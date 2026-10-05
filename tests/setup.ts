// Runs before every test file, before any app module is imported.
// Integration tests use a separate database: <DB_NAME>_test (created by tests/global-setup.ts).
import 'dotenv/config';

process.env.NODE_ENV = 'test';
process.env.SMS_PROVIDER = 'log';
process.env.SMTP_HOST = '';
process.env.LOG_LEVEL = 'silent';

const base = process.env.DB_NAME ?? 'everest_kennel';
if (!base.endsWith('_test')) {
  process.env.DB_NAME = `${base}_test`;
  process.env.DATABASE_URL = (process.env.DATABASE_URL ?? '').replace(new RegExp(`/${base}(\\?|$)`), `/${base}_test$1`);
}
