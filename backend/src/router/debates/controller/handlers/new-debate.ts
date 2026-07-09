import { Request, Response } from "express";
import axios, { AxiosResponse } from "axios";
import { logger } from "../../../../services/logger";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const FASTAPI_BASE_URL = process.env.FASTAPI_BASE_URL || "http://introspecter-api:3001";

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
  allDatasets?: string[];
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

const handleAxiosError = (error: any, context: string, res: Response) => {
  logger.error(`${context} error:`, {
    message: error.message,
    code: error.code,
    url: error.config?.url,
  });

  if (error.response) {
    return res.status(error.response.status).json({
      success: false,
      message: error.response.data?.detail || error.response.data?.message || `FastAPI error`,
      error: error.response.data,
      fastapi_url: FASTAPI_BASE_URL,
    });
  } else if (error.request) {
    return res.status(503).json({
      success: false,
      message: "Failed to connect to FastAPI backend",
      error: error.message,
    });
  }

  return res.status(500).json({
    success: false,
    message: "Unknown error occurred",
    error: error.message,
  });
};

async function createLlmConfigsFromAgents(agents: Agent[]) {
  const aiAgents = agents.filter(a => !a.isHuman);
  if (aiAgents.length === 0) return [];

  const distinctModels = [...new Set(aiAgents.map(a => a.model))];

  const existingConfigs = await prisma.llmConfig.findMany({
    where: { model: { in: distinctModels } }
  });

  const existingModelSet = new Set(existingConfigs.map(c => c.model));
  const missingModels = distinctModels.filter(m => !existingModelSet.has(m));

  if (missingModels.length > 0) {
    const newConfigsData = missingModels.map(model => ({
      modelName: model,
      model: model,
      apiBase: model.startsWith("gpt") ? "https://api.openai.com/v1" : undefined,
      temperature: 0.7,
      maxTokens: 2000,
    }));

    await prisma.llmConfig.createMany({
      data: newConfigsData,
      skipDuplicates: true 
    });
  }

  return prisma.llmConfig.findMany({
    where: { model: { in: distinctModels } }
  });
}

async function syncDebateWithFastAPI(
  debateId: string,
  debateData: DebateData,
  llmConfigs: any[],
  status: string = "queued"
) {
  const datasetName = (debateData.customQuestions && debateData.customQuestions.length > 0)
    ? "custom_questions"
    : (debateData.selectedDatasets?.[0] || "custom");

  const seed = Array.isArray(debateData.seeds) ? debateData.seeds[0] : (debateData as any).seed ?? 0;

  const existing = await prisma.debate.findFirst({
    where: { experimentId: debateId },
    select: { id: true }
  });

  if (existing) {
    return prisma.debate.update({
      where: { id: existing.id },
      data: { status, processedAt: new Date() },
      include: { llmConfigs: true },
    });
  }

  return prisma.debate.create({
    data: {
      experimentId: debateId,
      seed,
      datasetName,
      status,
      createdAt: new Date(),
      processedAt: new Date(),
      llmConfigs: {
        connect: llmConfigs.map((config) => ({ id: config.id })),
      },
    },
    include: { llmConfigs: true },
  });
}

function mapDatasetToTask(dataset: string): FastAPIDebateRequest["task"] {
  const mapping: Record<string, FastAPIDebateRequest["task"]> = {
    gsm8k: "gsm8k",
    mmlu: "mmlu",
    math: "math",
    commonsense_qa: "commonsense_qa",
    custom_questions: "custom",
  };
  return mapping[dataset.toLowerCase()] || "mmlu";
}

