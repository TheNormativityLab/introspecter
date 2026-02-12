"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.logger = void 0;
const winston_1 = require("winston");
const { File, Console } = winston_1.transports;
const { combine, timestamp, json, colorize, printf } = winston_1.format;
const logger = (0, winston_1.createLogger)({
    level: 'info',
});
exports.logger = logger;
if (process.env.NODE_ENV === 'production') {
    const fileFormat = combine(timestamp(), json());
    const errTransport = new File({
        filename: './logs/error.log',
        format: fileFormat,
        level: 'error',
    });
    const infoTransport = new File({
        filename: './logs/combined.log',
        format: fileFormat,
    });
    logger.add(errTransport);
    logger.add(infoTransport);
}
else {
    const errorStackFormat = (0, winston_1.format)((info) => {
        if (info.stack) {
            // log stack traces as error messages
            logger.log({ level: 'error', message: info.stack.toString() });
            return false;
        }
        return info;
    });
    // 👇 custom formatter that includes metadata
    const devFormat = printf(({ level, message, ...meta }) => {
        let metaString = '';
        if (Object.keys(meta).length > 0) {
            metaString = JSON.stringify(meta, null, 2);
        }
        return `${level}: ${message} ${metaString}`;
    });
    const consoleTransport = new Console({
        format: combine(colorize(), errorStackFormat(), devFormat),
    });
    logger.add(consoleTransport);
}
//# sourceMappingURL=logger.js.map