import request from 'supertest';
import { app } from './app';
import { ClientError, ServiceUnavailableError } from './errors';
import { Employee } from './models';
import {
  createEvent,
  getRegistrationTrend,
  listEvents,
  listOpenEvents,
  registerForEvent,
} from './services/event.service';

jest.mock('./models', () => ({ Employee: { findAll: jest.fn() }, MAX_CAPACITY: 99999 }));
jest.mock('./services/event.service', () => ({
  createEvent: jest.fn(),
  getRegistrationTrend: jest.fn(),
  listEvents: jest.fn(),
  listOpenEvents: jest.fn(),
  registerForEvent: jest.fn(),
}));

const mockedListHandlers = Employee.findAll as jest.Mock;
const mockedCreateEvent = createEvent as jest.Mock;
const mockedListEvents = listEvents as jest.Mock;
const mockedTrend = getRegistrationTrend as jest.Mock;
const mockedListOpenEvents = listOpenEvents as jest.Mock;
const mockedRegister = registerForEvent as jest.Mock;

const EVENT_UUID = '9b1d3c4e-2a5f-4e6b-8c7d-0f1e2d3c4b5a';

const DAY = 24 * 60 * 60 * 1000;
const futureIso = (days: number) => new Date(Date.now() + days * DAY).toISOString();

const validBody = () => ({
  name: '  Tech Talk  ',
  dateTime: futureIso(10),
  postalCode: '018956',
  deadline: futureIso(5),
  capacity: 100,
  handlerUuid: '3f6c1a52-8d1e-4b7a-9c2f-1e5d8a4b7c01',
});

beforeEach(() => jest.clearAllMocks());

describe('GET /api/admin/handlers', () => {
  it('returns the list of handlers', async () => {
    const handlers = [{ uuid: '3f6c1a52-8d1e-4b7a-9c2f-1e5d8a4b7c01', name: 'Tan Wei Ming' }];
    mockedListHandlers.mockResolvedValue(handlers);

    const res = await request(app).get('/api/admin/handlers');

    expect(res.status).toBe(200);
    expect(res.body).toEqual(handlers);
  });

  it('returns 500 without leaking details on an unexpected error', async () => {
    mockedListHandlers.mockRejectedValue(new Error('ECONNREFUSED 10.0.0.1:3306'));

    const res = await request(app).get('/api/admin/handlers');

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ message: 'An unexpected error occurred' });
  });
});

describe('POST /api/admin/events', () => {
  it('creates an event and returns 200 with an empty body', async () => {
    mockedCreateEvent.mockResolvedValue(undefined);
    const body = validBody();

    const res = await request(app).post('/api/admin/events').send(body);

    expect(res.status).toBe(200);
    expect(res.text).toBe('');
    expect(mockedCreateEvent).toHaveBeenCalledWith({
      ...body,
      name: 'Tech Talk', // trimmed
      dateTime: new Date(body.dateTime),
      deadline: new Date(body.deadline),
    });
  });

  it('returns 421 listing every missing field', async () => {
    const res = await request(app).post('/api/admin/events').send({});

    expect(res.status).toBe(421);
    expect(res.body.message).toBe('Validation failed');
    expect(res.body.errors.map((e: { field: string }) => e.field).sort()).toEqual(
      ['capacity', 'dateTime', 'deadline', 'handlerUuid', 'name', 'postalCode'].sort(),
    );
    expect(mockedCreateEvent).not.toHaveBeenCalled();
  });

  it.each([
    ['postalCode', { postalCode: '12345' }],
    ['postalCode', { postalCode: 'ABCDEF' }],
    ['capacity', { capacity: 0 }],
    ['capacity', { capacity: 1.5 }],
    ['capacity', { capacity: 100000 }],
    ['capacity', { capacity: '100' }],
    ['handlerUuid', { handlerUuid: 'not-a-uuid' }],
    ['name', { name: '   ' }],
    ['name', { name: 'x'.repeat(256) }],
    ['dateTime', { dateTime: '10/12/2030' }],
    ['dateTime', { dateTime: '2030-13-45T10:00:00Z' }],
  ])('returns 421 for an invalid %s (%j)', async (field, override) => {
    const res = await request(app)
      .post('/api/admin/events')
      .send({ ...validBody(), ...override });

    expect(res.status).toBe(421);
    expect(res.body.errors).toEqual(expect.arrayContaining([expect.objectContaining({ field })]));
  });

  it('returns 421 when dateTime is in the past', async () => {
    const res = await request(app)
      .post('/api/admin/events')
      .send({ ...validBody(), dateTime: futureIso(-1), deadline: futureIso(-2) });

    expect(res.status).toBe(421);
    expect(res.body.errors).toEqual(
      expect.arrayContaining([
        { field: 'dateTime', message: 'dateTime must be in the future' },
        { field: 'deadline', message: 'deadline must be in the future' },
      ]),
    );
  });

  it('returns 421 when the deadline is after the event', async () => {
    const res = await request(app)
      .post('/api/admin/events')
      .send({ ...validBody(), dateTime: futureIso(5), deadline: futureIso(6) });

    expect(res.status).toBe(421);
    expect(res.body.errors).toEqual([{ field: 'deadline', message: 'deadline must be on or before dateTime' }]);
  });

  it('returns 421 for malformed JSON', async () => {
    const res = await request(app)
      .post('/api/admin/events')
      .set('Content-Type', 'application/json')
      .send('{"name": ');

    expect(res.status).toBe(421);
    expect(res.body.message).toBe('Request body is not valid JSON');
  });

  it('returns 400 for an oversized body', async () => {
    const res = await request(app)
      .post('/api/admin/events')
      .send({ ...validBody(), name: 'x'.repeat(20_000) });

    expect(res.status).toBe(400);
  });

  it('returns 400 with the message when a business rule is broken', async () => {
    mockedCreateEvent.mockRejectedValue(
      new ClientError('An event with this name already exists', [
        { field: 'name', message: 'An event with this name already exists' },
      ]),
    );

    const res = await request(app).post('/api/admin/events').send(validBody());

    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      message: 'An event with this name already exists',
      errors: [{ field: 'name', message: 'An event with this name already exists' }],
    });
  });

  it('returns 500 when OneMap is unavailable', async () => {
    mockedCreateEvent.mockRejectedValue(new ServiceUnavailableError('Unable to verify postal code'));

    const res = await request(app).post('/api/admin/events').send(validBody());

    expect(res.status).toBe(500);
    expect(res.body.message).toBe('Unable to verify postal code');
  });
});

