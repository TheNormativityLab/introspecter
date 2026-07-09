import { Request, Response } from "express";
import { PrismaClient } from "@prisma/client";
import { logger } from '../../../../services/logger.js';

const prisma = new PrismaClient();

const debugLog = (msg: string) => {
  console.error(`[DEBUG] ${new Date().toISOString()} - ${msg}`);
};

export const getAllDebates = async (
  req: Request,
  res: Response
): Promise<Response> => {  
  try {
    const totalDebates = await prisma.debate.count();
    logger.info(`Total debate records in DB: ${totalDebates}`);

    if (totalDebates === 0) {
      return res.json({ success: false, experiment_groups: [], debug: { totalDebates: 0 } });
    }

    const allDebates = await prisma.debate.findMany({
      where: {
        AND: [
          { wandbMetadata: { not: null } },
          { wandbMetadata: { not: {} } },
          { seed: { not: null } },
        ],
      },
      select: {
        id: true,
        status: true,
        seed: true,
        datasetName: true,
        wandbMetadata: true,
        processedAt: true,
        llmConfigs: { select: { id: true, model: true } },
      },
      orderBy: { processedAt: "desc" },
    });

    logger.info(`Prisma returned ${allDebates.length} records with metadata/seed`);

    const experimentGroups = new Map();

    for (const debate of allDebates) {
      let experimentName = extractExperimentName(debate.wandbMetadata, debate.id);

      if (!experimentGroups.has(experimentName)) {
        logger.info(`[GROUPING] Creating NEW group for experiment: "${experimentName}" (ID: ${debate.id})`);
        const expected_seeds = debate.seed

        experimentGroups.set(experimentName, {
          experiment_name: experimentName,
          datasets: new Set(),
          model_config: { LLM: debate.llmConfigs },
          runs: [],
          total_runs: 0,
          completed_runs: 0,
          failed_runs: 0,
          seeds_present: new Set(),
          expected_seeds: expected_seeds,
          created_at: debate.processedAt,
          last_updated: debate.processedAt,
        });
      }

      const group = experimentGroups.get(experimentName);
      
      if (debate.datasetName) {
        group.datasets.add(debate.datasetName);
      }

      group.runs.push({ debate_id: debate.id, seed: debate.seed, status: debate.status });

      if (debate.seed !== null) group.seeds_present.add(debate.seed);
      group.total_runs++;
      if (debate.status === "completed") group.completed_runs++;
      if (debate.status === "failed") group.failed_runs++;

      if (debate.processedAt > group.last_updated) group.last_updated = debate.processedAt;
      if (debate.processedAt < group.created_at) group.created_at = debate.processedAt;
    }

    const consolidatedExperiments = Array.from(experimentGroups.values()).map(group => {
      const seedsPresent = Array.from(group.seeds_present).map(Number).sort((a: number, b: number) => a - b);
      const success_rate = group.total_runs > 0 
        ? ((group.completed_runs / group.total_runs) * 100).toFixed(1) + "%" 
        : "0%";

      return {
        ...group,
        dataset_name: Array.from(group.datasets),
        datasets: undefined, 
        runs: group.runs.sort((a: any, b: any) => a.seed - b.seed),
        seeds_present: seedsPresent,
        success_rate,
      };
    });

    logger.info(`Consolidation complete. Found ${consolidatedExperiments.length} unique experiment names.`);
    debugLog(`Consolidation complete. Found ${consolidatedExperiments.length} experiments`);
    
    return res.json({ success: true, experiment_groups: consolidatedExperiments });

  } catch (error) {
    logger.error("!!! FATAL ERROR in getAllDebates !!!", error);
    debugLog(`ERROR: ${error}`);
    return res.status(500).json({ success: false, message: "Internal server error" });
  }
};

