import express from "express";
import { postResponse } from "./controller/handlers/response";
import { argumentativeDebateRoutes } from "../routes";
import { getAllArgumentativeRuns, getSingleArgumentativeRun } from "./controller/handlers/all-runs";

const router = express.Router();
router.post(argumentativeDebateRoutes.PostResponse, postResponse);
router.get(argumentativeDebateRoutes.allRuns, getAllArgumentativeRuns);
router.get(argumentativeDebateRoutes.singleRun, getSingleArgumentativeRun);
export { router as argumentativeRouter };
