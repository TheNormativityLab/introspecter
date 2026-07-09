import { Request, Response } from "express";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export const getAllArgumentativeRuns = async (
  req: Request,
  res: Response
): Promise<Response> => {
  try {
  const runs = await prisma.$queryRaw<any[]>`
    SELECT
      r.id,
      r.run_name,
      r.source_file,
      r.debater_model,
      r.judge_model,
      r.num_rounds,
      r.metrics,
      r.created_at AS imported_at,
      COUNT(rq.id)::int AS total_questions,
      COUNT(rq.id) FILTER (WHERE rq.is_correct = true)::int  AS correct_questions,
      COUNT(rq.id) FILTER (WHERE rq.is_correct = false)::int AS incorrect_questions
    FROM argumentative_runs r
    LEFT JOIN argumentative_run_questions rq ON rq.run_id = r.id
    GROUP BY r.id
    ORDER BY r.created_at DESC
  `;

    const shaped = runs.map((r) => ({
      id: r.id,
      run_name: r.run_name,
      source_file: r.source_file,
      debater_model: r.debater_model,
      judge_model: r.judge_model,
      num_rounds: r.num_rounds,
      metrics: r.metrics,
      imported_at: r.imported_at,
      total_questions: r.total_questions,
      correct_questions: r.correct_questions,
      incorrect_questions: r.incorrect_questions,
      accuracy:
        r.total_questions > 0
          ? ((r.correct_questions / r.total_questions) * 100).toFixed(1) + "%"
          : "0%",
    }));

    return res.json({ success: true, runs: shaped });
  } catch (error) {
    console.error("Error in getAllArgumentativeRuns", error);
    return res.status(500).json({ success: false, message: "Internal server error" });
  }
};

export const getSingleArgumentativeRun = async (
  req: Request,
  res: Response
): Promise<Response> => {
  try {
    const { runId } = req.query;
    if (!runId) {
      return res.status(400).json({ success: false, message: "Missing runId" });
    }

    const id = Array.isArray(runId) ? runId[0] : runId;

    const runs = await prisma.$queryRaw<any[]>`
      SELECT * FROM argumentative_runs WHERE id = ${id}::uuid
    `;
    if (!runs.length) {
      return res.status(404).json({ success: false, message: "Run not found" });
    }
    const run = runs[0];

    const questions = await prisma.$queryRaw<any[]>`
      SELECT
        rq.id,
        rq.question_index,
        rq.correct_position,
        rq.judgment,
        rq.is_correct,
        rq.cost,
        q.question_text,
        q.story_title,
        q.correct_answer,
        q.incorrect_answer
      FROM argumentative_run_questions rq
      JOIN argumentative_questions q ON q.id = rq.question_id
      WHERE rq.run_id = ${id}::uuid
      ORDER BY rq.question_index ASC
    `;

    const questionIds = questions.map((q) => q.id);

    const rounds =
      questionIds.length > 0
        ? await prisma.$queryRaw<any[]>`
            SELECT * FROM argumentative_rounds
            WHERE run_question_id = ANY(${questionIds}::uuid[])
            ORDER BY run_question_id, round_type, round_number
          `
        : [];

    const roundsByQuestion: Record<string, any[]> = {};
    for (const round of rounds) {
      const key = round.run_question_id;
      if (!roundsByQuestion[key]) roundsByQuestion[key] = [];
      roundsByQuestion[key].push(round);
    }

    const questionsWithRounds = questions.map((q) => ({
      ...q,
      rounds: (roundsByQuestion[q.id] ?? []).filter((r) => r.round_type === "round"),
      responses: (roundsByQuestion[q.id] ?? []).filter((r) => r.round_type === "response"),
    }));

    return res.json({
      success: true,
      run: {
        ...run,
        questions: questionsWithRounds,
      },
    });
  } catch (error) {
    console.error("Error in getSingleArgumentativeRun", error);
    return res.status(500).json({ success: false, message: "Internal server error" });
  }
};