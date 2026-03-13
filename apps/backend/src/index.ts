import 'dotenv/config';
import express from 'express';
import logger from './logger';

const app = express();

// Allow the frontend (localhost:3000 by default) to call this backend in dev.
app.use((_req, res, next) => {
  const origin = process.env.CORS_ORIGIN ?? 'http://localhost:3000';
  res.header('Access-Control-Allow-Origin', origin);
  next();
});

app.get('/health', (_req, res) => {
  const timestamp = new Date().toISOString();
  res.json({ status: 'ok', timestamp });
});

const port = Number(process.env.PORT ?? 4000);

app.listen(port, () => {
  logger.info(`backend listening on port ${port}`);
});
