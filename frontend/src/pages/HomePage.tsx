import { Card, Col, Row } from 'react-bootstrap';
import { Link } from 'react-router';

export default function HomePage() {
  return (
    <>
      <div className="text-center my-5">
        <h1 className="display-5 fw-bold">Event Company</h1>
        <p className="lead text-body-secondary">Register for upcoming events, or manage events as an employee.</p>
      </div>

      <Row xs={1} md={2} className="g-4 justify-content-center">
        <Col lg={5}>
          <Card className="h-100 shadow-sm">
            <Card.Body className="d-flex flex-column">
              <Card.Title as="h2" className="h4">
                Register for an event
              </Card.Title>
              <Card.Text className="text-body-secondary flex-grow-1">
                Browse the events that are open for registration and sign up with your email address.
              </Card.Text>
              <Link to="/register" className="btn btn-primary">
                Register now
              </Link>
            </Card.Body>
          </Card>
        </Col>
        <Col lg={5}>
          <Card className="h-100 shadow-sm">
            <Card.Body className="d-flex flex-column">
              <Card.Title as="h2" className="h4">
                Employee portal
              </Card.Title>
              <Card.Text className="text-body-secondary flex-grow-1">
                Create events, search and filter the event list, and view registration trends.
              </Card.Text>
              <Link to="/admin" className="btn btn-outline-primary">
                Go to employee portal
              </Link>
            </Card.Body>
          </Card>
        </Col>
      </Row>
    </>
  );
}
