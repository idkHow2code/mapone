import { DataTypes } from 'sequelize';
import type { Migration } from '../migrator';

const TABLE_OPTIONS = { charset: 'utf8mb4', collate: 'utf8mb4_0900_ai_ci' };

export const up: Migration = async ({ context: queryInterface }) => {
  await queryInterface.createTable(
    'employees',
    {
      id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
      uuid: { type: DataTypes.UUID, allowNull: false },
      name: { type: DataTypes.STRING(100), allowNull: false },
      created_at: { type: DataTypes.DATE, allowNull: false },
      updated_at: { type: DataTypes.DATE, allowNull: false },
    },
    TABLE_OPTIONS,
  );
  await queryInterface.addIndex('employees', ['uuid'], { unique: true, name: 'employees_uuid_unique' });

  await queryInterface.createTable(
    'events',
    {
      id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
      uuid: { type: DataTypes.UUID, allowNull: false },
      // utf8mb4_0900_ai_ci makes the unique index case-insensitive
      name: { type: DataTypes.STRING(255), allowNull: false },
      date_time: { type: DataTypes.DATE, allowNull: false },
      postal_code: { type: DataTypes.CHAR(6), allowNull: false },
      address: { type: DataTypes.STRING(500), allowNull: false },
      deadline: { type: DataTypes.DATE, allowNull: false },
      capacity: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
      handler_id: {
        type: DataTypes.INTEGER.UNSIGNED,
        allowNull: false,
        references: { model: 'employees', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT',
      },
      created_at: { type: DataTypes.DATE, allowNull: false },
      updated_at: { type: DataTypes.DATE, allowNull: false },
    },
    TABLE_OPTIONS,
  );
  await queryInterface.addIndex('events', ['uuid'], { unique: true, name: 'events_uuid_unique' });
  await queryInterface.addIndex('events', ['name'], { unique: true, name: 'events_name_unique' });
  await queryInterface.addIndex('events', ['handler_id'], { name: 'events_handler_id' });
  await queryInterface.addIndex('events', ['deadline'], { name: 'events_deadline' });

  await queryInterface.createTable(
    'registrations',
    {
      id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
      event_id: {
        type: DataTypes.INTEGER.UNSIGNED,
        allowNull: false,
        references: { model: 'events', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT',
      },
      email_address: { type: DataTypes.STRING(254), allowNull: false },
      registration_no: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
      created_at: { type: DataTypes.DATE, allowNull: false },
      updated_at: { type: DataTypes.DATE, allowNull: false },
    },
    TABLE_OPTIONS,
  );
  // Running number is unique per event
  await queryInterface.addIndex('registrations', ['event_id', 'registration_no'], {
    unique: true,
    name: 'registrations_event_id_registration_no_unique',
  });
  // One registration per email per event
  await queryInterface.addIndex('registrations', ['event_id', 'email_address'], {
    unique: true,
    name: 'registrations_event_id_email_address_unique',
  });
  // Registration trend lookups
  await queryInterface.addIndex('registrations', ['event_id', 'created_at'], {
    name: 'registrations_event_id_created_at',
  });
};

export const down: Migration = async ({ context: queryInterface }) => {
  await queryInterface.dropTable('registrations');
  await queryInterface.dropTable('events');
  await queryInterface.dropTable('employees');
};
