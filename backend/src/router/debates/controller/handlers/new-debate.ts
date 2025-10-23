import { Request, Response } from "express";
import axios, { AxiosResponse } from "axios";
import { logger } from "../../../../services/logger";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const FASTAPI_BASE_URL =
  process.env.FASTAPI_BASE_URL || "http://introspecter-api:3001";

interface Agent {
  id: string;
  name: string;
  model: string;
  enabled: boolean;
  isHuman?: boolean;
}

interface DebateData {
  experimentName: string;
  totalQuestions: number;
  numRounds: number;
  seeds: number[];
  agents: Agent[];
  selectedDatasets: string[];
  customQuestions: string[];
  status: string;
  createdAt: string;
  debateType?: string;
}
interface CustomQuestion {
  question: string;
  answer: string;
  question_prompt: string;
}
interface FastAPIDebateRequest {
  debate_type: "basic_debate" | "judge";
  task: "mmlu" | "math" | "commonsense_qa" | "gsm8k" | "custom";
  num_questions: number;
  num_rounds: number;
  num_agents: number;
  agent_models: string[];
  human_agent_index?: number;
  seed: number;
  name?: string;
  summarize: boolean;
  llm_conf_at_llm1?: string;
  custom_questions?: CustomQuestion[];
  selected_datasets?: string[];
}

interface FastAPIDebateResponse {
  debate_id: string;
  debate_type: string;
  status: string;
  celery_task_id: string;
  websocket_url: string;
  current_question_index: number;
  total_questions: number;
  human_agent_index?: number;
  created_at: string;
}

async function createLlmConfigsFromAgents(agents: Agent[]) {
  const createdConfigs = [];

  for (const agent of agents) {
    // Skip human agents
    if (agent.isHuman) {
      logger.info(`Skipping human agent: ${agent.name}`);
      continue;
    }

    try {
      const existing = await prisma.llmConfig.findFirst({
        where: {
          model: agent.model,
        },
      });

      if (existing) {
        logger.info(`LLM config already exists: ${agent.name}`);
        createdConfigs.push(existing);
        continue;
      }

      const newConfig = await prisma.llmConfig.create({
        data: {
          modelName: agent.name,
          model: agent.model,
          apiBase: agent.model.startsWith("gpt")
            ? "https://api.openai.com/v1"
            : undefined,
          temperature: 0.7,
          maxTokens: 2000,
        },
      });

      logger.info(`Created new LLM config: ${agent.name}`);
      createdConfigs.push(newConfig);
    } catch (error) {
      logger.error(`Error creating LLM config for ${agent.name}:`, error);
    }
  }

  return createdConfigs;
}

async function syncDebateWithFastAPI(
  debateId: string,
  debateData: DebateData,
  llmConfigs: any[],
  status: string = "queued"
) {
  try {
    logger.info(`Syncing experiment with ID: ${debateId} (status: ${status})`);

    // Check if debate already exists by debateId
    const existingByDebateId = await prisma.debate.findFirst({
      where: {
        experimentId: debateId,
      },
    });

    if (existingByDebateId) {
      logger.info(
        `Debate already exists with experimentId: ${existingByDebateId.id}, updating status to ${status}`
      );

      const updatedDebate = await prisma.debate.update({
        where: { id: existingByDebateId.id },
        data: {
          status: status,
          processedAt: new Date(),
        },
        include: {
          llmConfigs: true,
        },
      });

      return updatedDebate;
    }

    // Determine the dataset name to use
    const isCustomQuestions =
      debateData.customQuestions && debateData.customQuestions.length > 0;
    const datasetName = isCustomQuestions
      ? "custom_questions"
      : debateData.selectedDatasets?.[0] || "custom";

    logger.info(
      `Creating new debate with dataset: ${datasetName}, seed: ${debateData.seeds?.[0]}`
    );

    const debate = await prisma.debate.create({
      data: {
        experimentId: debateId,
        seed: Array.isArray(debateData.seeds)
          ? debateData.seeds[0]
          : (debateData as any).seed ?? 0,
        datasetName: datasetName,
        status: status,
        createdAt: new Date(),
        processedAt: new Date(),
        llmConfigs: {
          connect: llmConfigs.map((config) => ({ id: config.id })),
        },
      },
      include: {
        llmConfigs: true,
      },
    });

    logger.info(
      `Created new debate record with ID: ${debate.id} (experimentId: ${debateId}, dataset: ${datasetName}, seed: ${debateData.seeds?.[0]}, status: ${status})`
    );
    return debate;
  } catch (error) {
    logger.error("Error syncing debate record with FastAPI:", error);

    // If it's a unique constraint error, try to find existing record
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as any).code === "P2002"
    ) {
      logger.warn(
        "Unique constraint violation, attempting to find existing record..."
      );

      try {
        const existing = await prisma.debate.findFirst({
          where: {
            experimentId: debateId,
          },
          include: {
            llmConfigs: true,
          },
        });

        if (existing) {
          logger.info(
            `Found existing record after constraint error: ${existing.id}`
          );
          return existing;
        }
      } catch (findError) {
        logger.error("Error finding existing record:", findError);
      }
    }

    throw error;
  }
}

