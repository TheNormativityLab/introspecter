import OpenAI from 'openai';
import { PrismaClient, Prisma } from '@prisma/client';
import { logger } from '../services/logger.js';

const prisma = new PrismaClient();

const client = new OpenAI({
  apiKey: process.env.OPENROUTER_API_KEY,
  baseURL: 'https://openrouter.ai/api/v1',
  defaultHeaders: {
    'HTTP-Referer': process.env.APP_URL || 'http://localhost:3000',
    'X-Title': 'Debate Analysis Agent',
  },
});

const MODEL = 'anthropic/claude-sonnet-4.6';
const TEMPERATURE = 0.1;
const MAX_TOKENS = 4096;

export interface AgentStep {
  type: 'thinking' | 'tool_call' | 'tool_result' | 'error' | 'final' | 'plot';
  content: string;
  toolName?: string;
  data?: any;
}

export interface AgentContext {
  processedData: ProcessedDebateData | null;
  steps: AgentStep[];
  plot: PlotConfig | null;
  debateIds: number[] | null;
}

export interface AgentResult {
  result: string;
  steps: AgentStep[];
  plot?: PlotConfig;
  conversationId: string;
  stats?: DetailedStats;
}

export interface PlotConfig {
  id?: string;
  type: string;
  title: string;
  data: any;
  rawData?: any;
  url?: string;
  renderType?: string;
  createdAt?: string;
  messageIndex?: number;
}

interface StoredPlot extends PlotConfig {
  id: string;
  createdAt: string;
  messageIndex: number;
}

interface DebateRound {
  round_number: number;
  responses: Record<string, any>;
  correct_answer?: string;
}

interface QuestionResult {
  question: string;
  question_id: number;
  question_prompt: string;
  correct_answer: string;
  debate_session: {
    rounds: DebateRound[];
  };
  final_answers?: Record<string, string>;
}

interface DebateRecord {
  id: number;
  experiment_id: string | null;
  dataset_name: string | null;
  status: string | null;
  result_data: any;
  performance_data: any;
  created_at: Date | null;
  wandbMetadata: any;
}

interface RoundStat {
  correct: number;
  total: number;
}

interface ConsensusDetail {
  unanimous: number;
  unanimousCorrect: number;
  unanimousIncorrect: number;
  majorityCorrect: number;
  split: number;
  total: number;
}

interface CorrectnessTransition {
  correctToCorrect: number;
  correctToIncorrect: number;
  incorrectToCorrect: number;
  incorrectToIncorrect: number;
}

interface ProcessedDebateData {
  questions: QuestionResult[];
  roundStats: Map<number, RoundStat>;
  agentStats: Map<string, Map<number, RoundStat>>;
  consensusStats: Map<number, ConsensusDetail>;
  answerChanges: Map<string, { changes: number; total: number }>;
  answerFlows: Map<string, Map<string, number>>;
  correctnessFlows: Map<string, CorrectnessTransition>;
  agentCorrectnessFlows: Map<string, Map<string, CorrectnessTransition>>;
  roundAnswerCounts: Map<number, Map<string, number>>;
  totalDebates: number;
  experimentNames: string[];
  experimentData: Map<string, {
    roundStats: Map<number, RoundStat>;
    consensusStats: Map<number, ConsensusDetail>;
    totalQuestions: number;
  }>;
}

interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  plotId?: string;
}

interface DetailedStats {
  overview: {
    totalDebates: number;
    totalQuestions: number;
    totalRounds: number;
    experiments: string[];
    agents: string[];
  };
  accuracyByRound: Record<number, { correct: number; total: number; accuracy: number }>;
  agentAccuracyByRound: Record<string, Record<number, { correct: number; total: number; accuracy: number }>>;
  agentOverallAccuracy: Record<string, { correct: number; total: number; accuracy: number }>;
  majorityVote: {
    totalQuestions: number;
    correctCount: number;
    accuracy: number;
    byRound: Record<number, { correct: number; total: number; accuracy: number }>;
  };
  consensusByRound: Record<number, {
    unanimous: number;
    unanimousCorrect: number;
    unanimousIncorrect: number;
    majorityCorrect: number;
    split: number;
    total: number;
    unanimousRate: number;
    unanimousCorrectRate: number;
  }>;
  correctnessTransitions: Record<string, {
    correctToCorrect: number;
    correctToIncorrect: number;
    incorrectToCorrect: number;
    incorrectToIncorrect: number;
    retentionRate: number;
    recoveryRate: number;
    lossRate: number;
  }>;
  perAgentTransitions: Record<string, Record<string, CorrectnessTransition>>;
  questionDifficulty: {
    easy: number;
    medium: number;
    hard: number;
  };
}

const COLORS = [
  '#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6',
  '#ec4899', '#06b6d4', '#84cc16', '#f97316', '#6366f1',
];

let globalProcessedData: ProcessedDebateData | null = null;
let globalDetailedStats: DetailedStats | null = null;
let globalSteps: AgentStep[] = [];
let globalPlot: PlotConfig | null = null;
let globalDebateIds: number[] | null = null;
let globalCurrentConversationId: string | null = null;
let globalCurrentMessageIndex: number = 0;

function extractModelName(agentId: string): string {
  return agentId
    .replace(/_?agent_?\d+$/i, '')
    .replace(/_?\d+$/i, '')
    .replace(/_+$/, '')
    .trim();
}

function log(type: AgentStep['type'], content: string, toolName?: string, data?: any) {
  logger.info(`[Agent ${type}] ${content}`);
  globalSteps.push({ type, content, toolName, data });
}

async function getConversationHistory(conversationId: string): Promise<ConversationMessage[]> {
  const conversation = await prisma.agentConversation.findUnique({
    where: { id: conversationId },
  });

  if (!conversation) return [];

  const messages = conversation.messages;
  if (!messages || !Array.isArray(messages)) return [];

  return messages as unknown as ConversationMessage[];
}

async function getConversationPlots(conversationId: string): Promise<StoredPlot[]> {
  const conversation = await prisma.agentConversation.findUnique({
    where: { id: conversationId },
  });

  if (!conversation) return [];

  const plots = conversation.plots;
  if (!plots || !Array.isArray(plots)) return [];

  return plots as unknown as StoredPlot[];
}

export async function archiveOldConversations(olderThanDays: number = 30): Promise<number> {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

  const result = await prisma.agentConversation.deleteMany({
    where: { updatedAt: { lt: cutoffDate } },
  });

  return result.count;
}

function formatConversationContext(history: ConversationMessage[]): string {
  if (history.length === 0) return '';

  const contextMessages = history.slice(-10);
  const formatted = contextMessages.map(msg => {
    const role = msg.role === 'user' ? 'User' : 'Assistant';
    return `${role}: ${msg.content}`;
  }).join('\n\n');

  return `Previous conversation:\n${formatted}\n\n---\n\nCurrent request:`;
}

