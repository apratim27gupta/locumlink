import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable, throwError } from 'rxjs';
import { tap, catchError } from 'rxjs/operators';
import { AppLoggerService } from '../logger/app-logger.service.js';
import { Request, Response } from 'express';

/** One scannable access line. Structured fields stay on the Winston record. */
export function httpAccessMessage(fields: {
  method: string;
  path: string;
  statusCode: number;
  durationMs: number;
  userId: string | null;
  error?: string;
}): string {
  const user = fields.userId ? ` user=${fields.userId}` : '';
  const error = fields.error ? ` ${fields.error.replace(/\s+/g, ' ').trim()}` : '';
  return `${fields.method} ${fields.path} ${fields.statusCode} ${fields.durationMs}ms${user}${error}`;
}

@Injectable()
export class HttpLoggingInterceptor implements NestInterceptor {
  constructor(private readonly logger: AppLoggerService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context
      .switchToHttp()
      .getRequest<Request & { user?: { id?: string } }>();
    const res = context.switchToHttp().getResponse<Response>();
    const startTime = Date.now();
    const userId = req.user?.id ?? null;

    return next.handle().pipe(
      tap(() => {
        const durationMs = Date.now() - startTime;
        this.logger.info(
          httpAccessMessage({
            method: req.method,
            path: req.url,
            statusCode: res.statusCode,
            durationMs,
            userId,
          }),
          {
            userId,
            method: req.method,
            path: req.url,
            statusCode: res.statusCode,
            durationMs,
          },
        );
      }),
      catchError((err: Error & { status?: number }) => {
        const durationMs = Date.now() - startTime;
        const statusCode = err.status ?? 500;
        this.logger.error(
          httpAccessMessage({
            method: req.method,
            path: req.url,
            statusCode,
            durationMs,
            userId,
            error: err.message || 'Unhandled error',
          }),
          {
            userId,
            method: req.method,
            path: req.url,
            statusCode,
            stack: err.stack,
            durationMs,
          },
        );
        return throwError(() => err);
      }),
    );
  }
}
