import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { config as loadEnv } from 'dotenv';

// Runs before any test module is imported: ConfigModule.forRoot() snapshots env when
// AppModule is first imported, so overrides set later are not seen by ConfigService.
const envTestPath = resolve(__dirname, '../../.env.test');
if (existsSync(envTestPath)) {
  loadEnv({ path: envTestPath, override: true });
}
process.env.NODE_ENV = 'test';
if (process.env.TEST_DATABASE_URL) {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
}
// Stripe API calls are stubbed per test; the webhook secret must be known to sign test events.
process.env.STRIPE_SECRET_KEY = 'sk_test_journey_dummy';
process.env.STRIPE_WEBHOOK_SECRET = 'whsec_journey_test_secret';
