"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.argumentativeRouter = void 0;
const express_1 = __importDefault(require("express"));
const response_1 = require("./controller/handlers/response");
const routes_1 = require("../routes");
const router = express_1.default.Router();
exports.argumentativeRouter = router;
router.post(routes_1.argumentativeDebateRoutes.PostResponse, response_1.postResponse);
//# sourceMappingURL=index.js.map