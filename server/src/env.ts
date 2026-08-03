import { config } from 'dotenv';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { z } from 'zod';

// Load the repo-root .env regardless of cwd. This module lives at
// server/src/env.ts (dev) or server/dist/env.js (prod); the root is two levels
// up in both cases. Without this, npm workspace scripts run with cwd=server/
// and dotenv/config would look for server/.env and miss the real file.
const moduleDir = dirname(fileURLToPath(import.meta.url));
config({ path: join(moduleDir, '../../.env') });

const schema = z.object({
  ANTHROPIC_API_KEY: z.string().min(1, 'ANTHROPIC_API_KEY is required'),
  PORT: z.coerce.number().int().positive().default(8787),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
});

export const env = schema.parse(process.env);
export type Env = typeof env;
