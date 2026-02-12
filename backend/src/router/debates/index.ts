import express from "express";
import {
  getAllDebates,
  getSingleDebate,
  getDebateRun,
} from "./controller/handlers/all-debates";
import {
  getNewDebate,
  getExperimentResults,
} from "./controller/handlers/new-debate";
import {
  replayDebate,
  getQuestionDetails,
  getStatus,
  cancelDebate,
  getHumanResponse,
  getHumanReady,
} from "./controller/handlers/debugger";
import { debateRoutes } from "../routes";

const router = express.Router();
router.get(debateRoutes.GetAllDebates, getAllDebates);
router.get(debateRoutes.GetSingleDebate, getSingleDebate);
router.get(debateRoutes.GetResults, getExperimentResults);
router.post(debateRoutes.GetNewDebate, getNewDebate);

router.get(debateRoutes.getDebateRun, getDebateRun);
router.get(debateRoutes.getStatus, getStatus);
router.post(debateRoutes.humanResponse, getHumanResponse);
router.post(debateRoutes.humanReady, getHumanReady);
router.post(debateRoutes.replayDebate, replayDebate);
router.post(debateRoutes.cancelDebate, cancelDebate);
router.get(debateRoutes.getQuestionDetails, getQuestionDetails);
export { router as debateRouter };
