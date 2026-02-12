"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.app = void 0;
const logger_1 = require("./services/logger");
const express_1 = __importDefault(require("express"));
const routes_1 = require("./router/routes");
const index_1 = require("./router/users/index");
const index_2 = require("./router/debates/index");
const index_3 = require("./router/argumentative-debate/index");
const app = (0, express_1.default)();
exports.app = app;
app.use(express_1.default.json());
// app.use(morgan(':remote-addr - :remote-user [:date[clf]] ":method :url HTTP/:http-version" :status :res[content-length] ":referrer" ":user-agent" - :response-time ms - :total-time[digits] ms'));
// app.use((req, res, next) => {
//   console.log(`Incoming request: ${req.method} ${req.originalUrl}`);
//   next();
// });
app.use(routes_1.appRoutesPrefix + routes_1.userRoutePrefix, index_1.userRouter);
app.use(routes_1.appRoutesPrefix + routes_1.debateRoutePrefix, index_2.debateRouter);
app.use(routes_1.appRoutesPrefix + routes_1.debateRoutePrefix, index_3.argumentativeRouter);
app.get("/health", (req, res) => {
    res.status(200).json({ status: "ok" });
});
app.all("*", async (req, res, next) => {
    logger_1.logger.warn(`404 - Route not found: ${req.method} ${req.originalUrl} from ${req.ip}`);
    res.status(404).json({
        success: false,
        message: "Route not found",
        method: req.method,
        url: req.originalUrl,
    });
});
//# sourceMappingURL=app.js.map