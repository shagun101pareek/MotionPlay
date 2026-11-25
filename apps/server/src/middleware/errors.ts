import type { ErrorRequestHandler, RequestHandler } from 'express';

export const notFoundHandler: RequestHandler = (_req, res) => {
  res.status(404).json({ error: 'Not found' });
};

export const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  console.error(error);
  if (res.headersSent) return;
  res.status(500).json({ error: 'Internal server error' });
};
