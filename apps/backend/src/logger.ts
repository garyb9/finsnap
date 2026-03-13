import { createLogger as winstonCreateLogger, format, transports } from 'winston';

function makeLogger(label?: string) {
  return winstonCreateLogger({
    level: process.env.LOG_LEVEL ?? 'info',
    format: format.combine(
      format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
      format.errors({ stack: true }),
      format.colorize(),
      format.printf(({ timestamp, level, message, stack }) => {
        const prefix = label ? `[${label}] ` : '';
        return stack
          ? `${timestamp} [${level}]: ${prefix}${message}\n${stack}`
          : `${timestamp} [${level}]: ${prefix}${message}`;
      })
    ),
    transports: [new transports.Console()],
  });
}

export function createLogger(label: string) {
  return makeLogger(label);
}

export default makeLogger();
