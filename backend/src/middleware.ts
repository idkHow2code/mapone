import { ErrorRequestHandler, RequestHandler } from 'express';
import { AppError, HTTP_STATUS } from './errors';
import { logger } from './utils/logger';

export const requestLogger: RequestHandler = (req, res, next) => {
  const start = process.hrtime.bigint();
  res.on('finish', () => {
    const ms = Number(process.hrtime.bigint() - start) / 1e6;
    logger.info(`${req.method} ${req.originalUrl} ${res.statusCode} ${ms.toFixed(1)}ms`);
  });
  next();
};

export const notFoundHandler: RequestHandler = (req, res) => {
  res.status(HTTP_STATUS.CLIENT_ERROR).json({ message: `Route ${req.method} ${req.path} not found` });
};

interface HttpParserError {
  type?: string;
}

export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  if (err instanceof AppError) {
    if (err.status >= HTTP_STATUS.SERVER_ERROR) {
      logger.error(`${req.method} ${req.originalUrl} failed: ${err.message}`);
    }
    res.status(err.status).json({ message: err.message, ...(err.errors && { errors: err.errors }) });
    return;
  }

  // Errors raised by express.json() before reaching a route
  const parserError = err as HttpParserError;
  if (parserError.type === 'entity.parse.failed') {
    res.status(HTTP_STATUS.VALIDATION_ERROR).json({ message: 'Request body is not valid JSON' });
    return;
  }
  if (parserError.type === 'entity.too.large') {
    res.status(HTTP_STATUS.CLIENT_ERROR).json({ message: 'Request body is too large' });
    return;
  }

  // Unexpected: log the details, never leak them to the client
  logger.error(`${req.method} ${req.originalUrl} failed`, err);
  res.status(HTTP_STATUS.SERVER_ERROR).json({ message: 'An unexpected error occurred' });
};
