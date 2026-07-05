import winston from 'winston';
import { env, isProd } from '../config/env';

const { combine, timestamp, printf, colorize, errors, json } = winston.format;

const consoleFormat = combine(
  colorize(),
  timestamp({ format: 'HH:mm:ss' }),
  printf(({ level, message, timestamp: ts, stack }) => {
    return `${ts} ${level}: ${stack || message}`;
  }),
);

export const logger = winston.createLogger({
  level: isProd ? 'info' : 'debug',
  format: combine(errors({ stack: true }), timestamp(), json()),
  transports: [new winston.transports.Console({ format: consoleFormat })],
  exitOnError: false,
});

// In production also persist to files (see Phase 6 for rotation).
if (isProd) {
  logger.add(new winston.transports.File({ filename: 'logs/error.log', level: 'error' }));
  logger.add(new winston.transports.File({ filename: 'logs/combined.log' }));
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _touch = env; // ensure env is validated before logger is used
