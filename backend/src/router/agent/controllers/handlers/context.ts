import { Request, Response } from 'express';
import { PrismaClient, Prisma } from '@prisma/client';
import { logger } from '../../../../services/logger.js';

const prisma = new PrismaClient();

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
  renderType?: string;
  createdAt: string;
  messageIndex: number;
}

interface AgentConversationWithPlots {
  id: string;
  messages: Prisma.JsonValue;
  metadata: Prisma.JsonValue;
  plots: Prisma.JsonValue;
  createdAt: Date;
  updatedAt: Date;
}

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

export async function getOrCreateConversation(req: Request, res: Response): Promise<void> {
  try {
    const { conversationId } = req.body;

    if (conversationId) {
      const existing = await prisma.agentConversation.findUnique({
        where: { id: conversationId },
      }) as AgentConversationWithPlots | null;

      if (existing) {
        const messages = parseJsonArray<ConversationMessage>(existing.messages);
        const plots = parseJsonArray<StoredPlot>(existing.plots);

        res.json({
          conversationId: existing.id,
          messages,
          plots,
          metadata: existing.metadata,
          createdAt: existing.createdAt,
          updatedAt: existing.updatedAt,
        });
        return;
      }
    }

    const conversation = await prisma.agentConversation.create({
      data: {
        messages: [],
        metadata: {},
        plots: [],
      } as any,
    }) as AgentConversationWithPlots;

    logger.info(`Created new conversation: ${conversation.id}`);

    res.json({
      conversationId: conversation.id,
      messages: [],
      plots: [],
      metadata: {},
      createdAt: conversation.createdAt,
      updatedAt: conversation.updatedAt,
    });
  } catch (error) {
    logger.error('Failed to get/create conversation:', error);
    res.status(500).json({ error: 'Failed to get or create conversation' });
  }
}

export async function listConversations(req: Request, res: Response): Promise<void> {
  try {
    const limit = parseInt(req.query.limit as string) || 20;
    const offset = parseInt(req.query.offset as string) || 0;

    const conversations = await prisma.agentConversation.findMany({
      orderBy: { updatedAt: 'desc' },
      take: limit,
      skip: offset,
    }) as AgentConversationWithPlots[];

    const conversationsWithPreview = conversations.map((conv) => {
      const messages = parseJsonArray<ConversationMessage>(conv.messages);
      const plots = parseJsonArray<StoredPlot>(conv.plots);
      const firstUserMessage = messages.find((m) => m.role === 'user');

      return {
        id: conv.id,
        preview: firstUserMessage?.content?.slice(0, 100) || 'New conversation',
        messageCount: messages.length,
        plotCount: plots.length,
        metadata: conv.metadata,
        createdAt: conv.createdAt,
        updatedAt: conv.updatedAt,
      };
    });

    res.json({ conversations: conversationsWithPreview });
  } catch (error) {
    logger.error('Failed to list conversations:', error);
    res.status(500).json({ error: 'Failed to list conversations' });
  }
}

export async function getConversationHistory(req: Request, res: Response): Promise<void> {
  try {
    const { conversationId } = req.params;

    if (!conversationId) {
      res.status(400).json({ error: 'Conversation ID is required' });
      return;
    }

    const conversation = await prisma.agentConversation.findUnique({
      where: { id: conversationId },
    }) as AgentConversationWithPlots | null;

    if (!conversation) {
      res.status(404).json({ error: 'Conversation not found' });
      return;
    }

    const messages = parseJsonArray<ConversationMessage>(conversation.messages);
    const plots = parseJsonArray<StoredPlot>(conversation.plots);
    const metadata = (conversation.metadata && typeof conversation.metadata === 'object')
      ? conversation.metadata as Record<string, any>
      : {};

    res.json({
      conversationId: conversation.id,
      messages,
      plots,
      metadata,
      debateIds: metadata.debateIds || [],
      argumentativeIds: metadata.argumentativeIds || [],
      createdAt: conversation.createdAt,
      updatedAt: conversation.updatedAt,
    });
  } catch (error) {
    logger.error('Failed to get conversation history:', error);
    res.status(500).json({ error: 'Failed to get conversation history' });
  }
}

export async function deleteConversation(req: Request, res: Response): Promise<void> {
  try {
    const { conversationId } = req.params;

    if (!conversationId) {
      res.status(400).json({ error: 'Conversation ID is required' });
      return;
    }

    await prisma.agentConversation.delete({
      where: { id: conversationId },
    });

    res.json({ success: true });
  } catch (error: any) {
    if (error.code === 'P2025') {
      res.status(404).json({ error: 'Conversation not found' });
      return;
    }
    logger.error('Failed to delete conversation:', error);
    res.status(500).json({ error: 'Failed to delete conversation' });
  }
}

export async function clearConversation(req: Request, res: Response): Promise<void> {
  try {
    const { conversationId } = req.params;

    if (!conversationId) {
      res.status(400).json({ error: 'Conversation ID is required' });
      return;
    }

    const conversation = await prisma.agentConversation.update({
      where: { id: conversationId },
      data: {
        messages: [],
        plots: [],
        updatedAt: new Date(),
      } as any,
    }) as AgentConversationWithPlots;

    res.json({ 
      success: true,
      conversationId: conversation.id,
    });
  } catch (error: any) {
    if (error.code === 'P2025') {
      res.status(404).json({ error: 'Conversation not found' });
      return;
    }
    logger.error('Failed to clear conversation:', error);
    res.status(500).json({ error: 'Failed to clear conversation' });
  }
}