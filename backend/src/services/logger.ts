import { createLogger, format, transports } from 'winston';

const { File, Console } = transports;
const { combine, timestamp, json, colorize, printf } = format;

const logger = createLogger({
  level: 'info',
});

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
} else {
  const errorStackFormat = format((info) => {
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
    format: combine(
      colorize(),
      errorStackFormat(),
      devFormat
    ),
  });
  logger.add(consoleTransport);
}

export { logger };
