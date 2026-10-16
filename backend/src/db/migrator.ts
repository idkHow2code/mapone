import 'dotenv/config';
import { QueryInterface } from 'sequelize';
import { SequelizeStorage, Umzug } from 'umzug';
import { sequelize } from '../config/database';
import { Employee } from '../models';
import { logger } from '../utils/logger';

// Employees are not manageable through the system, so they are seeded.
// UUIDs are fixed so they stay stable across environments.
export const EMPLOYEES = [
  { uuid: '3f6c1a52-8d1e-4b7a-9c2f-1e5d8a4b7c01', name: 'Tan Wei Ming' },
  { uuid: '7a2e9d14-5b3c-4f8e-a1d6-2c9b4e7f3a02', name: 'Nur Aisyah binte Rahman' },
  { uuid: 'c91b4e67-2f8a-4d3c-b5e1-6a7d9c2e4b03', name: 'Rajesh s/o Kumaran' },
  { uuid: '5d8f3a29-6e1b-4c7d-8f2a-9b3e1d6c5a04', name: 'Lim Hui Min' },
  { uuid: 'e4a7c2b8-9d5f-4e1a-b3c6-7f2d8e9a1b05', name: 'Daniel Pereira' },
];

export const migrator = new Umzug<QueryInterface>({
  // .ts when run with tsx/ts-jest, .js once compiled into dist/
  migrations: { glob: ['migrations/*.{js,ts}', { cwd: __dirname, ignore: ['**/*.d.ts'] }] },
  context: sequelize.getQueryInterface(),
  storage: new SequelizeStorage({ sequelize, tableName: 'sequelize_meta' }),
  logger: {
    info: (msg) => logger.info(JSON.stringify(msg)),
    warn: (msg) => logger.warn(JSON.stringify(msg)),
    error: (msg) => logger.error(JSON.stringify(msg)),
    debug: (msg) => logger.debug(JSON.stringify(msg)),
  },
});

export type Migration = typeof migrator._types.migration;

export async function runMigrations(): Promise<void> {
  const executed = await migrator.up();
  logger.info(`Migrations complete (${executed.length} applied)`);
}

/** Idempotent: INSERT IGNORE on the unique uuid index, so re-running is safe. */
export async function runSeeders(): Promise<void> {
  await Employee.bulkCreate(EMPLOYEES, { ignoreDuplicates: true });
  logger.info('Seeding complete');
}

// CLI: node dist/db/migrator.js <migrate|migrate:undo|seed>
if (require.main === module) {
  const commands: Record<string, () => Promise<unknown>> = {
    migrate: runMigrations,
    'migrate:undo': () => migrator.down(),
    seed: runSeeders,
  };
  const name = process.argv[2];
  const command = commands[name];

  (command
    ? command()
    : Promise.reject(new Error(`Unknown command "${name}". Use one of: ${Object.keys(commands).join(', ')}`))
  )
    .catch((err: unknown) => {
      logger.error('Database command failed', err);
      process.exitCode = 1;
    })
    .finally(() => sequelize.close());
}