const logResponseDetails = (response: AxiosResponse, context: string) => {
  logger.info(`${context} - Response details:`, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
    contentType: response.headers["content-type"],
    dataType: typeof response.data,
    dataLength:
      typeof response.data === "string" ? response.data.length : "N/A",
    dataPreview:
      typeof response.data === "string"
        ? response.data.substring(0, 200) +
          (response.data.length > 200 ? "..." : "")
        : JSON.stringify(response.data).substring(0, 200),
  });
};

const handleAxiosError = (error: any, context: string, res: Response) => {
  logger.error(`${context} - Detailed error analysis:`, {
    errorType: error.constructor.name,
    message: error.message,
    code: error.code,
    config: {
      url: error.config?.url,
      method: error.config?.method,
      timeout: error.config?.timeout,
      headers: error.config?.headers,
    },
  });

  if (error.response) {
    logger.error(`${context} - FastAPI response error:`, {
      status: error.response.status,
      statusText: error.response.statusText,
      headers: error.response.headers,
      contentType: error.response.headers["content-type"],
      dataType: typeof error.response.data,
      dataLength:
        typeof error.response.data === "string"
          ? error.response.data.length
          : "N/A",
      rawData: error.response.data,
      dataPreview:
        typeof error.response.data === "string"
          ? error.response.data.substring(0, 500)
          : JSON.stringify(error.response.data).substring(0, 500),
    });

    const contentType = error.response.headers["content-type"] || "";
    if (contentType.includes("text/html")) {
      logger.warn(
        `${context} - Received HTML response instead of JSON. This might indicate a server error or wrong endpoint.`
      );
    }

    return res.status(error.response.status).json({
      success: false,
      message:
        error.response.data?.detail ||
        error.response.data?.message ||
        `FastAPI error: ${error.response.status}`,
      error: error.response.data,
      fastapi_url: FASTAPI_BASE_URL,
      debug: {
        contentType: contentType,
        responseType: typeof error.response.data,
        statusCode: error.response.status,
      },
    });
  } else if (error.request) {
    logger.error(`${context} - Network error (no response):`, {
      code: error.code,
      message: error.message,
      timeout: error.config?.timeout,
      url: FASTAPI_BASE_URL,
      errno: error.errno,
      syscall: error.syscall,
      address: error.address,
      port: error.port,
    });

    return res.status(503).json({
      success: false,
      message: "Failed to connect to FastAPI backend",
      error: error.message,
      debug: {
        requestSetupError: true,
      },
    });
  }

  return res.status(500).json({
    success: false,
    message: "Unknown error occurred",
    error: error.message,
  });
};

function mapDatasetToTask(dataset: string): FastAPIDebateRequest["task"] {
  const mapping: Record<string, FastAPIDebateRequest["task"]> = {
    gsm8k: "gsm8k",
    mmlu: "mmlu",
    math: "math",
    commonsense_qa: "commonsense_qa",
    custom_questions: "custom",
  };

  const normalized = dataset.toLowerCase();
  return mapping[normalized] || "mmlu";
}