async function getDebateData(limit: number, debateIds?: number[]): Promise<DebateRecord[]> {
  try {
    logger.info(`Fetching debates – limit: ${limit}, ids: ${debateIds?.length ? `${debateIds.length} selected` : 'all'}`);
    let debates: DebateRecord[];

    if (debateIds && debateIds.length > 0) {
      const validIds = debateIds.filter(id => typeof id === 'number' && !isNaN(id) && id > 0);
      if (validIds.length === 0) {
        logger.warn('No valid debate IDs after filtering');
        return [];
      }
      const prismaDebates = await prisma.debate.findMany({
        where: { id: { in: validIds }, resultData: { not: Prisma.AnyNull } },
        orderBy: { createdAt: 'desc' },
      });
      debates = prismaDebates.map(d => ({
        id: d.id,
        experiment_id: d.experimentId,
        dataset_name: d.datasetName,
        status: d.status,
        result_data: d.resultData,
        performance_data: d.performanceData,
        created_at: d.createdAt,
        wandbMetadata: d.wandbMetadata,
      }));
    } else {
      const prismaDebates = await prisma.debate.findMany({
        where: { resultData: { not: Prisma.AnyNull } },
        orderBy: { createdAt: 'desc' },
        take: limit,
      });
      debates = prismaDebates.map(d => ({
        id: d.id,
        experiment_id: d.experimentId,
        dataset_name: d.datasetName,
        status: d.status,
        result_data: d.resultData,
        performance_data: d.performanceData,
        created_at: d.createdAt,
        wandbMetadata: d.wandbMetadata,
      }));
    }

    logger.info(`Found ${debates.length} debates with result_data`);
    return debates;
  } catch (error: any) {
    logger.error(`Database error: ${error.message}`);
    throw error;
  }
}

function extractAnswer(response: any): string | null {
  if (!response) return null;
  let text: string;
  if (typeof response === 'string') {
    text = response;
  } else if (response.response && typeof response.response === 'string') {
    text = response.response;
  } else if (response.answer && typeof response.answer === 'string') {
    text = response.answer;
  } else if (response.content && typeof response.content === 'string') {
    text = response.content;
  } else {
    return null;
  }
  const boxedMatch = text.match(/\\boxed\{([^}]+)\}/);
  if (boxedMatch) return boxedMatch[1].trim();
  const answerIsMatch = text.match(/(?:the\s+)?answer\s+is[:\s]+([A-Za-z0-9]+)/i);
  if (answerIsMatch) return answerIsMatch[1].trim();
  const finalAnswerMatch = text.match(/final\s+answer[:\s]+([A-Za-z0-9]+)/i);
  if (finalAnswerMatch) return finalAnswerMatch[1].trim();
  const numbers = text.match(/\b\d+\b/g);
  if (numbers && numbers.length > 0) return numbers[numbers.length - 1];
  const letters = text.match(/\b[A-D]\b/g);
  if (letters && letters.length > 0) return letters[letters.length - 1];
  return null;
}

function extractCorrectAnswer(correctAnswer: string | null | undefined): string | null {
  if (!correctAnswer || typeof correctAnswer !== 'string') return null;
  const hashMatch = correctAnswer.match(/####\s*([A-Za-z0-9]+)/);
  if (hashMatch) return hashMatch[1].trim();
  const boxedMatch = correctAnswer.match(/\\boxed\{([^}]+)\}/);
  if (boxedMatch) return boxedMatch[1].trim();
  const numbers = correctAnswer.match(/\b\d+\b/g);
  if (numbers && numbers.length > 0) return numbers[numbers.length - 1];
  const letters = correctAnswer.match(/\b[A-D]\b/g);
  if (letters && letters.length > 0) return letters[letters.length - 1];
  return correctAnswer.trim();
}

