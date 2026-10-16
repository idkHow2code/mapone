import {
  CreationOptional,
  DataTypes,
  InferAttributes,
  InferCreationAttributes,
  Model,
  NonAttribute,
} from 'sequelize';
import { sequelize } from './config/database';

export const MAX_CAPACITY = 99999; // registration numbers are 5 digits

export class Employee extends Model<InferAttributes<Employee>, InferCreationAttributes<Employee>> {
  declare id: CreationOptional<number>;
  declare uuid: CreationOptional<string>;
  declare name: string;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

export class Event extends Model<InferAttributes<Event>, InferCreationAttributes<Event>> {
  declare id: CreationOptional<number>;
  declare uuid: CreationOptional<string>;
  declare name: string;
  declare dateTime: Date;
  declare postalCode: string;
  declare address: string;
  declare deadline: Date;
  declare capacity: number;
  declare handlerId: number;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare handler?: NonAttribute<Employee>;
}

export class Registration extends Model<
  InferAttributes<Registration>,
  InferCreationAttributes<Registration>
> {
  declare id: CreationOptional<number>;
  declare eventId: number;
  declare emailAddress: string;
  declare registrationNo: number;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare event?: NonAttribute<Event>;
}

Employee.init(
  {
    id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
    uuid: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, allowNull: false, unique: true },
    name: { type: DataTypes.STRING(100), allowNull: false },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
  },
  { sequelize, tableName: 'employees' },
);

Event.init(
  {
    id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
    uuid: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, allowNull: false, unique: true },
    // Unique, case-insensitive via the utf8mb4_0900_ai_ci collation
    name: { type: DataTypes.STRING(255), allowNull: false, unique: true },
    dateTime: { type: DataTypes.DATE, allowNull: false },
    postalCode: { type: DataTypes.CHAR(6), allowNull: false },
    address: { type: DataTypes.STRING(500), allowNull: false },
    deadline: { type: DataTypes.DATE, allowNull: false },
    capacity: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
      validate: { min: 1, max: MAX_CAPACITY },
    },
    handlerId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
  },
  { sequelize, tableName: 'events' },
);

Registration.init(
  {
    id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
    eventId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    emailAddress: { type: DataTypes.STRING(254), allowNull: false },
    registrationNo: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
  },
  {
    sequelize,
    tableName: 'registrations',
    indexes: [
      { unique: true, fields: ['event_id', 'registration_no'] },
      { unique: true, fields: ['event_id', 'email_address'] },
      { fields: ['event_id', 'created_at'] },
    ],
  },
);

Employee.hasMany(Event, { foreignKey: 'handlerId', as: 'events' });
Event.belongsTo(Employee, { foreignKey: 'handlerId', as: 'handler' });

Event.hasMany(Registration, { foreignKey: 'eventId', as: 'registrations' });
Registration.belongsTo(Event, { foreignKey: 'eventId', as: 'event' });
