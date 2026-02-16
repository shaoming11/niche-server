import { Router, Request, Response, NextFunction } from 'express';
import { supabaseAdmin } from '../config/database';
import { requireAuth } from '../middleware/auth';
import { validateReviewCreation } from '../middleware/validation';

const router = Router();

// POST /api/businesses/:businessId/reviews
router.post('/businesses/:businessId/reviews', requireAuth, ...validateReviewCreation, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { businessId } = req.params;
    const { rating, comment } = req.body;

    // Verify business exists
    const { data: biz } = await supabaseAdmin
      .from('businesses')
      .select('id')
      .eq('id', businessId)
      .single();

    if (!biz) {
      res.status(404).json({ error: 'Business not found' });
      return;
    }

    // Check if user already reviewed
    const { data: existing } = await supabaseAdmin
      .from('reviews')
      .select('id')
      .eq('business_id', businessId)
      .eq('user_id', req.user!.id)
      .single();

    if (existing) {
      res.status(409).json({ error: 'You have already reviewed this business' });
      return;
    }

    const { data, error } = await supabaseAdmin
      .from('reviews')
      .insert({
        business_id: businessId,
        user_id: req.user!.id,
        rating,
        comment: comment || null,
      })
      .select()
      .single();

    if (error) {
      res.status(500).json({ error: 'Failed to create review' });
      return;
    }

    res.status(201).json(data);
  } catch (err) {
    next(err);
  }
});

// PUT /api/reviews/:id
router.put('/reviews/:id', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const { rating, comment } = req.body;

    if (rating !== undefined && (rating < 1 || rating > 5)) {
      res.status(400).json({ error: 'Rating must be 1-5' });
      return;
    }

    const { data: review } = await supabaseAdmin
      .from('reviews')
      .select('user_id')
      .eq('id', id)
      .single();

    if (!review) {
      res.status(404).json({ error: 'Review not found' });
      return;
    }

    if (review.user_id !== req.user!.id) {
      res.status(403).json({ error: 'Not authorized to update this review' });
      return;
    }

    const updates: Record<string, unknown> = {};
    if (rating !== undefined) updates.rating = rating;
    if (comment !== undefined) updates.comment = comment;

    const { data, error } = await supabaseAdmin
      .from('reviews')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      res.status(500).json({ error: 'Failed to update review' });
      return;
    }

    res.json(data);
  } catch (err) {
    next(err);
  }
});

// DELETE /api/reviews/:id
router.delete('/reviews/:id', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;

    const { data: review } = await supabaseAdmin
      .from('reviews')
      .select('user_id')
      .eq('id', id)
      .single();

    if (!review) {
      res.status(404).json({ error: 'Review not found' });
      return;
    }

    if (review.user_id !== req.user!.id) {
      res.status(403).json({ error: 'Not authorized to delete this review' });
      return;
    }

    const { error } = await supabaseAdmin
      .from('reviews')
      .delete()
      .eq('id', id);

    if (error) {
      res.status(500).json({ error: 'Failed to delete review' });
      return;
    }

    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

export default router;
