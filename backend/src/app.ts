import { logger } from "./services/logger";
import express, { NextFunction, Request, Response } from "express";
import morgan from "morgan";
import {
  appRoutesPrefix,
  userRoutePrefix,
  debateRoutePrefix,
  agentRoutePrefix
} from "./router/routes";
import { userRouter } from "./router/users/index";
import { agentRouter } from "./router/agent/index";
import { debateRouter } from "./router/debates/index";
import { argumentativeRouter } from "./router/argumentative-debate/index";
const app = express();

app.use(morgan("dev"));
app.use(express.json());
app.use(appRoutesPrefix + agentRoutePrefix, agentRouter);
app.use(appRoutesPrefix + userRoutePrefix, userRouter);
app.use(appRoutesPrefix + debateRoutePrefix, debateRouter);
app.use(appRoutesPrefix + debateRoutePrefix, argumentativeRouter);
app.get("/health", (req, res) => {
  res.status(200).json({ status: "ok" });
});
app.all("*", async (req: Request, res: Response, next: NextFunction) => {
  logger.warn(
    `404 - Route not found: ${req.method} ${req.originalUrl} from ${req.ip}`
  );

  res.status(404).json({
    success: false,
    message: "Route not found",
    method: req.method,
    url: req.originalUrl,
  });
});

export { app };
