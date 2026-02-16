import { createMockQueryBuilder, createMockSupabaseAdmin, mockUser, mockAuthToken, MockQueryBuilder } from './setup';

const mockAdmin = createMockSupabaseAdmin({});

jest.mock('../config/database', () => ({
  supabase: mockAdmin,
  supabaseAdmin: mockAdmin,
}));

import request from 'supertest';
import app from '../app';

describe('AI Routes', () => {
  let postsBuilder: MockQueryBuilder;
  let aiQueueBuilder: MockQueryBuilder;

  beforeEach(() => {
    jest.clearAllMocks();
    postsBuilder = createMockQueryBuilder();
    aiQueueBuilder = createMockQueryBuilder();
    mockAdmin.from.mockImplementation((table: string) => {
      if (table === 'posts') return postsBuilder;
      if (table === 'ai_summary_queue') return aiQueueBuilder;
      return createMockQueryBuilder();
    });
  });

  describe('POST /api/ai/summarize/:postId', () => {
    it('should queue summary generation', async () => {
      mockAuthToken(mockAdmin);
      postsBuilder._result = { data: { id: 'p1' }, error: null };
      aiQueueBuilder._result = { data: { id: 'q1' }, error: null };

      const res = await request(app)
        .post('/api/ai/summarize/p1')
        .set('Authorization', 'Bearer test-token');

      expect(res.status).toBe(202);
      expect(res.body.message).toBe('Summary generation queued');
      expect(res.body.queue_id).toBe('q1');
    });

    it('should return 404 for non-existent post', async () => {
      mockAuthToken(mockAdmin);
      postsBuilder._result = { data: null, error: { message: 'not found' } };

      const res = await request(app)
        .post('/api/ai/summarize/nonexistent')
        .set('Authorization', 'Bearer test-token');

      expect(res.status).toBe(404);
    });

    it('should return 401 without auth', async () => {
      const res = await request(app).post('/api/ai/summarize/p1');
      expect(res.status).toBe(401);
    });
  });

  describe('GET /api/ai/queue', () => {
    it('should return queue status', async () => {
      mockAuthToken(mockAdmin);
      const queue = [
        { id: 'q1', post_id: 'p1', status: 'completed' },
        { id: 'q2', post_id: 'p2', status: 'pending' },
      ];
      aiQueueBuilder._result = { data: queue, error: null };

      const res = await request(app)
        .get('/api/ai/queue')
        .set('Authorization', 'Bearer test-token');

      expect(res.status).toBe(200);
      expect(res.body.queue).toHaveLength(2);
    });

    it('should return 401 without auth', async () => {
      const res = await request(app).get('/api/ai/queue');
      expect(res.status).toBe(401);
    });
  });
});
