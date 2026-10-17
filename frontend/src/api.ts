import axios from 'axios';

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000',
  timeout: 15_000,
});

export const PAGE_SIZE = 10; // matches the API's page size

// ---- Types (mirror the API responses) ----

export interface Handler {
  uuid: string;
  name: string;
}

export interface AdminEvent {
  uuid: string;
  createdAt: string;
  name: string;
  dateTime: string;
  address: string;
  deadline: string;
  capacity: number;
  registrationCount: number;
  handler: Handler;
}

export interface EventList {
  total: number;
  events: AdminEvent[];
}

export interface PublicEvent {
  uuid: string;
  name: string;
  dateTime: string;
  address: string;
  deadline: string;
}

export interface TrendRow {
  date: string;
  registrationCount: number;
  newRegistrationCount: number;
}

export interface CreateEventPayload {
  name: string;
  dateTime: string;
  postalCode: string;
  deadline: string;
  capacity: number;
  handlerUuid: string;
}

// ---- Admin ----

export async function getHandlers(): Promise<Handler[]> {
  const { data } = await api.get<Handler[]>('/api/admin/handlers');
  return data;
}

export async function getAdminEvents(params: { page: number; search?: string; open?: boolean }): Promise<EventList> {
  const { data } = await api.get<EventList>('/api/admin/events', {
    params: {
      page: params.page,
      search: params.search || undefined,
      open: params.open ? 'true' : undefined,
    },
  });
  return data;
}

export async function createEvent(payload: CreateEventPayload): Promise<void> {
  await api.post('/api/admin/events', payload);
}

export async function getRegistrationTrend(eventUuid: string): Promise<TrendRow[]> {
  const { data } = await api.post<TrendRow[]>(`/api/admin/events/${encodeURIComponent(eventUuid)}/trend`);
  return data;
}

// ---- Public ----

export async function getOpenEvents(): Promise<PublicEvent[]> {
  const { data } = await api.get<PublicEvent[]>('/api/public/events');
  return data;
}

export async function registerForEvent(payload: { eventUuid: string; emailAddress: string }): Promise<string> {
  const { data } = await api.post<{ registrationNo: string }>('/api/public/register', payload);
  return data.registrationNo;
}

// ---- Errors ----

export interface ApiError {
  status?: number;
  message: string;
  /** Field name -> message, from the API's `errors` array */
  fieldErrors: Record<string, string>;
}

interface ErrorBody {
  message?: string;
  errors?: { field: string; message: string }[];
}

/** Turns any thrown error into a message (and per-field messages) to show the user. */
export function toApiError(err: unknown): ApiError {
  if (axios.isAxiosError<ErrorBody>(err)) {
    if (!err.response) {
      return { message: 'Unable to reach the server. Please check your connection and try again.', fieldErrors: {} };
    }
    const { status, data } = err.response;
    const fieldErrors: Record<string, string> = {};
    for (const { field, message } of data?.errors ?? []) {
      fieldErrors[field] ??= message; // keep the first message per field
    }
    return {
      status,
      message: data?.message ?? 'Something went wrong. Please try again.',
      fieldErrors,
    };
  }
  return { message: 'Something went wrong. Please try again.', fieldErrors: {} };
}