function processDebateData(debates: DebateRecord[]): ProcessedDebateData {
  const result: ProcessedDebateData = {
    questions: [],
    roundStats: new Map(),
    agentStats: new Map(),
    consensusStats: new Map(),
    answerChanges: new Map(),
    answerFlows: new Map(),
    correctnessFlows: new Map(),
    agentCorrectnessFlows: new Map(),
    roundAnswerCounts: new Map(),
    totalDebates: debates.length,
    experimentNames: [],
    experimentData: new Map(),
  };

  let processedQuestions = 0;
  let skippedQuestions = 0;

  for (const debate of debates) {
    let runName = 'Unknown';
    if (debate.wandbMetadata) {
      const wandb = debate.wandbMetadata as any;
      if (wandb.tags && Array.isArray(wandb.tags)) {
        const nameTag = wandb.tags.find((tag: any) =>
          typeof tag === 'string' && tag.startsWith('name-')
        );
        if (nameTag) runName = nameTag.replace(/^name-/, '');
      }
      if (runName === 'Unknown') {
        if (wandb.run_name) runName = wandb.run_name;
        else if (wandb.name) runName = wandb.name;
      }
    }
    if (runName === 'Unknown' && debate.experiment_id) runName = debate.experiment_id;
    if (runName === 'Unknown' && debate.result_data) {
      const rd = debate.result_data as any;
      if (rd.metadata?.run_name) runName = rd.metadata.run_name;
      else if (rd.run_name) runName = rd.run_name;
    }

    if (!result.experimentNames.includes(runName)) result.experimentNames.push(runName);
    if (!result.experimentData.has(runName)) {
      result.experimentData.set(runName, {
        roundStats: new Map(),
        consensusStats: new Map(),
        totalQuestions: 0,
      });
    }
    const expData = result.experimentData.get(runName)!;

    if (!debate.result_data) {
      logger.warn(`Debate ${debate.id} has no result_data`);
      continue;
    }

    let questions: QuestionResult[];
    if (Array.isArray(debate.result_data)) {
      questions = debate.result_data as QuestionResult[];
    } else if (typeof debate.result_data === 'object' && debate.result_data !== null) {
      const rd = debate.result_data as any;
      if (rd.questions && Array.isArray(rd.questions)) {
        questions = rd.questions;
      } else if (rd.results && Array.isArray(rd.results)) {
        questions = rd.results;
      } else {
        logger.warn(`Debate ${debate.id} has unknown result_data format`);
        continue;
      }
    } else {
      logger.warn(`Debate ${debate.id} has invalid result_data type`);
      continue;
    }

    expData.totalQuestions += questions.length;

    for (const question of questions) {
      if (!question || !question.debate_session?.rounds) {
        skippedQuestions++;
        continue;
      }
      result.questions.push(question);
      processedQuestions++;

      const correctAnswer = extractCorrectAnswer(question.correct_answer);
      const rounds = question.debate_session.rounds;
      const prevAnswers = new Map<string, string>();
      const prevCorrectness = new Map<string, boolean>();

      for (let i = 0; i < rounds.length; i++) {
        const round = rounds[i];
        if (!round || !round.responses) continue;
        const roundNum = round.round_number ?? (i + 1);
        const responses = round.responses;

        if (!result.roundStats.has(roundNum)) result.roundStats.set(roundNum, { correct: 0, total: 0 });
        if (!result.consensusStats.has(roundNum)) {
          result.consensusStats.set(roundNum, {
            unanimous: 0, unanimousCorrect: 0, unanimousIncorrect: 0,
            majorityCorrect: 0, split: 0, total: 0,
          });
        }
        if (!result.roundAnswerCounts.has(roundNum)) result.roundAnswerCounts.set(roundNum, new Map());
        if (!expData.roundStats.has(roundNum)) expData.roundStats.set(roundNum, { correct: 0, total: 0 });
        if (!expData.consensusStats.has(roundNum)) {
          expData.consensusStats.set(roundNum, {
            unanimous: 0, unanimousCorrect: 0, unanimousIncorrect: 0,
            majorityCorrect: 0, split: 0, total: 0,
          });
        }

        const roundStat = result.roundStats.get(roundNum)!;
        const expRoundStat = expData.roundStats.get(roundNum)!;
        const consensusStat = result.consensusStats.get(roundNum)!;
        const expConsensusStat = expData.consensusStats.get(roundNum)!;
        const answerCounts = result.roundAnswerCounts.get(roundNum)!;
        const answersThisRound: string[] = [];
        const correctAnswersThisRound: number[] = [];

        for (const [agentId, response] of Object.entries(responses)) {
          const modelName = extractModelName(agentId);
          const agentAnswer = extractAnswer(response);

          if (agentAnswer) {
            answersThisRound.push(agentAnswer);
            answerCounts.set(agentAnswer, (answerCounts.get(agentAnswer) || 0) + 1);
          }

          if (!result.agentStats.has(modelName)) result.agentStats.set(modelName, new Map());
          const agentRoundStats = result.agentStats.get(modelName)!;
          if (!agentRoundStats.has(roundNum)) agentRoundStats.set(roundNum, { correct: 0, total: 0 });
          const agentStat = agentRoundStats.get(roundNum)!;

          agentStat.total++;
          roundStat.total++;
          expRoundStat.total++;

          const isCorrect = correctAnswer !== null && agentAnswer === correctAnswer;
          if (isCorrect) {
            agentStat.correct++;
            roundStat.correct++;
            expRoundStat.correct++;
            correctAnswersThisRound.push(1);
          } else {
            correctAnswersThisRound.push(0);
          }

          const prevAnswer = prevAnswers.get(modelName);
          const wasCorrect = prevCorrectness.get(modelName);

          if (prevAnswer !== undefined && wasCorrect !== undefined) {
            const changeKey = `${roundNum - 1}_to_${roundNum}`;
            if (!result.answerChanges.has(changeKey)) {
              result.answerChanges.set(changeKey, { changes: 0, total: 0 });
            }
            const changeStat = result.answerChanges.get(changeKey)!;
            changeStat.total++;
            if (prevAnswer !== agentAnswer) changeStat.changes++;

            if (prevAnswer && agentAnswer) {
              const sourceNode = `R${roundNum - 1}_${prevAnswer}`;
              const targetNode = `R${roundNum}_${agentAnswer}`;
              if (!result.answerFlows.has(sourceNode)) result.answerFlows.set(sourceNode, new Map());
              const targetMap = result.answerFlows.get(sourceNode)!;
              targetMap.set(targetNode, (targetMap.get(targetNode) || 0) + 1);
            }

            if (!result.correctnessFlows.has(changeKey)) {
              result.correctnessFlows.set(changeKey, {
                correctToCorrect: 0,
                correctToIncorrect: 0,
                incorrectToCorrect: 0,
                incorrectToIncorrect: 0,
              });
            }
            const corrFlow = result.correctnessFlows.get(changeKey)!;

            if (!result.agentCorrectnessFlows.has(modelName)) {
              result.agentCorrectnessFlows.set(modelName, new Map());
            }
            if (!result.agentCorrectnessFlows.get(modelName)!.has(changeKey)) {
              result.agentCorrectnessFlows.get(modelName)!.set(changeKey, {
                correctToCorrect: 0,
                correctToIncorrect: 0,
                incorrectToCorrect: 0,
                incorrectToIncorrect: 0,
              });
            }
            const agentCorrFlow = result.agentCorrectnessFlows.get(modelName)!.get(changeKey)!;

            if (wasCorrect && isCorrect) {
              corrFlow.correctToCorrect++;
              agentCorrFlow.correctToCorrect++;
            } else if (wasCorrect && !isCorrect) {
              corrFlow.correctToIncorrect++;
              agentCorrFlow.correctToIncorrect++;
            } else if (!wasCorrect && isCorrect) {
              corrFlow.incorrectToCorrect++;
              agentCorrFlow.incorrectToCorrect++;
            } else {
              corrFlow.incorrectToIncorrect++;
              agentCorrFlow.incorrectToIncorrect++;
            }
          }

          if (agentAnswer) {
            prevAnswers.set(modelName, agentAnswer);
            prevCorrectness.set(modelName, isCorrect);
          }
        }

        consensusStat.total++;
        expConsensusStat.total++;

        if (answersThisRound.length > 0) {
          const allSame = answersThisRound.every(a => a === answersThisRound[0]);
          if (allSame) {
            consensusStat.unanimous++;
            expConsensusStat.unanimous++;
            if (correctAnswer && answersThisRound[0] === correctAnswer) {
              consensusStat.unanimousCorrect++;
              expConsensusStat.unanimousCorrect++;
            } else {
              consensusStat.unanimousIncorrect++;
              expConsensusStat.unanimousIncorrect++;
            }
          } else {
            const numCorrect = correctAnswersThisRound.reduce((a, b) => a + b, 0);
            if (numCorrect > answersThisRound.length / 2) {
              consensusStat.majorityCorrect++;
              expConsensusStat.majorityCorrect++;
            } else {
              consensusStat.split++;
              expConsensusStat.split++;
            }
          }
        }
      }
    }
  }

  logger.info(`Processed ${processedQuestions} questions, skipped ${skippedQuestions}`);
  return result;
}

