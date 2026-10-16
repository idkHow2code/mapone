import { z } from 'zod';

// HTTP status rules from the specification
export const HTTP_STATUS = {
  OK: 200,
  CLIENT_ERROR: 400,
  VALIDATION_ERROR: 421,
  SERVER_ERROR: 500,
} as const;

export interface FieldError {
  field: string;
  message: string;
}

export class AppError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly errors?: FieldError[],
  ) {
    super(message);
    this.name = new.target.name;
  }
}

/** Request is malformed: missing/invalid fields (421). */
export class ValidationError extends AppError {
  constructor(errors: FieldError[], message = 'Validation failed') {
    super(HTTP_STATUS.VALIDATION_ERROR, message, errors);
  }
}

/** Request is well-formed but rejected by a business rule (400). */
export class ClientError extends AppError {
  constructor(message: string, errors?: FieldError[]) {
    super(HTTP_STATUS.CLIENT_ERROR, message, errors);
  }
}

/** Expected failure of a dependency, e.g. OneMap is unreachable (500). */
export class ServiceUnavailableError extends AppError {
  constructor(message: string) {
    super(HTTP_STATUS.SERVER_ERROR, message);
  }
}

/** Parses input against a zod schema, throwing a 421 ValidationError on failure. */
export function parseInput<T extends z.ZodType>(schema: T, input: unknown): z.infer<T> {
  const result = schema.safeParse(input ?? {});
  if (!result.success) {
    throw new ValidationError(
      result.error.issues.map((issue) => ({
        field: issue.path.join('.') || 'body',
        message: issue.message,
      })),
    );
  }
  return result.data;
}

// ISO 8601 date-time, e.g. 2026-12-01T10:00:00Z, 2026-12-01T18:00:00+08:00, 2026-12-01T18:00.
// Without an offset, the value is interpreted in the server timezone (TZ).
const ISO_DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})?$/;

export const isoDateTime = (field: string) =>
  z
    .string({ error: `${field} is required` })
    .trim()
    .regex(ISO_DATE_TIME, `${field} must be an ISO 8601 date-time, e.g. 2026-12-01T18:00:00+08:00`)
    .transform((value) => new Date(value))
    .refine((date) => !Number.isNaN(date.getTime()), `${field} is not a valid date`);
