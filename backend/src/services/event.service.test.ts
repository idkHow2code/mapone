import { Op, UniqueConstraintError } from 'sequelize';
import { ClientError } from '../errors';
import { Employee, Event, Registration } from '../models';
import {
  createEvent,
  CreateEventInput,
  dateRange,
  escapeLike,
  formatRegistrationNo,
  getRegistrationTrend,
  listEvents,
  listOpenEvents,
  PAGE_SIZE,
  registerForEvent,
  toLocalDate,
} from './event.service';
import { oneMapClient } from './onemap.service';

jest.mock('../models', () => ({
  Employee: { findOne: jest.fn(), findByPk: jest.fn() },
  Event: {
    findOne: jest.fn(),
    findAll: jest.fn(),
    findAndCountAll: jest.fn(),
    count: jest.fn(),
    create: jest.fn(),
  },
  Registration: { findOne: jest.fn(), findAll: jest.fn(), count: jest.fn(), create: jest.fn() },
}));
jest.mock('../config/database', () => ({
  sequelize: {
    transaction: jest.fn(async (callback: (t: unknown) => Promise<unknown>) =>
      callback({ LOCK: { UPDATE: 'UPDATE' } }),
    ),
    where: jest.fn(),
    literal: jest.fn(),
    col: jest.fn(),
  },
}));
jest.mock('./onemap.service', () => ({ oneMapClient: { getAddressByPostalCode: jest.fn() } }));

const mocked = {
  employeeFindOne: Employee.findOne as jest.Mock,
  eventFindOne: Event.findOne as jest.Mock,
  eventCount: Event.count as jest.Mock,
  eventCreate: Event.create as jest.Mock,
  getAddress: oneMapClient.getAddressByPostalCode as jest.Mock,
};

const input: CreateEventInput = {
  name: 'Tech Talk',
  dateTime: new Date('2030-01-10T10:00:00Z'),
  postalCode: '018956',
  deadline: new Date('2030-01-05T10:00:00Z'),
  capacity: 100,
  handlerUuid: '3f6c1a52-8d1e-4b7a-9c2f-1e5d8a4b7c01',
};

const handler = { id: 1, uuid: input.handlerUuid, name: 'Tan Wei Ming' };

describe('createEvent', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mocked.employeeFindOne.mockResolvedValue(handler);
    mocked.eventFindOne.mockResolvedValue(null);
    mocked.eventCount.mockResolvedValue(0);
    mocked.getAddress.mockResolvedValue('10 BAYFRONT AVENUE SINGAPORE 018956');
    mocked.eventCreate.mockResolvedValue({});
  });

  it('creates the event with the address from OneMap', async () => {
    await createEvent(input);

    expect(mocked.eventCreate).toHaveBeenCalledWith(
      {
        name: 'Tech Talk',
        dateTime: input.dateTime,
        postalCode: '018956',
        address: '10 BAYFRONT AVENUE SINGAPORE 018956',
        deadline: input.deadline,
        capacity: 100,
        handlerId: 1,
      },
      expect.anything(),
    );
  });

  it('rejects an unknown handler', async () => {
    mocked.employeeFindOne.mockResolvedValue(null);

    await expect(createEvent(input)).rejects.toMatchObject({ status: 400, message: 'Handler not found' });
    expect(mocked.getAddress).not.toHaveBeenCalled();
  });

  it('rejects a duplicate event name', async () => {
    mocked.eventFindOne.mockResolvedValue({ id: 5 });

    await expect(createEvent(input)).rejects.toMatchObject({
      status: 400,
      message: 'An event with this name already exists',
    });
  });

  it('rejects a handler who already has an open event', async () => {
    mocked.eventCount.mockResolvedValue(1);

    await expect(createEvent(input)).rejects.toMatchObject({
      status: 400,
      message: 'Tan Wei Ming is already handling an open event',
    });
    expect(mocked.getAddress).not.toHaveBeenCalled();
  });

  it('rejects when the handler gets an open event concurrently', async () => {
    mocked.eventCount.mockResolvedValueOnce(0).mockResolvedValueOnce(1);

    await expect(createEvent(input)).rejects.toThrow('already handling an open event');
    expect(mocked.eventCreate).not.toHaveBeenCalled();
  });

  it('rejects a postal code that OneMap does not recognise', async () => {
    mocked.getAddress.mockResolvedValue(null);

    await expect(createEvent(input)).rejects.toMatchObject({ status: 400, message: 'Postal code not found' });
    expect(mocked.eventCreate).not.toHaveBeenCalled();
  });

  it('maps a unique constraint race on the name to a duplicate name error', async () => {
    mocked.eventCreate.mockRejectedValue(new UniqueConstraintError({}));

    const promise = createEvent(input);
    await expect(promise).rejects.toBeInstanceOf(ClientError);
    await expect(promise).rejects.toThrow('An event with this name already exists');
  });

  it('rethrows unexpected errors', async () => {
    mocked.eventCreate.mockRejectedValue(new Error('connection lost'));

    await expect(createEvent(input)).rejects.toThrow('connection lost');
  });
});

