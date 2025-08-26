import { Request, Response } from 'express';
import axios, { AxiosResponse } from 'axios';
import { logger } from '../../../../services/logger';
import { PrismaClient } from '@prisma/client';

// Initialize Prisma client
const prisma = new PrismaClient();

// FastAPI backend configuration
const FASTAPI_BASE_URL = process.env.FASTAPI_BASE_URL || 'http://localhost:8001';

interface Agent {
  id: string;
  name: string;
  model: string;
  enabled: boolean;
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
}

interface FastAPIDebateResponse {
  success: boolean;
  message: string;
  experiment_id: string;
  command?: string;
  websocket_url?: string;
}

async function createLlmConfigsFromAgents(agents: Agent[]) {
  const createdConfigs = [];
  
  for (const agent of agents) {
    try {
      // Check if config already exists
      const existing = await prisma.llmConfig.findFirst({
        where: {
          model: agent.model
        }
      });
      
      if (existing) {
        logger.info(`LLM config already exists: ${agent.name}`);
        createdConfigs.push(existing);
        continue;
      }

      // Create new config if it doesn't exist
      const newConfig = await prisma.llmConfig.create({
        data: {
          modelName: agent.name,
          model: agent.model,
          apiBase: agent.model.startsWith('gpt') ? 'https://api.openai.com/v1' : undefined,
          temperature: 0.7,
          maxTokens: 2000,
        }
      });
      
      logger.info(`Created new LLM config: ${agent.name}`);
      createdConfigs.push(newConfig);
      
    } catch (error) {
      logger.error(`Error creating LLM config for ${agent.name}:`, error);
    }
  }
  
  return createdConfigs;
}

