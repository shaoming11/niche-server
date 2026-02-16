import { createMockQueryBuilder, createMockSupabaseAdmin, mockUser, mockAuthToken, MockQueryBuilder } from './setup';

const mockAdmin = createMockSupabaseAdmin({});

jest.mock('../config/database', () => ({
  supabase: mockAdmin,
  supabaseAdmin: mockAdmin,
}));

import request from 'supertest';
import app from '../app';

describe('Business Routes', () => {
  let businessesBuilder: MockQueryBuilder;
  let postsBuilder: MockQueryBuilder;
  let reviewsBuilder: MockQueryBuilder;
  let dealsBuilder: MockQueryBuilder;

  beforeEach(() => {
    jest.clearAllMocks();
    businessesBuilder = createMockQueryBuilder();
    postsBuilder = createMockQueryBuilder();
    reviewsBuilder = createMockQueryBuilder();
    dealsBuilder = createMockQueryBuilder();
    mockAdmin.from.mockImplementation((table: string) => {
      if (table === 'businesses') return businessesBuilder;
      if (table === 'posts') return postsBuilder;
      if (table === 'reviews') return reviewsBuilder;
      if (table === 'deals') return dealsBuilder;
      return createMockQueryBuilder();
    });
  });

  describe('GET /api/businesses', () => {
    it('should return paginated businesses', async () => {
      const businesses = [{ id: 'b1', name: 'Pizza Place', category: 'restaurant' }];
      businessesBuilder._result = { data: businesses, error: null, count: 1 };

      const res = await request(app).get('/api/businesses');

      expect(res.status).toBe(200);
      expect(res.body.businesses).toEqual(businesses);
      expect(res.body.pagination).toBeDefined();
      expect(res.body.pagination.total).toBe(1);
    });

    it('should filter by category and city', async () => {
      businessesBuilder._result = { data: [], error: null, count: 0 };

      const res = await request(app).get('/api/businesses?category=restaurant&city=Toronto');

      expect(res.status).toBe(200);
      expect(businessesBuilder.eq).toHaveBeenCalledWith('category', 'restaurant');
      expect(businessesBuilder.eq).toHaveBeenCalledWith('city', 'Toronto');
    });
  });

  describe('GET /api/businesses/search', () => {
    it('should search businesses by query', async () => {
      const results = [{ id: 'b1', name: 'Pizza Palace' }];
      businessesBuilder._result = { data: results, error: null };

      const res = await request(app).get('/api/businesses/search?q=pizza');

      expect(res.status).toBe(200);
      expect(res.body.businesses).toEqual(results);
      expect(res.body.count).toBe(1);
    });

    it('should return 400 without query parameter', async () => {
      const res = await request(app).get('/api/businesses/search');
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('required');
    });
  });

  describe('GET /api/businesses/:id', () => {
    it('should return a business by id', async () => {
      const biz = { id: 'b1', name: 'Pizza Palace', category: 'restaurant' };
      businessesBuilder._result = { data: biz, error: null };

      const res = await request(app).get('/api/businesses/b1');

      expect(res.status).toBe(200);
      expect(res.body.name).toBe('Pizza Palace');
    });

    it('should return 404 for non-existent business', async () => {
      businessesBuilder._result = { data: null, error: { message: 'not found' } };

      const res = await request(app).get('/api/businesses/nonexistent');

      expect(res.status).toBe(404);
    });
  });

  describe('GET /api/businesses/:id/posts', () => {
    it('should return posts for a business', async () => {
      const posts = [{ id: 'p1', title: 'Great food', message_count: 5 }];
      postsBuilder._result = { data: posts, error: null, count: 1 };

      const res = await request(app).get('/api/businesses/b1/posts');

      expect(res.status).toBe(200);
      expect(res.body.posts).toEqual(posts);
      expect(res.body.pagination).toBeDefined();
    });
  });

  describe('GET /api/businesses/:id/reviews', () => {
    it('should return reviews with stats', async () => {
      const reviews = [{ id: 'r1', rating: 5, comment: 'Great!' }];
      reviewsBuilder._result = { data: reviews, error: null, count: 1 };
      businessesBuilder._result = { data: { average_rating: 4.5, total_ratings: 10 }, error: null };

      const res = await request(app).get('/api/businesses/b1/reviews');

      expect(res.status).toBe(200);
      expect(res.body.reviews).toEqual(reviews);
      expect(res.body.stats).toBeDefined();
      expect(res.body.stats.rating_distribution).toBeDefined();
    });
  });

  describe('GET /api/businesses/:id/deals', () => {
    it('should return active deals', async () => {
      const deals = [{ id: 'd1', title: '20% off', active: true }];
      dealsBuilder._result = { data: deals, error: null };

      const res = await request(app).get('/api/businesses/b1/deals');

      expect(res.status).toBe(200);
      expect(res.body.deals).toEqual(deals);
    });
  });

  describe('POST /api/businesses', () => {
    it('should create a business when authenticated', async () => {
      mockAuthToken(mockAdmin);
      const newBiz = { id: 'b2', name: 'Taco Shop', category: 'restaurant', city: 'Toronto' };
      businessesBuilder._result = { data: newBiz, error: null };

      const res = await request(app)
        .post('/api/businesses')
        .set('Authorization', 'Bearer test-token')
        .send({ name: 'Taco Shop', category: 'restaurant', city: 'Toronto' });

      expect(res.status).toBe(201);
      expect(res.body.name).toBe('Taco Shop');
    });

    it('should return 400 if required fields missing', async () => {
      mockAuthToken(mockAdmin);

      const res = await request(app)
        .post('/api/businesses')
        .set('Authorization', 'Bearer test-token')
        .send({ name: 'Taco Shop' });

      expect(res.status).toBe(400);
    });

    it('should return 401 without auth', async () => {
      const res = await request(app)
        .post('/api/businesses')
        .send({ name: 'Taco Shop', category: 'restaurant', city: 'Toronto' });

      expect(res.status).toBe(401);
    });
  });

  describe('PUT /api/businesses/:id', () => {
    it('should update a business when authenticated', async () => {
      mockAuthToken(mockAdmin);
      const updated = { id: 'b1', name: 'Pizza Palace Updated' };
      businessesBuilder._result = { data: updated, error: null };

      const res = await request(app)
        .put('/api/businesses/b1')
        .set('Authorization', 'Bearer test-token')
        .send({ name: 'Pizza Palace Updated' });

      expect(res.status).toBe(200);
      expect(res.body.name).toBe('Pizza Palace Updated');
    });
  });
});
