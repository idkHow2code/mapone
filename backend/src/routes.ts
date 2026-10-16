import { Router } from 'express';
import { z } from 'zod';
import { HTTP_STATUS, isoDateTime, parseInput } from './errors';
import { Employee, MAX_CAPACITY } from './models';
import {
  createEvent,
  getRegistrationTrend,
  listEvents,
  listOpenEvents,
  registerForEvent,
} from './services/event.service';

// ---- Request schemas ----

const createEventSchema = z
  .object({
    name: z
      .string({ error: 'name is required' })
      .trim()
      .min(1, 'name is required')
      .max(255, 'name must be at most 255 characters'),
    dateTime: isoDateTime('dateTime'),
    postalCode: z
      .string({ error: 'postalCode is required' })
      .trim()
      .regex(/^\d{6}$/, 'postalCode must be a 6-digit Singapore postal code'),
    deadline: isoDateTime('deadline'),
    capacity: z
      .number({ error: 'capacity must be a number' })
      .int('capacity must be a whole number')
      .min(1, 'capacity must be at least 1')
      .max(MAX_CAPACITY, `capacity must be at most ${MAX_CAPACITY}`),
    handlerUuid: z.uuid({ error: 'handlerUuid must be a valid UUID' }),
  })
  .superRefine(({ dateTime, deadline }, ctx) => {
    // Zod still runs this when a field failed its own checks, leaving the raw (untransformed) value
    if (!(dateTime instanceof Date) || !(deadline instanceof Date)) {
      return;
    }
    const now = Date.now();
    if (dateTime.getTime() <= now) {
      ctx.addIssue({ code: 'custom', path: ['dateTime'], message: 'dateTime must be in the future' });
    }
    if (deadline.getTime() <= now) {
      ctx.addIssue({ code: 'custom', path: ['deadline'], message: 'deadline must be in the future' });
    }
    if (deadline.getTime() > dateTime.getTime()) {
      ctx.addIssue({ code: 'custom', path: ['deadline'], message: 'deadline must be on or before dateTime' });
    }
  });

const listEventsQuerySchema = z.object({
  page: z.coerce
    .number({ error: 'page must be a number' })
    .int('page must be a whole number')
    .min(1, 'page must be at least 1'),
  search: z
    .string({ error: 'search must be a string' })
    .trim()
    .max(255, 'search must be at most 255 characters')
    .optional()
    .transform((value) => value || undefined),
  open: z
    .enum(['true', 'false'], { error: 'open must be true or false' })
    .optional()
    .transform((value) => value === 'true'),
});

const eventUuidParamsSchema = z.object({
  uuid: z.uuid({ error: 'uuid must be a valid UUID' }),
});

const registerSchema = z.object({
  eventUuid: z.uuid({ error: 'eventUuid must be a valid UUID' }),
  emailAddress: z
    .string({ error: 'emailAddress is required' })
    .trim()
    .toLowerCase()
    .pipe(
      z
        .email({ error: 'emailAddress must be a valid email address' })
        .max(254, 'emailAddress must be at most 254 characters'),
    ),
});

// ---- Admin (employees) ----

export const adminRouter = Router();

adminRouter.get('/handlers', async (_req, res) => {
  const employees = await Employee.findAll({ attributes: ['uuid', 'name'], order: [['name', 'ASC']] });
  res.status(HTTP_STATUS.OK).json(employees.map(({ uuid, name }) => ({ uuid, name })));
});

adminRouter.get('/events', async (req, res) => {
  const query = parseInput(listEventsQuerySchema, req.query);
  res.status(HTTP_STATUS.OK).json(await listEvents(query));
});

adminRouter.post('/events', async (req, res) => {
  const input = parseInput(createEventSchema, req.body);
  await createEvent(input);
  res.status(HTTP_STATUS.OK).end();
});

adminRouter.post('/events/:uuid/trend', async (req, res) => {
  const { uuid } = parseInput(eventUuidParamsSchema, req.params);
  res.status(HTTP_STATUS.OK).json(await getRegistrationTrend(uuid));
});

// ---- Public ----

export const publicRouter = Router();

publicRouter.get('/events', async (_req, res) => {
  res.status(HTTP_STATUS.OK).json(await listOpenEvents());
});

publicRouter.post('/register', async (req, res) => {
  const input = parseInput(registerSchema, req.body);
  const registrationNo = await registerForEvent(input);
  res.status(HTTP_STATUS.OK).json({ registrationNo });
});
