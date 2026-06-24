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
        this.logger.info('HTTP Request', {
          userId,
          method: req.method,
          path: req.url,
          statusCode: res.statusCode,
          durationMs: Date.now() - startTime,
        });
      }),
      catchError((err: Error & { status?: number }) => {
        this.logger.error(err.message ?? 'Unhandled error', {
          userId,
          method: req.method,
          path: req.url,
          statusCode: err.status ?? 500,
          stack: err.stack,
          durationMs: Date.now() - startTime,
        });
        return throwError(() => err);
      }),
    );
  }
}
