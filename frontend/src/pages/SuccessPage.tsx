import { Card, Col, Row } from 'react-bootstrap';
import { Link, Navigate, useLocation } from 'react-router';

interface SuccessState {
  registrationNo?: string;
  eventName?: string;
}

export default function SuccessPage() {
  const state = useLocation().state as SuccessState | null;

  // Only reachable right after a registration
  if (!state?.registrationNo) {
    return <Navigate to="/register" replace />;
  }

  return (
    <Row className="justify-content-center">
      <Col lg={6}>
        <Card className="text-center shadow-sm">
          <Card.Body className="p-5">
            <div className="display-4 text-success mb-3" aria-hidden="true">
              ✓
            </div>
            <h1 className="h3">Registration successful</h1>
            <p className="text-body-secondary">
              Thank you for registering{state.eventName ? ` for ${state.eventName}` : ''}.
            </p>
            <p className="mb-1">Your registration number is</p>
            <p className="display-5 fw-bold font-monospace mb-4">{state.registrationNo}</p>
            <Link to="/register" className="btn btn-outline-primary">
              Register for another event
            </Link>
          </Card.Body>
        </Card>
      </Col>
    </Row>
  );
}
