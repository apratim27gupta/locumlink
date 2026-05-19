import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
    private readonly pool: Pool;

    constructor(config: ConfigService) {
        const url = config.get<string>('DATABASE_URL') ?? process.env['DATABASE_URL'];
        const pool = new Pool({
            connectionString: url,
            max: 10,
            idleTimeoutMillis: 30_000,
        });
        const adapter = new PrismaPg(pool);
        super({ adapter });
        this.pool = pool;
    }
    async onModuleInit(): Promise<void> {
        try {
            await this.$connect();
        }
        catch (err) {
            console.error('[PrismaService] Database connection failed on startup', err);
        }
    }
    async onModuleDestroy(): Promise<void> {
        await this.$disconnect();
        await this.pool.end();
    }
}
