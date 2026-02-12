"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getHumanResponse = exports.getHumanReady = exports.cancelDebate = exports.getStatus = exports.getQuestionDetails = exports.replayDebate = void 0;
const axios_1 = __importDefault(require("axios"));
const logger_1 = require("../../../../services/logger");
const client_1 = require("@prisma/client");
const prisma = new client_1.PrismaClient();
const api = axios_1.default.create({
    baseURL: process.env.FASTAPI_BASE_URL || "http://introspecter-api:3001",
    timeout: 30000,
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    validateStatus: (s) => s < 600,
});
const handleError = (res, error, context) => {
    logger_1.logger.error(`${context} error:`, error.message);
    if (error.response) {
        return res.status(error.response.status).json({
            success: false,
            message: error.response.data?.detail || "Backend error",
            error: error.response.data,
        });
    }
    if (error.request) {
        return res.status(503).json({ success: false, message: "Backend unavailable" });
    }
    return res.status(500).json({ success: false, message: "Internal server error", error: error.message });
};
const replayDebate = async (req, res) => {
    try {
        const replayData = req.body;
        const required = ["question_index", "start_from_round", "replace_agent_name", "question_data", "previous_rounds", "original_config"];
        if (!required.every(f => f in replayData)) {
            return res.status(400).json({ success: false, message: "Missing required fields" });
        }
        if (replayData.start_from_round < 0) {
            return res.status(400).json({ success: false, message: "start_from_round must be >= 0" });
        }
        const response = await api.post("/debates/replay", replayData);
        if (response.status >= 400)
            return res.status(response.status).json(response.data);
        const result = response.data;
        prisma.debate.create({
            data: {
                experimentId: result.debate_id,
                seed: replayData.original_config.seed || 0,
                datasetName: replayData.original_config.dataset_name || "replay",
                status: result.status,
                createdAt: new Date(result.created_at),
                processedAt: new Date(),
                wandbMetadata: {
                    is_replay: true,
                    question_index: replayData.question_index,
                    start_from_round: replayData.start_from_round,
                    replace_agent_name: replayData.replace_agent_name,
                },
            },
        }).catch(e => logger_1.logger.error("Replay DB sync failed", e));
        return res.status(201).json({
            success: true,
            message: "Replay created",
            debate_id: result.debate_id,
            websocket_url: result.websocket_url,
            status: result.status,
            celery_task_id: result.celery_task_id,
            human_agent_index: result.human_agent_index,
        });
    }
    catch (error) {
        return handleError(res, error, "Replay Debate");
    }
};
exports.replayDebate = replayDebate;
const getQuestionDetails = async (req, res) => {
    try {
        const { debateId, questionIndex } = req.params;
        if (!debateId || !questionIndex)
            return res.status(400).json({ success: false, message: "Missing params" });
        const response = await api.get(`/debates/${debateId}/question/${questionIndex}`, { timeout: 15000 });
        if (response.status === 404)
            return res.status(404).json({ success: false, message: "Not found" });
        if (response.status >= 400)
            return res.status(response.status).json(response.data);
        return res.status(200).json({ success: true, data: response.data });
    }
    catch (error) {
        return handleError(res, error, "Get Question");
    }
};
exports.getQuestionDetails = getQuestionDetails;
const getStatus = async (req, res) => {
    const { debateId } = req.params;
    try {
        const response = await api.get(`/debates/${debateId}/status`, { timeout: 10000 });
        if (response.status === 404)
            return res.status(404).json({ success: false, message: "Debate not found" });
        if (response.status < 300) {
            return res.status(200).json({
                success: true,
                data: {
                    debate_id: debateId,
                    status: response.data.status || "unknown",
                    celery_task_id: response.data.celery_task_id,
                    task_status: response.data.task_status,
                    current_question: response.data.current_question_index || 0,
                    total_questions: response.data.total_questions || 0,
                    created_at: response.data.created_at,
                    debug_info: { fastapi_reachable: true },
                },
            });
        }
    }
    catch (e) {
        logger_1.logger.warn(`FastAPI status check failed for ${debateId}, falling back to DB`);
    }
    try {
        const dbDebate = await prisma.debate.findFirst({
            where: { experimentId: debateId },
            select: { status: true, createdAt: true },
        });
        if (dbDebate) {
            return res.status(200).json({
                success: true,
                data: {
                    debate_id: debateId,
                    status: dbDebate.status || "queued",
                    current_question: 0,
                    total_questions: 0,
                    created_at: dbDebate.createdAt.toISOString(),
                    debug_info: { source: "database", fastapi_unavailable: true },
                },
            });
        }
    }
    catch (dbError) {
        logger_1.logger.error("DB fallback failed", dbError);
    }
    return res.status(200).json({
        success: true,
        data: {
            debate_id: debateId,
            status: "queued",
            created_at: new Date().toISOString(),
            debug_info: { source: "fallback", system_unavailable: true },
        },
    });
};
exports.getStatus = getStatus;
const cancelDebate = async (req, res) => {
    try {
        const response = await api.post(`/debates/${req.params.debateId}/cancel`, {}, { timeout: 10000 });
        if (response.status >= 400)
            return res.status(response.status).json({ success: false, error: response.data });
        return res.status(200).json({ success: true, message: "Cancelled", data: response.data });
    }
    catch (error) {
        return handleError(res, error, "Cancel Debate");
    }
};
exports.cancelDebate = cancelDebate;
const getHumanReady = async (req, res) => {
    try {
        const response = await api.post(`/debates/${req.params.debateId}/human-ready`);
        if (response.status >= 400)
            throw new Error(response.data.detail || "Failed to signal ready");
        return res.status(200).json(response.data);
    }
    catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};
exports.getHumanReady = getHumanReady;
const getHumanResponse = async (req, res) => {
    try {
        const { debateId } = req.params;
        const { response_text, extracted_answer } = req.body;
        if (!debateId || !response_text)
            return res.status(400).json({ success: false, message: "Missing fields" });
        const response = await api.post(`/debate/${debateId}/human-response`, { response_text, extracted_answer }, { timeout: 15000 });
        if (response.status >= 400) {
            return res.status(response.status).json({ success: false, message: "Submission failed", error: response.data });
        }
        return res.status(200).json({ success: true, message: "Submitted", debate_id: debateId });
    }
    catch (error) {
        return handleError(res, error, "Human Response");
    }
};
exports.getHumanResponse = getHumanResponse;
//# sourceMappingURL=debugger.js.map