export const getNewDebate = async (
  req: Request,
  res: Response
): Promise<Response> => {
  try {
    const debateData: DebateData = req.body;
    logger.info(`📥 RAW REQUEST BODY:`, {
      body: req.body,
      hasAgents: !!req.body.agents,
      hasAgentModels: !!req.body.agent_models,
      agentModels: req.body.agent_models,
      agents: req.body.agents,
    });
    // Log incoming request for debugging
    logger.info(`Incoming debate request:`, {
      experimentName: debateData.experimentName,
      totalQuestions: debateData.totalQuestions,
      numRounds: debateData.numRounds,
      seedsCount: debateData.seeds?.length,
      agentsCount: debateData.agents?.length,
      agents: debateData.agents?.map((a) => ({
        name: a.name,
        model: a.model,
        isHuman: a.isHuman,
      })),
      datasetsCount: debateData.selectedDatasets?.length,
      customQuestionsCount: debateData.customQuestions?.length,
      status: debateData.status,
    });

    try {
      logger.info("Performing FastAPI health check...");
      const healthResponse = await axios.get(`${FASTAPI_BASE_URL}/health`, {
        timeout: 5000,
        headers: {
          Accept: "application/json",
          "User-Agent": "NodeJS-Express-Client",
        },
      });

      logResponseDetails(healthResponse, "Health Check");
      logger.info("FastAPI server health check passed");
    } catch (healthError: any) {
      logger.error("FastAPI server health check failed:", {
        error: healthError.message,
        code: healthError.code,
        fastapi_url: FASTAPI_BASE_URL,
      });

      return res.status(503).json({
        success: false,
        message: `FastAPI backend server is not available at ${FASTAPI_BASE_URL}`,
        error: "Service unavailable",
        fastapi_url: FASTAPI_BASE_URL,
        debug: {
          healthCheckFailed: true,
          errorCode: healthError.code,
        },
      });
    }

    let agentModels: string[];
    let agents: Agent[] = [];

    if (req.body.agent_models && Array.isArray(req.body.agent_models)) {
      logger.info("Using agent_models from frontend:", req.body.agent_models);
      agentModels = req.body.agent_models;

      agents = agentModels.map((model, index) => ({
        id: `agent_${index}`,
        name: model,
        model: model,
        enabled: true,
        isHuman: model === "human-participant",
      }));
    } else if (debateData.agents && debateData.agents.length > 0) {
      logger.info("Extracting agent_models from agents array");
      agents = debateData.agents;
      agentModels = debateData.agents
        .filter((agent) => agent.enabled)
        .map((agent) => agent.model);
    } else {
      logger.error("No agents or agent_models found in request");
      return res.status(400).json({
        success: false,
        message: "At least 1 agent is required",
        error: "No agents provided",
        debug: {
          hasAgents: !!debateData.agents,
          hasAgentModels: !!req.body.agent_models,
          body: req.body,
        },
      });
    }

    if (!agentModels || agentModels.length === 0) {
      logger.error("Invalid agent count after extraction:", {
        agentModels,
        agents: debateData.agents,
        body: req.body,
      });
      return res.status(400).json({
        success: false,
        message: "At least 1 agent is required",
        error: "Invalid agent count",
        debug: {
          received_agents_count: agentModels?.length || 0,
          agents: debateData.agents,
          agent_models: req.body.agent_models,
        },
      });
    }

    // Find human agent index if any - NOW USING THE LOCAL agents VARIABLE
    const humanAgentIndex = agents.findIndex((agent) => agent.isHuman === true);

    const hasHumanAgent = humanAgentIndex >= 0;
    // CRITICAL: Use the agents array length, not filtered count
    const totalAgents = agents.length;
    const aiAgentCount = agents.filter((agent) => !agent.isHuman).length;

    // If only 1 agent total and it's human, that's invalid - need at least 1 AI agent
    if (totalAgents === 1 && hasHumanAgent) {
      return res.status(400).json({
        success: false,
        message:
          "Cannot create debate with only a human agent. At least 1 AI agent is required.",
        error: "No AI agents configured",
      });
    }

    logger.info(`Agent configuration:`, {
      totalAgents,
      aiAgentCount,
      hasHumanAgent,
      humanAgentIndex: hasHumanAgent ? humanAgentIndex : "none",
      agents_received: agents.map((a) => ({
        name: a.name,
        isHuman: a.isHuman,
        enabled: a.enabled,
      })),
    });

    // Create LLM configs (excluding human agents) - NOW USING THE LOCAL agents VARIABLE
    let llmConfigs: any[] = [];
    try {
      logger.info("Creating LLM configs from AI agents...");
      llmConfigs = await createLlmConfigsFromAgents(agents);
      logger.info(`Created/found ${llmConfigs.length} LLM configs`);

      // For debates, we need at least 1 AI agent (human can't debate alone)
      if (llmConfigs.length === 0 && totalAgents > 0) {
        return res.status(400).json({
          success: false,
          message: "At least one AI agent is required for debates",
          error: "No AI agents configured",
        });
      }
    } catch (dbError) {
      logger.error("Error creating LLM configs:", dbError);
      return res.status(500).json({
        success: false,
        message: "Failed to prepare LLM configurations",
        error: dbError,
      });
    }

    // Also fix the firstAiAgent lookup - NOW USING THE LOCAL agents VARIABLE
    const firstAiAgent = agents.find((agent) => !agent.isHuman);
    if (firstAiAgent?.model === "gpt-4o-mini") {
      firstAiAgent.model = "gpt_4o_mini";
      logger.info("Using gpt-4o-mini as first AI agent, adjusting settings.");
    }
    const customQuestionsArray =
      debateData.customQuestions || req.body.custom_questions || [];
    const isCustomQuestions = customQuestionsArray.length > 0;

    const formattedCustomQuestions = isCustomQuestions
      ? customQuestionsArray.map((q: any) => {
          if (typeof q === "string") {
            return {
              question: q,
              answer: "",
              question_prompt: q,
            };
          } else if (typeof q === "object" && q.question) {
            const questionText =
              typeof q.question === "string"
                ? q.question
                : q.question.question || "";
            const answerText =
              typeof q.question === "object"
                ? q.question.correctAnswer || ""
                : q.correctAnswer || "";

            return {
              question: questionText,
              answer: answerText,
              question_prompt: questionText,
            };
          }
          return {
            question: String(q),
            answer: "",
            question_prompt: String(q),
          };
        })
      : undefined;

    logger.info("Custom questions handling:", {
      hasDebateDataCustomQuestions: !!debateData.customQuestions,
      hasReqBodyCustomQuestions: !!req.body.custom_questions,
      customQuestionsCount: customQuestionsArray.length,
      isCustomQuestions,
      formattedCount: formattedCustomQuestions?.length || 0,
      selectedDatasets:
        debateData.selectedDatasets || req.body.selectedDatasets,
    });

    const fastapiRequest: FastAPIDebateRequest = {
      debate_type: (debateData.debateType as any) ?? "basic_debate",
      task: mapDatasetToTask(debateData.selectedDatasets?.[0] ?? "gsm8k"),
      num_questions: Number(
        debateData.totalQuestions ?? req.body.num_questions ?? 1
      ),
      num_rounds: Number(debateData.numRounds ?? req.body.num_rounds ?? 1),
      num_agents: agentModels.length,
      agent_models: agentModels,
      human_agent_index: hasHumanAgent ? humanAgentIndex : undefined,
      seed: req.body.seed ?? debateData.seeds?.[0] ?? 0,
      name: req.body.name ?? debateData.experimentName,
      summarize: true,
      llm_conf_at_llm1: agentModels[0],
      custom_questions: formattedCustomQuestions,
      selected_datasets: debateData.selectedDatasets || [],
    };

    logger.info("📤 Sending to FastAPI:", {
      url: `${FASTAPI_BASE_URL}/debates`,
      payload: fastapiRequest,
    });

    const createResponse = await axios.post<FastAPIDebateResponse>(
      `${FASTAPI_BASE_URL}/debates`,
      fastapiRequest,
      {
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          "User-Agent": "NodeJS-Express-Client",
        },
        timeout: 30000,
        validateStatus: (status) => status < 600,
      }
    );

    logResponseDetails(createResponse, "Debate Creation Request");

    if (createResponse.status >= 400) {
      logger.warn(`FastAPI returned error status ${createResponse.status}`, {
        status: createResponse.status,
        data: createResponse.data,
      });

      return res.status(createResponse.status).json({
        success: false,
        message:
          (createResponse.data as any)?.detail || "FastAPI request failed",
        error: createResponse.data,
        debug: {
          fastapi_error: true,
          status: createResponse.status,
        },
      });
    }

    if (!createResponse.data?.debate_id) {
      logger.warn("FastAPI returned no debate_id", {
        response_data: createResponse.data,
      });

      return res.status(500).json({
        success: false,
        message: "Failed to create debate - no debate ID returned",
        debug: {
          has_debate_id: !!createResponse.data?.debate_id,
          response_data: createResponse.data,
        },
      });
    }

    // Sync with database
    let dbDebate: any = null;
    try {
      dbDebate = await syncDebateWithFastAPI(
        createResponse.data.debate_id,
        debateData,
        llmConfigs,
        createResponse.data.status || "queued"
      );
      logger.info(
        `Database synced with FastAPI debate: ${createResponse.data.debate_id}`
      );
    } catch (dbError) {
      logger.error(
        "Error syncing database with FastAPI debate, continuing without DB sync:",
        dbError
      );
    }

    logger.info("Debate created successfully", {
      debate_id: createResponse.data.debate_id,
      websocket_url: createResponse.data.websocket_url,
      database_synced: !!dbDebate,
      status: createResponse.data.status,
      human_agent_index: createResponse.data.human_agent_index,
    });

    return res.status(201).json({
      success: true,
      message: "Debate created successfully",
      debate_id: createResponse.data.debate_id,
      websocket_url: createResponse.data.websocket_url,
      status: createResponse.data.status,
      human_agent_index: createResponse.data.human_agent_index,
      celery_task_id: createResponse.data.celery_task_id,
      database_record: dbDebate
        ? {
            id: dbDebate.id,
            synced: true,
          }
        : null,
    });
  } catch (error: any) {
    logger.error("Error during debate creation:", error);
    return handleAxiosError(error, "Create Debate", res);
  }
};

