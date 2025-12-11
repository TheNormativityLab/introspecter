import express from "express";
import { postResponse } from "./controller/handlers/response";
import { argumentativeDebateRoutes } from "../routes";

const router = express.Router();
router.post(argumentativeDebateRoutes.PostResponse, postResponse);
export { router as argumentativeRouter };
