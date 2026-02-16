import { Request, Response, NextFunction } from 'express';

interface AppError extends Error {
  statusCode?: number;
  type?: string;
}

function errorHandler(err: AppError, req: Request, res: Response, _next: NextFunction): void {
  console.error('Error:', err.message);
  console.error('Stack:', err.stack);

  if (err.type === 'entity.parse.failed') {
    res.status(400).json({ error: 'Invalid JSON in request body' });
    return;
  }

  const statusCode = err.statusCode || 500;
  const message = statusCode === 500 ? 'Internal server error' : err.message;

  res.status(statusCode).json({ error: message });
}

export { errorHandler };
