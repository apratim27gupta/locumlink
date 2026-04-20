import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module.js';
import { PrismaClientKnownExceptionFilter } from './prisma/prisma-client-exception.filter.js';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);

  app.useGlobalFilters(new PrismaClientKnownExceptionFilter());

app.enableCors({
  origin: [
    'http://localhost:3001',
    'http://127.0.0.1:3001',
    'http://localhost:3002',
    'http://127.0.0.1:3002',
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    'https://locumlink-frontend-nd48.vercel.app',  
  ],
  credentials: true,
});
  app.setGlobalPrefix('api');

  const config = app.get(ConfigService);
  const port = config.get<number>('PORT', 3000);

  await app.listen(port);
  console.log(
    `Application running on port ${port} [${config.get('NODE_ENV')}]`,
  );
}

void bootstrap();
