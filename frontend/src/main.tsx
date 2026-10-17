import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Link, NavLink, Route, Routes } from 'react-router';
import { Container, Nav, Navbar } from 'react-bootstrap';
import 'bootstrap/dist/css/bootstrap.min.css';
import AdminEventsPage from './pages/AdminEventsPage';
import HomePage from './pages/HomePage';
import RegisterPage from './pages/RegisterPage';
import SuccessPage from './pages/SuccessPage';

function NotFoundPage() {
  return (
    <div className="text-center py-5">
      <h1 className="h3">Page not found</h1>
      <Link to="/">Back to home</Link>
    </div>
  );
}

function App() {
  return (
    <div className="min-vh-100 bg-body-tertiary">
      <Navbar bg="white" className="border-bottom shadow-sm mb-4">
        <Container>
          <Navbar.Brand as={Link} to="/" className="fw-bold">
            Event Company
          </Navbar.Brand>
          <Nav className="ms-auto small">
            <Nav.Link as={NavLink} to="/register">
              Register
            </Nav.Link>
            <Nav.Link as={NavLink} to="/admin">
              Employee portal
            </Nav.Link>
          </Nav>
        </Container>
      </Navbar>

      <Container as="main" className="pb-5">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/success" element={<SuccessPage />} />
          <Route path="/admin" element={<AdminEventsPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </Container>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
);