describe('helpers', () => {
  it('formats registration numbers as 5 digits', () => {
    expect(formatRegistrationNo(1)).toBe('00001');
    expect(formatRegistrationNo(123)).toBe('00123');
    expect(formatRegistrationNo(99999)).toBe('99999');
  });

  it('escapes LIKE wildcards', () => {
    expect(escapeLike('50% off_now\\')).toBe('50\\% off\\_now\\\\');
  });

  it('converts instants to Singapore calendar dates', () => {
    expect(toLocalDate(new Date('2026-10-15T15:59:59Z'))).toBe('2026-10-15');
    expect(toLocalDate(new Date('2026-10-15T16:00:00Z'))).toBe('2026-10-16'); // midnight SGT
  });

  it('lists every date in a range, across month ends', () => {
    expect(dateRange('2026-10-30', '2026-11-02')).toEqual(['2026-10-30', '2026-10-31', '2026-11-01', '2026-11-02']);
    expect(dateRange('2026-10-15', '2026-10-15')).toEqual(['2026-10-15']);
  });
});

describe('listEvents', () => {
  const row = {
    uuid: 'event-uuid',
    createdAt: new Date('2026-10-01T02:00:00Z'),
    name: 'Tech Talk',
    dateTime: new Date('2030-01-10T10:00:00Z'),
    address: 'ADDR',
    deadline: new Date('2030-01-05T10:00:00Z'),
    capacity: 100,
    dataValues: { registrationCount: 7 },
    handler: { uuid: 'handler-uuid', name: 'Tan Wei Ming' },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (Event.findAndCountAll as jest.Mock).mockResolvedValue({ count: 23, rows: [row] });
  });

  it('maps rows to the API shape', async () => {
    await expect(listEvents({ page: 1 })).resolves.toEqual({
      total: 23,
      events: [
        {
          uuid: 'event-uuid',
          createdAt: '2026-10-01T02:00:00.000Z',
          name: 'Tech Talk',
          dateTime: '2030-01-10T10:00:00.000Z',
          address: 'ADDR',
          deadline: '2030-01-05T10:00:00.000Z',
          capacity: 100,
          registrationCount: 7,
          handler: { uuid: 'handler-uuid', name: 'Tan Wei Ming' },
        },
      ],
    });
  });

  it('paginates', async () => {
    await listEvents({ page: 3 });

    expect(Event.findAndCountAll).toHaveBeenCalledWith(
      expect.objectContaining({ limit: PAGE_SIZE, offset: 2 * PAGE_SIZE }),
    );
  });

  it('searches name, address and handler name with escaped wildcards', async () => {
    await listEvents({ page: 1, search: '50%' });

    const { where } = (Event.findAndCountAll as jest.Mock).mock.calls[0][0];
    const [searchCondition] = where[Op.and];
    expect(searchCondition[Op.or]).toEqual([
      { name: { [Op.like]: '%50\\%%' } },
      { address: { [Op.like]: '%50\\%%' } },
      { '$handler.name$': { [Op.like]: '%50\\%%' } },
    ]);
  });

  it('adds the open filter only when open is true', async () => {
    await listEvents({ page: 1, open: false });
    expect((Event.findAndCountAll as jest.Mock).mock.calls[0][0].where[Op.and]).toHaveLength(0);

    await listEvents({ page: 1, open: true });
    expect((Event.findAndCountAll as jest.Mock).mock.calls[1][0].where[Op.and]).toHaveLength(1);
  });
});

