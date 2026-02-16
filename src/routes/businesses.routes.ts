import { Router, Request, Response, NextFunction } from 'express';
import { supabaseAdmin } from '../config/database';
import { requireAuth } from '../middleware/auth';
import { validatePagination } from '../middleware/validation';
import { getPagination, buildPaginationMeta } from '../utils/helpers';

const router = Router();

// GET /api/businesses
router.get('/', ...validatePagination, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { page, limit, offset } = getPagination(req.query);
    const { category, city } = req.query;

    let query = supabaseAdmin.from('businesses').select('*', { count: 'exact' });

    if (category) query = query.eq('category', category as string);
    if (city) query = query.eq('city', city as string);

    query = query.order('average_rating', { ascending: false }).range(offset, offset + limit - 1);

    const { data, error, count } = await query;

    if (error) {
      res.status(500).json({ error: 'Failed to fetch businesses' });
      return;
    }

    res.json({
      businesses: data,
      pagination: buildPaginationMeta(page, limit, count || 0),
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/businesses/search
router.get('/search', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { q, category, city } = req.query;

    if (!q) {
      res.status(400).json({ error: 'Search query (q) is required' });
      return;
    }

    let query = supabaseAdmin.from('businesses').select('*').textSearch(
      'name',
      q as string,
      { type: 'websearch' }
    );

    if (category) query = query.eq('category', category as string);
    if (city) query = query.eq('city', city as string);

    query = query.limit(50);

    const { data, error } = await query;

    if (error) {
      res.status(500).json({ error: 'Search failed' });
      return;
    }

    res.json({
      businesses: data,
      count: data?.length || 0,
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/businesses/:id
router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;

    const { data, error } = await supabaseAdmin
      .from('businesses')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !data) {
      res.status(404).json({ error: 'Business not found' });
      return;
    }

    res.json(data);
  } catch (err) {
    next(err);
  }
});

// GET /api/businesses/:id/posts
router.get('/:id/posts', ...validatePagination, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const { page, limit, offset } = getPagination(req.query);
    const sort = (req.query.sort as string) || 'recent';

    const { count } = await supabaseAdmin
      .from('posts')
      .select('*', { count: 'exact', head: true })
      .eq('business_id', id);

    const orderCol = sort === 'recent' ? 'last_activity_at' : 'created_at';

    const { data, error } = await supabaseAdmin
      .from('posts')
      .select(`
        id, title, content, ai_summary, message_count, last_activity_at, created_at,
        creator:profiles!creator_id(id, username, name, profile_picture_url)
      `)
      .eq('business_id', id)
      .order(orderCol, { ascending: false })
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

// GET /api/businesses/:id/reviews
router.get('/:id/reviews', ...validatePagination, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const { page, limit, offset } = getPagination(req.query);

    const { count } = await supabaseAdmin
      .from('reviews')
      .select('*', { count: 'exact', head: true })
      .eq('business_id', id);

    const { data, error } = await supabaseAdmin
      .from('reviews')
      .select(`
        id, rating, comment, created_at,
        user:profiles!user_id(id, username, name, profile_picture_url)
      `)
      .eq('business_id', id)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      res.status(500).json({ error: 'Failed to fetch reviews' });
      return;
    }

    // Get rating distribution
    const { data: distData } = await supabaseAdmin
      .from('reviews')
      .select('rating')
      .eq('business_id', id);

    const distribution: Record<string, number> = { '5': 0, '4': 0, '3': 0, '2': 0, '1': 0 };
    (distData || []).forEach((r: any) => {
      distribution[String(r.rating)] = (distribution[String(r.rating)] || 0) + 1;
    });

    // Get business stats
    const { data: biz } = await supabaseAdmin
      .from('businesses')
      .select('average_rating, total_ratings')
      .eq('id', id)
      .single();

    res.json({
      reviews: data,
      pagination: buildPaginationMeta(page, limit, count || 0),
      stats: {
        average_rating: biz?.average_rating || 0,
        total_ratings: biz?.total_ratings || 0,
        rating_distribution: distribution,
      },
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/businesses/:id/deals
router.get('/:id/deals', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;

    const { data, error } = await supabaseAdmin
      .from('deals')
      .select('*')
      .eq('business_id', id)
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

// POST /api/businesses (admin only)
router.post('/', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { name, description, category, tags, address, city, postal_code,
      latitude, longitude, phone, website, order_link, menu_url, hours,
      background_image_url, photo_urls } = req.body;

    if (!name || !category || !city) {
      res.status(400).json({ error: 'name, category, and city are required' });
      return;
    }

    const { data, error } = await supabaseAdmin
      .from('businesses')
      .insert({
        name, description, category, tags, address, city, postal_code,
        latitude, longitude, phone, website, order_link, menu_url, hours,
        background_image_url, photo_urls,
      })
      .select()
      .single();

    if (error) {
      res.status(500).json({ error: 'Failed to create business' });
      return;
    }

    res.status(201).json(data);
  } catch (err) {
    next(err);
  }
});

// PUT /api/businesses/:id (admin only)
router.put('/:id', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    const { data, error } = await supabaseAdmin
      .from('businesses')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      res.status(500).json({ error: 'Failed to update business' });
      return;
    }

    if (!data) {
      res.status(404).json({ error: 'Business not found' });
      return;
    }

    res.json(data);
  } catch (err) {
    next(err);
  }
});

export default router;
