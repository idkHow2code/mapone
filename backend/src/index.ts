import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';

const PORT = Number(process.env.PORT ?? 8000);

const app = express();
app.use(helmet());
app.use(cors({ origin: process.env.CORS_ORIGIN ?? 'http://localhost:8001' }));
app.use(express.json());

app.get('/health', (_req, res) => {
  res.status(200).json({ status: 'ok' });
});

app.listen(PORT, () => {
  console.log(`API listening on port ${PORT}`);
});