function computeDetailedStats(data: ProcessedDebateData): DetailedStats {
  const sortedRounds = Array.from(data.roundStats.keys()).sort((a, b) => a - b);
  const agents = Array.from(data.agentStats.keys());

  const overview = {
    totalDebates: data.totalDebates,
    totalQuestions: data.questions.length,
    totalRounds: sortedRounds.length,
    experiments: data.experimentNames,
    agents,
  };

  const accuracyByRound: DetailedStats['accuracyByRound'] = {};
  for (const round of sortedRounds) {
    const stat = data.roundStats.get(round)!;
    accuracyByRound[round] = {
      correct: stat.correct,
      total: stat.total,
      accuracy: stat.total > 0 ? Math.round((stat.correct / stat.total) * 1000) / 10 : 0,
    };
  }

  const agentAccuracyByRound: DetailedStats['agentAccuracyByRound'] = {};
  const agentOverallAccuracy: DetailedStats['agentOverallAccuracy'] = {};

  for (const [agentId, roundStats] of data.agentStats) {
    agentAccuracyByRound[agentId] = {};
    let totalCorrect = 0;
    let totalAll = 0;

    for (const [round, stat] of roundStats) {
      agentAccuracyByRound[agentId][round] = {
        correct: stat.correct,
        total: stat.total,
        accuracy: stat.total > 0 ? Math.round((stat.correct / stat.total) * 1000) / 10 : 0,
      };
      totalCorrect += stat.correct;
      totalAll += stat.total;
    }

    agentOverallAccuracy[agentId] = {
      correct: totalCorrect,
      total: totalAll,
      accuracy: totalAll > 0 ? Math.round((totalCorrect / totalAll) * 1000) / 10 : 0,
    };
  }

  const majorityVoteByRound: Record<number, { correct: number; total: number }> = {};
  for (const round of sortedRounds) {
    majorityVoteByRound[round] = { correct: 0, total: 0 };
  }

  let totalMajorityCorrect = 0;
  let totalMajorityQuestions = 0;

  for (const question of data.questions) {
    const correctAnswer = extractCorrectAnswer(question.correct_answer);
    if (!correctAnswer) continue;

    for (let i = 0; i < question.debate_session.rounds.length; i++) {
      const round = question.debate_session.rounds[i];
      if (!round?.responses) continue;
      const roundNum = round.round_number ?? (i + 1);

      const answerCounts = new Map<string, number>();
      for (const response of Object.values(round.responses)) {
        const answer = extractAnswer(response);
        if (answer) answerCounts.set(answer, (answerCounts.get(answer) || 0) + 1);
      }

      let majorityAnswer = '';
      let maxCount = 0;
      for (const [answer, count] of answerCounts) {
        if (count > maxCount) {
          maxCount = count;
          majorityAnswer = answer;
        }
      }

      if (majorityAnswer) {
        if (!majorityVoteByRound[roundNum]) {
          majorityVoteByRound[roundNum] = { correct: 0, total: 0 };
        }
        majorityVoteByRound[roundNum].total++;
        if (majorityAnswer === correctAnswer) majorityVoteByRound[roundNum].correct++;

        if (i === question.debate_session.rounds.length - 1) {
          totalMajorityQuestions++;
          if (majorityAnswer === correctAnswer) totalMajorityCorrect++;
        }
      }
    }
  }

  const majorityVoteByRoundWithAccuracy: Record<number, { correct: number; total: number; accuracy: number }> = {};
  for (const [round, stat] of Object.entries(majorityVoteByRound)) {
    const r = parseInt(round);
    majorityVoteByRoundWithAccuracy[r] = {
      ...stat,
      accuracy: stat.total > 0 ? Math.round((stat.correct / stat.total) * 1000) / 10 : 0,
    };
  }

  const majorityVote = {
    totalQuestions: totalMajorityQuestions,
    correctCount: totalMajorityCorrect,
    accuracy: totalMajorityQuestions > 0 ? Math.round((totalMajorityCorrect / totalMajorityQuestions) * 1000) / 10 : 0,
    byRound: majorityVoteByRoundWithAccuracy,
  };

  const consensusByRound: DetailedStats['consensusByRound'] = {};
  for (const [round, stat] of data.consensusStats) {
    consensusByRound[round] = {
      unanimous: stat.unanimous,
      unanimousCorrect: stat.unanimousCorrect,
      unanimousIncorrect: stat.unanimousIncorrect,
      majorityCorrect: stat.majorityCorrect,
      split: stat.split,
      total: stat.total,
      unanimousRate: stat.total > 0 ? Math.round((stat.unanimous / stat.total) * 1000) / 10 : 0,
      unanimousCorrectRate: stat.total > 0 ? Math.round((stat.unanimousCorrect / stat.total) * 1000) / 10 : 0,
    };
  }

  const correctnessTransitions: DetailedStats['correctnessTransitions'] = {};
  for (const [transition, flow] of data.correctnessFlows) {
    const totalFromCorrect = flow.correctToCorrect + flow.correctToIncorrect;
    const totalFromIncorrect = flow.incorrectToCorrect + flow.incorrectToIncorrect;
    correctnessTransitions[transition] = {
      ...flow,
      retentionRate: totalFromCorrect > 0 ? Math.round((flow.correctToCorrect / totalFromCorrect) * 1000) / 10 : 0,
      recoveryRate: totalFromIncorrect > 0 ? Math.round((flow.incorrectToCorrect / totalFromIncorrect) * 1000) / 10 : 0,
      lossRate: totalFromCorrect > 0 ? Math.round((flow.correctToIncorrect / totalFromCorrect) * 1000) / 10 : 0,
    };
  }

  const perAgentTransitions: DetailedStats['perAgentTransitions'] = {};
  for (const [agentId, transitions] of data.agentCorrectnessFlows) {
    perAgentTransitions[agentId] = {};
    for (const [transition, flow] of transitions) {
      perAgentTransitions[agentId][transition] = { ...flow };
    }
  }

  let easy = 0, medium = 0, hard = 0;
  for (const question of data.questions) {
    const lastRound = question.debate_session.rounds[question.debate_session.rounds.length - 1];
    if (!lastRound?.responses) continue;

    const correctAnswer = extractCorrectAnswer(question.correct_answer);
    if (!correctAnswer) continue;

    const responses = Object.values(lastRound.responses);
    const correctCount = responses.filter(r => extractAnswer(r) === correctAnswer).length;
    const accuracy = responses.length > 0 ? (correctCount / responses.length) * 100 : 0;

    if (accuracy >= 80) easy++;
    else if (accuracy >= 40) medium++;
    else hard++;
  }

  return {
    overview,
    accuracyByRound,
    agentAccuracyByRound,
    agentOverallAccuracy,
    majorityVote,
    consensusByRound,
    correctnessTransitions,
    perAgentTransitions,
    questionDifficulty: { easy, medium, hard },
  };
}

function buildQuickChartUrl(chartConfig: any, width = 800, height = 500): string {
  return `https://quickchart.io/chart?c=${encodeURIComponent(JSON.stringify(chartConfig))}&w=${width}&h=${height}`;
}

