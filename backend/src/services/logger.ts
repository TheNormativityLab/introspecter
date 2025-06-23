import { createLogger, format, transports } from 'winston';

const { File, Console } = transports;

const logger = createLogger({
  level: 'info',
});

if (process.env.NODE_ENV === 'production') {
  const fileFormat = format.combine(
    format.timestamp(),
    format.json(),
  );
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
      logger.log({ level: 'error', message: info.stack.toString() });
      return false;
    }
    return info;
  });
  const consoleTransport = new Console({
    format: format.combine(
      format.colorize(),
      format.simple(),
      format.cli({
        colors: {
          error: 'red',
          warn: 'yellow',
          info: 'blue',
          http: 'green',
          verbose: 'cyan',
          debug: 'white'
        }
      }),
      errorStackFormat(),
    ),
  });
  logger.add(consoleTransport);

}

export {
  logger
}