export const getExperimentResults = async (
  req: Request,
  res: Response
): Promise<Response> => {
  try {
    const { expId } = req.params;
    logger.info(`Getting results for experiment: ${expId}`);

    try {
      logger.info("Performing health check before results request...");
      await axios.get(`${FASTAPI_BASE_URL}/health`, { timeout: 5000 });
      logger.info("Health check passed");
    } catch (healthError) {
      logger.error("Health check failed before results request:", healthError);
      return res.status(503).json({
        success: false,
        message: "FastAPI backend server is not available",
        error: "Service unavailable",
      });
    }

    const resultsUrl = `${FASTAPI_BASE_URL}/debates/${expId}/results`;
    logger.info(`Requesting results from: ${resultsUrl}`);

    const response = await axios.get(resultsUrl, {
      timeout: 30000,
      headers: {
        Accept: "application/json",
        "User-Agent": "NodeJS-Express-Client",
      },
      validateStatus: (status) => status < 600,
    });

    logResponseDetails(response, "Debate Results");

    if (response.status === 404) {
      return res.status(404).json({
        success: false,
        message: "Debate not found",
      });
    }

    if (response.status >= 400) {
      logger.warn(`Error fetching results for ${expId}`);
      return res.status(response.status).json({
        success: false,
        message: "Failed to fetch debate results",
        error: response.data,
      });
    }

    const debateData = response.data;
    const questions = debateData.questions || [];

    const wandbMetadata =
      debateData.wandb_metadata || (await getWandbMetadataFromDb(expId));
    let performanceData =
      debateData.performance_data || (await getPerformanceDataFromDb(expId));
    if (Array.isArray(performanceData)) {
      performanceData = { rounds: performanceData };
    } else if (!performanceData || typeof performanceData !== "object") {
      performanceData = { rounds: [] };
    } else if (!performanceData.rounds) {
      performanceData = { rounds: [] };
    }

    // Enhanced metadata reconstruction with proper agent information
    const reconstructedMetadata = {
      experimentId: expId,
      totalQuestions: questions.length,
      totalRounds: performanceData.rounds.length,

      // Extract agent info from wandb_metadata if available
      agents: wandbMetadata?.agents?.agent_models
        ? wandbMetadata.agents.agent_models.map(
            (model: string, index: number) => ({
              id: `agent_${index + 1}`,
              name: model,
              model: model,
            })
          )
        : extractAgentsFromResults(questions),

      // Add comprehensive metadata fields for frontend filtering
      task:
        wandbMetadata?.parsed_args?.task ||
        wandbMetadata?.parsed_args?.original_task ||
        "unknown",
      hasCustomQuestions:
        wandbMetadata?.parsed_args?.has_custom_questions || false,
      debateType: wandbMetadata?.debate_config?.debate_type || "unknown",
      numAgents:
        wandbMetadata?.agents?.num_agents ||
        wandbMetadata?.parsed_args?.num_agents ||
        0,
      agentModels: wandbMetadata?.agents?.agent_models || [],
      agentDistribution: wandbMetadata?.agents?.agent_distribution || {},
      uniqueModels: wandbMetadata?.agents?.unique_models || [],
      agentCounts: wandbMetadata?.agents?.agent_counts || [],
      humanAgentIndex: wandbMetadata?.debate_config?.human_agent_index,
      seed: wandbMetadata?.parsed_args?.seed || 0,
      summarize: wandbMetadata?.debate_config?.summarize || false,

      hasPerformanceData: performanceData.rounds.length > 0,
      hasWandbMetadata:
        !!wandbMetadata && Object.keys(wandbMetadata).length > 0,
    };

    try {
      await prisma.debate.updateMany({
        where: { experimentId: expId },
        data: {
          resultData: questions,
          performanceData: performanceData.rounds,
          wandbMetadata,
          processedAt: new Date(),
          status: "completed",
        },
      });
      logger.info(`Stored updated results for debate ${expId}`);
    } catch (dbError) {
      logger.error(`Error storing results for ${expId}:`, dbError);
    }

    return res.status(200).json({
      success: true,
      message: "Debate results retrieved successfully",
      data: {
        questions,
        performance_data: performanceData.rounds,
        wandb_metadata: wandbMetadata,
        metadata: reconstructedMetadata,
      },
    });
  } catch (error: any) {
    logger.error(
      `Error in getExperimentResults for ${req.params.expId}:`,
      error
    );
    return handleAxiosError(error, "Get Debate Results", res);
  }
};