function getBaseDatasets(
  chartType: string,
  data: ProcessedDebateData,
  dataKeys: string[],
  sortedRounds: number[],
) {
  const datasets: any[] = [];

  if (dataKeys.includes('accuracy') || dataKeys.length === 0) {
    const accuracyData = sortedRounds.map(round => {
      const stat = data.roundStats.get(round)!;
      return stat.total > 0 ? Math.round((stat.correct / stat.total) * 100) : 0;
    });
    datasets.push({
      label: 'Accuracy (%)',
      data: accuracyData,
      backgroundColor: COLORS[0] + '80',
      borderColor: COLORS[0],
      borderWidth: 2,
      fill: ['area', 'stacked_area'].includes(chartType),
      tension: 0.3,
    });
  }

  if (dataKeys.includes('consensus')) {
    const consensusData = sortedRounds.map(round => {
      const stat = data.consensusStats.get(round);
      return stat && stat.total > 0 ? Math.round((stat.unanimousCorrect / stat.total) * 100) : 0;
    });
    datasets.push({
      label: 'Correct Consensus (%)',
      data: consensusData,
      backgroundColor: COLORS[2] + '80',
      borderColor: COLORS[2],
      borderWidth: 2,
      fill: ['area', 'stacked_area'].includes(chartType),
      tension: 0.3,
    });
  }

  if (dataKeys.includes('consensusGrouped')) {
    datasets.push({
      label: 'Unanimous Correct (%)',
      data: sortedRounds.map(round => {
        const stat = data.consensusStats.get(round);
        return stat && stat.total > 0 ? Math.round((stat.unanimousCorrect / stat.total) * 100) : 0;
      }),
      backgroundColor: '#10b98180',
      borderColor: '#10b981',
      borderWidth: 2,
      fill: false,
      tension: 0.3,
    });
    datasets.push({
      label: 'Unanimous Incorrect (%)',
      data: sortedRounds.map(round => {
        const stat = data.consensusStats.get(round);
        return stat && stat.total > 0 ? Math.round((stat.unanimousIncorrect / stat.total) * 100) : 0;
      }),
      backgroundColor: '#ef444480',
      borderColor: '#ef4444',
      borderWidth: 2,
      fill: false,
      tension: 0.3,
    });
    datasets.push({
      label: 'Majority Correct (%)',
      data: sortedRounds.map(round => {
        const stat = data.consensusStats.get(round);
        return stat && stat.total > 0 ? Math.round((stat.majorityCorrect / stat.total) * 100) : 0;
      }),
      backgroundColor: '#f59e0b80',
      borderColor: '#f59e0b',
      borderWidth: 2,
      fill: false,
      tension: 0.3,
    });
    datasets.push({
      label: 'Split (%)',
      data: sortedRounds.map(round => {
        const stat = data.consensusStats.get(round);
        return stat && stat.total > 0 ? Math.round((stat.split / stat.total) * 100) : 0;
      }),
      backgroundColor: '#8b5cf680',
      borderColor: '#8b5cf6',
      borderWidth: 2,
      fill: false,
      tension: 0.3,
    });
  }

  return datasets;
}

function resolveChartJsType(chartType: string): string | null {
  const map: Record<string, string> = {
    line: 'line',
    multi_line: 'line',
    bar: 'bar',
    grouped_bar: 'bar',
    stacked_bar: 'bar',
    horizontal_bar: 'bar',
    area: 'line',
    stacked_area: 'line',
    scatter: 'scatter',
    bubble: 'bubble',
    histogram: 'bar',
    pie: 'pie',
    donut: 'doughnut',
    radar: 'radar',
  };
  return map[chartType] ?? null;
}

function createChartJsPlot(
  chartType: string,
  title: string,
  data: ProcessedDebateData,
  dataKeys: string[],
  compareExperiments: boolean,
  compareAgents: boolean,
): PlotConfig {
  const sortedRounds = Array.from(data.roundStats.keys()).sort((a, b) => a - b);
  const labels = sortedRounds.map(r => `Round ${r}`);
  const cjsType = resolveChartJsType(chartType)!;

  let datasets: any[];

  if (compareAgents && data.agentStats.size > 0) {
    datasets = [];
    let idx = 0;
    for (const [agentId, roundStats] of data.agentStats) {
      const agentData = sortedRounds.map(r => {
        const s = roundStats.get(r);
        return s && s.total > 0 ? Math.round((s.correct / s.total) * 100) : 0;
      });
      datasets.push({
        label: agentId,
        data: agentData,
        backgroundColor: COLORS[idx % COLORS.length] + '80',
        borderColor: COLORS[idx % COLORS.length],
        borderWidth: 2,
        fill: false,
        tension: 0.3,
      });
      idx++;
    }
  } else if (compareExperiments && data.experimentNames.length > 1) {
    datasets = [];
    data.experimentNames.forEach((expName, idx) => {
      const expData = data.experimentData.get(expName)!;
      if (dataKeys.includes('accuracy') || dataKeys.length === 0) {
        datasets.push({
          label: `${expName} – Accuracy`,
          data: sortedRounds.map(r => {
            const s = expData.roundStats.get(r);
            return s && s.total > 0 ? Math.round((s.correct / s.total) * 100) : 0;
          }),
          backgroundColor: COLORS[idx % COLORS.length] + '80',
          borderColor: COLORS[idx % COLORS.length],
          borderWidth: 2,
          fill: false,
          tension: 0.3,
        });
      }
      if (dataKeys.includes('consensus') || dataKeys.includes('consensusGrouped')) {
        datasets.push({
          label: `${expName} – Consensus`,
          data: sortedRounds.map(r => {
            const s = expData.consensusStats.get(r);
            return s && s.total > 0 ? Math.round((s.unanimousCorrect / s.total) * 100) : 0;
          }),
          backgroundColor: COLORS[(idx + 5) % COLORS.length] + '80',
          borderColor: COLORS[(idx + 5) % COLORS.length],
          borderWidth: 2,
          fill: false,
          tension: 0.3,
          borderDash: [5, 5],
        });
      }
    });
  } else {
    datasets = getBaseDatasets(chartType, data, dataKeys, sortedRounds);
  }

  if (chartType === 'pie' || chartType === 'donut') {
    const values = sortedRounds.map(r => {
      const s = data.roundStats.get(r)!;
      return s.total > 0 ? Math.round((s.correct / s.total) * 100) : 0;
    });
    const pieDatasets = [{ data: values, backgroundColor: COLORS.slice(0, values.length) }];
    const cfg: any = {
      type: cjsType,
      data: { labels, datasets: pieDatasets },
      options: {
        responsive: true,
        plugins: {
          title: { display: true, text: title, font: { size: 16 } },
          legend: { display: true, position: 'top' },
        },
      },
    };
    const url = buildQuickChartUrl(cfg, 600, 500);
    return { type: chartType, title, data: cfg.data, rawData: cfg.data, url, renderType: 'image' };
  }

  if (chartType === 'radar') {
    const cfg: any = {
      type: 'radar',
      data: { labels, datasets },
      options: {
        responsive: true,
        plugins: { title: { display: true, text: title, font: { size: 16 } } },
        scales: { r: { beginAtZero: true, max: 100 } },
      },
    };
    const url = buildQuickChartUrl(cfg, 700, 600);
    return { type: chartType, title, data: cfg.data, rawData: cfg.data, url, renderType: 'image' };
  }

  const options: any = {
    responsive: true,
    plugins: {
      title: { display: true, text: title, font: { size: 16 } },
      legend: { display: datasets.length > 1, position: 'top' },
    },
    scales: {
      y: { beginAtZero: true, max: 100, title: { display: true, text: 'Percentage' } },
      x: { title: { display: true, text: 'Round' } },
    },
  };

  if (chartType === 'stacked_bar' || chartType === 'stacked_area') {
    options.scales.x.stacked = true;
    options.scales.y.stacked = true;
  }

  if (chartType === 'horizontal_bar') options.indexAxis = 'y';

  const cfg: any = { type: cjsType, data: { labels, datasets }, options };
  const url = buildQuickChartUrl(cfg, 900, 500);
  return { type: chartType, title, data: cfg.data, rawData: cfg.data, url, renderType: 'image' };
}

