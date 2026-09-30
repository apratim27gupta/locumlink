import { config } from 'dotenv';
import { resolve } from 'node:path';
config({ path: resolve(process.cwd(), '../.env') });
console.log('ADMIN_ALERT_EMAIL from ../.env:', process.env.ADMIN_ALERT_EMAIL ?? '(unset)');
