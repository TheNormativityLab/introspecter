import { logger } from "./services/logger";
import express, { NextFunction, Request, Response } from "express";
import morgan from "morgan";
import { appRoutesPrefix, userRoutePrefix, debateRoutePrefix } from "./router/routes";
import { userRouter } from "./router/users/index"
import { debateRouter } from "./router/debates/index";

const app = express();

app.use(express.json());
app.use(morgan(':remote-addr - :remote-user [:date[clf]] ":method :url HTTP/:http-version" :status :res[content-length] ":referrer" ":user-agent" - :response-time ms - :total-time[digits] ms'));
app.use((req, res, next) => {
  console.log(`Incoming request: ${req.method} ${req.originalUrl}`);
  next();
});

app.use(appRoutesPrefix + userRoutePrefix, userRouter);
app.use(appRoutesPrefix + debateRoutePrefix, debateRouter);

app.all("*", async (req: Request, res: Response, next: NextFunction) => {
  logger.warn(`404 - Route not found: ${req.method} ${req.originalUrl} from ${req.ip}`);

  res.status(404).json({
    success: false,
    message: "Route not found",
    method: req.method,
    url: req.originalUrl,
  });
});

export { app };