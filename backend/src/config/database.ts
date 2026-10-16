import { Sequelize } from 'sequelize';
import { logger } from '../utils/logger';

export const sequelize = new Sequelize({
  dialect: 'mysql',
  host: process.env.DB_HOST ?? 'localhost',
  port: Number(process.env.DB_PORT ?? 3306),
  database: process.env.DB_NAME ?? 'event_registration',
  username: process.env.DB_USER ?? 'app',
  password: process.env.DB_PASSWORD ?? '',
  // Store and read all DATETIME values as UTC
  timezone: '+00:00',
  define: {
    underscored: true,
    charset: 'utf8mb4',
    collate: 'utf8mb4_0900_ai_ci',
  },
  pool: { max: 10, min: 0, idle: 10000 },
  logging: (sql) => logger.debug(sql),
});
