import { createLogger, format, transports } from 'winston';

const { File, Console } = transports;
const { combine, timestamp, json, colorize, printf, errors } = format;

const filterInternalMetadata = format((info) => {
  const { level, message, timestamp, stack, ...rest } = info;
  const stringifiedRest = JSON.stringify(rest);
  if (stringifiedRest === '{}') {
    info.metadata = null;
  } else {
    info.metadata = rest;
  }
  return info;
});

const devFormat = printf(({ level, message, timestamp, stack, metadata }) => {
  const msg = stack || message;
  let metaString = '';
  
  if (metadata && Object.keys(metadata).length > 0) {
    metaString = `\n${JSON.stringify(metadata, null, 2)}`;
  }
  
  return `${timestamp} ${level}: ${msg}${metaString}`;
});

const logger = createLogger({
  level: 'info',
  format: combine(
    timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    errors({ stack: true }), 
    filterInternalMetadata()
  ),
});

if (process.env.NODE_ENV === 'production') {
  const fileFormat = combine(timestamp(), json());
  
  logger.add(new File({
    filename: './logs/error.log',
    level: 'error',
    format: fileFormat,
  }));
  
  logger.add(new File({
    filename: './logs/combined.log',
    format: fileFormat,
  }));
} else {
  logger.add(new Console({
    format: combine(
      colorize(),
      devFormat
    ),
  }));
}

export { logger };