import 'dotenv/config';
import { z } from 'zod';

const schema = z.object({
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  PORT: z.coerce.number().int().default(3001),
  CORS_ORIGIN: z.string().default('http://localhost:5173'),
  DEMO_PASSWORD: z.string().min(8).default('demo-pass-123'),
  NODE_ENV: z.string().default('development'),
  // Deployment conveniences: apply migrations / (re)seed demo users on boot.
  AUTO_MIGRATE: z.enum(['true', 'false']).default('false').transform((v) => v === 'true'),
  SEED_DEMO: z.enum(['true', 'false']).default('false').transform((v) => v === 'true'),
  DATABASE_SSL: z.enum(['true', 'false']).default('false').transform((v) => v === 'true'),
});

export type Config = z.infer<typeof schema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = schema.safeParse(env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Invalid environment configuration: ${issues}`);
  }
  return parsed.data;
}
