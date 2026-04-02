export interface Logger {
  info(message: string, ...args: unknown[]): void;
  warn(message: string, ...args: unknown[]): void;
  error(message: string, ...args: unknown[]): void;
  debug(message: string, ...args: unknown[]): void;
}

export function createLogger(): Logger {
  const level = process.env.LOG_LEVEL || 'info';
  const format = process.env.LOG_FORMAT || (process.env.NODE_ENV === 'production' ? 'json' : 'text');
  const levels = { error: 0, warn: 1, info: 2, debug: 3 };
  const currentLevel = levels[level as keyof typeof levels] ?? 2;

  function shouldLog(msgLevel: keyof typeof levels): boolean {
    return levels[msgLevel] <= currentLevel;
  }

  function formatMessage(msgLevel: string, message: string, args: unknown[]): string {
    const timestamp = new Date().toISOString();
    if (format === 'json') {
      return JSON.stringify({ timestamp, level: msgLevel, message, ...(args.length ? { data: args } : {}) });
    }
    const prefix = `[${timestamp}] [${msgLevel.toUpperCase()}]`;
    return args.length ? `${prefix} ${message} ${args.map(a => JSON.stringify(a)).join(' ')}` : `${prefix} ${message}`;
  }

  return {
    info(message, ...args) { if (shouldLog('info')) console.log(formatMessage('info', message, args)); },
    warn(message, ...args) { if (shouldLog('warn')) console.warn(formatMessage('warn', message, args)); },
    error(message, ...args) { if (shouldLog('error')) console.error(formatMessage('error', message, args)); },
    debug(message, ...args) { if (shouldLog('debug')) console.log(formatMessage('debug', message, args)); },
  };
}
