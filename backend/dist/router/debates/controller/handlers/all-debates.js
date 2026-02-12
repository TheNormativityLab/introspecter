"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.disconnectPrisma = exports.debugDatabase = exports.getDebateRun = exports.getSingleDebate = exports.getAllDebates = void 0;
const client_1 = require("@prisma/client");
const logger_1 = require("../../../../services/logger");
const prisma = new client_1.PrismaClient();
const getAllDebates = async (req, res) => {
    try {
        logger_1.logger.info(`Attempt to retrieve all debates`);
        const totalDebates = await prisma.debate.count();
        if (totalDebates === 0) {
            return res.json({
                success: true,
                experiment_groups: [],
                debug: {
                    totalDebates: 0,
                    message: "No debates found in database",
                },
            });
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
                llmConfigs: {
                    select: {
                        id: true,
                        modelName: true,
                        model: true,
                        apiBase: true,
                        timeout: true,
                        numRetries: true,
                        rpm: true,
                        topP: true,
                        maxTokens: true,
                        temperature: true,
                    },
                },
            },
            orderBy: {
                processedAt: "desc",
            },
        });
        logger_1.logger.info(`Found ${allDebates.length} debates with wandb_metadata and seed`);
        const experimentGroups = new Map();
        for (const debate of allDebates) {
            let experimentName = extractExperimentName(debate.wandbMetadata, debate.llmConfigs);
            if (!experimentGroups.has(experimentName)) {
                const expected_seeds = extractExpectedSeeds(debate.wandbMetadata);
                experimentGroups.set(experimentName, {
                    experiment_name: experimentName,
                    dataset_name: debate.datasetName,
                    model_config: {
                        LLM: debate.llmConfigs,
                    },
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
            group.runs.push({
                debate_id: debate.id,
                seed: debate.seed,
                dataset_name: debate.datasetName,
                status: debate.status,
                wandb_metadata: debate.wandbMetadata,
                processed_at: debate.processedAt,
            });
            if (debate.seed !== null) {
                group.seeds_present.add(debate.seed);
            }
            group.total_runs++;
            if (debate.status === "completed")
                group.completed_runs++;
            if (debate.status === "failed")
                group.failed_runs++;
            if (debate.processedAt > group.last_updated) {
                group.last_updated = debate.processedAt;
            }
            if (debate.processedAt < group.created_at) {
                group.created_at = debate.processedAt;
            }
        }
        const consolidatedExperiments = Array.from(experimentGroups.values()).map((group) => {
            const seedsPresent = Array.from(group.seeds_present)
                .map(Number)
                .sort((a, b) => a - b);
            const missingSeeds = group.expected_seeds
                ? group.expected_seeds.filter((seed) => !group.seeds_present.has(seed))
                : [];
            const success_rate = group.total_runs > 0
                ? ((group.completed_runs / group.total_runs) * 100).toFixed(1) + "%"
                : "0%";
            return {
                ...group,
                runs: group.runs.sort((a, b) => a.seed - b.seed),
                seeds_present: seedsPresent,
                missing_seeds: missingSeeds,
                is_complete: group.runs.every((run) => run.status === "completed"),
                success_rate,
            };
        });
        consolidatedExperiments.sort((a, b) => {
            const nameA = String(a.experiment_name || "");
            const nameB = String(b.experiment_name || "");
            const nameCompare = nameA.localeCompare(nameB);
            if (nameCompare !== 0)
                return nameCompare;
            const timeA = new Date(a.last_updated).getTime();
            const timeB = new Date(b.last_updated).getTime();
            return timeB - timeA;
        });
        return res.json({
            success: true,
            experiment_groups: consolidatedExperiments,
            debug: {
                totalDebates,
                totalExperiments: consolidatedExperiments.length,
                totalRuns: allDebates.length,
                experimentNames: consolidatedExperiments.map((exp) => ({
                    name: exp.experiment_name,
                    runs: exp.total_runs,
                    seeds: exp.seeds_present,
                    missing: exp.missing_seeds,
                    complete: exp.is_complete,
                })),
            },
        });
    }
    catch (error) {
        logger_1.logger.error("Get all debates error:", error);
        return res.status(500).json({
            success: false,
            message: "Internal server error",
            error: error instanceof Error ? error.message : "Unknown error",
        });
    }
};
exports.getAllDebates = getAllDebates;
function extractExperimentName(wandbMetadata, llmConfigs) {
    if (!wandbMetadata || typeof wandbMetadata !== "object") {
        return llmConfigs
            .map((c) => c.modelName)
            .sort()
            .join("_vs_");
    }
    if (Array.isArray(wandbMetadata.parsed_args) &&
        wandbMetadata.parsed_args.length > 0) {
        const firstConfig = wandbMetadata.parsed_args[0];
        return (firstConfig["experiment.name"] ||
            llmConfigs
                .map((c) => c.modelName)
                .sort()
                .join("_vs_"));
    }
    if (wandbMetadata.parsed_args &&
        typeof wandbMetadata.parsed_args === "object") {
        return (wandbMetadata.parsed_args["experiment.name"] ||
            llmConfigs
                .map((c) => c.modelName)
                .sort()
                .join("_vs_"));
    }
    return llmConfigs
        .map((c) => c.modelName)
        .sort()
        .join("_vs_");
}
function extractExpectedSeeds(wandbMetadata) {
    if (!wandbMetadata || typeof wandbMetadata !== "object") {
        return [];
    }
    let seedRaw;
    if (Array.isArray(wandbMetadata.parsed_args) &&
        wandbMetadata.parsed_args.length > 0) {
        return [];
    }
    if (wandbMetadata.parsed_args &&
        typeof wandbMetadata.parsed_args === "object") {
        seedRaw = wandbMetadata.parsed_args["seed"];
    }
    if (seedRaw) {
        return Array.isArray(seedRaw)
            ? seedRaw.map(Number)
            : seedRaw.toString().split(",").map(Number);
    }
    return [];
}
const getSingleDebate = async (req, res) => {
    try {
        const { experimentName, seed } = req.query;
        logger_1.logger.info(`Attempt to retrieve all runs from experiment: ${experimentName} with seed: ${seed}`);
        if (!experimentName) {
            return res.status(400).json({
                success: false,
                errors: { experimentName: ["Experiment name is required"] },
            });
        }
        if (!seed) {
            return res.status(400).json({
                success: false,
                errors: { seed: ["Seed is required"] },
            });
        }
        const experimentNameValue = Array.isArray(experimentName)
            ? experimentName[0]
            : experimentName;
        const seedValue = Array.isArray(seed) ? seed[0] : seed;
        const seedNumber = Number(seedValue);
        if (isNaN(seedNumber)) {
            return res.status(400).json({
                success: false,
                errors: { seed: ["Seed must be a valid number"] },
            });
        }
        const candidateDebates = await prisma.debate.findMany({
            where: {
                AND: [
                    { wandbMetadata: { not: null } },
                    { seed: seedNumber },
                ],
            },
            select: {
                id: true,
                wandbMetadata: true,
                llmConfigs: {
                    select: { modelName: true },
                },
            },
        });
        const targetIds = candidateDebates
            .filter((debate) => {
            const debateExperimentName = extractExperimentName(debate.wandbMetadata, debate.llmConfigs);
            return debateExperimentName === experimentNameValue;
        })
            .map((d) => d.id);
        if (targetIds.length === 0) {
            return res.status(404).json({
                success: false,
                message: `No runs found for experiment '${experimentNameValue}' with seed ${seedNumber}`,
            });
        }
        const matchingDebates = await prisma.debate.findMany({
            where: {
                id: { in: targetIds },
            },
            include: {
                llmConfigs: {
                    select: {
                        id: true,
                        modelName: true,
                        model: true,
                        apiBase: true,
                        timeout: true,
                        numRetries: true,
                        rpm: true,
                        topP: true,
                        maxTokens: true,
                        temperature: true,
                    },
                },
            },
            orderBy: {
                processedAt: "desc",
            },
        });
        const transformedRuns = matchingDebates.map((debate) => ({
            _id: debate.id,
            status: debate.status,
            performance_data: debate.performanceData,
            result_data: debate.resultData,
            wandb_metadata: debate.wandbMetadata,
            seed: debate.seed,
            dataset_name: debate.datasetName,
            processedAt: debate.processedAt,
        }));
        return res.json({
            success: true,
            experiment_name: experimentNameValue,
            seed: seedNumber,
            runs: transformedRuns.sort((a, b) => new Date(b.processedAt).getTime() - new Date(a.processedAt).getTime()),
        });
    }
    catch (error) {
        logger_1.logger.error("Get single debate error:", error);
        return res.status(500).json({
            success: false,
            message: "Internal server error",
            error: error instanceof Error ? error.message : "Unknown error",
        });
    }
};
exports.getSingleDebate = getSingleDebate;
const getDebateRun = async (req, res) => {
    try {
        const { debateId } = req.query;
        logger_1.logger.info(`Attempt to retrieve debate run with ID: ${debateId}`);
        if (!debateId) {
            return res.status(400).json({
                success: false,
                errors: {
                    debateId: ["Debate ID is required"],
                },
            });
        }
        const idValue = Array.isArray(debateId) ? debateId[0] : debateId;
        const debateIdNum = Number(idValue);
        if (isNaN(debateIdNum) || debateIdNum <= 0) {
            return res.status(400).json({
                success: false,
                errors: {
                    debateId: ["Debate ID must be a valid positive number"],
                },
            });
        }
        const debate = await prisma.debate.findUnique({
            where: {
                id: debateIdNum,
            },
            include: {
                llmConfigs: {
                    select: {
                        id: true,
                        modelName: true,
                        model: true,
                        apiBase: true,
                        timeout: true,
                        numRetries: true,
                        rpm: true,
                        topP: true,
                        maxTokens: true,
                        temperature: true,
                    },
                },
            },
        });
        if (!debate) {
            return res.status(404).json({
                success: false,
                message: "Debate not found",
            });
        }
        if (!debate.wandbMetadata ||
            (typeof debate.wandbMetadata === "object" &&
                Object.keys(debate.wandbMetadata).length === 0)) {
            return res.status(404).json({
                success: false,
                message: "Debate found but has no wandb_metadata",
            });
        }
        if (!debate.seed && debate.seed !== 0) {
            return res.status(404).json({
                success: false,
                message: "Debate found but has no seed",
            });
        }
        const runDetails = {
            debate_id: debate.id,
            seed: debate.seed,
            status: debate.status,
            dataset_name: debate.datasetName,
            model_config: {
                LLM: debate.llmConfigs.map((config) => ({
                    id: config.id,
                    modelName: config.modelName,
                    model: config.model,
                    apiBase: config.apiBase,
                    timeout: config.timeout,
                    numRetries: config.numRetries,
                    rpm: config.rpm,
                    topP: config.topP,
                    maxTokens: config.maxTokens,
                    temperature: config.temperature,
                })),
            },
            performance_data: debate.performanceData,
            result_data: debate.resultData,
            wandb_metadata: debate.wandbMetadata,
            processed_at: debate.processedAt,
        };
        return res.json({
            success: true,
            run_details: runDetails,
        });
    }
    catch (error) {
        logger_1.logger.error("Get debate run error:", error);
        return res.status(500).json({
            success: false,
            message: "Internal server error",
            error: error instanceof Error ? error.message : "Unknown error",
        });
    }
};
exports.getDebateRun = getDebateRun;
const debugDatabase = async (req, res) => {
    try {
        await prisma.$connect();
        const totalDebates = await prisma.debate.count();
        const totalLlmConfigs = await prisma.llmConfig.count();
        const debatesWithWandb = await prisma.debate.count({
            where: {
                AND: [
                    { wandbMetadata: { not: null } },
                    { wandbMetadata: { not: {} } },
                ],
            },
        });
        const debatesWithSeed = await prisma.debate.count({
            where: { seed: { not: null } },
        });
        const debatesWithDatasetName = await prisma.debate.count({
            where: { datasetName: { not: null } },
        });
        const seedCounts = await prisma.debate.groupBy({
            by: ["seed"],
            _count: { seed: true },
            where: { seed: { not: null } },
            orderBy: { _count: { seed: "desc" } },
        });
        const statusCounts = await prisma.debate.groupBy({
            by: ["status"],
            _count: { status: true },
            orderBy: { _count: { status: "desc" } },
        });
        const sampleDebates = await prisma.debate.findMany({
            where: {
                AND: [
                    { wandbMetadata: { not: null } },
                    { wandbMetadata: { not: {} } },
                ],
            },
            select: {
                id: true,
                status: true,
                processedAt: true,
                llmConfigs: {
                    select: {
                        id: true,
                        modelName: true,
                    },
                },
            },
            orderBy: { processedAt: "desc" },
            take: 5,
        });
        const sampleLlmConfigs = await prisma.llmConfig.findMany({
            select: {
                id: true,
                modelName: true,
                model: true,
                _count: {
                    select: { debates: true },
                },
            },
            orderBy: { id: "asc" },
            take: 5,
        });
        return res.json({
            success: true,
            debug: {
                totalDebates,
                totalLlmConfigs,
                debatesWithWandb,
                debatesWithSeed,
                debatesWithDatasetName,
                seedCounts,
                statusCounts,
                sampleDebates,
                sampleLlmConfigs,
                connection: "OK",
                timestamp: new Date().toISOString(),
            },
        });
    }
    catch (error) {
        logger_1.logger.error("Database debug error:", error);
        return res.status(500).json({
            success: false,
            message: "Database connection or query failed",
            error: error instanceof Error ? error.message : "Unknown error",
            timestamp: new Date().toISOString(),
        });
    }
};
exports.debugDatabase = debugDatabase;
const disconnectPrisma = async () => {
    try {
        await prisma.$disconnect();
        logger_1.logger.info("Prisma client disconnected successfully");
    }
    catch (error) {
        logger_1.logger.error("Error disconnecting Prisma client:", error);
    }
};
exports.disconnectPrisma = disconnectPrisma;
process.on("SIGINT", async () => {
    await (0, exports.disconnectPrisma)();
    process.exit(0);
});
process.on("SIGTERM", async () => {
    await (0, exports.disconnectPrisma)();
    process.exit(0);
});
//# sourceMappingURL=all-debates.js.map