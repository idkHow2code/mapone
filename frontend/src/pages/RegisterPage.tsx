import { FormEvent, useCallback, useEffect, useState } from 'react';
import { Alert, Button, Card, Col, Form, Row, Spinner } from 'react-bootstrap';
import { useNavigate } from 'react-router';
import { ApiError, getOpenEvents, PublicEvent, registerForEvent, toApiError } from '../api';
import { formatLongDateTime, formatLongDeadline } from '../utils';

export default function RegisterPage() {
  const navigate = useNavigate();

  const [events, setEvents] = useState<PublicEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [eventUuid, setEventUuid] = useState('');
  const [emailAddress, setEmailAddress] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  const loadEvents = useCallback(async () => {
    setLoadError(null);
    try {
      const openEvents = await getOpenEvents();
      setEvents(openEvents);
      // Drop the selection if that event is no longer open
      setEventUuid((current) => (openEvents.some((e) => e.uuid === current) ? current : ''));
    } catch (err) {
      setLoadError(toApiError(err).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadEvents();
  }, [loadEvents]);

  const selectedEvent = events.find((e) => e.uuid === eventUuid);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!selectedEvent) {
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const registrationNo = await registerForEvent({ eventUuid, emailAddress });
      navigate('/success', { state: { registrationNo, eventName: selectedEvent.name } });
    } catch (err) {
      const apiError = toApiError(err);
      setError(apiError);
      if (apiError.status === 400) {
        void loadEvents(); // e.g. the event just became full or closed
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Row className="justify-content-center">
      <Col md={9} lg={7} xl={6}>
        <Card className="shadow-sm">
          <Card.Body className="p-4">
            {loading && (
              <div className="text-center py-4">
                <Spinner animation="border" role="status" />
              </div>
            )}

            {!loading && loadError && (
              <Alert variant="danger" className="mb-0">
                {loadError}{' '}
                <Button variant="link" className="p-0 align-baseline" onClick={() => void loadEvents()}>
                  Try again
                </Button>
              </Alert>
            )}

            {!loading && !loadError && events.length === 0 && (
              <Alert variant="info" className="mb-0">
                There are no events open for registration right now. Please check back later.
              </Alert>
            )}

            {!loading && !loadError && events.length > 0 && (
              <Form onSubmit={handleSubmit} noValidate>
                {error && (
                  <Alert variant="danger" onClose={() => setError(null)} dismissible>
                    {error.message}
                  </Alert>
                )}

                <Form.Group controlId="event">
                  <Form.Label className="fw-semibold">Select an Event</Form.Label>
                  <Form.Select
                    value={eventUuid}
                    onChange={(e) => {
                      setEventUuid(e.target.value);
                      setError(null);
                    }}
                    isInvalid={Boolean(error?.fieldErrors.eventUuid)}
                    required
                  >
                    <option value="">-- Choose an event --</option>
                    {events.map((event) => (
                      <option key={event.uuid} value={event.uuid}>
                        {event.name}
                      </option>
                    ))}
                  </Form.Select>
                  <Form.Control.Feedback type="invalid">{error?.fieldErrors.eventUuid}</Form.Control.Feedback>
                </Form.Group>

                {selectedEvent && (
                  <>
                    <hr className="my-4" />
                    <h2 className="h4 fw-bold mb-3">Event Details</h2>
                    <dl className="mb-0" data-testid="event-details">
                      <dt className="small fw-semibold text-body-secondary">Name</dt>
                      <dd className="mb-3">{selectedEvent.name}</dd>
                      <dt className="small fw-semibold text-body-secondary">Date &amp; Time</dt>
                      <dd className="mb-3">{formatLongDateTime(selectedEvent.dateTime)}</dd>
                      <dt className="small fw-semibold text-body-secondary">Address</dt>
                      <dd className="mb-3">{selectedEvent.address}</dd>
                      <dt className="small fw-semibold text-body-secondary">Registration Deadline</dt>
                      <dd className="mb-0">{formatLongDeadline(selectedEvent.deadline)}</dd>
                    </dl>

                    <hr className="my-4" />
                    <Form.Group className="mb-3" controlId="emailAddress">
                      <Form.Label className="small fw-semibold">Email Address</Form.Label>
                      <Form.Control
                        type="email"
                        value={emailAddress}
                        onChange={(e) => setEmailAddress(e.target.value)}
                        placeholder="Enter your email address"
                        maxLength={254}
                        autoComplete="email"
                        isInvalid={Boolean(error?.fieldErrors.emailAddress)}
                        required
                      />
                      <Form.Control.Feedback type="invalid">{error?.fieldErrors.emailAddress}</Form.Control.Feedback>
                    </Form.Group>

                    <Button type="submit" className="w-100" disabled={!emailAddress.trim() || submitting}>
                      {submitting && <Spinner animation="border" size="sm" className="me-2" />}
                      Register
                    </Button>
                  </>
                )}
              </Form>
            )}
          </Card.Body>
        </Card>
      </Col>
    </Row>
  );
}
