// backend/src/router/agent/index.ts
import express from "express";
import { 
  handleRunTask, 
  handleHarnessAnalyze,
  handleHarnessRuns
} from "./controllers/handlers/plot.js";
import {
  listConversations,
  getOrCreateConversation,
  getConversationHistory,
  deleteConversation,
 clearConversation, 
} from "./controllers/handlers/context.js";
import { agentRoutes } from "../routes";

const router = express.Router();

router.post(agentRoutes.Execute, handleRunTask);
router.get(agentRoutes.Runs, handleHarnessRuns); 
router.post(agentRoutes.Analyze, handleHarnessAnalyze);

router.get(agentRoutes.Conversations, listConversations);
router.post(agentRoutes.Conversations, getOrCreateConversation);
router.get(agentRoutes.ConversationById, getConversationHistory);
router.delete(agentRoutes.ConversationById, deleteConversation);
router.post(agentRoutes.ConversationClear, clearConversation);

export const agentRouter = router;