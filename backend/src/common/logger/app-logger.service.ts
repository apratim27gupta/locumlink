import { Injectable } from '@nestjs/common';
import * as winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';

@Injectable()
export class AppLoggerService {
  private readonly logger: winston.Logger;

  constructor() {
    this.logger = winston.createLogger({
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json(),
      ),
      transports: [
        new DailyRotateFile({
          filename: '/var/log/locumlink/app-%DATE%.log',
          datePattern: 'YYYY-MM-DD',
          zippedArchive: false,
          maxFiles: '30d',
          format: winston.format.combine(
            winston.format.timestamp(),
            winston.format.json(),
          ),
        }),
        new DailyRotateFile({
          filename: '/var/log/locumlink/error-alert.log',
          level: 'error',
          frequency: null,
          datePattern: undefined,
          auditFile: '/var/log/locumlink/.error-audit.json',
          format: winston.format.combine(
            winston.format.timestamp(),
            winston.format.json(),
          ),
        }),
        ...(process.env.NODE_ENV !== 'production'
          ? [new winston.transports.Console()]
          : []),
      ],
    });
  }

  info(message: string, meta?: Record<string, unknown>) {
    this.logger.info(message, meta ?? {});
  }

  error(message: string, meta?: Record<string, unknown>) {
    this.logger.error(message, meta ?? {});
  }

  warn(message: string, meta?: Record<string, unknown>) {
    this.logger.warn(message, meta ?? {});
  }
}