async function syncDebateWithFastAPI(debateData: DebateData, experimentId: string, llmConfigs: any[], status: string = 'queued') {
  try {
    logger.info(`Syncing experiment with ID: ${experimentId} (status: ${status})`);
    
    // Check if debate already exists by experimentId first
    const existingByExpId = await prisma.debate.findFirst({
      where: { 
        experimentId: experimentId
      }
    });

    if (existingByExpId) {
      logger.info(`Debate already exists with experimentId: ${existingByExpId.id}, updating status to ${status}`);
      
      const updatedDebate = await prisma.debate.update({
        where: { id: existingByExpId.id },
        data: {
          status: status,
          processedAt: new Date(),
        },
        include: {
          llmConfigs: true
        }
      });
      
      return updatedDebate;
    }
    
    const baseDatasetName = debateData.selectedDatasets?.[0] || 'custom';    
    const debate = await prisma.debate.create({
      data: {
        experimentId: experimentId,
        seed: debateData.seeds?.[0] || null,
        datasetName: baseDatasetName,
        status: status,
        createdAt: new Date(),
        processedAt: new Date(),
        llmConfigs: {
          connect: llmConfigs.map(config => ({ id: config.id }))
        }
      },
      include: {
        llmConfigs: true
      }
    });
    
    logger.info(`✅ Created new debate record with ID: ${debate.id} (experimentId: ${experimentId}, status: ${status})`);
    return debate;
    
  } catch (error) {
    logger.error('❌ Error syncing debate record with FastAPI:', error);
    
    // If it's a unique constraint error, try to find existing record
    if (typeof error === 'object' && error !== null && 'code' in error && (error as any).code === 'P2002') {
      logger.warn('Unique constraint violation, attempting to find existing record...');
      
      try {
        const existing = await prisma.debate.findFirst({
          where: { 
            experimentId: experimentId
          },
          include: {
            llmConfigs: true
          }
        });
        
        if (existing) {
          logger.info(`Found existing record after constraint error: ${existing.id}`);
          return existing;
        }
      } catch (findError) {
        logger.error('Error finding existing record:', findError);
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
    contentType: response.headers['content-type'],
    dataType: typeof response.data,
    dataLength: typeof response.data === 'string' ? response.data.length : 'N/A',
    dataPreview: typeof response.data === 'string' 
      ? response.data.substring(0, 200) + (response.data.length > 200 ? '...' : '')
      : JSON.stringify(response.data).substring(0, 200)
  });
};

// Helper function to handle axios errors with better logging
const handleAxiosError = (error: any, context: string, res: Response) => {
  logger.error(`${context} - Detailed error analysis:`, {
    errorType: error.constructor.name,
    message: error.message,
    code: error.code,
    config: {
      url: error.config?.url,
      method: error.config?.method,
      timeout: error.config?.timeout,
      headers: error.config?.headers
    }
  });

  if (error.response) {
    logger.error(`${context} - FastAPI response error:`, {
      status: error.response.status,
      statusText: error.response.statusText,
      headers: error.response.headers,
      contentType: error.response.headers['content-type'],
      dataType: typeof error.response.data,
      dataLength: typeof error.response.data === 'string' ? error.response.data.length : 'N/A',
      rawData: error.response.data,
      dataPreview: typeof error.response.data === 'string' 
        ? error.response.data.substring(0, 500)
        : JSON.stringify(error.response.data).substring(0, 500)
    });
    
    const contentType = error.response.headers['content-type'] || '';
    if (contentType.includes('text/html')) {
      logger.warn(`${context} - Received HTML response instead of JSON. This might indicate a server error or wrong endpoint.`);
    }
    
    return res.status(error.response.status).json({
      success: false,
      message: error.response.data?.detail || error.response.data?.message || `FastAPI error: ${error.response.status}`,
      error: error.response.data,
      fastapi_url: FASTAPI_BASE_URL,
      debug: {
        contentType: contentType,
        responseType: typeof error.response.data,
        statusCode: error.response.status
      }
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
      port: error.port
    });
    
    return res.status(503).json({
      success: false,
      message: 'Failed to process request',
      error: error.message,
      debug: {
        requestSetupError: true
      }
    });
  }
};

async function checkForExistingExperiment(debateData: DebateData): Promise<any | null> {
  try {
    const fiveMinutesAgo = new Date(Date.now() -  60 * 1000);
    const existingExperiment = await prisma.debate.findFirst({
      where: {
        AND: [
          { datasetName: debateData.selectedDatasets?.[0] || 'custom' },
          { seed: debateData.seeds?.[0] || null },
          { createdAt: { gte: fiveMinutesAgo } },
          {
            OR: [
              { status: 'queued' },
              { status: 'running' },
              { status: 'in-progress' },
              { status: 'pending' }
            ]
          }
        ]
      },
      include: {
        llmConfigs: true
      }
    });

    return existingExperiment;
  } catch (error) {
    logger.error('Error checking for existing experiment:', error);
    return null;
  }
}

export const getNewDebate = async (req: Request, res: Response): Promise<Response> => {
  try {
    const debateData: DebateData = req.body;
    
    // Check for existing experiments first
    const existingExperiment = await checkForExistingExperiment(debateData);
    if (existingExperiment && existingExperiment.experimentId) {
      logger.info(`Found existing experiment: ${existingExperiment.experimentId}`);
      return res.status(200).json({
        success: true,
        message: 'Found existing experiment with same configuration',
        experiment_id: existingExperiment.experimentId,
        websocket_url: `ws://localhost:8001/ws/debate/${existingExperiment.experimentId}`,
        status: existingExperiment.status,
        database_record: { id: existingExperiment.id, synced: true, existing: true }
      });
    }
    
    logger.info(`Creating new debate experiment with payload:`, {
      experimentName: debateData.experimentName,
      totalQuestions: debateData.totalQuestions,
      numRounds: debateData.numRounds,
      seedsCount: debateData.seeds?.length,
      agentsCount: debateData.agents?.length,
      datasetsCount: debateData.selectedDatasets?.length,
      customQuestionsCount: debateData.customQuestions?.length,
      status: debateData.status
    });
    
    // Health check
    try {
      logger.info('Performing FastAPI health check...');
      const healthResponse = await axios.get(`${FASTAPI_BASE_URL}/health`, { 
        timeout: 5000,
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'NodeJS-Express-Client'
        }
      });
      
      logResponseDetails(healthResponse, 'Health Check');
      logger.info('FastAPI server health check passed');
    } catch (healthError: any) {
      logger.error('FastAPI server health check failed:', {
        error: healthError.message,
        code: healthError.code,
        fastapi_url: FASTAPI_BASE_URL
      });
      
      return res.status(503).json({
        success: false,
        message: 'FastAPI backend server is not available. Please make sure it is running on port 8001.',
        error: 'Service unavailable',
        fastapi_url: FASTAPI_BASE_URL,
        debug: {
          healthCheckFailed: true,
          errorCode: healthError.code
        }
      });
    }

    let llmConfigs: any[] = [];
    
    try {
      logger.info('Creating LLM configs from agents...');
      llmConfigs = await createLlmConfigsFromAgents(debateData.agents);
      logger.info(`Created/found ${llmConfigs.length} LLM configs`);
    } catch (dbError) {
      logger.error('Error creating LLM configs:', dbError);
      return res.status(500).json({
        success: false,
        message: 'Failed to prepare LLM configurations',
        error: dbError
      });
    }
    
    // SINGLE API CALL - queue endpoint will handle both queuing AND execution
    logger.info('Sending debate request to FastAPI (queue and auto-execute)...');
    const queueResponse = await axios.post<FastAPIDebateResponse>(
      `${FASTAPI_BASE_URL}/api/debate/queue`,
      debateData,
      {
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'User-Agent': 'NodeJS-Express-Client'
        },
        timeout: 30000,
        validateStatus: (status) => status < 600
      }
    );
    
    logResponseDetails(queueResponse, 'Debate Queue Request');
    
    if (queueResponse.status >= 400) {
      logger.warn(`FastAPI returned error status ${queueResponse.status}`, {
        status: queueResponse.status,
        data: queueResponse.data
      });
      
      return res.status(queueResponse.status).json({
        success: false,
        message: queueResponse.data?.message || 'FastAPI request failed',
        error: queueResponse.data,
        debug: {
          fastapi_error: true,
          status: queueResponse.status
        }
      });
    }
    
    if (!queueResponse.data?.success || !queueResponse.data.experiment_id) {
      logger.warn('FastAPI returned success=false or missing experiment_id', {
        response_data: queueResponse.data
      });
      
      return res.status(500).json({
        success: false,
        message: queueResponse.data?.message || 'Failed to queue debate experiment - no experiment ID returned',
        debug: {
          fastapi_success: queueResponse.data?.success,
          has_experiment_id: !!queueResponse.data?.experiment_id,
          response_data: queueResponse.data
        }
      });
    }

    // Sync with database (the FastAPI queue endpoint already started execution)
    let dbDebate: any = null;
    try {
      // Since FastAPI queue endpoint auto-starts execution, mark as running
      dbDebate = await syncDebateWithFastAPI(debateData, queueResponse.data.experiment_id, llmConfigs, 'running');
      logger.info(`Database synced with FastAPI experiment: ${queueResponse.data.experiment_id} (Status: running)`);
    } catch (dbError) {
      logger.error('Error syncing database with FastAPI experiment, continuing without DB sync:', dbError);
    }
    
    logger.info('Debate experiment queued and execution started successfully', {
      experiment_id: queueResponse.data.experiment_id,
      websocket_url: queueResponse.data.websocket_url,
      database_synced: !!dbDebate,
      status: 'running'
    });

    // Return success response - no need for additional execution calls
    return res.status(200).json({
      success: true,
      message: 'Experiment running successfully',
      experiment_id: queueResponse.data.experiment_id,
      websocket_url: queueResponse.data.websocket_url,
      status: 'running'
    });

  } catch (error: any) {
    logger.error('Error during experiment creation:', error);
    return handleAxiosError(error, 'Create Debate Experiment', res);
  }
};
export const getExperimentStatus = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { experiment_id } = req.params;
    logger.info(`Getting status for experiment: ${experiment_id}`);
    
    try {
      logger.info('Performing health check before status request...');
      await axios.get(`${FASTAPI_BASE_URL}/health`, { timeout: 5000 });
      logger.info('Health check passed');
    } catch (healthError) {
      logger.error('Health check failed before status request:', healthError);
      return res.status(503).json({
        success: false,
        message: 'FastAPI backend server is not available',
        error: 'Service unavailable',
        debug: {
          healthCheckFailed: true
        }
      });
    }
    
    logger.info(`Requesting status from: ${FASTAPI_BASE_URL}/api/debate/${experiment_id}/status`);
    const response = await axios.get(
      `${FASTAPI_BASE_URL}/api/debate/${experiment_id}/status`,
      { 
        timeout: 10000,
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'NodeJS-Express-Client'
        },
        validateStatus: (status) => status < 600
      }
    );
    
    logResponseDetails(response, 'Experiment Status');
    
    if (response.status === 404) {
      logger.warn(`Experiment ${experiment_id} not found`);
      return res.status(404).json({
        success: false,
        message: 'Experiment not found',
      });
    }
    
    logger.info(`Successfully retrieved status for experiment ${experiment_id}`);
    return res.status(200).json(response.data);
    
  } catch (error: any) {
    return handleAxiosError(error, 'Get Experiment Status', res);
  }
};

