const { PrismaClient } = require("@prisma/client");
const { execSync } = require("child_process");
const path = require("path");
const fs = require("fs");

class DatabaseManager {
  constructor() {
    this.prisma = new PrismaClient();
  }

  async connect() {
    await this.prisma.$connect();
  }

  async disconnect() {
    await this.prisma.$disconnect();
  }

  async getExistingExperimentIds() {
    try {
      const debates = await this.prisma.debate.findMany({
        select: { experimentId: true },
      });
      return debates.map((d) => d.experimentId);
    } catch (error) {
      console.error("Error getting existing IDs", error);
      return [];
    }
  }

  cleanData(obj) {
    if (obj === null || obj === undefined) return obj;
    if (typeof obj === "string") {
      return obj.replace(/\0/g, '').replace(/\\u0000/g, '');
    }
    if (Array.isArray(obj)) {
      return obj.map((item) => this.cleanData(item));
    }
    if (typeof obj === "object") {
      const cleaned = {};
      for (const [key, value] of Object.entries(obj)) {
        cleaned[key] = this.cleanData(value);
      }
      return cleaned;
    }
    return obj;
  }

  async insertNewExperiments(experiments) {
    let successCount = 0;
    const batchSize = 25;
    
    for (let i = 0; i < experiments.length; i += batchSize) {
      const batch = experiments.slice(i, i + batchSize);
      console.log(`[JS] Processing batch ${i / batchSize + 1} of ${Math.ceil(experiments.length / batchSize)}`);
      
      await Promise.all(batch.map(async (exp) => {
        try {
          const cleanedPerf = this.cleanData(exp.performance_data);
          const cleanedRes = this.cleanData(exp.result_data);
          
          const llmConfigConnections = exp.modelConfig.LLM.map((llm) => ({
            where: {
              modelName_model: {
                modelName: llm.model_name,
                model: llm.model,
              },
            },
            create: {
              modelName: llm.model_name,
              model: llm.model,
            },
          }));

          await this.prisma.debate.create({
            data: {
              experimentId: exp.experiment_id,
              seed: exp.current_seed,
              datasetName: exp.dataset_name || "unknown",
              status: exp.status,
              performanceData: cleanedPerf,
              resultData: cleanedRes,
              wandbMetadata: exp.wandb_metadata,
              processedAt: new Date(exp.processed_at),
              llmConfigs: {
                connectOrCreate: llmConfigConnections,
              },
            },
          });
          successCount++;
        } catch (error) {
          if (error.code !== "P2002") {
            console.error(`[ERROR] Run ${exp.experiment_id} failed ${error.message}`);
          }
        }
      }));
    }
    return successCount;
  }
  async getLastSyncTime() {
    try {
      const lastEntry = await this.prisma.debate.findFirst({
        orderBy: { processedAt: 'desc' },
        select: { processedAt: true },
      });
      return lastEntry ? lastEntry.processedAt.toISOString() : null;
    } catch (error) {
      console.error("Error getting last sync time", error);
      return null;
    }
  }
}

async function main() {
  const dbManager = new DatabaseManager();
  await dbManager.connect();

  try {
    const pythonScriptPath = path.resolve(__dirname, "./wandb_collector.py");
    
    const existingIds = await dbManager.getExistingExperimentIds();
    const lastSyncTime = await dbManager.getLastSyncTime();

    console.log(`[JS] Syncing runs created after: ${lastSyncTime || "Beginning of time"}`);

    const payload = JSON.stringify({
      existingIds,
      lastSyncTime
    });

    const pythonStdout = execSync(`python3 ${pythonScriptPath}`, {
      input: payload,
      encoding: "utf8",
      maxBuffer: 1024 * 1024 * 10
    });

    const tempFilePath = pythonStdout.trim();
    if (!tempFilePath || !fs.existsSync(tempFilePath)) {
      console.log("[JS] No data file received from Python");
      return;
    }

    const rawData = fs.readFileSync(tempFilePath, "utf8");
    const newExperiments = JSON.parse(rawData);
    fs.unlinkSync(tempFilePath);

    console.log(`[JS] Found ${newExperiments.length} new experiments to sync`);

    if (newExperiments.length > 0) {
      const count = await dbManager.insertNewExperiments(newExperiments);
      console.log(`[JS] Successfully inserted ${count} records`);
    }

  } catch (error) {
    console.error(`[JS FATAL] ${error.message}`);
  } finally {
    await dbManager.disconnect();
  }
}

main();