describe('getRegistrationTrend', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns one row per date from creation to deadline with running totals', async () => {
    (Event.findOne as jest.Mock).mockResolvedValue({
      id: 1,
      createdAt: new Date('2026-10-10T01:00:00Z'), // 10 Oct SGT
      deadline: new Date('2026-10-13T15:59:00Z'), // 13 Oct 23:59 SGT
    });
    (Registration.findAll as jest.Mock).mockResolvedValue([
      { createdAt: new Date('2026-10-10T03:00:00Z') }, // 10 Oct
      { createdAt: new Date('2026-10-10T15:30:00Z') }, // 10 Oct 23:30 SGT
      { createdAt: new Date('2026-10-10T16:30:00Z') }, // 11 Oct 00:30 SGT
      { createdAt: new Date('2026-10-12T05:00:00Z') }, // 12 Oct
    ]);

    await expect(getRegistrationTrend('event-uuid')).resolves.toEqual([
      { date: '2026-10-10', registrationCount: 2, newRegistrationCount: 2 },
      { date: '2026-10-11', registrationCount: 3, newRegistrationCount: 1 },
      { date: '2026-10-12', registrationCount: 4, newRegistrationCount: 1 },
      { date: '2026-10-13', registrationCount: 4, newRegistrationCount: 0 },
    ]);
  });

  it('rejects an unknown event', async () => {
    (Event.findOne as jest.Mock).mockResolvedValue(null);

    await expect(getRegistrationTrend('missing')).rejects.toMatchObject({ status: 400, message: 'Event not found' });
  });
});

describe('listOpenEvents', () => {
  it('maps open events to the public shape', async () => {
    (Event.findAll as jest.Mock).mockResolvedValue([
      {
        uuid: 'event-uuid',
        name: 'Tech Talk',
        dateTime: new Date('2030-01-10T10:00:00Z'),
        address: 'ADDR',
        deadline: new Date('2030-01-05T10:00:00Z'),
        capacity: 100, // not exposed
      },
    ]);

    await expect(listOpenEvents()).resolves.toEqual([
      {
        uuid: 'event-uuid',
        name: 'Tech Talk',
        dateTime: '2030-01-10T10:00:00.000Z',
        address: 'ADDR',
        deadline: '2030-01-05T10:00:00.000Z',
      },
    ]);
  });
});

describe('registerForEvent', () => {
  const input = { eventUuid: 'event-uuid', emailAddress: 'jane@example.com' };
  const openEvent = { id: 1, capacity: 3, deadline: new Date(Date.now() + 86_400_000) };

  beforeEach(() => {
    jest.clearAllMocks();
    (Event.findOne as jest.Mock).mockResolvedValue(openEvent);
    (Registration.findOne as jest.Mock).mockResolvedValue(null);
    (Registration.count as jest.Mock).mockResolvedValue(2);
    (Registration.create as jest.Mock).mockResolvedValue({});
  });

  it('assigns the next running number', async () => {
    await expect(registerForEvent(input)).resolves.toBe('00003');
    expect(Registration.create).toHaveBeenCalledWith(
      { eventId: 1, emailAddress: 'jane@example.com', registrationNo: 3 },
      expect.anything(),
    );
  });

  it('locks the event row', async () => {
    await registerForEvent(input);

    expect(Event.findOne).toHaveBeenCalledWith(expect.objectContaining({ lock: 'UPDATE' }));
  });

  it('rejects an unknown event', async () => {
    (Event.findOne as jest.Mock).mockResolvedValue(null);

    await expect(registerForEvent(input)).rejects.toMatchObject({ status: 400, message: 'Event not found' });
  });

  it('rejects after the deadline', async () => {
    (Event.findOne as jest.Mock).mockResolvedValue({ ...openEvent, deadline: new Date(Date.now() - 1000) });

    await expect(registerForEvent(input)).rejects.toThrow('Registration for this event has closed');
    expect(Registration.create).not.toHaveBeenCalled();
  });

  it('rejects a duplicate email', async () => {
    (Registration.findOne as jest.Mock).mockResolvedValue({ id: 9 });

    await expect(registerForEvent(input)).rejects.toThrow('already registered for this event');
  });

  it('rejects when the event is full', async () => {
    (Registration.count as jest.Mock).mockResolvedValue(3);

    await expect(registerForEvent(input)).rejects.toThrow('This event is fully booked');
    expect(Registration.create).not.toHaveBeenCalled();
  });

  it('maps a unique constraint violation to a duplicate email error', async () => {
    (Registration.create as jest.Mock).mockRejectedValue(new UniqueConstraintError({}));

    await expect(registerForEvent(input)).rejects.toThrow('already registered for this event');
  });

  it('rethrows unexpected errors', async () => {
    (Registration.create as jest.Mock).mockRejectedValue(new Error('deadlock'));

    await expect(registerForEvent(input)).rejects.toThrow('deadlock');
  });
});
