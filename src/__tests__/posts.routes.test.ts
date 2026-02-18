import { createMockQueryBuilder, createMockSupabaseAdmin, mockUser, mockAuthToken, MockQueryBuilder } from './setup.js';

const mockAdmin = createMockSupabaseAdmin({});

jest.mock('../config/database', () => ({
  supabase: mockAdmin,
  supabaseAdmin: mockAdmin,
}));

import request from 'supertest';
import app from '../app.js';

describe('Post Routes', () => {
  let postsBuilder: MockQueryBuilder;
  let businessesBuilder: MockQueryBuilder;
  let aiQueueBuilder: MockQueryBuilder;

  beforeEach(() => {
    jest.clearAllMocks();
    postsBuilder = createMockQueryBuilder();
    businessesBuilder = createMockQueryBuilder();
    aiQueueBuilder = createMockQueryBuilder();
    mockAdmin.from.mockImplementation((table: string) => {
      if (table === 'posts') return postsBuilder;
      if (table === 'businesses') return businessesBuilder;
      if (table === 'ai_summary_queue') return aiQueueBuilder;
      return createMockQueryBuilder();
    });
    mockAdmin.rpc.mockResolvedValue({ data: null, error: null });
  });

  describe('GET /api/posts', () => {
    it('should return paginated posts', async () => {
      const posts = [{ id: 'p1', title: 'Test Post', message_count: 3 }];
      postsBuilder._result = { data: posts, error: null, count: 1 };

      const res = await request(app).get('/api/posts');

      expect(res.status).toBe(200);
      expect(res.body.posts).toEqual(posts);
      expect(res.body.pagination.total).toBe(1);
    });

    it('should support sort parameter', async () => {
      postsBuilder._result = { data: [], error: null, count: 0 };

      const res = await request(app).get('/api/posts?sort=top');

      expect(res.status).toBe(200);
      expect(postsBuilder.order).toHaveBeenCalledWith('message_count', { ascending: false });
    });
  });

  describe('GET /api/posts/:id', () => {
    it('should return a post by id', async () => {
      const post = { id: 'p1', title: 'Test Post', content: 'Content here' };
      postsBuilder._result = { data: post, error: null };

      const res = await request(app).get('/api/posts/p1');

      expect(res.status).toBe(200);
      expect(res.body.title).toBe('Test Post');
    });

    it('should return 404 for non-existent post', async () => {
      postsBuilder._result = { data: null, error: { message: 'not found' } };

      const res = await request(app).get('/api/posts/nonexistent');

      expect(res.status).toBe(404);
    });
  });

  describe('POST /api/posts', () => {
    it('should create a post when authenticated', async () => {
      mockAuthToken(mockAdmin);
      businessesBuilder._result = { data: { id: 'b1' }, error: null };
      const newPost = { id: 'p2', title: 'New Post', content: 'Some content here', business_id: 'b1', creator_id: mockUser.id };
      postsBuilder._result = { data: newPost, error: null };

      const res = await request(app)
        .post('/api/posts')
        .set('Authorization', 'Bearer test-token')
        .send({
          business_id: '11111111-1111-1111-1111-111111111111',
          title: 'New Post',
          content: 'Some content here that is long enough',
        });

      expect(res.status).toBe(201);
      expect(res.body.title).toBe('New Post');
    });

    it('should return 401 without auth', async () => {
      const res = await request(app)
        .post('/api/posts')
        .send({ business_id: '11111111-1111-1111-1111-111111111111', title: 'Test', content: 'Content here' });

      expect(res.status).toBe(401);
    });

    it('should return 400 for invalid input', async () => {
      mockAuthToken(mockAdmin);

      const res = await request(app)
        .post('/api/posts')
        .set('Authorization', 'Bearer test-token')
        .send({ title: 'ab', content: 'short', business_id: 'not-uuid' });

      expect(res.status).toBe(400);
    });

    it('should return 404 if business does not exist', async () => {
      mockAuthToken(mockAdmin);
      businessesBuilder._result = { data: null, error: { message: 'not found' } };

      const res = await request(app)
        .post('/api/posts')
        .set('Authorization', 'Bearer test-token')
        .send({
          business_id: '11111111-1111-1111-1111-111111111111',
          title: 'New Post',
          content: 'Some content here that is long enough',
        });

      expect(res.status).toBe(404);
    });
  });

  describe('PUT /api/posts/:id', () => {
    it('should update own post', async () => {
      mockAuthToken(mockAdmin);
      postsBuilder._result = { data: { creator_id: mockUser.id }, error: null };
      // After first call (select), subsequent calls return updated
      const updated = { id: 'p1', title: 'Updated Title', content: 'Updated content' };

      // We need the builder to return different results on different calls
      // First single() call returns creator_id, second returns updated post
      let callCount = 0;
      postsBuilder.single.mockImplementation(() => {
        callCount++;
        if (callCount === 1) return Promise.resolve({ data: { creator_id: mockUser.id }, error: null });
        return Promise.resolve({ data: updated, error: null });
      });

      const res = await request(app)
        .put('/api/posts/p1')
        .set('Authorization', 'Bearer test-token')
        .send({ title: 'Updated Title' });

      expect(res.status).toBe(200);
    });

    it('should return 403 when updating another user post', async () => {
      mockAuthToken(mockAdmin);
      postsBuilder._result = { data: { creator_id: 'other-user-id' }, error: null };

      const res = await request(app)
        .put('/api/posts/p1')
        .set('Authorization', 'Bearer test-token')
        .send({ title: 'Updated Title' });

      expect(res.status).toBe(403);
    });
  });

  describe('DELETE /api/posts/:id', () => {
    it('should delete own post with no messages', async () => {
      mockAuthToken(mockAdmin);
      postsBuilder._result = { data: { creator_id: mockUser.id, message_count: 0 }, error: null };

      const res = await request(app)
        .delete('/api/posts/p1')
        .set('Authorization', 'Bearer test-token');

      expect(res.status).toBe(204);
    });

    it('should return 403 when post has messages', async () => {
      mockAuthToken(mockAdmin);
      postsBuilder._result = { data: { creator_id: mockUser.id, message_count: 5 }, error: null };

      const res = await request(app)
        .delete('/api/posts/p1')
        .set('Authorization', 'Bearer test-token');

      expect(res.status).toBe(403);
      expect(res.body.error).toContain('comments');
    });

    it('should return 403 when deleting another user post', async () => {
      mockAuthToken(mockAdmin);
      postsBuilder._result = { data: { creator_id: 'other-user', message_count: 0 }, error: null };

      const res = await request(app)
        .delete('/api/posts/p1')
        .set('Authorization', 'Bearer test-token');

      expect(res.status).toBe(403);
    });
  });

  describe('POST /api/posts/:id/regenerate-summary', () => {
    it('should queue summary regeneration', async () => {
      mockAuthToken(mockAdmin);
      postsBuilder._result = { data: { id: 'p1' }, error: null };
      aiQueueBuilder._result = { data: { id: 'q1' }, error: null };

      const res = await request(app)
        .post('/api/posts/p1/regenerate-summary')
        .set('Authorization', 'Bearer test-token');

      expect(res.status).toBe(202);
      expect(res.body.queue_id).toBe('q1');
    });

    it('should return 404 for non-existent post', async () => {
      mockAuthToken(mockAdmin);
      postsBuilder._result = { data: null, error: { message: 'not found' } };

      const res = await request(app)
        .post('/api/posts/nonexistent/regenerate-summary')
        .set('Authorization', 'Bearer test-token');

      expect(res.status).toBe(404);
    });
  });
});
