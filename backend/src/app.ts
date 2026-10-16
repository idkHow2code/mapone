import express, { Router } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { errorHandler, notFoundHandler, requestLogger } from './middleware';
import { adminRouter, publicRouter } from './routes';

export const app = express();

app.use(helmet());
app.use(cors({ origin: process.env.CORS_ORIGIN ?? 'http://localhost:8001' }));
app.use(express.json({ limit: '10kb' }));
app.use(requestLogger);

app.get('/health', (_req, res) => {
  res.status(200).json({ status: 'ok' });
});

const api = Router();
api.use('/admin', adminRouter);
api.use('/public', publicRouter);
app.use('/api', api);

app.use(notFoundHandler);
app.use(errorHandler);
