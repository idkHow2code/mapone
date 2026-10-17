import { useEffect, useState } from 'react';

// The system is Singapore-based: show and enter all times in Singapore time
const TIMEZONE = 'Asia/Singapore';
const SG_OFFSET = '+08:00';

const partsFormat = new Intl.DateTimeFormat('en-US', {
  timeZone: TIMEZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hour12: true,
});

function sgParts(iso: string) {
  const parts = Object.fromEntries(partsFormat.formatToParts(new Date(iso)).map((p) => [p.type, p.value]));
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    time: `${parts.hour}:${parts.minute} ${parts.dayPeriod}`,
  };
}

/** "2026-05-15" */
export const formatShortDate = (iso: string) => sgParts(iso).date;

/** "2026-05-15 09:00 AM" */
export const formatShortDateTime = (iso: string) => {
  const { date, time } = sgParts(iso);
  return `${date} ${time}`;
};

const longDateTimeFormat = new Intl.DateTimeFormat('en-US', {
  timeZone: TIMEZONE,
  dateStyle: 'long',
  timeStyle: 'short',
});
const longDateFormat = new Intl.DateTimeFormat('en-US', { timeZone: TIMEZONE, dateStyle: 'long' });

/** "July 15, 2026 at 6:00 PM" */
export const formatLongDateTime = (iso: string) => longDateTimeFormat.format(new Date(iso));

/** Deadlines set from the date picker close at 11:59 PM, so show those as a date only */
const isEndOfDay = (iso: string) => sgParts(iso).time === '11:59 PM';

/** "2026-05-10", or "2026-05-10 06:00 PM" when the deadline is not end of day */
export const formatShortDeadline = (iso: string) => (isEndOfDay(iso) ? formatShortDate(iso) : formatShortDateTime(iso));

/** "July 10, 2026", or "July 10, 2026 at 6:00 PM" when the deadline is not end of day */
export const formatLongDeadline = (iso: string) =>
  isEndOfDay(iso) ? longDateFormat.format(new Date(iso)) : formatLongDateTime(iso);

const trendDateFormat = new Intl.DateTimeFormat('en-SG', {
  timeZone: 'UTC', // input is already a calendar date
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});

/** "2026-12-01" -> "Tue, 1 Dec 2026" */
export const formatTrendDate = (ymd: string) => trendDateFormat.format(new Date(`${ymd}T00:00:00Z`));

/** <input type="datetime-local"> value, read as Singapore time -> ISO 8601 with offset */
export const singaporeLocalToIso = (value: string) =>
  `${value.length === 16 ? `${value}:00` : value}${SG_OFFSET}`;

/**
 * Deadline date picked in the form -> ISO 8601.
 * Registration closes at the end of that day, or when the event starts if it is the same day.
 */
export function deadlineDateToIso(deadlineDate: string, eventDateTime: string): string {
  if (eventDateTime && eventDateTime.slice(0, 10) === deadlineDate) {
    return singaporeLocalToIso(eventDateTime);
  }
  return `${deadlineDate}T23:59:59${SG_OFFSET}`;
}

/** Same rule as the API: deadline not reached and capacity not reached */
export const isEventOpen = (event: { deadline: string; capacity: number; registrationCount: number }) =>
  new Date(event.deadline).getTime() > Date.now() && event.registrationCount < event.capacity;

/** Returns `value` once it has stopped changing for `delayMs`. */
export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}
