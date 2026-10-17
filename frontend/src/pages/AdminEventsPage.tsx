import { useCallback, useEffect, useState } from 'react';
import { Alert, Button, Card, Col, Form, Modal, Row, Spinner, Table } from 'react-bootstrap';
import { useSearchParams } from 'react-router';
import { AdminEvent, EventList, getAdminEvents, getRegistrationTrend, PAGE_SIZE, toApiError, TrendRow } from '../api';
import {
  formatShortDate,
  formatShortDateTime,
  formatShortDeadline,
  formatTrendDate,
  isEventOpen,
  useDebouncedValue,
} from '../utils';
import AddEventModal from './AddEventModal';

export default function AdminEventsPage() {
  // Page, search and filter live in the URL, so they survive a refresh
  const [searchParams, setSearchParams] = useSearchParams();
  const page = Math.max(1, Number.parseInt(searchParams.get('page') ?? '1', 10) || 1);
  const search = searchParams.get('search') ?? '';
  const openOnly = searchParams.get('open') === 'true';

  const [searchInput, setSearchInput] = useState(search);
  const debouncedSearch = useDebouncedValue(searchInput.trim(), 300);

  const [data, setData] = useState<EventList | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const [showAddEvent, setShowAddEvent] = useState(false);
  const [createdName, setCreatedName] = useState<string | null>(null);
  const [trendEvent, setTrendEvent] = useState<AdminEvent | null>(null);

  const updateParams = useCallback(
    (changes: { page?: number; search?: string; open?: boolean }) => {
      setSearchParams(
        (current) => {
          const next = new URLSearchParams(current);
          if (changes.page !== undefined) next.set('page', String(changes.page));
          if (changes.search !== undefined) {
            if (changes.search) next.set('search', changes.search);
            else next.delete('search');
          }
          if (changes.open !== undefined) {
            if (changes.open) next.set('open', 'true');
            else next.delete('open');
          }
          return next;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  // A new search starts again from page 1
  useEffect(() => {
    if (debouncedSearch !== search) {
      updateParams({ search: debouncedSearch, page: 1 });
    }
  }, [debouncedSearch, search, updateParams]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const result = await getAdminEvents({ page, search, open: openOnly });
        if (!cancelled) setData(result);
      } catch (err) {
        if (!cancelled) setError(toApiError(err).message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [page, search, openOnly, reloadKey]);

  function handleCreated(name: string) {
    setShowAddEvent(false);
    setCreatedName(name);
    setReloadKey((key) => key + 1);
  }

  const totalPages = Math.max(1, Math.ceil((data?.total ?? 0) / PAGE_SIZE));

  return (
    <>
      <h1 className="h3 fw-bold mb-3">Events</h1>

      {createdName && (
        <Alert variant="success" onClose={() => setCreatedName(null)} dismissible>
          Event <strong>{createdName}</strong> was created.
        </Alert>
      )}

      <Row className="g-2 align-items-center mb-3">
        <Col>
          <Form.Control
            type="search"
            placeholder="Search events by name, address, or handler..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            maxLength={255}
            aria-label="Search events"
          />
        </Col>
        <Col xs="auto">
          <Form.Check
            id="open-only"
            label="Open Events Only"
            className="small mb-0"
            checked={openOnly}
            onChange={(e) => updateParams({ open: e.target.checked, page: 1 })}
          />
        </Col>
        <Col xs="auto">
          <Button onClick={() => setShowAddEvent(true)}>Add Event</Button>
        </Col>
      </Row>

      {error && <Alert variant="danger">{error}</Alert>}

      <Card className="shadow-sm">
        <div className="position-relative">
          {loading && (
            <div className="position-absolute top-50 start-50 translate-middle" style={{ zIndex: 1 }}>
              <Spinner animation="border" role="status" />
            </div>
          )}

          <Table responsive hover className={`align-middle mb-0 ${loading ? 'opacity-50' : ''}`}>
            <thead className="table-light">
              <tr className="text-uppercase text-body-secondary" style={{ fontSize: '0.75rem' }}>
                <th className="fw-semibold">Name</th>
                <th className="fw-semibold">Created On</th>
                <th className="fw-semibold">Event Date Time</th>
                <th className="fw-semibold">Address</th>
                <th className="fw-semibold">Registration Deadline</th>
                <th className="fw-semibold">Handler</th>
                <th className="fw-semibold">Capacity</th>
                <th className="fw-semibold">No. of Registration</th>
                <th className="fw-semibold">Status</th>
                <th className="fw-semibold">Actions</th>
              </tr>
            </thead>
            <tbody className="small">
              {data?.events.map((event) => (
                <tr key={event.uuid}>
                  <td className="fw-semibold">{event.name}</td>
                  <td className="text-nowrap">{formatShortDate(event.createdAt)}</td>
                  <td>{formatShortDateTime(event.dateTime)}</td>
                  <td>{event.address}</td>
                  <td>{formatShortDeadline(event.deadline)}</td>
                  <td>{event.handler.name}</td>
                  <td>{event.capacity}</td>
                  <td>{event.registrationCount}</td>
                  <td>
                    {isEventOpen(event) ? (
                      <span className="badge rounded-pill bg-success-subtle text-success-emphasis">Open</span>
                    ) : (
                      <span className="badge rounded-pill bg-secondary-subtle text-secondary-emphasis">Closed</span>
                    )}
                  </td>
                  <td>
                    <Button size="sm" className="text-nowrap" onClick={() => setTrendEvent(event)}>
                      View Trend
                    </Button>
                  </td>
                </tr>
              ))}
              {data && data.events.length === 0 && (
                <tr>
                  <td colSpan={10} className="text-center text-body-secondary py-4">
                    {search || openOnly ? 'No events match your search.' : 'No events yet. Click "Add Event" to create one.'}
                  </td>
                </tr>
              )}
            </tbody>
          </Table>
        </div>

        {data && data.total > 0 && (
          <Card.Footer className="bg-body d-flex justify-content-end py-2">
            <PageNav page={page} totalPages={totalPages} onChange={(p) => updateParams({ page: p })} />
          </Card.Footer>
        )}
      </Card>

      <AddEventModal show={showAddEvent} onHide={() => setShowAddEvent(false)} onCreated={handleCreated} />
      <TrendModal event={trendEvent} onHide={() => setTrendEvent(null)} />
    </>
  );
}

function PageNav({ page, totalPages, onChange }: { page: number; totalPages: number; onChange: (page: number) => void }) {
  // Show up to 5 page numbers around the current page
  const first = Math.max(1, Math.min(page - 2, totalPages - 4));
  const pages = Array.from({ length: Math.min(5, totalPages) }, (_, i) => first + i);

  // Separate square buttons, like the sample UI (Bootstrap's Pagination joins them into one bar)
  const buttonStyle = { width: '1.75rem', height: '1.75rem' };
  const buttonClass = 'd-inline-flex align-items-center justify-content-center p-0 rounded-2 small';

  return (
    <nav aria-label="Event list pages" className="d-flex gap-2">
      <Button
        variant="outline-secondary"
        className={`${buttonClass} border-secondary-subtle`}
        style={buttonStyle}
        disabled={page <= 1}
        onClick={() => onChange(page - 1)}
        aria-label="Previous page"
      >
        &lt;
      </Button>
      {pages.map((p) => (
        <Button
          key={p}
          variant={p === page ? 'primary' : 'outline-secondary'}
          className={`${buttonClass} fw-semibold ${p === page ? '' : 'border-secondary-subtle'}`}
          style={buttonStyle}
          onClick={() => onChange(p)}
          aria-current={p === page ? 'page' : undefined}
        >
          {p}
        </Button>
      ))}
      <Button
        variant="outline-secondary"
        className={`${buttonClass} border-secondary-subtle`}
        style={buttonStyle}
        disabled={page >= totalPages}
        onClick={() => onChange(page + 1)}
        aria-label="Next page"
      >
        &gt;
      </Button>
    </nav>
  );
}

function TrendModal({ event, onHide }: { event: AdminEvent | null; onHide: () => void }) {
  const [rows, setRows] = useState<TrendRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!event) {
      return;
    }
    let cancelled = false;
    async function load(eventUuid: string) {
      setRows(null);
      setError(null);
      try {
        const result = await getRegistrationTrend(eventUuid);
        if (!cancelled) setRows(result);
      } catch (err) {
        if (!cancelled) setError(toApiError(err).message);
      }
    }
    void load(event.uuid);
    return () => {
      cancelled = true;
    };
  }, [event]);

  return (
    <Modal show={Boolean(event)} onHide={onHide} size="lg" scrollable centered>
      <Modal.Header closeButton>
        <Modal.Title as="h2" className="h5 fw-bold">
          Registration Trend: {event?.name}
        </Modal.Title>
      </Modal.Header>
      <Modal.Body>
        {error && <Alert variant="danger">{error}</Alert>}
        {!rows && !error && (
          <div className="text-center py-4">
            <Spinner animation="border" role="status" />
          </div>
        )}
        {rows && (
          <Table size="sm" striped className="mb-0">
            <thead>
              <tr>
                <th>Date</th>
                <th className="text-end">Total Registrations</th>
                <th className="text-end">New Registrations</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.date}>
                  <td>{formatTrendDate(row.date)}</td>
                  <td className="text-end">{row.registrationCount}</td>
                  <td className={`text-end ${row.newRegistrationCount > 0 ? 'fw-semibold text-success' : ''}`}>
                    {row.newRegistrationCount > 0 ? `+${row.newRegistrationCount}` : 0}
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Modal.Body>
    </Modal>
  );
}
