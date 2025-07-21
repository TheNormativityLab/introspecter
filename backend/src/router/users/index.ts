import express from "express";
// import { getUserAuth, logoutUser, getUserProfile } from "./controller/handlers/user-auth";
import { userRoutes } from "../routes";
import { authenticateToken } from "../../middleware/auth";

const router = express.Router();
// router.post(userRoutes.GetUserAuth, getUserAuth);
// router.post(userRoutes.GetUserAuth, logoutUser);
// router.get(userRoutes.GetUserAuth, authenticateToken, getUserProfile);

export { router as userRouter };