import { Router, Request, Response, NextFunction } from 'express';
import { supabaseAdmin } from '../config/database.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

// POST /api/bookmarks
router.post('/', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { business_id } = req.body;

    if (!business_id) {
      res.status(400).json({ error: 'business_id is required' });
      return;
    }

    // Verify business exists
    const { data: biz } = await supabaseAdmin
      .from('businesses')
      .select('id')
      .eq('id', business_id)
      .single();

    if (!biz) {
      res.status(404).json({ error: 'Business not found' });
      return;
    }

    const { data, error } = await supabaseAdmin
      .from('bookmarks')
      .upsert(
        { user_id: req.user!.id, business_id },
        { onConflict: 'user_id,business_id', ignoreDuplicates: true }
      )
      .select()
      .single();

    if (error) {
      res.status(500).json({ error: 'Failed to create bookmark' });
      return;
    }

    res.status(201).json(data);
  } catch (err) {
    next(err);
  }
});

// DELETE /api/bookmarks/:businessId
router.delete('/:businessId', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { businessId } = req.params;

    const { error } = await supabaseAdmin
      .from('bookmarks')
      .delete()
      .eq('user_id', req.user!.id)
      .eq('business_id', businessId);

    if (error) {
      res.status(500).json({ error: 'Failed to remove bookmark' });
      return;
    }

    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

export default router;
