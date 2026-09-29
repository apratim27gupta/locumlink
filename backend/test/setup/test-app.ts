import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../../src/app.module';
import { PrismaClientKnownExceptionFilter } from '../../src/prisma/prisma-client-exception.filter';

export type TestAppContext = {
  app: INestApplication<App>;
  agent: ReturnType<typeof request>;
};

export async function createTestApp(): Promise<TestAppContext> {
  const moduleFixture: TestingModule = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  const app = moduleFixture.createNestApplication({ rawBody: true });
  app.useGlobalFilters(new PrismaClientKnownExceptionFilter());
  app.use(cookieParser());
  app.setGlobalPrefix('api');
  await app.init();

  const agent = request(app.getHttpServer());
  return { app, agent };
}

export async function closeTestApp(app: INestApplication): Promise<void> {
  await app.close();
}
