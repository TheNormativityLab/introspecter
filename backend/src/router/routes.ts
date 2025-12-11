export const appRoutesPrefix = "/api/v1";
export const userRoutePrefix = "/user";
export const debateRoutePrefix = "/debate";

export enum debateRoutes {
  GetAllDebates = "/all-debates",
  GetSingleDebate = "/single-debate",
  GetNewDebate = "/new-debate",
  GetResults = "/:expId/results",

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
}
export enum userRoutes {
  GetUserAuth = "/user-auth",
}
