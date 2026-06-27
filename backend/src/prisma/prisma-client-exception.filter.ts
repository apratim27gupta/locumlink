import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpStatus,
} from '@nestjs/common';
import type { Response } from 'express';
import { Prisma } from '@prisma/client';
@Catch(Prisma.PrismaClientKnownRequestError)
export class PrismaClientKnownExceptionFilter implements ExceptionFilter {
  catch(exception: Prisma.PrismaClientKnownRequestError, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>();
    const isProd = process.env.NODE_ENV === 'production';
    const code = exception.code;
    const status =
      code === 'P2025'
        ? HttpStatus.NOT_FOUND
        : code === 'P2002' || code === 'P2003'
          ? HttpStatus.BAD_REQUEST
          : HttpStatus.INTERNAL_SERVER_ERROR;
    res.status(status).json({
      statusCode: status,
      message: isProd ? 'Database error' : `[${code}] ${exception.message}`,
    });
  }
}