function createPlotlyPlot(
  chartType: string,
  title: string,
  data: ProcessedDebateData,
  dataKeys: string[],
  compareExperiments: boolean,
  compareAgents: boolean,
): PlotConfig {
  const sortedRounds = Array.from(data.roundStats.keys()).sort((a, b) => a - b);
  const roundLabels = sortedRounds.map(r => `Round ${r}`);

  const accuracyValues = sortedRounds.map(r => {
    const s = data.roundStats.get(r)!;
    return s.total > 0 ? (s.correct / s.total) * 100 : 0;
  });

  let traces: any[] = [];

  switch (chartType) {
    case 'box':
    case 'violin': {
      const allAccuracies = data.questions.map(q => {
        const lastRound = q.debate_session.rounds[q.debate_session.rounds.length - 1];
        if (!lastRound?.responses) return 0;
        const total = Object.keys(lastRound.responses).length;
        const correct = Object.values(lastRound.responses).filter(
          r => extractAnswer(r) === extractCorrectAnswer(q.correct_answer),
        ).length;
        return total > 0 ? (correct / total) * 100 : 0;
      });
      traces = [{
        type: chartType === 'violin' ? 'violin' : 'box',
        y: allAccuracies,
        name: 'Accuracy Distribution',
        marker: { color: COLORS[0] },
        ...(chartType === 'violin' ? { box: { visible: true }, meanline: { visible: true } } : {}),
      }];
      break;
    }

    case 'scatter':
    case 'bubble': {
      if (chartType === 'bubble' && data.experimentNames.length > 0) {
        traces = data.experimentNames.map((expName, idx) => {
          const expData = data.experimentData.get(expName)!;
          const sortedExpRounds = Array.from(expData.roundStats.keys()).sort((a, b) => a - b);
          const lastRound = sortedExpRounds[sortedExpRounds.length - 1];
          const lastStat = expData.roundStats.get(lastRound);
          const finalAccuracy = lastStat && lastStat.total > 0
            ? (lastStat.correct / lastStat.total) * 100
            : 0;
          const numRounds = sortedExpRounds.length;
          const totalQ = expData.totalQuestions;

          return {
            type: 'scatter',
            mode: 'markers+text',
            name: expName,
            x: [finalAccuracy],
            y: [totalQ],
            text: [expName],
            textposition: 'top center',
            marker: {
              color: COLORS[idx % COLORS.length],
              size: [Math.max(20, numRounds * 10)],
              sizemode: 'diameter',
              opacity: 0.75,
              line: { width: 2, color: '#fff' },
            },
            hovertemplate:
              `<b>${expName}</b><br>` +
              `Final Accuracy: %{x:.1f}%<br>` +
              `Total Questions: %{y}<br>` +
              `Rounds: ${numRounds}<extra></extra>`,
          };
        });
      } else {
        traces = [{
          type: 'scatter',
          mode: 'markers',
          x: roundLabels,
          y: accuracyValues,
          name: 'Accuracy',
          marker: { color: COLORS[0], size: 10 },
        }];
      }
      break;
    }

    case 'histogram': {
      const allQuestionAccuracies = data.questions.map(q => {
        const lastRound = q.debate_session.rounds[q.debate_session.rounds.length - 1];
        if (!lastRound?.responses) return 0;
        const total = Object.keys(lastRound.responses).length;
        const correct = Object.values(lastRound.responses).filter(
          r => extractAnswer(r) === extractCorrectAnswer(q.correct_answer),
        ).length;
        return total > 0 ? (correct / total) * 100 : 0;
      });
      traces = [{
        type: 'histogram',
        x: allQuestionAccuracies,
        name: 'Accuracy Distribution',
        marker: { color: COLORS[0] },
        nbinsx: 10,
      }];
      break;
    }

    case 'heatmap': {
      if (compareAgents && data.agentStats.size > 0) {
        const agents = Array.from(data.agentStats.keys());
        const zValues = agents.map(agent => {
          const roundStats = data.agentStats.get(agent)!;
          return sortedRounds.map(r => {
            const s = roundStats.get(r);
            return s && s.total > 0 ? (s.correct / s.total) * 100 : 0;
          });
        });
        traces = [{
          type: 'heatmap',
          z: zValues,
          x: roundLabels,
          y: agents,
          colorscale: 'Blues',
          colorbar: { title: '% Accuracy' },
        }];
      } else {
        const experiments = compareExperiments ? data.experimentNames : ['All'];
        const zValues = experiments.map(exp => {
          if (exp === 'All') return accuracyValues;
          const ed = data.experimentData.get(exp);
          return sortedRounds.map(r => {
            const s = ed?.roundStats.get(r);
            return s && s.total > 0 ? (s.correct / s.total) * 100 : 0;
          });
        });
        traces = [{
          type: 'heatmap',
          z: zValues,
          x: roundLabels,
          y: experiments,
          colorscale: 'Blues',
          colorbar: { title: '% Accuracy' },
        }];
      }
      break;
    }

    case 'sankey':
    case 'correctness_flow': {
      const sankeyRounds = Array.from(new Set<number>([
        ...Array.from(data.correctnessFlows.keys()).flatMap(k => {
          const m = k.match(/(\d+)_to_(\d+)/);
          return m ? [parseInt(m[1]), parseInt(m[2])] : [];
        }),
      ])).sort((a, b) => a - b);

      const nodeLabels = sankeyRounds.flatMap(r => [`R${r}: Correct`, `R${r}: Incorrect`]);
      const nodeColors = nodeLabels.map(n => n.includes('Correct') ? '#10b981' : '#ef4444');

      const sourceIdxs: number[] = [];
      const targetIdxs: number[] = [];
      const values: number[] = [];
      const linkColors: string[] = [];

      for (const [transition, flow] of data.correctnessFlows) {
        const match = transition.match(/(\d+)_to_(\d+)/);
        if (!match) continue;
        const fromRound = parseInt(match[1]);
        const toRound = parseInt(match[2]);

        const fromRoundIdx = sankeyRounds.indexOf(fromRound);
        const toRoundIdx = sankeyRounds.indexOf(toRound);
        if (fromRoundIdx === -1 || toRoundIdx === -1) continue;

        const fromCorrectIdx = fromRoundIdx * 2;
        const fromIncorrectIdx = fromRoundIdx * 2 + 1;
        const toCorrectIdx = toRoundIdx * 2;
        const toIncorrectIdx = toRoundIdx * 2 + 1;

        if (flow.correctToCorrect > 0) {
          sourceIdxs.push(fromCorrectIdx); targetIdxs.push(toCorrectIdx);
          values.push(flow.correctToCorrect); linkColors.push('rgba(16,185,129,0.5)');
        }
        if (flow.correctToIncorrect > 0) {
          sourceIdxs.push(fromCorrectIdx); targetIdxs.push(toIncorrectIdx);
          values.push(flow.correctToIncorrect); linkColors.push('rgba(239,68,68,0.65)');
        }
        if (flow.incorrectToCorrect > 0) {
          sourceIdxs.push(fromIncorrectIdx); targetIdxs.push(toCorrectIdx);
          values.push(flow.incorrectToCorrect); linkColors.push('rgba(59,130,246,0.5)');
        }
        if (flow.incorrectToIncorrect > 0) {
          sourceIdxs.push(fromIncorrectIdx); targetIdxs.push(toIncorrectIdx);
          values.push(flow.incorrectToIncorrect); linkColors.push('rgba(156,163,175,0.35)');
        }
      }

      traces = [{
        type: 'sankey',
        arrangement: 'fixed',
        node: { label: nodeLabels, color: nodeColors, pad: 30, thickness: 25 },
        link: { source: sourceIdxs, target: targetIdxs, value: values, color: linkColors },
      }];
      break;
    }

    default: {
      traces = [{
        type: 'scatter',
        mode: 'lines+markers',
        x: roundLabels,
        y: accuracyValues,
        name: 'Accuracy',
        marker: { color: COLORS[0] },
      }];
    }
  }

  const layout: any = {
    title: { text: title },
    paper_bgcolor: 'rgba(0,0,0,0)',
    plot_bgcolor: 'rgba(0,0,0,0)',
    font: { size: 14 },
  };

  return {
    type: chartType,
    title,
    data: { traces, layout },
    rawData: { traces, layout },
    renderType: 'plotly',
  };
}

