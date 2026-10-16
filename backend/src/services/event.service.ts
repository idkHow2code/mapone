import { Op, Transaction, UniqueConstraintError, WhereOptions } from 'sequelize';
import { sequelize } from '../config/database';
import { ClientError } from '../errors';
import { Employee, Event, Registration } from '../models';
import { oneMapClient } from './onemap.service';

export const PAGE_SIZE = 10;

// Calendar dates (e.g. for the registration trend) are in the server timezone
const TIMEZONE = process.env.TZ ?? 'Asia/Singapore';

/** Correlated subquery: number of registrations for the `Event` row in the outer query. */
export const REGISTRATION_COUNT_SQL =
  '(SELECT COUNT(*) FROM `registrations` AS `r` WHERE `r`.`event_id` = `Event`.`id`)';

/**
 * An event is open for registration when its deadline has not been reached
 * and its capacity has not been reached.
 */
export function openEventWhere(now: Date = new Date()): WhereOptions<Event> {
  return {
    [Op.and]: [
      { deadline: { [Op.gt]: now } },
      sequelize.where(sequelize.literal(REGISTRATION_COUNT_SQL), Op.lt, sequelize.col('Event.capacity')),
    ],
  };
}

export interface CreateEventInput {
  name: string;
  dateTime: Date;
  postalCode: string;
  deadline: Date;
  capacity: number;
  handlerUuid: string;
}

const duplicateNameError = () =>
  new ClientError('An event with this name already exists', [
    { field: 'name', message: 'An event with this name already exists' },
  ]);

const handlerBusyError = (handlerName: string) =>
  new ClientError(`${handlerName} is already handling an open event`, [
    { field: 'handlerUuid', message: `${handlerName} is already handling an open event` },
  ]);

async function hasOpenEvent(handlerId: number, transaction?: Transaction): Promise<boolean> {
  const count = await Event.count({ where: { handlerId, ...openEventWhere() }, transaction });
  return count > 0;
}

export async function createEvent(input: CreateEventInput): Promise<void> {
  // Cheap checks first, so the OneMap call is only made for otherwise-valid requests
  const handler = await Employee.findOne({ where: { uuid: input.handlerUuid } });
  if (!handler) {
    throw new ClientError('Handler not found', [{ field: 'handlerUuid', message: 'Handler not found' }]);
  }

  // Case-insensitive thanks to the column collation
  if (await Event.findOne({ where: { name: input.name }, attributes: ['id'] })) {
    throw duplicateNameError();
  }

  if (await hasOpenEvent(handler.id)) {
    throw handlerBusyError(handler.name);
  }

  const address = await oneMapClient.getAddressByPostalCode(input.postalCode);
  if (!address) {
    throw new ClientError('Postal code not found', [
      { field: 'postalCode', message: 'Postal code does not match any address in Singapore' },
    ]);
  }

  try {
    await sequelize.transaction(async (transaction) => {
      // Lock the handler row so concurrent requests for the same handler run one at a time
      await Employee.findByPk(handler.id, { transaction, lock: transaction.LOCK.UPDATE });
      if (await hasOpenEvent(handler.id, transaction)) {
        throw handlerBusyError(handler.name);
      }

      await Event.create(
        {
          name: input.name,
          dateTime: input.dateTime,
          postalCode: input.postalCode,
          address,
          deadline: input.deadline,
          capacity: input.capacity,
          handlerId: handler.id,
        },
        { transaction },
      );
    });
  } catch (err) {
    // A concurrent request created an event with the same name
    if (err instanceof UniqueConstraintError) {
      throw duplicateNameError();
    }
    throw err;
  }
}

// ---- Admin: event listing ----

export interface ListEventsInput {
  page: number;
  search?: string;
  open?: boolean;
}

export interface EventListDto {
  total: number;
  events: {
    uuid: string;
    createdAt: string;
    name: string;
    dateTime: string;
    address: string;
    deadline: string;
    capacity: number;
    registrationCount: number;
    handler: { uuid: string; name: string };
  }[];
}

/** Escapes LIKE wildcards so user input is matched literally. */
export const escapeLike = (value: string) => value.replace(/[\\%_]/g, '\\$&');

export async function listEvents({ page, search, open }: ListEventsInput): Promise<EventListDto> {
  const conditions: WhereOptions<Event>[] = [];
  if (search) {
    const pattern = `%${escapeLike(search)}%`;
    conditions.push({
      [Op.or]: [
        { name: { [Op.like]: pattern } },
        { address: { [Op.like]: pattern } },
        { '$handler.name$': { [Op.like]: pattern } },
      ],
    });
  }
  if (open) {
    conditions.push(openEventWhere());
  }

  const { count, rows } = await Event.findAndCountAll({
    where: { [Op.and]: conditions },
    include: [{ model: Employee, as: 'handler', attributes: ['uuid', 'name'], required: true }],
    attributes: { include: [[sequelize.literal(REGISTRATION_COUNT_SQL), 'registrationCount']] },
    order: [
      ['createdAt', 'DESC'],
      ['id', 'DESC'],
    ],
    limit: PAGE_SIZE,
    offset: (page - 1) * PAGE_SIZE,
  });

  return {
    total: count,
    events: rows.map((event) => ({
      uuid: event.uuid,
      createdAt: event.createdAt.toISOString(),
      name: event.name,
      dateTime: event.dateTime.toISOString(),
      address: event.address,
      deadline: event.deadline.toISOString(),
      capacity: event.capacity,
      registrationCount: Number((event.dataValues as { registrationCount?: number }).registrationCount ?? 0),
      handler: { uuid: event.handler!.uuid, name: event.handler!.name },
    })),
  };
}

