import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  HttpException,
} from '@nestjs/common';
import { Observable, throwError } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { OpsAlertService } from './ops-alert.service.js';
import { httpExceptionLogMessage } from './ops-alert.constants.js';

@Injectable()
export class ErrorLogInterceptor implements NestInterceptor {
  constructor(private readonly opsAlert: OpsAlertService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest();
    const userId = req.user?.id ?? null;
    const route = req.url ?? null;
    const method = req.method ?? null;
    return next.handle().pipe(
      catchError((err) => {
        const isHttp = err instanceof HttpException;
        const statusCode = isHttp ? err.getStatus() : 500;
        const message = isHttp
          ? httpExceptionLogMessage(err)
          : (err?.message ?? 'Unknown error');
        const stack = err?.stack ?? null;
        void this.opsAlert.recordError({
          userId,
          route,
          method,
          statusCode,
          message,
          stack,
          metadata: {
            userAgent: req.headers['user-agent'] ?? null,
            ip: req.ip ?? null,
          },
        });
        return throwError(() => err);
      }),
    );
  }
}
