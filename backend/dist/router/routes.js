"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.userRoutes = exports.argumentativeDebateRoutes = exports.debateRoutes = exports.debateRoutePrefix = exports.userRoutePrefix = exports.appRoutesPrefix = void 0;
exports.appRoutesPrefix = "/api/v1";
exports.userRoutePrefix = "/user";
exports.debateRoutePrefix = "/debate";
var debateRoutes;
(function (debateRoutes) {
    debateRoutes["GetAllDebates"] = "/all-debates";
    debateRoutes["GetSingleDebate"] = "/single-debate";
    debateRoutes["GetNewDebate"] = "/new-debate";
    debateRoutes["GetResults"] = "/:expId/results";
    debateRoutes["getDebateRun"] = "/run";
    debateRoutes["replayDebate"] = "/replay";
    debateRoutes["getStatus"] = "/:debateId/status";
    debateRoutes["cancelDebate"] = "/:debateId/cancel";
    debateRoutes["humanResponse"] = "/:debateId/human-response";
    debateRoutes["humanReady"] = "/:debateId/human-ready";
    debateRoutes["getQuestionDetails"] = "/:debateId/question/:questionIndex";
})(debateRoutes || (exports.debateRoutes = debateRoutes = {}));
var argumentativeDebateRoutes;
(function (argumentativeDebateRoutes) {
    argumentativeDebateRoutes["PostResponse"] = "/response";
})(argumentativeDebateRoutes || (exports.argumentativeDebateRoutes = argumentativeDebateRoutes = {}));
var userRoutes;
(function (userRoutes) {
    userRoutes["GetUserAuth"] = "/user-auth";
})(userRoutes || (exports.userRoutes = userRoutes = {}));
//# sourceMappingURL=routes.js.map