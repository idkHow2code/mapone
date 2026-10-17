import { ChangeEvent, FormEvent, useEffect, useState } from 'react';
import { Alert, Button, Form, Modal, Spinner } from 'react-bootstrap';
import { ApiError, createEvent, getHandlers, Handler, toApiError } from '../api';
import { deadlineDateToIso, singaporeLocalToIso } from '../utils';

const EMPTY_FORM = {
  name: '',
  dateTime: '',
  postalCode: '',
  deadline: '',
  capacity: '',
  handlerUuid: '',
};

type FormValues = typeof EMPTY_FORM;

interface AddEventModalProps {
  show: boolean;
  onHide: () => void;
  onCreated: (eventName: string) => void;
}

export default function AddEventModal({ show, onHide, onCreated }: AddEventModalProps) {
  const [values, setValues] = useState<FormValues>(EMPTY_FORM);
  const [handlers, setHandlers] = useState<Handler[]>([]);
  const [handlersError, setHandlersError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  // Start with a clean form and fresh handler list each time the popup opens
  useEffect(() => {
    if (!show) {
      return;
    }
    setValues(EMPTY_FORM);
    setError(null);
    async function loadHandlers() {
      setHandlersError(null);
      try {
        setHandlers(await getHandlers());
      } catch (err) {
        setHandlersError(toApiError(err).message);
      }
    }
    void loadHandlers();
  }, [show]);

  function handleChange(e: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) {
    const { name, value } = e.target;
    setValues((current) => ({ ...current, [name]: value }));
    // Clear the error of the field being edited
    if (error?.fieldErrors[name]) {
      setError({ ...error, fieldErrors: { ...error.fieldErrors, [name]: '' } });
    }
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const name = values.name.trim();
      await createEvent({
        name,
        dateTime: values.dateTime ? singaporeLocalToIso(values.dateTime) : '',
        postalCode: values.postalCode.trim(),
        deadline: values.deadline ? deadlineDateToIso(values.deadline, values.dateTime) : '',
        capacity: Number(values.capacity),
        handlerUuid: values.handlerUuid,
      });
      onCreated(name);
    } catch (err) {
      setError(toApiError(err));
    } finally {
      setSubmitting(false);
    }
  }

  const fieldError = (field: keyof FormValues) => error?.fieldErrors[field] || undefined;

  return (
    <Modal show={show} onHide={onHide} backdrop={submitting ? 'static' : true} centered>
      <Form onSubmit={handleSubmit} noValidate>
        <Modal.Header closeButton={!submitting}>
          <Modal.Title as="h2" className="h5 fw-bold">
            Add New Event
          </Modal.Title>
        </Modal.Header>

        <Modal.Body>
          {error && (
            <Alert variant="danger" className="py-2">
              {error.message}
            </Alert>
          )}

          <Form.Group className="mb-3" controlId="name">
            <Form.Label className="fw-semibold small">Name</Form.Label>
            <Form.Control
              name="name"
              value={values.name}
              onChange={handleChange}
              maxLength={255}
              isInvalid={Boolean(fieldError('name'))}
              required
            />
            <Form.Control.Feedback type="invalid">{fieldError('name')}</Form.Control.Feedback>
          </Form.Group>

          <Form.Group className="mb-3" controlId="dateTime">
            <Form.Label className="fw-semibold small">Event Date Time</Form.Label>
            <Form.Control
              type="datetime-local"
              name="dateTime"
              value={values.dateTime}
              onChange={handleChange}
              isInvalid={Boolean(fieldError('dateTime'))}
              required
            />
            <Form.Control.Feedback type="invalid">{fieldError('dateTime')}</Form.Control.Feedback>
          </Form.Group>

          <Form.Group className="mb-3" controlId="postalCode">
            <Form.Label className="fw-semibold small">Postal Code</Form.Label>
            <Form.Control
              name="postalCode"
              value={values.postalCode}
              onChange={handleChange}
              inputMode="numeric"
              maxLength={6}
              isInvalid={Boolean(fieldError('postalCode'))}
              required
            />
            <Form.Control.Feedback type="invalid">{fieldError('postalCode')}</Form.Control.Feedback>
          </Form.Group>

          <Form.Group className="mb-3" controlId="deadline">
            <Form.Label className="fw-semibold small">Registration Deadline</Form.Label>
            <Form.Control
              type="date"
              name="deadline"
              value={values.deadline}
              onChange={handleChange}
              max={values.dateTime ? values.dateTime.slice(0, 10) : undefined}
              isInvalid={Boolean(fieldError('deadline'))}
              required
            />
            <Form.Control.Feedback type="invalid">{fieldError('deadline')}</Form.Control.Feedback>
          </Form.Group>

          <Form.Group className="mb-3" controlId="capacity">
            <Form.Label className="fw-semibold small">Capacity</Form.Label>
            <Form.Control
              type="number"
              name="capacity"
              value={values.capacity}
              onChange={handleChange}
              min={1}
              max={99999}
              step={1}
              isInvalid={Boolean(fieldError('capacity'))}
              required
            />
            <Form.Control.Feedback type="invalid">{fieldError('capacity')}</Form.Control.Feedback>
          </Form.Group>

          <Form.Group controlId="handlerUuid">
            <Form.Label className="fw-semibold small">Handler</Form.Label>
            <Form.Select
              name="handlerUuid"
              value={values.handlerUuid}
              onChange={handleChange}
              isInvalid={Boolean(fieldError('handlerUuid') || handlersError)}
              required
            >
              <option value="">Select a handler</option>
              {handlers.map((handler) => (
                <option key={handler.uuid} value={handler.uuid}>
                  {handler.name}
                </option>
              ))}
            </Form.Select>
            <Form.Control.Feedback type="invalid">
              {fieldError('handlerUuid') ?? `Could not load handlers: ${handlersError}`}
            </Form.Control.Feedback>
          </Form.Group>
        </Modal.Body>

        <Modal.Footer>
          <Button variant="outline-secondary" onClick={onHide} disabled={submitting}>
            Cancel
          </Button>
          <Button type="submit" disabled={submitting}>
            {submitting && <Spinner animation="border" size="sm" className="me-2" />}
            Add Event
          </Button>
        </Modal.Footer>
      </Form>
    </Modal>
  );
}
