"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const logger_js_1 = require("./services/logger.js");
const http_1 = __importDefault(require("http"));
const app_1 = require("./app");
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const start = async () => {
    const server = http_1.default.createServer(app_1.app);
    if (!process.env.PORT) {
        throw new Error("PORT must be defined");
    }
    try {
        logger_js_1.logger.info("Connected to PostgreSQL Database");
    }
    catch (e) {
        logger_js_1.logger.error(e);
        console.log(e);
    }
    const port = Number(process.env.PORT) || 8000;
    server.listen(port, '0.0.0.0', () => {
        logger_js_1.logger.info(`Services running on port ${port}`);
    });
};
process.on('SIGINT', () => {
    logger_js_1.logger.info("Bye bye!");
    process.exit();
});
start();
//# sourceMappingURL=index.js.map