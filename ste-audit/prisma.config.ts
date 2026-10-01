/**
 * Prisma 7 configuration.
 * Connection URLs live here (not in schema.prisma) since Prisma 7.
 * `.env` is loaded explicitly; `prisma dev` supplies a local Prisma Postgres URL.
 */
import { defineConfig } from 'prisma/config';

try {
  // Node >= 20.12 — load .env for CLI commands (migrate, generate, studio).
  process.loadEnvFile('.env');
} catch {
  // .env is optional in CI where the platform injects environment variables.
}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  datasource: {
    url: process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@127.0.0.1:5432/ste_audit',
    shadowDatabaseUrl: process.env.SHADOW_DATABASE_URL
  },
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts'
  }
});