export const getNewDebate = async (req: Request, res: Response): Promise<Response> => {
  try {
    const debateData: DebateData = req.body;
    let agents: Agent[] = [];
    let agentModels: string[] = [];

    // Prefer debateData.agents — it carries the authoritative isHuman flag per agent.
    // Only fall back to reconstructing from a bare agent_models[] list when no
    // structured agents array was sent at all.
    if (debateData.agents && debateData.agents.length > 0) {
      agents = debateData.agents;
      agentModels = agents.filter((a) => a.enabled).map((a) => a.model);
    } else if (req.body.agent_models && Array.isArray(req.body.agent_models)) {
      agentModels = req.body.agent_models;
      agents = agentModels.map((model, index) => ({
        id: `agent_${index}`,
        name: model,
        model: model,
        enabled: true,
        isHuman: model === "human-participant",
      }));
    } else {
      return res.status(400).json({ success: false, message: "At least 1 agent is required" });
    }

    if (!agentModels.length) return res.status(400).json({ success: false, message: "Invalid agent count" });

    const humanAgentIndex = agents.findIndex((a) => a.isHuman === true);
    const hasHumanAgent = humanAgentIndex >= 0;

    if (agents.length === 1 && hasHumanAgent) {
      return res.status(400).json({ success: false, message: "Cannot create debate with only a human agent." });
    }

    const llmConfigs = await createLlmConfigsFromAgents(agents);

    const customQuestionsArray = debateData.customQuestions || req.body.custom_questions || [];
    const formattedCustomQuestions = customQuestionsArray.length > 0
      ? customQuestionsArray.map((q: any) => {
          if (typeof q === "string") return { question: q, answer: "", question_prompt: q };
          const qText = typeof q.question === "string" ? q.question : q.question?.question || "";
          const aText = typeof q.question === "object" ? q.question.correctAnswer || "" : q.correctAnswer || "";
          return { question: qText, answer: aText, question_prompt: qText };
        })
      : undefined;

    const totalQuestions = Number(debateData.totalQuestions ?? req.body.num_questions ?? 1);
    const numCustom = formattedCustomQuestions?.length || 0;
    const regularDatasets = (debateData.selectedDatasets || []).filter(d => d !== "custom_questions");
    
    let questionsPerDataset = totalQuestions;
    if (regularDatasets.length > 0) {
      const remaining = Math.max(0, totalQuestions - numCustom);
      questionsPerDataset = Math.floor(remaining / regularDatasets.length);
    }

    const fastapiRequest: FastAPIDebateRequest = {
      debate_type: (debateData.debateType as any) ?? "basic_debate",
      task: mapDatasetToTask(debateData.selectedDatasets?.[0] ?? "gsm8k"),
      num_questions: questionsPerDataset,
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

    const createResponse = await axios.post<FastAPIDebateResponse>(
      `${FASTAPI_BASE_URL}/debates`,
      fastapiRequest,
      {
        headers: { "Content-Type": "application/json" },
        timeout: 30000,
        validateStatus: (s) => s < 600,
      }
    );

    if (createResponse.status >= 400) {
      return res.status(createResponse.status).json({
        success: false,
        message: (createResponse.data as any)?.detail || "FastAPI request failed",
        error: createResponse.data,
      });
    }

    const { debate_id, websocket_url, status, celery_task_id } = createResponse.data;

    let dbDebate = null;
    try {
      dbDebate = await syncDebateWithFastAPI(debate_id, debateData, llmConfigs, status || "queued");
    } catch (e) {
      logger.error("DB Sync failed non-fatally", e);
    }

    return res.status(201).json({
      success: true,
      message: "Debate created successfully",
      debate_id,
      websocket_url,
      status,
      human_agent_index: createResponse.data.human_agent_index,
      celery_task_id,
      database_record: dbDebate ? { id: dbDebate.id, synced: true } : null,
    });

  } catch (error: any) {
    return handleAxiosError(error, "Create Debate", res);
  }
};

export const getExperimentResults = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { expId } = req.params;
    
    const response = await axios.get(`${FASTAPI_BASE_URL}/debates/${expId}/results`, {
      timeout: 30000,
      headers: { Accept: "application/json" },
      validateStatus: (s) => s < 600,
    });

    if (response.status === 404) return res.status(404).json({ success: false, message: "Debate not found" });
    if (response.status >= 400) return res.status(response.status).json({ success: false, error: response.data });

    const debateData = response.data;
    const questions = debateData.questions || [];
    
    const [dbWandb, dbPerf] = await Promise.all([
        getWandbMetadataFromDb(expId),
        getPerformanceDataFromDb(expId)
    ]);

    const wandbMetadata = debateData.wandb_metadata || dbWandb;
    let performanceData = debateData.performance_data || dbPerf;

    if (Array.isArray(performanceData)) performanceData = { rounds: performanceData };
    else if (!performanceData?.rounds) performanceData = { rounds: [] };

    const reconstructedMetadata = {
      experimentId: expId,
      totalQuestions: questions.length,
      totalRounds: performanceData.rounds.length,
      agents: wandbMetadata?.agents?.agent_models
        ? wandbMetadata.agents.agent_models.map((m: string, i: number) => ({ id: `agent_${i + 1}`, name: m, model: m }))
        : extractAgentsFromResults(questions),
      task: wandbMetadata?.parsed_args?.task || "unknown",
      hasCustomQuestions: wandbMetadata?.parsed_args?.has_custom_questions || false,
      debateType: wandbMetadata?.debate_config?.debate_type || "unknown",
      numAgents: wandbMetadata?.agents?.num_agents || 0,
      agentModels: wandbMetadata?.agents?.agent_models || [],
      humanAgentIndex: wandbMetadata?.debate_config?.human_agent_index,
      seed: wandbMetadata?.parsed_args?.seed || 0,
      summarize: wandbMetadata?.debate_config?.summarize || false,
    };

    prisma.debate.updateMany({
      where: { experimentId: expId },
      data: {
        resultData: questions,
        performanceData: performanceData.rounds,
        wandbMetadata,
        processedAt: new Date(),
        status: "completed",
      },
    }).catch(e => logger.error(`Background DB update failed for ${expId}`, e));

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
    return handleAxiosError(error, "Get Debate Results", res);
  }
};

async function getWandbMetadataFromDb(expId: string) {
  const r = await prisma.debate.findFirst({ where: { experimentId: expId }, select: { wandbMetadata: true } });
  return r?.wandbMetadata || {};
}

async function getPerformanceDataFromDb(expId: string) {
  const r = await prisma.debate.findFirst({ where: { experimentId: expId }, select: { performanceData: true } });
  return r?.performanceData || {};
}

function extractAgentsFromResults(questions: any[]): any[] {
  const agentSet = new Set<string>();
  for (const q of questions) {
    if (!q.debate_session?.rounds) continue;
    for (const round of q.debate_session.rounds) {
      const responses = round.responses;
      if (!responses) continue;
      const keys = Array.isArray(responses) 
        ? responses.flatMap(r => Object.keys(r)) 
        : Object.keys(responses);
      
      for (const k of keys) {
        if (k !== "is_human") agentSet.add(k);
      }
    }
  }
  return Array.from(agentSet).map((name, index) => ({
    id: `agent_${index + 1}`,
    name,
    model: name,
  }));
}