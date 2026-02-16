import { Router, Request, Response, NextFunction } from 'express';
import { supabaseAdmin } from '../config/database';
import { requireAuth } from '../middleware/auth';
import { validateMessageCreation, validatePagination } from '../middleware/validation';
import { getPagination, buildPaginationMeta, buildCommentTree } from '../utils/helpers';

const router = Router();

// GET /api/posts/:postId/messages
router.get('/posts/:postId/messages', ...validatePagination, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { postId } = req.params;
    const { page, limit, offset } = getPagination(req.query);

    // Fetch all messages for this post (for tree building)
    const { data: allMessages, error: countError } = await supabaseAdmin
      .from('messages')
      .select('id', { count: 'exact', head: true })
      .eq('post_id', postId)
      .is('parent_message_id', null);

    const totalTopLevel = (allMessages as any) || 0;

    const { data, error } = await supabaseAdmin
      .from('messages')
      .select(`
        id, content, parent_message_id, depth, likes_count, deleted, created_at,
        user:profiles!user_id(id, username, name, profile_picture_url)
      `)
      .eq('post_id', postId)
      .order('created_at', { ascending: true });

    if (error) {
      res.status(500).json({ error: 'Failed to fetch messages' });
      return;
    }

    const tree = buildCommentTree(data || []);

    // Paginate top-level messages
    const paginatedTree = tree.slice(offset, offset + limit);

    // Get count of top-level messages
    const { count } = await supabaseAdmin
      .from('messages')
      .select('*', { count: 'exact', head: true })
      .eq('post_id', postId)
      .is('parent_message_id', null);

    res.json({
      messages: paginatedTree,
      pagination: buildPaginationMeta(page, limit, count || 0),
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/posts/:postId/messages
router.post('/posts/:postId/messages', requireAuth, ...validateMessageCreation, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { postId } = req.params;
    const { content, parent_message_id } = req.body;

    // Verify post exists
    const { data: post } = await supabaseAdmin
      .from('posts')
      .select('id, message_count')
      .eq('id', postId)
      .single();

    if (!post) {
      res.status(404).json({ error: 'Post not found' });
      return;
    }

    let depth = 0;

    if (parent_message_id) {
      const { data: parent } = await supabaseAdmin
        .from('messages')
        .select('depth, post_id')
        .eq('id', parent_message_id)
        .single();

      if (!parent) {
        res.status(404).json({ error: 'Parent message not found' });
        return;
      }

      if (parent.post_id !== postId) {
        res.status(400).json({ error: 'Parent message does not belong to this post' });
        return;
      }

      if (parent.depth >= 5) {
        res.status(400).json({ error: 'Maximum nesting depth reached' });
        return;
      }

      depth = parent.depth + 1;
    }

    const { data, error } = await supabaseAdmin
      .from('messages')
      .insert({
        post_id: postId,
        user_id: req.user!.id,
        content,
        parent_message_id: parent_message_id || null,
        depth,
      })
      .select()
      .single();

    if (error) {
      res.status(500).json({ error: 'Failed to create message' });
      return;
    }

    // Check if should queue AI summary regeneration
    const newCount = post.message_count + 1;
    const thresholds = [5, 10, 25, 50, 100];
    if (thresholds.includes(newCount)) {
      supabaseAdmin
        .from('ai_summary_queue')
        .insert({ post_id: postId, status: 'pending' })
        .then(() => {});
    }

    res.status(201).json(data);
  } catch (err) {
    next(err);
  }
});

// PUT /api/messages/:id
router.put('/messages/:id', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const { content } = req.body;

    if (!content || content.length < 1 || content.length > 5000) {
      res.status(400).json({ error: 'Content must be 1-5000 characters' });
      return;
    }

    const { data: msg } = await supabaseAdmin
      .from('messages')
      .select('user_id, deleted')
      .eq('id', id)
      .single();

    if (!msg) {
      res.status(404).json({ error: 'Message not found' });
      return;
    }

    if (msg.user_id !== req.user!.id) {
      res.status(403).json({ error: 'Not authorized to update this message' });
      return;
    }

    if (msg.deleted) {
      res.status(400).json({ error: 'Cannot edit a deleted message' });
      return;
    }

    const { data, error } = await supabaseAdmin
      .from('messages')
      .update({ content })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      res.status(500).json({ error: 'Failed to update message' });
      return;
    }

    res.json(data);
  } catch (err) {
    next(err);
  }
});

// DELETE /api/messages/:id (soft delete)
router.delete('/messages/:id', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;

    const { data: msg } = await supabaseAdmin
      .from('messages')
      .select('user_id')
      .eq('id', id)
      .single();

    if (!msg) {
      res.status(404).json({ error: 'Message not found' });
      return;
    }

    if (msg.user_id !== req.user!.id) {
      res.status(403).json({ error: 'Not authorized to delete this message' });
      return;
    }

    const { data, error } = await supabaseAdmin
      .from('messages')
      .update({ deleted: true, content: '[deleted]' })
      .eq('id', id)
      .select('id, deleted')
      .single();

    if (error) {
      res.status(500).json({ error: 'Failed to delete message' });
      return;
    }

    res.json(data);
  } catch (err) {
    next(err);
  }
});

// POST /api/messages/:id/like
router.post('/messages/:id/like', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;

    // Verify message exists
    const { data: msg } = await supabaseAdmin
      .from('messages')
      .select('id, likes_count')
      .eq('id', id)
      .single();

    if (!msg) {
      res.status(404).json({ error: 'Message not found' });
      return;
    }

    const { error } = await supabaseAdmin
      .from('likes')
      .upsert(
        { user_id: req.user!.id, message_id: id },
        { onConflict: 'user_id,message_id', ignoreDuplicates: true }
      );

    if (error) {
      res.status(500).json({ error: 'Failed to like message' });
      return;
    }

    // Fetch updated count
    const { data: updated } = await supabaseAdmin
      .from('messages')
      .select('likes_count')
      .eq('id', id)
      .single();

    res.status(201).json({
      message_id: id,
      liked: true,
      likes_count: updated?.likes_count || msg.likes_count + 1,
    });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/messages/:id/like
router.delete('/messages/:id/like', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;

    const { error } = await supabaseAdmin
      .from('likes')
      .delete()
      .eq('user_id', req.user!.id)
      .eq('message_id', id);

    if (error) {
      res.status(500).json({ error: 'Failed to unlike message' });
      return;
    }

    const { data: updated } = await supabaseAdmin
      .from('messages')
      .select('likes_count')
      .eq('id', id)
      .single();

    res.json({
      message_id: id,
      liked: false,
      likes_count: updated?.likes_count || 0,
    });
  } catch (err) {
    next(err);
  }
});

export default router;
