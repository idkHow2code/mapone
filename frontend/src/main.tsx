import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';
import 'bootstrap/dist/css/bootstrap.min.css';
import { Container } from 'react-bootstrap';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <Container className="py-4">
        <h1>Event Registration</h1>
      </Container>
    </BrowserRouter>
  </StrictMode>,
);
