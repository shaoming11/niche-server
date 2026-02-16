import { Router, Request, Response, NextFunction } from 'express';
import { supabaseAdmin } from '../config/database';
import { requireAuth } from '../middleware/auth';

const router = Router();

// GET /api/businesses/:businessId/deals
router.get('/businesses/:businessId/deals', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { businessId } = req.params;

    const { data, error } = await supabaseAdmin
      .from('deals')
      .select('*')
      .eq('business_id', businessId)
      .eq('active', true)
      .gte('valid_until', new Date().toISOString())
      .order('created_at', { ascending: false });

    if (error) {
      res.status(500).json({ error: 'Failed to fetch deals' });
      return;
    }

    res.json({ deals: data });
  } catch (err) {
    next(err);
  }
});

// POST /api/businesses/:businessId/deals (admin only)
router.post('/businesses/:businessId/deals', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { businessId } = req.params;
    const { title, description, discount_percentage, code, valid_from, valid_until } = req.body;

    if (!title) {
      res.status(400).json({ error: 'title is required' });
      return;
    }

    const { data, error } = await supabaseAdmin
      .from('deals')
      .insert({
        business_id: businessId,
        title,
        description,
        discount_percentage,
        code,
        valid_from,
        valid_until,
      })
      .select()
      .single();

    if (error) {
      res.status(500).json({ error: 'Failed to create deal' });
      return;
    }

    res.status(201).json(data);
  } catch (err) {
    next(err);
  }
});

// PUT /api/deals/:id (admin only)
router.put('/deals/:id', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    const { data, error } = await supabaseAdmin
      .from('deals')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error || !data) {
      res.status(404).json({ error: 'Deal not found' });
      return;
    }

    res.json(data);
  } catch (err) {
    next(err);
  }
});

// DELETE /api/deals/:id (admin only)
router.delete('/deals/:id', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;

    const { error } = await supabaseAdmin
      .from('deals')
      .delete()
      .eq('id', id);

    if (error) {
      res.status(500).json({ error: 'Failed to delete deal' });
      return;
    }

    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

export default router;
