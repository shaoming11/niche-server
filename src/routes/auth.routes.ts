import { Router, Request, Response, NextFunction } from 'express';
import { supabase, supabaseAdmin } from '../config/database';
import { requireAuth } from '../middleware/auth';
import { validateRegistration, validateLogin } from '../middleware/validation';

const router = Router();

// POST /api/auth/register
router.post('/register', ...validateRegistration, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email, password, username, name } = req.body;

    const { data: existing } = await supabaseAdmin
      .from('profiles')
      .select('id')
      .eq('username', username)
      .single();

    if (existing) {
      res.status(409).json({ error: 'Username already taken' });
      return;
    }

    const { data: authData, error: authError } = await supabase.auth.signUp({
      email,
      password,
    });

    if (authError) {
      res.status(400).json({ error: authError.message });
      return;
    }

    const { error: profileError } = await supabaseAdmin
      .from('profiles')
      .insert({
        id: authData.user!.id,
        username,
        name,
      });

    if (profileError) {
      res.status(500).json({ error: 'Failed to create profile' });
      return;
    }

    res.status(201).json({
      user: {
        id: authData.user!.id,
        email: authData.user!.email,
        username,
      },
      session: authData.session,
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/login
router.post('/login', ...validateLogin, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email, password } = req.body;

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }

    res.json({
      user: data.user,
      session: data.session,
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/logout
router.post('/logout', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { error } = await supabase.auth.signOut();
    if (error) {
      res.status(500).json({ error: 'Logout failed' });
      return;
    }
    res.json({ message: 'Logged out successfully' });
  } catch (err) {
    next(err);
  }
});

// GET /api/auth/verify
router.get('/verify', requireAuth, (req: Request, res: Response) => {
  res.json({ user: req.user });
});

// POST /api/auth/refresh
router.post('/refresh', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { refresh_token } = req.body;

    if (!refresh_token) {
      res.status(400).json({ error: 'Refresh token required' });
      return;
    }

    const { data, error } = await supabase.auth.refreshSession({ refresh_token });

    if (error) {
      res.status(401).json({ error: 'Invalid refresh token' });
      return;
    }

    res.json({ session: data.session });
  } catch (err) {
    next(err);
  }
});

export default router;
