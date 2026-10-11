import { buildApp } from './app.js';
import { loadConfig } from './config.js';
import { runMigrations } from './db/migrate.js';
import { createPool } from './db/pool.js';
import { seedUsers } from './db/seed.js';

const config = loadConfig();
if (config.NODE_ENV === 'production' && config.JWT_SECRET.startsWith('dev-only')) {
  throw new Error('Refusing to start in production with a development JWT_SECRET');
}

const pool = createPool(config.DATABASE_URL, { ssl: config.DATABASE_SSL });
const app = buildApp(pool, config, { logger: true });

const shutdown = async () => {
  await app.close();
  await pool.end();
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

async function main() {
  if (config.AUTO_MIGRATE) {
    const ran = await runMigrations(pool);
    app.log.info(ran.length ? `Applied migrations: ${ran.join(', ')}` : 'Database is up to date');
  }
  if (config.SEED_DEMO) {
    await seedUsers(pool, config.DEMO_PASSWORD);
    app.log.info('Seeded demo users');
  }
  await app.listen({ port: config.PORT, host: '0.0.0.0' });
}

main().catch((err) => {
  app.log.error(err);
  process.exit(1);
});
