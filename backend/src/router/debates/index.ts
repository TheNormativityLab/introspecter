import express from "express";
import { getAllDebates, getSingleDebate } from "./controller/handlers/all-debates"
import { debateRoutes } from "../routes";
import { authenticateToken } from "../../middleware/auth";

const router = express.Router();
router.get(debateRoutes.GetAllDebates, getAllDebates);
router.get(debateRoutes.GetSingleDebate, getSingleDebate);
export { router as debateRouter };