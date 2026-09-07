import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable, throwError } from 'rxjs';
import { tap, catchError } from 'rxjs/operators';
import { Request, Response } from 'express';
import { OpsAlertService } from '../ops-alert.service.js';

@Injectable()
export class SlowRequestInterceptor implements NestInterceptor {
  constructor(private readonly opsAlert: OpsAlertService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context
      .switchToHttp()
      .getRequest<Request & { user?: { id?: string } }>();
    const res = context.switchToHttp().getResponse<Response>();
    const startTime = Date.now();
    const userId = req.user?.id ?? null;

    const maybeRecord = (statusCode: number) => {
      const durationMs = Date.now() - startTime;
      void this.opsAlert.recordSlowRequest({
        userId,
        method: req.method,
        path: req.url,
        statusCode,
        durationMs,
      });
    };

    return next.handle().pipe(
      tap(() => {
        maybeRecord(res.statusCode);
      }),
      catchError((err: Error & { status?: number }) => {
        maybeRecord(err.status ?? 500);
        return throwError(() => err);
      }),
    );
  }
}