function createVisualization(
  chartType: string,
  title: string,
  dataKeys: string[],
  compareExperiments: boolean,
  compareAgents: boolean = false,
): PlotConfig {
  if (!globalProcessedData) {
    return { type: chartType, title, data: null, renderType: 'error' };
  }

  const cjsType = resolveChartJsType(chartType);

  if (cjsType) {
    return createChartJsPlot(chartType, title, globalProcessedData, dataKeys, compareExperiments, compareAgents);
  }

  return createPlotlyPlot(chartType, title, globalProcessedData, dataKeys, compareExperiments, compareAgents);
}

const tools: OpenAI.ChatCompletionTool[] = [
  {
    type: 'function',
    function: {
      name: 'fetch_debate_data',
      description: 'Fetches and processes debate data from database. Returns comprehensive statistics including per-agent accuracy, majority vote, and correctness transitions.',
      parameters: { type: 'object', properties: {}, required: [] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_detailed_stats',
      description: `Returns detailed statistics in JSON format including:
- Overview: total debates, questions, rounds, experiments, agents
- Accuracy by round (overall and per-agent)
- Agent overall accuracy rankings
- Majority vote accuracy (overall and by round)
- Consensus statistics by round
- Correctness transitions with retention/recovery/loss rates
- Question difficulty distribution (easy/medium/hard)`,
      parameters: { type: 'object', properties: {}, required: [] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_visualization',
      description: `Creates a visualization. Chart types:
- line: Accuracy trends over rounds
- bar/grouped_bar: Compare metrics across rounds
- sankey/correctness_flow: Show how answers changed (correct→incorrect, etc.)
- heatmap: Agent or experiment performance matrix
- box/violin: Distribution of accuracies
- pie/donut: Proportion breakdown
- radar: Multi-metric comparison

data_keys options:
- accuracy: Overall accuracy per round
- consensus: Unanimous correct rate only (single line/bar)
- consensusGrouped: Unanimous correct, unanimous incorrect, majority correct, and split rates as separate series — use this for grouped bar charts showing consensus breakdown

Set compare_agents=true to show per-agent breakdown.
Set compare_experiments=true to compare experiments side-by-side.`,
      parameters: {
        type: 'object',
        properties: {
          chart_type: {
            type: 'string',
            enum: ['line', 'bar', 'grouped_bar', 'stacked_bar', 'horizontal_bar', 'area',
              'scatter', 'bubble', 'histogram', 'pie', 'donut', 'radar',
              'box', 'violin', 'heatmap', 'sankey', 'correctness_flow'],
          },
          title: { type: 'string', description: 'Descriptive chart title' },
          data_keys: {
            type: 'array',
            items: { type: 'string', enum: ['accuracy', 'consensus', 'consensusGrouped', 'transitions'] },
            description: 'Metrics to visualize. Use consensusGrouped for grouped bar charts showing unanimous correct vs incorrect vs split.',
          },
          compare_experiments: { type: 'boolean', description: 'Whether to show experiments side-by-side' },
          compare_agents: { type: 'boolean', description: 'Whether to show per-agent breakdown' },
        },
        required: ['chart_type', 'title', 'data_keys'],
      },
    },
  },
];

async function executeTool(name: string, args: any): Promise<string> {
  switch (name) {
    case 'fetch_debate_data':
      return await executeFetchDebateData();
    case 'get_detailed_stats':
      return executeGetDetailedStats();
    case 'create_visualization':
      return executeCreateVisualization(args);
    default:
      return JSON.stringify({ error: `Unknown tool: ${name}` });
  }
}

async function executeFetchDebateData(): Promise<string> {
  if (globalProcessedData && globalDetailedStats) {
    return JSON.stringify({ status: 'already_loaded', summary: globalDetailedStats.overview });
  }

  try {
    const debates = await getDebateData(100, globalDebateIds ?? undefined);
    if (debates.length === 0) {
      return JSON.stringify({ status: 'error', message: 'No debates found' });
    }

    globalProcessedData = processDebateData(debates);
    globalDetailedStats = computeDetailedStats(globalProcessedData);

    return JSON.stringify({ status: 'success', summary: globalDetailedStats.overview });
  } catch (error: any) {
    return JSON.stringify({ status: 'error', message: error.message });
  }
}

function executeGetDetailedStats(): string {
  if (!globalDetailedStats) {
    return JSON.stringify({ error: 'No data loaded. Call fetch_debate_data first.' });
  }
  return JSON.stringify(globalDetailedStats, null, 2);
}

function executeCreateVisualization(args: {
  chart_type: string;
  title: string;
  data_keys: string[];
  compare_experiments?: boolean;
  compare_agents?: boolean;
}): string {
  if (!globalProcessedData || !globalDetailedStats) {
    return JSON.stringify({ error: 'No data loaded.' });
  }

  const { chart_type, title, data_keys, compare_experiments, compare_agents } = args;
  const sortedRounds = Array.from(globalProcessedData.roundStats.keys()).sort((a, b) => a - b);

  if (sortedRounds.length === 0) {
    return JSON.stringify({ error: 'No round data available.' });
  }

  if ((chart_type === 'sankey' || chart_type === 'correctness_flow') &&
    Object.keys(globalDetailedStats.correctnessTransitions).length === 0) {
    return JSON.stringify({ error: 'No correctness transitions found. Need at least 2 rounds.' });
  }

  if (compare_experiments && globalDetailedStats.overview.experiments.length < 2) {
    return JSON.stringify({
      error: `Cannot compare experiments: only ${globalDetailedStats.overview.experiments.length} experiment(s) found.`
    });
  }

  if (compare_agents && globalDetailedStats.overview.agents.length === 0) {
    return JSON.stringify({ error: 'No agent data available.' });
  }

  const plot = createVisualization(
    chart_type,
    title,
    data_keys,
    compare_experiments ?? false,
    compare_agents ?? false,
  );

  if (!plot || plot.renderType === 'error' || !plot.data) {
    return JSON.stringify({ error: `Failed to create ${chart_type} chart.` });
  }

  globalPlot = plot;
  logger.info(`[Agent] Plot created: type=${chart_type}, renderType=${plot.renderType}, hasData=${!!plot.data}`);

  return JSON.stringify({
    success: true,
    chart_type,
    title,
    renderType: plot.renderType,
    message: `Created ${chart_type} chart: "${title}"`,
  });
}

const SYSTEM_PROMPT = `You are an expert data analyst specializing in multi-agent debate experiments.

## Your Capabilities
You analyze debate data to provide insights on:
- Agent accuracy per round (individual and overall)
- How agents change answers between rounds (correctness transitions)
- Majority vote accuracy by round
- Consensus patterns and rates
- Experiment comparisons
- Question difficulty distribution

## Workflow
1. ALWAYS call fetch_debate_data first to load the data
2. Call get_detailed_stats to see comprehensive statistics
3. Based on the user's question, analyze the stats and decide if a visualization helps
4. ALWAYS call create_visualization when the user asks for a chart or plot — do not skip this step
5. Provide specific numbers, percentages, and actionable insights

## Statistics Available
After calling get_detailed_stats, you have access to:
- accuracyByRound: Overall accuracy per round
- agentAccuracyByRound: Each agent's accuracy per round
- agentOverallAccuracy: Each agent's total accuracy
- majorityVote: Majority vote accuracy overall and by round
- consensusByRound: Unanimous/split rates per round
- correctnessTransitions: How answers changed between rounds
  - retentionRate: % that stayed correct
  - recoveryRate: % that went from incorrect to correct
  - lossRate: % that went from correct to incorrect
- questionDifficulty: Easy/medium/hard distribution

## Chart Selection Guide
- "accuracy over rounds" → line chart with data_keys: ["accuracy"]
- "compare agents" → grouped_bar or heatmap with compare_agents=true
- "compare experiments" → grouped_bar with compare_experiments=true
- "how did answers change" / "transitions" → sankey or correctness_flow
- "distribution" → box or violin
- "consensus breakdown" → grouped_bar with data_keys: ["consensusGrouped"] — this shows unanimous correct, unanimous incorrect, majority correct, and split as separate series
- "consensus trend" → line with data_keys: ["consensus"]

## Important Rules
- ALWAYS include specific numbers (percentages, counts)
- ALWAYS call create_visualization when a chart is requested — never skip it
- Reference the actual statistics from get_detailed_stats
- If a visualization doesn't make sense (e.g., not enough data), explain why
- Focus on actionable insights and patterns`;

export async function runSmartAgent(
  userPrompt: string,
  debateIds?: number[],
  conversationId?: string,
): Promise<AgentResult> {
  if (!conversationId) {
    throw new Error('conversationId is required');
  }

  const conversation = await prisma.agentConversation.findUnique({
    where: { id: conversationId },
  });

  if (!conversation) {
    throw new Error(`Conversation ${conversationId} not found`);
  }

  globalCurrentConversationId = conversationId;

  const history = await getConversationHistory(conversationId);
  globalCurrentMessageIndex = history.length;

  const isNewConversation = history.length === 0;
  const debateIdsChanged = debateIds !== undefined &&
    JSON.stringify(debateIds?.sort()) !== JSON.stringify(globalDebateIds?.sort());

  if (isNewConversation || debateIdsChanged) {
    globalProcessedData = null;
    globalDetailedStats = null;
    globalDebateIds = debateIds ?? null;
  }

  globalSteps = [];
  globalPlot = null;

  const messages: OpenAI.ChatCompletionMessageParam[] = [
    { role: 'system', content: SYSTEM_PROMPT },
  ];

  if (history.length > 0) {
    const contextPrefix = formatConversationContext(history);
    messages.push({ role: 'user', content: `${contextPrefix} ${userPrompt}` });
  } else {
    messages.push({ role: 'user', content: userPrompt });
  }

  try {
    log('thinking', `Starting AI analysis${globalDebateIds?.length ? ` with ${globalDebateIds.length} selected debates` : ''}...`);

    let iterations = 0;
    const maxIterations = 10;

    while (iterations++ < maxIterations) {
      const response = await client.chat.completions.create({
        model: MODEL,
        messages,
        tools,
        tool_choice: 'auto',
        temperature: TEMPERATURE,
        max_tokens: MAX_TOKENS,
      });

      const message = response.choices[0].message;
      messages.push(message);

      if (!message.tool_calls || message.tool_calls.length === 0) {
        log('final', 'Analysis complete');

        return {
          result: message.content ?? 'Analysis complete.',
          steps: globalSteps,
          plot: globalPlot ?? undefined,
          conversationId,
          stats: globalDetailedStats ?? undefined,
        };
      }

      for (const toolCall of message.tool_calls) {
        const fnToolCall = toolCall as OpenAI.ChatCompletionMessageToolCall & { function: { name: string; arguments: string } };
        const args = JSON.parse(fnToolCall.function.arguments || '{}');

        log('tool_call', `Calling ${fnToolCall.function.name}`, fnToolCall.function.name, args);

        const result = await executeTool(fnToolCall.function.name, args);

        const preview = result.length > 300 ? result.substring(0, 300) + '...' : result;
        log('tool_result', preview, fnToolCall.function.name);

        messages.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          content: result,
        });
      }
    }

    return {
      result: 'Analysis reached maximum iterations.',
      steps: globalSteps,
      conversationId,
    };

  } catch (error: any) {
    log('error', `Analysis failed: ${error.message}`);
    logger.error('Agent error:', error);

    return {
      result: `Error during analysis: ${error.message}`,
      steps: globalSteps,
      conversationId,
    };
  }
}

