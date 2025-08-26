import express from "express";
import { getAllDebates, getSingleDebate } from "./controller/handlers/all-debates"
import { getNewDebate, getExperimentResults } from "./controller/handlers/new-debate";
import { debateRoutes } from "../routes";
import { authenticateToken } from "../../middleware/auth";

const router = express.Router();
router.get(debateRoutes.GetAllDebates, getAllDebates);
router.get(debateRoutes.GetSingleDebate, getSingleDebate);
router.get(debateRoutes.GetResults, getExperimentResults);
router.post(debateRoutes.GetNewDebate, getNewDebate);
export { router as debateRouter };