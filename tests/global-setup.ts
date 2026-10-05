import 'dotenv/config';
import { execSync } from 'node:child_process';

/** Resets the test database and loads reference data (no demo content). */
export default function setup() {
  const base = process.env.DB_NAME ?? 'everest_kennel';
  const testUrl = (process.env.DATABASE_URL ?? '').replace(new RegExp(`/${base}(\\?|$)`), `/${base}_test$1`);
  const env = { ...process.env, DATABASE_URL: testUrl, DB_NAME: `${base}_test`, SEED_DEMO: '0', ADMIN_PASSWORD: 'Test#Admin2026' };
  execSync('npx prisma migrate reset --force --skip-seed --skip-generate', { env, stdio: 'ignore' });
  execSync('npx tsx prisma/seed.ts', { env, stdio: 'ignore' });
}
