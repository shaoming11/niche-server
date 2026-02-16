import { Router, Request, Response, NextFunction } from 'express';
import { supabaseAdmin } from '../config/database';
import { requireAuth } from '../middleware/auth';
import { validatePostCreation, validatePostUpdate, validatePagination } from '../middleware/validation';
import { getPagination, buildPaginationMeta, calculateHotScore } from '../utils/helpers';

const router = Router();

// GET /api/posts
router.get('/', ...validatePagination, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { page, limit, offset } = getPagination(req.query);
    const sort = (req.query.sort as string) || 'recent';

    const { count } = await supabaseAdmin
      .from('posts')
      .select('*', { count: 'exact', head: true });

    let query = supabaseAdmin
      .from('posts')
      .select(`
        id, title, content, ai_summary, message_count, last_activity_at, created_at,
        business:businesses!business_id(id, name, category),
        creator:profiles!creator_id(id, username, name, profile_picture_url)
      `);

    if (sort === 'top') {
      query = query.order('message_count', { ascending: false });
    } else {
      query = query.order('last_activity_at', { ascending: false });
    }

    query = query.range(offset, offset + limit - 1);

    const { data, error } = await query;

    if (error) {
      res.status(500).json({ error: 'Failed to fetch posts' });
      return;
    }

    let posts = data || [];
    if (sort === 'hot') {
      posts = posts.sort((a: any, b: any) => calculateHotScore(b) - calculateHotScore(a));
    }

    res.json({
      posts,
      pagination: buildPaginationMeta(page, limit, count || 0),
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/posts/:id
router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;

    const { data, error } = await supabaseAdmin
      .from('posts')
      .select(`
        *,
        business:businesses!business_id(id, name, category),
        creator:profiles!creator_id(id, username, name, profile_picture_url)
      `)
      .eq('id', id)
      .single();

    if (error || !data) {
      res.status(404).json({ error: 'Post not found' });
      return;
    }

    res.json(data);
  } catch (err) {
    next(err);
  }
});

// POST /api/posts
router.post('/', requireAuth, ...validatePostCreation, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { business_id, title, content } = req.body;

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
      .from('posts')
      .insert({
        business_id,
        creator_id: req.user!.id,
        title,
        content,
      })
      .select()
      .single();

    if (error) {
      res.status(500).json({ error: 'Failed to create post' });
      return;
    }

    // Queue AI summary generation (async, don't await)
    supabaseAdmin.rpc('queue_ai_summary', { p_post_id: data.id }).then(() => {});

    res.status(201).json(data);
  } catch (err) {
    next(err);
  }
});

// PUT /api/posts/:id
router.put('/:id', requireAuth, ...validatePostUpdate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;

    const { data: post } = await supabaseAdmin
      .from('posts')
      .select('creator_id')
      .eq('id', id)
      .single();

    if (!post) {
      res.status(404).json({ error: 'Post not found' });
      return;
    }

    if (post.creator_id !== req.user!.id) {
      res.status(403).json({ error: 'Not authorized to update this post' });
      return;
    }

    const updates: Record<string, unknown> = {};
    if (req.body.title !== undefined) updates.title = req.body.title;
    if (req.body.content !== undefined) updates.content = req.body.content;

    const { data, error } = await supabaseAdmin
      .from('posts')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      res.status(500).json({ error: 'Failed to update post' });
      return;
    }

    res.json(data);
  } catch (err) {
    next(err);
  }
});

// DELETE /api/posts/:id
router.delete('/:id', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;

    const { data: post } = await supabaseAdmin
      .from('posts')
      .select('creator_id, message_count')
      .eq('id', id)
      .single();

    if (!post) {
      res.status(404).json({ error: 'Post not found' });
      return;
    }

    if (post.creator_id !== req.user!.id) {
      res.status(403).json({ error: 'Not authorized to delete this post' });
      return;
    }

    if (post.message_count > 0) {
      res.status(403).json({ error: 'Cannot delete post with comments' });
      return;
    }

    const { error } = await supabaseAdmin
      .from('posts')
      .delete()
      .eq('id', id);

    if (error) {
      res.status(500).json({ error: 'Failed to delete post' });
      return;
    }

    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

// POST /api/posts/:id/regenerate-summary
router.post('/:id/regenerate-summary', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;

    const { data: post } = await supabaseAdmin
      .from('posts')
      .select('id')
      .eq('id', id)
      .single();

    if (!post) {
      res.status(404).json({ error: 'Post not found' });
      return;
    }

    const { data, error } = await supabaseAdmin
      .from('ai_summary_queue')
      .insert({ post_id: id, status: 'pending' })
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

export default router;
