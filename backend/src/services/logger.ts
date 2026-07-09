import winston from 'winston';

const safeStringify = (obj: any): string => {
  const seen = new WeakSet();
  return JSON.stringify(obj, (key, value) => {
    if (typeof value === 'object' && value !== null) {
      if (seen.has(value)) {
        return '[Circular]';
      }
      seen.add(value);
    }
    if (key === 'socket' || key === 'req' || key === 'res' || key === '_httpMessage') {
      return '[Object]';
    }
    return value;
  });
};

const customFormat = winston.format.printf(({ level, message, timestamp, ...rest }) => {
  const stringifiedRest = Object.keys(rest).length ? safeStringify(rest) : '';
  return `${timestamp} [${level.toUpperCase()}] ${message} ${stringifiedRest}`;
});

export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    customFormat
  ),
  transports: [
    new winston.transports.Console()
  ]
});