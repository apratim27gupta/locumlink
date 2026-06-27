import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module.js';
import { PrismaClientKnownExceptionFilter } from './prisma/prisma-client-exception.filter.js';
import cookieParser from 'cookie-parser';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);
  app.useGlobalFilters(new PrismaClientKnownExceptionFilter());
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
    }),
  );
  app.use(cookieParser());

  const nodeEnv = config.get<string>('NODE_ENV', 'development');
  let corsOrigin: boolean | string[];
  if (nodeEnv === 'production') {
    const raw = config.get<string>('ALLOWED_ORIGINS', '');
    corsOrigin = raw
      ? raw
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
      : true;
  } else {
    corsOrigin = true;
  }
  app.enableCors({
    origin: corsOrigin,
    credentials: true,
    /** Required for cross-origin POST with `Authorization: Bearer …` from the Next.js app */
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'Accept',
      'X-Requested-With',
      'X-Client-Timezone',
    ],
    exposedHeaders: ['Content-Disposition'],
    methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
    maxAge: 86_400,
  });
  app.setGlobalPrefix('api');
  const port = parseInt(process.env.PORT ?? '3000', 10);
  await app.listen(port);
  console.log(`Application running on port ${port} [${nodeEnv}]`);
}
void bootstrap();
