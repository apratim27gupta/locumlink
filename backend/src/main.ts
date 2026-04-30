import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module.js';
import { PrismaClientKnownExceptionFilter } from './prisma/prisma-client-exception.filter.js';
import cookieParser from 'cookie-parser';
async function bootstrap(): Promise<void> {
    const app = await NestFactory.create(AppModule);
    const config = app.get(ConfigService);
    app.useGlobalFilters(new PrismaClientKnownExceptionFilter());
    app.use(cookieParser());
    const nodeEnv = config.get<string>('NODE_ENV', 'development');
    let corsOrigin: boolean | string[];
    if (nodeEnv === 'production') {
        const raw = config.get<string>('ALLOWED_ORIGINS', '');
        corsOrigin = raw
            ? raw.split(',').map((s) => s.trim()).filter(Boolean)
            : true;
    }
    else {
        corsOrigin = true;
    }
    app.enableCors({
        origin: corsOrigin,
        credentials: true,
    });
    app.setGlobalPrefix('api');
    const port = parseInt(process.env.PORT ?? '3000', 10);
    await app.listen(port);
    console.log(`Application running on port ${port} [${nodeEnv}]`);
}
void bootstrap();
