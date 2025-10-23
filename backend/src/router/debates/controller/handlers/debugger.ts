// backend/src/controllers/debate/debateController.ts (ADD THESE FUNCTIONS)

import { Request, Response } from "express";
import axios, { AxiosResponse } from "axios";
import { logger } from "../../../../services/logger";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const FASTAPI_BASE_URL =
  process.env.FASTAPI_BASE_URL || "http://introspecter-api:3001";

export const replayDebate = async (
  req: Request,
  res: Response
): Promise<Response> => {
  try {
    const replayData = req.body;

    logger.info("Replay request:", {
      question_index: replayData.question_index,
      start_from_round: replayData.start_from_round,
      replace_agent_index: replayData.replace_agent_index,
      previous_rounds: replayData.previous_rounds,
      original_config: replayData.original_config,
    });

    const requiredFields = [
      "question_index",
      "start_from_round",
      "replace_agent_index",
      "question_data",
      "previous_rounds",
      "original_config",
    ];

    for (const field of requiredFields) {
      if (!(field in replayData)) {
        logger.error(`Missing required field: ${field}`);
        return res.status(400).json({
          success: false,
          message: `Missing required field: ${field}`,
        });
      }
    }

    if (replayData.start_from_round < 0) {
      return res.status(400).json({
        success: false,
        message: "start_from_round must be >= 0",
      });
    }

    if (replayData.replace_agent_index < 0) {
      return res.status(400).json({
        success: false,
        message: "replace_agent_index must be >= 0",
      });
    }

    // Health check FastAPI
    try {
      await axios.get(`${FASTAPI_BASE_URL}/health`, { timeout: 5000 });
    } catch (healthError) {
      logger.error("FastAPI health check failed:", healthError);
      return res.status(503).json({
        success: false,
        message: "FastAPI backend is not available",
        error: "Service unavailable",
      });
    }

    const response = await axios.post(
      `${FASTAPI_BASE_URL}/debates/replay`,
      replayData,
      {
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        timeout: 30000,
        validateStatus: (status) => status < 600,
      }
    );

    if (response.status >= 400) {
      logger.error(`FastAPI replay error: ${response.status}`, {
        data: response.data,
      });

      return res.status(response.status).json({
        success: false,
        message:
          response.data?.detail ||
          response.data?.message ||
          "Failed to create replay",
        error: response.data,
      });
    }

    const replayResult = response.data;

    logger.info("Replay created successfully:", {
      debate_id: replayResult.debate_id,
      websocket_url: replayResult.websocket_url,
    });

    try {
      const debate = await prisma.debate.create({
        data: {
          experimentId: replayResult.debate_id,
          seed: replayData.original_config.seed || 0,
          datasetName: replayData.original_config.dataset_name || "replay",
          status: replayResult.status,
          createdAt: new Date(replayResult.created_at),
          processedAt: new Date(),
          // Store replay metadata
          wandbMetadata: {
            is_replay: true,
            question_index: replayData.question_index,
            start_from_round: replayData.start_from_round,
            replace_agent_index: replayData.replace_agent_index,
          },
        },
      });

      logger.info(`Synced replay to database with ID: ${debate.id}`);
    } catch (dbError) {
      logger.error("Failed to sync replay to database:", dbError);
    }

    return res.status(201).json({
      success: true,
      message: "Replay created successfully",
      debate_id: replayResult.debate_id,
      websocket_url: replayResult.websocket_url,
      status: replayResult.status,
      celery_task_id: replayResult.celery_task_id,
      human_agent_index: replayResult.human_agent_index,
    });
  } catch (error: any) {
    logger.error("Error creating replay:", error);

    if (error.response) {
      return res.status(error.response.status).json({
        success: false,
        message:
          error.response.data?.detail ||
          error.response.data?.message ||
          "FastAPI error",
        error: error.response.data,
      });
    }

    if (error.request) {
      return res.status(503).json({
        success: false,
        message: "Failed to connect to FastAPI backend",
        error: error.message,
      });
    }

    return res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};

export const getQuestionDetails = async (
  req: Request,
  res: Response
): Promise<Response> => {
  try {
    const { debateId, questionIndex } = req.params;

    logger.info(
      `Getting question details: debate=${debateId}, question=${questionIndex}`
    );

    if (!debateId || !questionIndex) {
      return res.status(400).json({
        success: false,
        message: "debateId and questionIndex are required",
      });
    }

    const questionIdx = parseInt(questionIndex, 10);
    if (isNaN(questionIdx) || questionIdx < 0) {
      return res.status(400).json({
        success: false,
        message: "questionIndex must be a valid non-negative number",
      });
    }

    try {
      await axios.get(`${FASTAPI_BASE_URL}/health`, { timeout: 5000 });
    } catch (healthError) {
      logger.error("FastAPI health check failed:", healthError);
      return res.status(503).json({
        success: false,
        message: "FastAPI backend is not available",
      });
    }

    // Fetch question details from FastAPI
    const response = await axios.get(
      `${FASTAPI_BASE_URL}/debates/${debateId}/question/${questionIdx}`,
      {
        headers: {
          Accept: "application/json",
        },
        timeout: 15000,
        validateStatus: (status) => status < 600,
      }
    );

    if (response.status === 404) {
      return res.status(404).json({
        success: false,
        message: "Question not found or debate not found",
      });
    }

    if (response.status >= 400) {
      logger.error(`FastAPI error: ${response.status}`, response.data);
      return res.status(response.status).json({
        success: false,
        message: "Failed to fetch question details",
        error: response.data,
      });
    }

    return res.status(200).json({
      success: true,
      data: response.data,
    });
  } catch (error: any) {
    logger.error("Error getting question details:", error);

    if (error.response) {
      return res.status(error.response.status).json({
        success: false,
        message: error.response.data?.detail || "FastAPI error",
        error: error.response.data,
      });
    }

    if (error.request) {
      return res.status(503).json({
        success: false,
        message: "Failed to connect to FastAPI backend",
      });
    }

    return res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};

export const getStatus = async (
  req: Request,
  res: Response
): Promise<Response> => {
  try {
    const { debateId } = req.params;

    logger.info(`Getting status for debate: ${debateId}`);

    try {
      const statusUrl = `${FASTAPI_BASE_URL}/debates/${debateId}/status`;
      logger.info(`Requesting status from: ${statusUrl}`);

      const response = await axios.get(statusUrl, {
        timeout: 10000,
        headers: {
          Accept: "application/json",
        },
        validateStatus: (status) => status < 600,
      });

      if (response.status === 404) {
        return res.status(404).json({
          success: false,
          message: "Debate not found",
          debate_id: debateId,
        });
      }

      if (response.status >= 200 && response.status < 300) {
        // Success - return the status
        const debateData = response.data;

        return res.status(200).json({
          success: true,
          data: {
            debate_id: debateId,
            status: debateData.status || "unknown",
            celery_task_id: debateData.celery_task_id,
            task_status: debateData.task_status,
            current_question: debateData.current_question_index || 0,
            total_questions: debateData.total_questions || 0,
            created_at: debateData.created_at,
            debug_info: {
              has_websocket: !!debateData.websocket_url,
              has_task_id: !!debateData.celery_task_id,
              task_state: debateData.task_status?.state || "UNKNOWN",
              fastapi_reachable: true,
            },
          },
        });
      }

      // FastAPI returned an error status
      logger.warn(
        `FastAPI returned error status ${response.status} for debate ${debateId}`
      );

      // Fall through to return a basic status based on what we know
    } catch (axiosError: any) {
      logger.error(`Error fetching status from FastAPI for ${debateId}:`, {
        message: axiosError.message,
        code: axiosError.code,
        response_status: axiosError.response?.status,
      });
    }

    try {
      const dbDebate = await prisma.debate.findFirst({
        where: { experimentId: debateId },
        select: {
          id: true,
          status: true,
          createdAt: true,
          processedAt: true,
        },
      });

      if (dbDebate) {
        logger.info(`Found debate in database with status: ${dbDebate.status}`);

        return res.status(200).json({
          success: true,
          data: {
            debate_id: debateId,
            status: dbDebate.status || "queued",
            current_question: 0,
            total_questions: 0,
            created_at: dbDebate.createdAt.toISOString(),
            debug_info: {
              source: "database",
              fastapi_unavailable: true,
              db_status: dbDebate.status,
            },
          },
        });
      }
    } catch (dbError) {
      logger.error(`Database error checking debate ${debateId}:`, dbError);
    }

    // If both FastAPI and database failed, return a safe default
    return res.status(200).json({
      success: true,
      data: {
        debate_id: debateId,
        status: "queued", // Safe default
        current_question: 0,
        total_questions: 0,
        created_at: new Date().toISOString(),
        debug_info: {
          source: "fallback",
          fastapi_unavailable: true,
          database_unavailable: true,
        },
      },
    });
  } catch (error: any) {
    logger.error(
      `Unexpected error getting debate status for ${req.params.debateId}:`,
      error
    );

    // Return a safe response instead of 500
    return res.status(200).json({
      success: true,
      data: {
        debate_id: req.params.debateId,
        status: "unknown",
        current_question: 0,
        total_questions: 0,
        created_at: new Date().toISOString(),
        debug_info: {
          error: error.message,
          error_type: error.constructor.name,
        },
      },
    });
  }
};

export const cancelDebate = async (
  req: Request,
  res: Response
): Promise<Response> => {
  try {
    const { debateId } = req.params;

    logger.info(`Cancelling debate: ${debateId}`);

    // Call FastAPI to cancel the debate
    const response = await axios.post(
      `${FASTAPI_BASE_URL}/debates/${debateId}/cancel`,
      {},
      {
        headers: {
          "Content-Type": "application/json",
        },
        timeout: 10000,
        validateStatus: (status) => status < 600,
      }
    );

    if (response.status >= 400) {
      logger.warn(`Failed to cancel debate ${debateId}`, {
        status: response.status,
        data: response.data,
      });

      return res.status(response.status).json({
        success: false,
        message: "Failed to cancel debate",
        error: response.data,
      });
    }

    logger.info(`Successfully cancelled debate ${debateId}`);

    return res.status(200).json({
      success: true,
      message: "Debate cancelled successfully",
      data: response.data,
    });
  } catch (error: any) {
    logger.error(`Error cancelling debate ${req.params.debateId}:`, error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};

export const getHumanResponse = async (
  req: Request,
  res: Response
): Promise<Response> => {
  try {
    const { debateId } = req.params;
    const { response_text, extracted_answer } = req.body;

    logger.info(`📨 Received human response for debate ${debateId}`);
    logger.info(`   Response text: ${response_text?.slice(0, 100)}...`);
    logger.info(`   Extracted answer: ${extracted_answer}`);

    if (!debateId) {
      return res.status(400).json({
        success: false,
        message: "debateId is required",
      });
    }

    if (!response_text) {
      return res.status(400).json({
        success: false,
        message: "response_text is required",
      });
    }

    try {
      await axios.get(`${FASTAPI_BASE_URL}/health`, { timeout: 5000 });
    } catch (healthError) {
      logger.error("FastAPI health check failed:", healthError);
      return res.status(503).json({
        success: false,
        message: "FastAPI backend is not available",
      });
    }

    const response = await axios.post(
      `${FASTAPI_BASE_URL}/debate/${debateId}/human-response`,
      {
        response_text,
        extracted_answer,
      },
      {
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        timeout: 15000,
        validateStatus: (status) => status < 600,
      }
    );
    if (response.status >= 400) {
      logger.warn(
        `FastAPI error submitting human response: ${response.status}`,
        {
          data: response.data,
        }
      );

      return res.status(response.status).json({
        success: false,
        message:
          response.data?.detail ||
          response.data?.message ||
          "Failed to submit human response",
        error: response.data,
      });
    }

    logger.info(`Human response submitted successfully for debate ${debateId}`);
    return res.status(200).json({
      success: true,
      message: "Human response submitted successfully",
      debate_id: debateId,
    });
  } catch (error: any) {
    logger.error("Error submitting human response:", error);

    if (error.response) {
      return res.status(error.response.status).json({
        success: false,
        message:
          error.response.data?.detail ||
          error.response.data?.message ||
          "FastAPI error",
        error: error.response.data,
      });
    }

    if (error.request) {
      return res.status(503).json({
        success: false,
        message: "Failed to connect to FastAPI backend",
      });
    }

    return res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};
