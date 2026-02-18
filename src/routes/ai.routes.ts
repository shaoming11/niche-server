import { Router, Request, Response, NextFunction } from 'express';
import { supabaseAdmin } from '../config/database.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

// POST /api/ai/summarize/:postId
router.post('/summarize/:postId', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { postId } = req.params;

    const { data: post } = await supabaseAdmin
      .from('posts')
      .select('id')
      .eq('id', postId)
      .single();

    if (!post) {
      res.status(404).json({ error: 'Post not found' });
      return;
    }

    const { data, error } = await supabaseAdmin
      .from('ai_summary_queue')
      .insert({ post_id: postId, status: 'pending' })
      .select('id')
      .single();

    if (error) {
      res.status(500).json({ error: 'Failed to queue summary generation' });
      return;
    }

    res.status(202).json({
      message: 'Summary generation queued',
      queue_id: data.id,
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/ai/queue
router.get('/queue', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('ai_summary_queue')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) {
      res.status(500).json({ error: 'Failed to fetch queue' });
      return;
    }

    res.json({ queue: data });
  } catch (err) {
    next(err);
  }
});

export default router;
