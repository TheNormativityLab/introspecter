const { PrismaClient } = require("@prisma/client");
const fs = require("fs");
const path = require("path");

const prisma = new PrismaClient();

function cleanData(obj) {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj === "string") return obj.replace(/\0/g, "").replace(/\\u0000/g, "");
  if (Array.isArray(obj)) return obj.map(cleanData);
  if (typeof obj === "object") {
    return Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, cleanData(v)]));
  }
  return obj;
}

function extractModel(llmCfg) {
  try {
    const lms = llmCfg?.language_models;
    if (Array.isArray(lms) && lms.length > 0) return lms[0].model_name ?? null;
  } catch (_) {}
  return null;
}

function resolveFilePaths(args) {
  const inputs = args.length > 0 ? args : [__dirname];
  return inputs.flatMap((p) => {
    const stat = fs.statSync(p);
    if (stat.isDirectory()) {
      return fs.readdirSync(p)
        .filter((f) => f.endsWith(".json"))
        .map((f) => path.join(p, f));
    }
    return [p];
  });
}

async function importFile(filePath) {
  const raw = fs.readFileSync(filePath, "utf8");
  const data = JSON.parse(raw);

  const metrics  = data.metrics  ?? {};
  const config   = data.config   ?? {};
  const results  = data.results  ?? [];

  const debaterModel = extractModel(config.debater_llm);
  const judgeModel   = extractModel(config.judge_llm);
  const numRounds    = config.num_rounds ?? null;
  const runName      = path.basename(filePath, ".json");

  console.log(`[IMPORT] ${runName}: ${results.length} questions, debater=${debaterModel}, judge=${judgeModel}, rounds=${numRounds}`);

  const run = await prisma.$queryRaw`
    INSERT INTO argumentative_runs
      (run_name, source_file, debater_model, judge_model, num_rounds, metrics, config)
    VALUES
      (${runName}, ${filePath}, ${debaterModel}, ${judgeModel}, ${numRounds},
      ${JSON.stringify(cleanData(metrics))}::jsonb,
      ${JSON.stringify(cleanData(config))}::jsonb)
    ON CONFLICT (run_name) DO UPDATE
      SET debater_model = EXCLUDED.debater_model,
          judge_model   = EXCLUDED.judge_model,
          num_rounds    = EXCLUDED.num_rounds,
          metrics       = EXCLUDED.metrics,
          config        = EXCLUDED.config
    RETURNING id
  `;
  const runId = run[0].id;

  let questionSuccess = 0;
  let questionFailed  = 0;

  for (const result of results) {
    try {
      const transcript      = result.transcript     ?? {};
      const questionText    = transcript.question;
      const storyTitle      = transcript.story_title ?? null;
      const storyText       = transcript.story       ?? null;
      const correctAnswer   = transcript.answers?.correct   ?? "";
      const incorrectAnswer = transcript.answers?.incorrect ?? "";
      const correctPosition = transcript.correct_position   ?? null;
      const questionIndex   = result.question_index ?? transcript.index ?? null;
      const judgment        = result.judgment        ?? null;
      const isCorrect       = result.is_correct      ?? null;
      const cost            = result.cost            ?? null;
      const rounds          = transcript.rounds      ?? [];
      const responses       = transcript.responses   ?? [];

      if (!questionText) {
        console.warn(`[WARN] Skipping result at index ${questionIndex}: missing question_text`);
        continue;
      }

      const upserted = await prisma.$queryRaw`
        INSERT INTO argumentative_questions
          (question_text, story_title, story_text, correct_answer, incorrect_answer)
        VALUES
          (${questionText}, ${storyTitle}, ${storyText}, ${correctAnswer}, ${incorrectAnswer})
        ON CONFLICT (question_text) DO UPDATE
          SET story_title      = EXCLUDED.story_title,
              story_text       = EXCLUDED.story_text,
              correct_answer   = EXCLUDED.correct_answer,
              incorrect_answer = EXCLUDED.incorrect_answer
        RETURNING id
      `;
      const questionId = upserted[0].id;

      const rq = await prisma.$queryRaw`
        INSERT INTO argumentative_run_questions
          (run_id, question_id, question_index, correct_position, judgment, is_correct, cost)
        VALUES
          (${runId}::uuid, ${questionId}::uuid, ${questionIndex},
           ${correctPosition}, ${judgment}, ${isCorrect}, ${cost})
        ON CONFLICT (run_id, question_id) DO NOTHING
        RETURNING id
      `;

      if (!rq.length) {
        console.warn(`[WARN] Duplicate run-question skipped: ${questionText.slice(0, 60)}`);
        continue;
      }
      const runQuestionId = rq[0].id;

      for (let i = 0; i < rounds.length; i++) {
        const r = rounds[i];
        await prisma.$queryRaw`
          INSERT INTO argumentative_rounds
            (run_question_id, round_number, round_type,
             correct_argument, incorrect_argument, cross_examiner_text, judge_text)
          VALUES
            (${runQuestionId}::uuid, ${i + 1}, 'round',
             ${r.correct ?? null}, ${r.incorrect ?? null},
             ${r.cross_examiner ?? null}, ${r.judge ?? null})
          ON CONFLICT (run_question_id, round_number, round_type) DO NOTHING
        `;
      }

      for (let i = 0; i < responses.length; i++) {
        const r = responses[i];
        await prisma.$queryRaw`
          INSERT INTO argumentative_rounds
            (run_question_id, round_number, round_type,
             correct_argument, incorrect_argument, cross_examiner_text, judge_text)
          VALUES
            (${runQuestionId}::uuid, ${i + 1}, 'response',
             ${r.correct ?? null}, ${r.incorrect ?? null},
             ${r.cross_examiner ?? null}, ${r.judge ?? null})
          ON CONFLICT (run_question_id, round_number, round_type) DO NOTHING
        `;
      }

      questionSuccess++;
    } catch (err) {
      questionFailed++;
      console.error(`[ERROR] Question at index ${result.question_index} failed: ${err.message}`);
    }
  }

  console.log(`[IMPORT] ${runName}: ✓ ${questionSuccess} inserted, ✗ ${questionFailed} failed`);
  return { runId, questionSuccess, questionFailed };
}

async function main() {
  const filePaths = resolveFilePaths(process.argv.slice(2));

  if (filePaths.length === 0) {
    console.error("[IMPORT] No JSON files found.");
    process.exit(1);
  }

  console.log(`[IMPORT] Processing ${filePaths.length} file(s): ${filePaths.map(f => path.basename(f)).join(", ")}`);

  await prisma.$connect();
  try {
    let totalSuccess = 0;
    let totalFailed  = 0;
    for (const fp of filePaths) {
      const { questionSuccess, questionFailed } = await importFile(fp);
      totalSuccess += questionSuccess;
      totalFailed  += questionFailed;
    }
    console.log(`\n[DONE] Total: ${totalSuccess} questions inserted, ${totalFailed} failed`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error("[FATAL]", err.message);
  process.exit(1);
});