function extractExperimentName(wandbMetadata: any, id: number): string {
  logger.info(`[EXTRACT] Processing Debate ID: ${id}`);
  
  if (!wandbMetadata) {
    logger.warn(`Debate ID ${id}: wandbMetadata is null/undefined`);
    return "unknown_experiment";
  }

  let m = wandbMetadata;
  const topKeys = Object.keys(m);
  logger.info(`Debate ID ${id}: Top-level keys found: [${topKeys.join(", ")}]`);

  if (m.tags) {
    const nameTag = m.tags.find((tag: string) =>
      tag.startsWith("name-")
    );

    if (nameTag) {
      const result = nameTag.replace(/^name-/, "");
      logger.info(`Debate ID ${id}: SUCCESS found via tag -> "${result}"`);
      return result;
    }
  }

  if (m.parsed_args) {
    const config = Array.isArray(m.parsed_args) ? m.parsed_args[0] : m.parsed_args;
    const configKeys = Object.keys(config);
    logger.info(`Debate ID ${id}: Checking parsed_args keys: [${configKeys.join(", ")}]`);

    const checkKeys = ["experiment_name", "experiment.name", "name", "exp_name"];
    for (const key of checkKeys) {
      let val = config[key];
      if (val && typeof val === 'object' && val.value !== undefined) {
        val = val.value;
      }
      if (val) {
        logger.info(`Debate ID ${id}: SUCCESS found in parsed_args["${key}"] -> "${val}"`);
        return String(val);
      }
    }
  }

  logger.warn(`Debate ID ${id}: All extraction paths failed. Returning fallback.`);
  return "unnamed_experiment";
}

export const getSingleDebate = async (
  req: Request,
  res: Response
): Promise<Response> => {
  try {
    const { experimentName, seed } = req.query;
    logger.info(`Retrieving experiment ${experimentName} seed ${seed}`);

    if (!experimentName || !seed) {
      return res.status(400).json({
        success: false,
        message: "Missing experiment name or seed",
      });
    }

    const nameValue = Array.isArray(experimentName) ? experimentName[0] : experimentName;
    const seedNum = Number(Array.isArray(seed) ? seed[0] : seed);

    const candidates = await prisma.debate.findMany({
      where: {
        AND: [
          { wandbMetadata: { not: null } },
          { seed: seedNum },
        ],
      },
      select: { id: true, wandbMetadata: true },
    });

    const ids = candidates
      .filter((d) => extractExperimentName(d.wandbMetadata, d.id) === nameValue)
      .map((d) => d.id);
      
    if (ids.length === 0) {
      return res.status(404).json({
        success: false,
        message: "No runs found",
      });
    }

    const matches = await prisma.debate.findMany({
      where: { id: { in: ids } },
      orderBy: { processedAt: "desc" },
    });

    const runs = matches.map((d) => ({
      _id: d.id,
      status: d.status,
      performance_data: d.performanceData,
      result_data: d.resultData,
      wandb_metadata: d.wandbMetadata,
      seed: d.seed,
      dataset_name: d.datasetName,
      processedAt: d.processedAt,
    }));

    return res.json({
      success: true,
      experiment_name: nameValue,
      seed: seedNum,
      runs,
    });
  } catch (error) {
    logger.error("Error in getSingleDebate", error);
    return res.status(500).json({ success: false, message: "Internal server error" });
  }
};

export const getDebateRun = async (
  req: Request,
  res: Response
): Promise<Response> => {
  try {
    const { debateId } = req.query;
    const id = Number(Array.isArray(debateId) ? debateId[0] : debateId);

    if (isNaN(id)) {
      return res.status(400).json({ success: false, message: "Invalid ID" });
    }

    const debate = await prisma.debate.findUnique({
      where: { id },
      include: {
        llmConfigs: {
          select: {
            id: true,
            modelName: true,
            model: true,
          },
        },
      },
    });

    if (!debate) {
      return res.status(404).json({ success: false, message: "Not found" });
    }

    const details = {
      debate_id: debate.id,
      seed: debate.seed,
      status: debate.status,
      dataset_name: debate.datasetName,
      model_config: { LLM: debate.llmConfigs },
      performance_data: debate.performanceData,
      result_data: debate.resultData,
      wandb_metadata: debate.wandbMetadata,
      processed_at: debate.processedAt,
    };

    return res.json({ success: true, run_details: details });
  } catch (error) {
    logger.error("Error in getDebateRun", error);
    return res.status(500).json({ success: false, message: "Internal server error" });
  }
};

export const debugDatabase = async (
  req: Request,
  res: Response
): Promise<Response> => {
  try {
    await prisma.$connect();
    const count = await prisma.debate.count();
    return res.json({
      success: true,
      debug: { count, connection: "OK", time: new Date().toISOString() },
    });
  } catch (error) {
    logger.error("Debug error", error);
    return res.status(500).json({ success: false, message: "Failed" });
  }
};

export const disconnectPrisma = async (): Promise<void> => {
  try {
    await prisma.$disconnect();
    logger.info("Disconnected Prisma");
  } catch (error) {
    logger.error("Disconnect error", error);
  }
};

process.on("SIGINT", async () => {
  await disconnectPrisma();
  process.exit(0);
});

process.on("SIGTERM", async () => {
  await disconnectPrisma();
  process.exit(0);
});