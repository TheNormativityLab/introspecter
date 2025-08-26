import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { logger } from '../../../../services/logger';

const prisma = new PrismaClient();

export const getAllDebates = async (req: Request, res: Response): Promise<Response> => {
  try {
    logger.info(`Attempt to retrieve all debates`);
    
    const totalDebates = await prisma.debate.count();
    logger.info(`Total debates in database: ${totalDebates}`);
    
    if (totalDebates === 0) {
      logger.info('No debates found in database');
      return res.json({
        success: true,
        experiment_groups: [],
        debug: {
          totalDebates: 0,
          message: 'No debates found in database'
        }
      });
    }
    
    const allDebates = await prisma.debate.findMany({
      where: {
        AND: [
          {
            wandbMetadata: {
              not: null
            }
          },
          {
            wandbMetadata: {
              not: {}
            }
          },
          {
            seed: {
              not: null
            }
          }
        ]
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
            temperature: true
          }
        }
      },
      orderBy: {
        processedAt: 'desc'
      }
    });
    
    logger.info(`Found ${allDebates.length} debates with wandb_metadata and seed`);    
    const experimentGroups = new Map();
    
    allDebates.forEach(debate => {
      let experimentName =
        typeof debate.wandbMetadata === 'object' &&
        debate.wandbMetadata !== null &&
        'parsed_args' in debate.wandbMetadata &&
        (debate.wandbMetadata as any).parsed_args &&
        (debate.wandbMetadata as any).parsed_args["experiment.name"]
          ? (debate.wandbMetadata as any).parsed_args["experiment.name"]
          : undefined;
      if (!experimentName) {
        experimentName = debate.llmConfigs.map(c => c.modelName).sort().join('_vs_');
      }
      if (!experimentGroups.has(experimentName)) {
        const expected_seeds = (() => {
          if (
            typeof debate.wandbMetadata === 'object' &&
            debate.wandbMetadata !== null &&
            'parsed_args' in debate.wandbMetadata &&
            (debate.wandbMetadata as any).parsed_args
          ) {
            const seedRaw = (debate.wandbMetadata as any).parsed_args?.["seed"];
            return seedRaw
              ? (Array.isArray(seedRaw)
                  ? seedRaw.map(Number)
                  : seedRaw.toString().split(',').map(Number))
              : [];
          }
          return [];
        })();
        experimentGroups.set(experimentName, {
          experiment_name: experimentName,
          dataset_name: debate.datasetName, 
          model_config: {
            LLM: debate.llmConfigs.map(config => ({
              id: config.id,
              modelName: config.modelName,
              model: config.model,
              apiBase: config.apiBase,
              timeout: config.timeout,
              numRetries: config.numRetries,
              rpm: config.rpm,
              topP: config.topP,
              maxTokens: config.maxTokens,
              temperature: config.temperature
            }))
          },
          runs: [],
          total_runs: 0,
          completed_runs: 0,
          failed_runs: 0,
          seeds_present: new Set(),
          expected_seeds: expected_seeds,
          created_at: debate.processedAt,
          last_updated: debate.processedAt
        });
      }
      
      const group = experimentGroups.get(experimentName);
      
      group.runs.push({
        debate_id: debate.id,
        seed: debate.seed,
        dataset_name: debate.datasetName,
        status: debate.status,
        wandb_metadata: debate.wandbMetadata,
        processed_at: debate.processedAt
      });
      
      group.seeds_present.add(debate.seed);
      
      group.total_runs++;
      if (debate.status === 'completed') group.completed_runs++;
      if (debate.status === 'failed') group.failed_runs++;
      
      if (debate.processedAt > group.last_updated) {
        group.last_updated = debate.processedAt;
      }
      if (debate.processedAt < group.created_at) {
        group.created_at = debate.processedAt;
      }
    });
    
    const consolidatedExperiments = Array.from(experimentGroups.values()).map(group => {
      const seedsPresent = Array.from(group.seeds_present).map(Number).sort((a, b) => a - b);
      const missingSeeds = group.expected_seeds ? 
        group.expected_seeds.filter(seed => !group.seeds_present.has(seed)) : 
        [];
      
      const success_rate = group.total_runs > 0 ? 
        ((group.completed_runs / group.total_runs) * 100).toFixed(1) + '%' : 
        '0%';
      
      return {
        ...group,
        runs: group.runs.sort((a, b) => a.seed - b.seed),
        seeds_present: seedsPresent,
        missing_seeds: missingSeeds,
        is_complete: group.runs.every(run => run.status === 'completed'),
        success_rate,
      };
    });
    
    consolidatedExperiments.sort((a, b) => {
      const nameCompare = a.experiment_name.localeCompare(b.experiment_name);
      if (nameCompare !== 0) return nameCompare;      
      return new Date(b.last_updated).getTime() - new Date(a.last_updated).getTime();
    });
    
    return res.json({
      success: true,
      experiment_groups: consolidatedExperiments,
      debug: {
        totalDebates,
        totalExperiments: consolidatedExperiments.length,
        totalRuns: allDebates.length,
        experimentNames: consolidatedExperiments.map(exp => ({
          name: exp.experiment_name,
          runs: exp.total_runs,
          seeds: exp.seeds_present,
          missing: exp.missing_seeds,
          complete: exp.is_complete
        }))
      }
    });
  } catch (error) {
    logger.error('Get all debates error:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

export const getDebateRun = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { debateId } = req.query;
    logger.info(`Attempt to retrieve debate run with ID: ${debateId}`);
    
    if (!debateId) {
      return res.status(400).json({
        success: false,
        errors: {
          debateId: ['Debate ID is required']
        }
      });
    }
    
    const idValue = Array.isArray(debateId) ? debateId[0] : debateId;
    const debateIdNum = Number(idValue);
    
    if (isNaN(debateIdNum) || debateIdNum <= 0) {
      return res.status(400).json({
        success: false,
        errors: {
          debateId: ['Debate ID must be a valid positive number']
        }
      });
    }
    
    const debate = await prisma.debate.findUnique({
      where: {
        id: debateIdNum
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
            temperature: true
          }
        }
      }
    });
    
    if (!debate) {
      return res.status(404).json({
        success: false,
        message: 'Debate not found'
      });
    }
    
    if (!debate.wandbMetadata || 
        (typeof debate.wandbMetadata === 'object' && Object.keys(debate.wandbMetadata).length === 0)) {
      return res.status(404).json({
        success: false,
        message: 'Debate found but has no wandb_metadata'
      });
    }
    
    if (!debate.seed && debate.seed !== 0) {
      return res.status(404).json({
        success: false,
        message: 'Debate found but has no seed'
      });
    }
    
    const runDetails = {
      debate_id: debate.id,
      seed: debate.seed,
      status: debate.status,
      dataset_name: debate.datasetName,
      model_config: {
        LLM: debate.llmConfigs.map(config => ({
          id: config.id,
          modelName: config.modelName,
          model: config.model,
          apiBase: config.apiBase,
          timeout: config.timeout,
          numRetries: config.numRetries,
          rpm: config.rpm,
          topP: config.topP,
          maxTokens: config.maxTokens,
          temperature: config.temperature
        }))
      },
      performance_data: debate.performanceData,
      result_data: debate.resultData,
      wandb_metadata: debate.wandbMetadata,
      processed_at: debate.processedAt
    };
    
    return res.json({
      success: true,
      run_details: runDetails
    });
  } catch (error) {
    logger.error('Get debate run error:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

export const getSingleDebate = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { experimentName, seed } = req.query;   
    logger.info(`Attempt to retrieve all runs from experiment: ${experimentName} with seed: ${seed}`);
    
    if (!experimentName) {
      return res.status(400).json({
        success: false,
        errors: { experimentName: ['Experiment name is required'] }
      });
    }

    if (!seed) {
      return res.status(400).json({
        success: false,
        errors: { seed: ['Seed is required'] }
      });
    }
    
    const experimentNameValue = Array.isArray(experimentName) ? experimentName[0] : experimentName;
    const seedValue = Array.isArray(seed) ? seed[0] : seed;
    const seedNumber = Number(seedValue);
    
    if (isNaN(seedNumber)) {
      return res.status(400).json({
        success: false,
        errors: { seed: ['Seed must be a valid number'] }
      });
    }

    let matchingDebates = await prisma.debate.findMany({
      where: {
        AND: [
          {
            wandbMetadata: {
              not: null
            }
          },
          {
            seed: seedNumber
          }
        ]
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
            temperature: true
          }
        }
      },
      orderBy: {
        processedAt: 'desc'
      }
    });

    matchingDebates = matchingDebates.filter(debate => {
      const debateExperimentName = 
        (debate.wandbMetadata as any)?.parsed_args?.["experiment.name"] ||
        debate.llmConfigs.map(c => c.modelName).sort().join('_vs_');
      return debateExperimentName === experimentNameValue;
    });

    if (matchingDebates.length === 0) {
      return res.status(404).json({
        success: false,
        message: `No runs found for experiment '${experimentNameValue}' with seed ${seedNumber}`
      });
    }

    const transformedRuns = matchingDebates.map(debate => ({
      _id: debate.id,
      status: debate.status,
      performance_data: debate.performanceData,
      result_data: debate.resultData,
      wandb_metadata: debate.wandbMetadata,
      seed: debate.seed,
      dataset_name: debate.datasetName,
      processedAt: debate.processedAt
    }));

    return res.json({
      success: true,
      experiment_name: experimentNameValue,
      seed: seedNumber,
      runs: transformedRuns.sort((a, b) => 
        new Date(b.processedAt).getTime() - new Date(a.processedAt).getTime()
      )
    });
    
  } catch (error) {
    logger.error('Get single debate error:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

export const debugDatabase = async (req: Request, res: Response): Promise<Response> => {
  try {
    await prisma.$connect();
    
    const totalDebates = await prisma.debate.count();
    const totalLlmConfigs = await prisma.llmConfig.count();
    const debatesWithWandb = await prisma.debate.count({
      where: {
        AND: [
          {
            wandbMetadata: {
              not: null
            }
          },
          {
            wandbMetadata: {
              not: {}
            }
          }
        ]
      }
    });
    
    const debatesWithSeed = await prisma.debate.count({
      where: {
        seed: {
          not: null
        }
      }
    });
    
    const debatesWithDatasetName = await prisma.debate.count({
      where: {
        datasetName: {
          not: null
        }
      }
    });
    
    const seedCounts = await prisma.debate.groupBy({
      by: ['seed'],
      _count: {
        seed: true
      },
      where: {
        seed: {
          not: null
        }
      },
      orderBy: {
        _count: {
          seed: 'desc'
        }
      }
    });
    
    const statusCounts = await prisma.debate.groupBy({
      by: ['status'],
      _count: {
        status: true
      },
      orderBy: {
        _count: {
          status: 'desc'
        }
      }
    });
    
    const sampleDebates = await prisma.debate.findMany({
      where: {
        AND: [
          {
            wandbMetadata: {
              not: null
            }
          },
          {
            wandbMetadata: {
              not: {}
            }
          }
        ]
      },
      include: {
        llmConfigs: {
          select: {
            id: true,
            modelName: true
          }
        }
      },
      orderBy: {
        processedAt: 'desc'
      },
      take: 5
    });
    
    const sampleLlmConfigs = await prisma.llmConfig.findMany({
      select: {
        id: true,
        modelName: true,
        model: true,
        _count: {
          select: {
            debates: true
          }
        }
      },
      orderBy: {
        id: 'asc'
      },
      take: 5
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
        connection: 'OK',
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    logger.error('Database debug error:', error);
    return res.status(500).json({
      success: false,
      message: 'Database connection or query failed',
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    });
  }
};

export const disconnectPrisma = async (): Promise<void> => {
  try {
    await prisma.$disconnect();
    logger.info('Prisma client disconnected successfully');
  } catch (error) {
    logger.error('Error disconnecting Prisma client:', error);
  }
};

process.on('SIGINT', async () => {
  await disconnectPrisma();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await disconnectPrisma();
  process.exit(0);
});