describe('unknown routes', () => {
  it('returns 400', async () => {
    const res = await request(app).get('/api/does-not-exist');

    expect(res.status).toBe(400);
  });
});

describe('GET /api/admin/events', () => {
  const result = { total: 0, events: [] };

  it('passes page, search and open to the service', async () => {
    mockedListEvents.mockResolvedValue(result);

    const res = await request(app).get('/api/admin/events').query({ page: '2', search: '  talk ', open: 'true' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual(result);
    expect(mockedListEvents).toHaveBeenCalledWith({ page: 2, search: 'talk', open: true });
  });

  it('treats a blank search and open=false as no filter', async () => {
    mockedListEvents.mockResolvedValue(result);

    await request(app).get('/api/admin/events').query({ page: '1', search: '   ', open: 'false' });

    expect(mockedListEvents).toHaveBeenCalledWith({ page: 1, search: undefined, open: false });
  });

  it.each([
    ['page', {}],
    ['page', { page: '0' }],
    ['page', { page: '1.5' }],
    ['page', { page: 'abc' }],
    ['open', { page: '1', open: 'yes' }],
    ['search', { page: '1', search: 'x'.repeat(256) }],
  ])('returns 421 for an invalid %s (%j)', async (field, query) => {
    const res = await request(app).get('/api/admin/events').query(query);

    expect(res.status).toBe(421);
    expect(res.body.errors).toEqual(expect.arrayContaining([expect.objectContaining({ field })]));
    expect(mockedListEvents).not.toHaveBeenCalled();
  });
});

describe('POST /api/admin/events/:uuid/trend', () => {
  it('returns the trend rows', async () => {
    const rows = [{ date: '2026-10-16', registrationCount: 2, newRegistrationCount: 2 }];
    mockedTrend.mockResolvedValue(rows);

    const res = await request(app).post(`/api/admin/events/${EVENT_UUID}/trend`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual(rows);
    expect(mockedTrend).toHaveBeenCalledWith(EVENT_UUID);
  });

  it('returns 421 for an invalid uuid', async () => {
    const res = await request(app).post('/api/admin/events/not-a-uuid/trend');

    expect(res.status).toBe(421);
    expect(mockedTrend).not.toHaveBeenCalled();
  });

  it('returns 400 for an unknown event', async () => {
    mockedTrend.mockRejectedValue(new ClientError('Event not found'));

    const res = await request(app).post(`/api/admin/events/${EVENT_UUID}/trend`);

    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Event not found');
  });
});

describe('GET /api/public/events', () => {
  it('returns the open events', async () => {
    const events = [
      {
        uuid: EVENT_UUID,
        name: 'Tech Talk',
        dateTime: '2030-01-10T10:00:00.000Z',
        address: '10 BAYFRONT AVENUE SINGAPORE 018956',
        deadline: '2030-01-05T10:00:00.000Z',
      },
    ];
    mockedListOpenEvents.mockResolvedValue(events);

    const res = await request(app).get('/api/public/events');

    expect(res.status).toBe(200);
    expect(res.body).toEqual(events);
  });
});

describe('POST /api/public/register', () => {
  it('registers with a normalised email and returns the registration number', async () => {
    mockedRegister.mockResolvedValue('00001');

    const res = await request(app)
      .post('/api/public/register')
      .send({ eventUuid: EVENT_UUID, emailAddress: '  Jane.Tan@Example.COM ' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ registrationNo: '00001' });
    expect(mockedRegister).toHaveBeenCalledWith({ eventUuid: EVENT_UUID, emailAddress: 'jane.tan@example.com' });
  });

  it.each([
    ['eventUuid', { emailAddress: 'a@b.com' }],
    ['eventUuid', { eventUuid: 'abc', emailAddress: 'a@b.com' }],
    ['emailAddress', { eventUuid: EVENT_UUID }],
    ['emailAddress', { eventUuid: EVENT_UUID, emailAddress: 'not-an-email' }],
    ['emailAddress', { eventUuid: EVENT_UUID, emailAddress: `${'a'.repeat(250)}@b.com` }],
    ['emailAddress', { eventUuid: EVENT_UUID, emailAddress: 123 }],
  ])('returns 421 for an invalid %s (%j)', async (field, body) => {
    const res = await request(app).post('/api/public/register').send(body);

    expect(res.status).toBe(421);
    expect(res.body.errors).toEqual(expect.arrayContaining([expect.objectContaining({ field })]));
    expect(mockedRegister).not.toHaveBeenCalled();
  });

  it('returns 400 when a business rule is broken', async () => {
    mockedRegister.mockRejectedValue(new ClientError('This event is fully booked'));

    const res = await request(app)
      .post('/api/public/register')
      .send({ eventUuid: EVENT_UUID, emailAddress: 'a@b.com' });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ message: 'This event is fully booked' });
  });
});