export const getExperimentResults = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { expId } = req.params;
    logger.info(`Getting results for experiment: ${expId}`);    
    try {
      logger.info('Performing health check before results request...');
      await axios.get(`${FASTAPI_BASE_URL}/health`, { timeout: 5000 });
      logger.info('Health check passed');
    } catch (healthError) {
      logger.error('Health check failed before results request:', healthError);
      return res.status(503).json({
        success: false,
        message: 'FastAPI backend server is not available',
        error: 'Service unavailable',
        debug: {
          healthCheckFailed: true
        }
      });
    }
    
    logger.info(`Requesting results from: ${FASTAPI_BASE_URL}/api/debate/${expId}/results`);
    const response = await axios.get(
      `${FASTAPI_BASE_URL}/api/debate/${expId}/results`,
      { 
        timeout: 30000,
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'NodeJS-Express-Client'
        },
        validateStatus: (status) => status < 600
      }
    );
    
    logResponseDetails(response, 'Experiment Results');
    
    if (response.status === 404) {
      logger.warn(`Experiment ${expId} not found`);
      return res.status(404).json({
        success: false,
        message: 'Experiment not found',
      });
    } else if (response.status === 400) {
      logger.warn(`Experiment ${expId} not completed yet`);
      return res.status(400).json({
        success: false,
        message: 'Experiment not completed yet',
      });
    }

    await prisma.debate.updateMany({
      where: { experimentId: expId },
      data: { 
        status: 'completed',
        resultData: response.data.resultData,
        performanceData: response.data.performanceData,
        wandbMetadata: response.data.wandbMetadata,
        processedAt: new Date()
      }
    });
    logger.info(`Successfully retrieved results for experiment ${expId}`);
    return res.status(200).json(response.data);
    
  } catch (error: any) {
    return handleAxiosError(error, 'Get Experiment Results', res);
  }
};