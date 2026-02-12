"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.debateRouter = void 0;
const express_1 = __importDefault(require("express"));
const all_debates_1 = require("./controller/handlers/all-debates");
const new_debate_1 = require("./controller/handlers/new-debate");
const debugger_1 = require("./controller/handlers/debugger");
const routes_1 = require("../routes");
const router = express_1.default.Router();
exports.debateRouter = router;
router.get(routes_1.debateRoutes.GetAllDebates, all_debates_1.getAllDebates);
router.get(routes_1.debateRoutes.GetSingleDebate, all_debates_1.getSingleDebate);
router.get(routes_1.debateRoutes.GetResults, new_debate_1.getExperimentResults);
router.post(routes_1.debateRoutes.GetNewDebate, new_debate_1.getNewDebate);
router.get(routes_1.debateRoutes.getDebateRun, all_debates_1.getDebateRun);
router.get(routes_1.debateRoutes.getStatus, debugger_1.getStatus);
router.post(routes_1.debateRoutes.humanResponse, debugger_1.getHumanResponse);
router.post(routes_1.debateRoutes.humanReady, debugger_1.getHumanReady);
router.post(routes_1.debateRoutes.replayDebate, debugger_1.replayDebate);
router.post(routes_1.debateRoutes.cancelDebate, debugger_1.cancelDebate);
router.get(routes_1.debateRoutes.getQuestionDetails, debugger_1.getQuestionDetails);
//# sourceMappingURL=index.js.map