// Helper functions remain the same
async function getWandbMetadataFromDb(expId: string) {
  try {
    const record = await prisma.debate.findFirst({
      where: { experimentId: expId },
      select: { wandbMetadata: true },
    });
    return record?.wandbMetadata || {};
  } catch {
    return {};
  }
}

async function getPerformanceDataFromDb(expId: string) {
  try {
    const record = await prisma.debate.findFirst({
      where: { experimentId: expId },
      select: { performanceData: true },
    });
    return record?.performanceData || {};
  } catch {
    return {};
  }
}

function extractAgentsFromResults(questions: any[]): any[] {
  const agentSet = new Set<string>();

  questions.forEach((q) => {
    q.debate_session?.rounds?.forEach((round: any) => {
      const responses = round.responses;

      if (responses && typeof responses === "object") {
        Object.keys(responses).forEach((key) => {
          if (key !== "is_human") agentSet.add(key);
        });
      } else if (Array.isArray(responses)) {
        // Fallback for old structure
        responses.forEach((resp: any) => {
          Object.keys(resp).forEach((key) => {
            if (key !== "is_human") agentSet.add(key);
          });
        });
      }
    });
  });

  return Array.from(agentSet).map((name, index) => ({
    id: `agent_${index + 1}`,
    name,
    model: name,
  }));
}
