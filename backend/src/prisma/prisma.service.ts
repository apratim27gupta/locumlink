import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly pool: Pool;
  private readonly dbDebug: string;

  constructor(config: ConfigService) {
    const url =
      config.get<string>('DATABASE_URL') ?? process.env['DATABASE_URL'];
    const safe = (() => {
      try {
        if (!url) return 'DATABASE_URL is missing';
        const u = new URL(url);
        const host = u.hostname || 'unknown-host';
        const port = u.port || '(default)';
        const db = (u.pathname || '').replace(/^\//, '') || '(no-db)';
        const user = u.username || '(no-user)';
        return `${u.protocol}//${user}@${host}:${port}/${db}`;
      } catch {
        return 'DATABASE_URL is invalid';
      }
    })();
    const pool = new Pool({
      connectionString: url,
      max: 10,
      idleTimeoutMillis: 30_000,
    });
    const adapter = new PrismaPg(pool);
    super({ adapter });
    this.pool = pool;
    this.dbDebug = safe;
  }
  async onModuleInit(): Promise<void> {
    try {
      console.log('[PrismaService] Using', this.dbDebug);
      await this.$connect();
      console.log('[PrismaService] Connected');
    } catch (err) {
      console.error(
        `[PrismaService] Database connection failed on startup (${this.dbDebug})`,
        err,
      );
    }
  }
  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
    await this.pool.end();
  }
}