export async function clearConversation(conversationId: string): Promise<void> {
  await prisma.agentConversation.update({
    where: { id: conversationId },
    data: { messages: [], plots: [], updatedAt: new Date() },
  });
  if (globalCurrentConversationId === conversationId) {
    globalProcessedData = null;
    globalDetailedStats = null;
    globalDebateIds = null;
  }
}

export async function getConversationMessages(conversationId: string): Promise<ConversationMessage[]> {
  return getConversationHistory(conversationId);
}

export async function getConversationWithPlots(conversationId: string): Promise<{
  messages: ConversationMessage[];
  plots: StoredPlot[];
} | null> {
  const conversation = await prisma.agentConversation.findUnique({
    where: { id: conversationId },
  });

  if (!conversation) return null;

  const messages = Array.isArray(conversation.messages)
    ? conversation.messages as unknown as ConversationMessage[]
    : [];

  const plots = Array.isArray(conversation.plots)
    ? conversation.plots as unknown as StoredPlot[]
    : [];

  return { messages, plots };
}

export async function listConversations(limit: number = 50): Promise<Array<{
  id: string;
  messageCount: number;
  createdAt: Date;
  updatedAt: Date;
  preview: string;
}>> {
  const conversations = await prisma.agentConversation.findMany({
    orderBy: { updatedAt: 'desc' },
    take: limit,
  });

  return conversations.map(c => {
    const messages = Array.isArray(c.messages) ? c.messages as unknown as ConversationMessage[] : [];
    const firstUserMessage = messages.find(m => m.role === 'user');
    return {
      id: c.id,
      messageCount: messages.length,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
      preview: firstUserMessage?.content?.substring(0, 100) || 'New conversation',
    };
  });
}

export { getDebateData, processDebateData, extractAnswer, extractCorrectAnswer, computeDetailedStats };