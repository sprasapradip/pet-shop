import pino from 'pino';
import { env, isProd, isTest } from '../config/env.js';

export const logger = pino({
  level: isTest ? 'silent' : env.LOG_LEVEL,
  redact: ['req.headers.cookie', 'req.headers.authorization', '*.password', '*.passwordHash', '*.otp'],
  transport: isTest
    ? undefined
    : isProd
      ? { target: 'pino-roll', options: { file: 'storage/logs/app', frequency: 'daily', mkdir: true, limit: { count: 14 } } }
      : { target: 'pino-pretty', options: { colorize: true, ignore: 'pid,hostname' } },
});
