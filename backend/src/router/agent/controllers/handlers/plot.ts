import { Request, Response } from 'express';
import { PrismaClient, Prisma } from '@prisma/client';
import { runSmartAgent } from '../../../../agent/index.js';
import { logger } from '../../../../services/logger.js';

const prisma = new PrismaClient();

// Type definitions
interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  plotId?: string;
}

interface StoredPlot {
  id: string;
  type: string;
  title: string;
  data: any;
  rawData?: any;
  url?: string; 
  renderType?: string;
  createdAt: string;
  messageIndex: number;
}

// Extended type that includes plots (workaround for Prisma types)
interface AgentConversationWithPlots {
  id: string;
  messages: Prisma.JsonValue;
  metadata: Prisma.JsonValue;
  plots: Prisma.JsonValue;
  createdAt: Date;
  updatedAt: Date;
}

// Helper to safely parse JSON array from Prisma
function parseJsonArray<T>(value: unknown): T[] {
  if (Array.isArray(value)) {
    return value as T[];
  }
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

export async function handleRunTask(req: Request, res: Response): Promise<void> {
  const { prompt, conversationId } = req.body; 
  if (!prompt) {
    res.status(400).json({ error: 'prompt required' });
    return;
  }

  try {
    logger.info(`Agent task: ${prompt.substring(0, 50)}...`);
    const { result, steps, plot } = await runSmartAgent(prompt, undefined, conversationId);
    res.json({ success: true, result, steps, plot });
  } catch (err: any) {
    logger.error('Agent task failed', { error: err.message });
    res.status(500).json({ success: false, error: err.message });
  }
}

export async function handleHarnessAnalyze(req: Request, res: Response): Promise<void> {
  const { debateIds, argumentativeIds, query, conversationId } = req.body;

  if (!query) {
    res.status(400).json({ error: 'query required' });
    return;
  }

  if (!conversationId) {
    res.status(400).json({ error: 'conversationId required' });
    return;
  }

  try {
    const conversation = await prisma.agentConversation.findUnique({
      where: { id: conversationId },
    }) as AgentConversationWithPlots | null;

    if (!conversation) {
      res.status(404).json({ error: 'Conversation not found. Please refresh the page.' });
      return;
    }

    const existingMessages = parseJsonArray<ConversationMessage>(conversation.messages);
    const existingPlots = parseJsonArray<StoredPlot>(conversation.plots);

    const existingMetadata = (conversation.metadata && typeof conversation.metadata === 'object')
      ? conversation.metadata as Record<string, any>
      : {};

    const isFirstMessage = existingMessages.length === 0;

    let effectiveDebateIds: number[] = [];
    let effectiveArgumentativeIds: number[] = [];

    if (isFirstMessage) {
      if ((!debateIds || debateIds.length === 0) && (!argumentativeIds || argumentativeIds.length === 0)) {
        res.status(400).json({ error: 'No experiments selected' });
        return;
      }

      effectiveDebateIds = debateIds || [];
      effectiveArgumentativeIds = argumentativeIds || [];
    } else {
      if (debateIds && debateIds.length > 0) {
        effectiveDebateIds = debateIds;
      } else if (existingMetadata.debateIds) {
        effectiveDebateIds = existingMetadata.debateIds;
      }

      if (argumentativeIds && argumentativeIds.length > 0) {
        effectiveArgumentativeIds = argumentativeIds;
      } else if (existingMetadata.argumentativeIds) {
        effectiveArgumentativeIds = existingMetadata.argumentativeIds;
      }

      if (effectiveDebateIds.length === 0 && effectiveArgumentativeIds.length === 0) {
        res.status(400).json({
          error: 'No experiments associated with this conversation. Please start a new conversation with experiments selected.'
        });
        return;
      }
    }

    logger.info(`Using debate IDs: ${effectiveDebateIds.join(', ')} for conversation ${conversationId}`);

    const { result, steps, plot } = await runSmartAgent(query, effectiveDebateIds, conversationId);

    const userMessage: ConversationMessage = {
      role: 'user',
      content: query,
      timestamp: new Date().toISOString(),
    };

    const assistantMessage: ConversationMessage = {
      role: 'assistant',
      content: result,
      timestamp: new Date().toISOString(),
    };

    let storedPlot: StoredPlot | null = null;

    if (plot) {
      const plotId = `plot_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;

      storedPlot = {
        id: plotId,
        type: plot.type || 'unknown',
        title: plot.title || 'Visualization',
        data: plot.data || plot,
        rawData: plot.rawData,
        renderType: plot.renderType || 'plotly',
        url: plot.url,   
        createdAt: new Date().toISOString(),
        messageIndex: existingMessages.length + 1,
      };

      assistantMessage.plotId = plotId;
    }

    const updatedMessages = [...existingMessages, userMessage, assistantMessage];
    const updatedPlots = storedPlot ? [...existingPlots, storedPlot] : existingPlots;

    const updatedMetadata = {
      ...existingMetadata,
      debateIds: effectiveDebateIds,
      argumentativeIds: effectiveArgumentativeIds,
      lastUpdated: new Date().toISOString(),
    };

    await prisma.agentConversation.update({
      where: { id: conversationId },
      data: {
        messages: updatedMessages as unknown as Prisma.InputJsonValue,
        plots: updatedPlots as unknown as Prisma.InputJsonValue,
        metadata: updatedMetadata as unknown as Prisma.InputJsonValue,
        updatedAt: new Date(),
      } as any,
    });

    res.json({
      success: true,
      summary: result,
      plot: storedPlot ? {
        id: storedPlot.id,
        type: storedPlot.type,
        title: storedPlot.title,
        data: storedPlot.data,
        rawData: storedPlot.rawData,
        renderType: storedPlot.renderType,
        url: storedPlot.url, 
      } : null,
      conversationId,
      data: {
        numExperiments: new Set(effectiveDebateIds).size,
        numDebates: effectiveDebateIds.length,
        debateIds: effectiveDebateIds,
        argumentativeIds: effectiveArgumentativeIds,
      },
      steps,
    });
  } catch (err: any) {
    logger.error('Harness analyze failed', { error: err.message });
    res.status(500).json({ success: false, error: err.message });
  }
}

function extractRunName(wandbMetadata: any, experimentId: string | null): string {
  if (!wandbMetadata) {
    return experimentId || 'Unknown';
  }

  let parsed = wandbMetadata;
  if (typeof wandbMetadata === 'string') {
    try {
      parsed = JSON.parse(wandbMetadata);
    } catch (e) {
      return experimentId || 'Unknown';
    }
  }

  if (parsed?.tags && Array.isArray(parsed.tags)) {
    const nameTag = parsed.tags.find((tag: any) => 
      typeof tag === 'string' && tag.startsWith('name-')
    );
    if (nameTag) {
      const extracted = nameTag.replace(/^name-/, '');
      return extracted;
    }
  }

  if (parsed && typeof parsed === 'object') {
    if (parsed.run_name) return parsed.run_name;
    if (parsed.name) return parsed.name;
    if (parsed.runName) return parsed.runName;
  }

  return experimentId || 'Unknown';
}

function hasValidTags(wandbMetadata: any): boolean {
  if (!wandbMetadata) return false;

  let parsed = wandbMetadata;
  if (typeof wandbMetadata === 'string') {
    try {
      parsed = JSON.parse(wandbMetadata);
    } catch (e) {
      return false;
    }
  }

  if (!parsed?.tags || !Array.isArray(parsed.tags)) return false;  
  return parsed.tags.some((tag: any) => typeof tag === 'string' && tag.trim().length > 0);
}

export async function handleHarnessRuns(req: Request, res: Response): Promise<void> {
  try {
    const debates = await prisma.debate.findMany({
      where: { 
        status: 'completed', 
        resultData: { not: Prisma.AnyNull },
        performanceData: { not: Prisma.AnyNull }
      },
      orderBy: { createdAt: 'desc' },
      select: { 
        id: true, 
        experimentId: true,
        datasetName: true,
        status: true, 
        createdAt: true,
        wandbMetadata: true,
        performanceData: true
      }
    });

    logger.info(`Found ${debates.length} completed debates with performance data`);

    const experimentMap = new Map<string, any>();
    let skippedNoPerformance = 0;
    let skippedNoTags = 0;
    
    for (const d of debates) {
      if (!d.performanceData || 
          (typeof d.performanceData === 'object' && Object.keys(d.performanceData).length === 0)) {
        skippedNoPerformance++;
        continue;
      }

      if (!hasValidTags(d.wandbMetadata) || extractRunName(d.wandbMetadata, d.experimentId) === 'splendid-galaxy-93') {
        skippedNoTags++;
        continue;
      }

      const runName = extractRunName(d.wandbMetadata, d.experimentId);
      const key = runName;
      
      if (!experimentMap.has(key)) {
        let parsedWandb: any = {};
        if (d.wandbMetadata) {
          if (typeof d.wandbMetadata === 'string') {
            try {
              parsedWandb = JSON.parse(d.wandbMetadata);
            } catch (e) {
              logger.warn(`Failed to parse wandbMetadata for debate ${d.id}`);
            }
          } else {
            parsedWandb = d.wandbMetadata;
          }
        }

        experimentMap.set(key, { 
          name: runName, 
          experimentId: d.experimentId,
          dataset: d.datasetName, 
          debateIds: [], 
          createdAt: d.createdAt,
          wandbMetadata: parsedWandb
        });
      }
      
      experimentMap.get(key)!.debateIds.push(d.id);
    }

    logger.info(`Skipped ${skippedNoPerformance} debates with empty performanceData`);
    logger.info(`Skipped ${skippedNoTags} debates with empty/missing tags`);

    const grouped = Array.from(experimentMap.values()).map((exp, i) => {
      let models: string[] = [];
      const wandb = exp.wandbMetadata;
      
      if (wandb?.tags && Array.isArray(wandb.tags)) {
        models = wandb.tags.filter((tag: string) => 
          typeof tag === 'string' && 
          !tag.startsWith('name-') && 
          !tag.startsWith('rounds-') && 
          !tag.startsWith('seed-') && 
          !tag.startsWith('task-')
        );
      }
      
      if (models.length === 0 && wandb) {
        if (Array.isArray(wandb.models)) {
          models = wandb.models;
        } else if (wandb.model) {
          models = [wandb.model];
        }
      }

      let numRounds = 0;
      if (wandb?.tags && Array.isArray(wandb.tags)) {
        const roundsTag = wandb.tags.find((tag: string) => 
          typeof tag === 'string' && tag.startsWith('rounds-')
        );
        if (roundsTag) {
          numRounds = parseInt(roundsTag.replace('rounds-', ''), 10) || 0;
        }
      }

      return {
        id: i,
        type: 'debate',
        name: exp.name,
        experimentId: exp.experimentId,
        dataset: exp.dataset || 'Unknown',
        models: models,
        status: `${exp.debateIds.length}/${exp.debateIds.length}`,
        numRounds: numRounds,
        numDebates: exp.debateIds.length,
        debateIds: exp.debateIds,
        createdAt: exp.createdAt?.toISOString(),
      };
    });

    logger.info(`Returning ${grouped.length} experiment groups`);

    res.json({ debates: grouped, argumentativeRuns: [] });
  } catch (err: any) {
    logger.error('Harness runs failed', { error: err.message, stack: err.stack });
    res.status(500).json({ error: err.message });
  }
}