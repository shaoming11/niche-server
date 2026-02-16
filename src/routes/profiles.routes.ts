import { Router, Request, Response, NextFunction } from 'express';
import { supabaseAdmin } from '../config/database';
import { requireAuth } from '../middleware/auth';
import { validateProfileUpdate, validatePagination } from '../middleware/validation';
import { getPagination, buildPaginationMeta } from '../utils/helpers';

const router = Router();

// GET /api/profiles/:id
router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;

    const { data, error } = await supabaseAdmin
      .from('profiles')
      .select('id, username, name, bio, interests, profile_picture_url, created_at')
      .eq('id', id)
      .single();

    if (error || !data) {
      res.status(404).json({ error: 'Profile not found' });
      return;
    }

    res.json(data);
  } catch (err) {
    next(err);
  }
});

// PUT /api/profiles/:id
router.put('/:id', requireAuth, ...validateProfileUpdate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;

    if (req.user!.id !== id) {
      res.status(403).json({ error: 'Cannot update another user\'s profile' });
      return;
    }

    const { name, bio, interests } = req.body;
    const updates: Record<string, unknown> = {};
    if (name !== undefined) updates.name = name;
    if (bio !== undefined) updates.bio = bio;
    if (interests !== undefined) updates.interests = interests;

    const { data, error } = await supabaseAdmin
      .from('profiles')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      res.status(500).json({ error: 'Failed to update profile' });
      return;
    }

    res.json(data);
  } catch (err) {
    next(err);
  }
});

// GET /api/profiles/:id/posts
router.get('/:id/posts', ...validatePagination, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const { page, limit, offset } = getPagination(req.query);

    const { count } = await supabaseAdmin
      .from('posts')
      .select('*', { count: 'exact', head: true })
      .eq('creator_id', id);

    const { data, error } = await supabaseAdmin
      .from('posts')
      .select(`
        id, title, content, ai_summary, message_count, last_activity_at, created_at,
        business:businesses(id, name, category)
      `)
      .eq('creator_id', id)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      res.status(500).json({ error: 'Failed to fetch posts' });
      return;
    }

    res.json({
      posts: data,
      pagination: buildPaginationMeta(page, limit, count || 0),
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/profiles/:id/bookmarks
router.get('/:id/bookmarks', requireAuth, ...validatePagination, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;

    if (req.user!.id !== id) {
      res.status(403).json({ error: 'Cannot view another user\'s bookmarks' });
      return;
    }

    const { page, limit, offset } = getPagination(req.query);

    const { count } = await supabaseAdmin
      .from('bookmarks')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', id);

    const { data, error } = await supabaseAdmin
      .from('bookmarks')
      .select(`
        created_at,
        business:businesses(*)
      `)
      .eq('user_id', id)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      res.status(500).json({ error: 'Failed to fetch bookmarks' });
      return;
    }

    res.json({
      bookmarks: (data || []).map((b: any) => ({
        business: b.business,
        bookmarked_at: b.created_at,
      })),
      pagination: buildPaginationMeta(page, limit, count || 0),
    });
  } catch (err) {
    next(err);
  }
});

export default router;