// ---- Admin: registration trend ----

export interface TrendRowDto {
  date: string;
  registrationCount: number;
  newRegistrationCount: number;
}

const localDateFormat = new Intl.DateTimeFormat('en-CA', {
  timeZone: TIMEZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** Calendar date (YYYY-MM-DD) of an instant in the server timezone. */
export const toLocalDate = (date: Date) => localDateFormat.format(date);

/** All calendar dates from `from` to `to` inclusive (YYYY-MM-DD). */
export function dateRange(from: string, to: string): string[] {
  const dates: string[] = [];
  for (let day = new Date(`${from}T00:00:00Z`); day <= new Date(`${to}T00:00:00Z`); ) {
    dates.push(day.toISOString().slice(0, 10));
    day.setUTCDate(day.getUTCDate() + 1);
  }
  return dates;
}

export async function getRegistrationTrend(eventUuid: string): Promise<TrendRowDto[]> {
  const event = await Event.findOne({ where: { uuid: eventUuid }, attributes: ['id', 'createdAt', 'deadline'] });
  if (!event) {
    throw new ClientError('Event not found');
  }

  const registrations = await Registration.findAll({
    where: { eventId: event.id },
    attributes: ['createdAt'],
    raw: true,
  });

  const newPerDate = new Map<string, number>();
  for (const { createdAt } of registrations) {
    const date = toLocalDate(new Date(createdAt));
    newPerDate.set(date, (newPerDate.get(date) ?? 0) + 1);
  }

  let total = 0;
  return dateRange(toLocalDate(event.createdAt), toLocalDate(event.deadline)).map((date) => {
    const newRegistrationCount = newPerDate.get(date) ?? 0;
    total += newRegistrationCount;
    return { date, registrationCount: total, newRegistrationCount };
  });
}

// ---- Public: open events and registration ----

export interface PublicEventDto {
  uuid: string;
  name: string;
  dateTime: string;
  address: string;
  deadline: string;
}

export async function listOpenEvents(): Promise<PublicEventDto[]> {
  const events = await Event.findAll({
    where: openEventWhere(),
    attributes: ['uuid', 'name', 'dateTime', 'address', 'deadline'],
    order: [
      ['dateTime', 'ASC'],
      ['id', 'ASC'],
    ],
  });
  return events.map((event) => ({
    uuid: event.uuid,
    name: event.name,
    dateTime: event.dateTime.toISOString(),
    address: event.address,
    deadline: event.deadline.toISOString(),
  }));
}

export interface RegisterInput {
  eventUuid: string;
  emailAddress: string;
}

/** 5-digit running number, e.g. 1 -> "00001" */
export const formatRegistrationNo = (registrationNo: number) => String(registrationNo).padStart(5, '0');

const duplicateEmailError = () =>
  new ClientError('This email address is already registered for this event', [
    { field: 'emailAddress', message: 'This email address is already registered for this event' },
  ]);

export async function registerForEvent({ eventUuid, emailAddress }: RegisterInput): Promise<string> {
  try {
    return await sequelize.transaction(async (transaction) => {
      // Lock the event row: registrations for the same event run one at a time,
      // so the running number and capacity check cannot race
      const event = await Event.findOne({
        where: { uuid: eventUuid },
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      if (!event) {
        throw new ClientError('Event not found', [{ field: 'eventUuid', message: 'Event not found' }]);
      }
      if (event.deadline.getTime() <= Date.now()) {
        throw new ClientError('Registration for this event has closed');
      }

      const existing = await Registration.findOne({
        where: { eventId: event.id, emailAddress },
        attributes: ['id'],
        transaction,
      });
      if (existing) {
        throw duplicateEmailError();
      }

      const registrationCount = await Registration.count({ where: { eventId: event.id }, transaction });
      if (registrationCount >= event.capacity) {
        throw new ClientError('This event is fully booked');
      }

      const registrationNo = registrationCount + 1;
      await Registration.create({ eventId: event.id, emailAddress, registrationNo }, { transaction });
      return formatRegistrationNo(registrationNo);
    });
  } catch (err) {
    // Safety net: the unique index on (event_id, email_address)
    if (err instanceof UniqueConstraintError) {
      throw duplicateEmailError();
    }
    throw err;
  }
}
