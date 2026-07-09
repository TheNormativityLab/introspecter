export const appRoutesPrefix = "/api/v1";
export const userRoutePrefix = "/user";
export const debateRoutePrefix = "/debate";
export const agentRoutePrefix = "/agent";
export const argumentativeDebateRoutePrefix = "/argumentative-debate";

export enum debateRoutes {
  GetAllDebates = "/all-debates",
  GetSingleDebate = "/single-debate",
  GetNewDebate = "/new-debate",
  GetResults = "/:expId/results",
  GetConfigs = "/llm-configs",

  getDebateRun = "/run",
  replayDebate = "/replay",
  getStatus = "/:debateId/status",
  cancelDebate = "/:debateId/cancel",
  humanResponse = "/:debateId/human-response",
  humanReady = "/:debateId/human-ready",
  getQuestionDetails = "/:debateId/question/:questionIndex",
}

export enum argumentativeDebateRoutes {
  PostResponse = "/response",
  allRuns = "/all-runs",
  singleRun = "/single-run",
}
export enum userRoutes {
  GetUserAuth = "/user-auth",
}

export enum agentRoutes {
  Execute = "/harness/execute",
  Analyze = "/harness/analyze",
  Runs = "/harness/runs",
  Conversations = "/harness/conversations",
  ConversationById = "/harness/conversations/:conversationId",
  ConversationClear = "/harness/conversations/:conversationId/clear",
}
