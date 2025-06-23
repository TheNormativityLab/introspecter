interface LogMeta {
  [key: string]: any;
}

class SimpleLogger {
  private formatMessage(level: string, message: string, meta?: LogMeta): string {
    const timestamp = new Date().toISOString();
    const metaStr = meta ? ` ${JSON.stringify(meta)}` : '';
    return `[${timestamp}] ${level.toUpperCase()}: ${message}${metaStr}`;
  }

  info(message: string, meta?: LogMeta) {
    console.info(this.formatMessage('info', message, meta));
  }

  warn(message: string, meta?: LogMeta) {
    console.warn(this.formatMessage('warn', message, meta));
  }

  error(message: string, meta?: LogMeta) {
    console.error(this.formatMessage('error', message, meta));
  }
}

export const logger = new SimpleLogger();