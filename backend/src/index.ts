import 'dotenv/config';
import { app } from './app';
import { sequelize } from './config/database';
import { runMigrations, runSeeders } from './db/migrator';
import { logger } from './utils/logger';

const PORT = Number(process.env.PORT ?? 8000);

async function main(): Promise<void> {
  await sequelize.authenticate();
  logger.info('Database connection established');

  await runMigrations();
  await runSeeders();

  app.listen(PORT, () => {
    logger.info(`API listening on port ${PORT}`);
  });
}

main().catch((err: unknown) => {
  logger.error('Failed to start API', err);
  process.exit(1);
});
