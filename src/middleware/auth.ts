import { Request, Response, NextFunction } from 'express';
import { supabase } from '../config/database';

async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const token = req.headers.authorization?.replace('Bearer ', '');

  if (!token) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  const { data: { user }, error } = await supabase.auth.getUser(token);

  if (error || !user) {
    res.status(401).json({ error: 'Invalid token' });
    return;
  }

  req.user = user;
  next();
}

async function optionalAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const token = req.headers.authorization?.replace('Bearer ', '');

  if (token) {
    const { data: { user } } = await supabase.auth.getUser(token);
    req.user = user || null;
  } else {
    req.user = null;
  }

  next();
}

export { requireAuth, optionalAuth };
