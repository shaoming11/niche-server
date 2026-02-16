import { createMockQueryBuilder, createMockSupabaseAdmin, mockUser, mockAuthToken, MockQueryBuilder } from './setup';

const mockAdmin = createMockSupabaseAdmin({});

jest.mock('../config/database', () => ({
  supabase: mockAdmin,
  supabaseAdmin: mockAdmin,
}));

import request from 'supertest';
import app from '../app';

describe('Message Routes', () => {
  let messagesBuilder: MockQueryBuilder;
  let postsBuilder: MockQueryBuilder;
  let likesBuilder: MockQueryBuilder;
  let aiQueueBuilder: MockQueryBuilder;

  beforeEach(() => {
    jest.clearAllMocks();
    messagesBuilder = createMockQueryBuilder();
    postsBuilder = createMockQueryBuilder();
    likesBuilder = createMockQueryBuilder();
    aiQueueBuilder = createMockQueryBuilder();
    mockAdmin.from.mockImplementation((table: string) => {
      if (table === 'messages') return messagesBuilder;
      if (table === 'posts') return postsBuilder;
      if (table === 'likes') return likesBuilder;
      if (table === 'ai_summary_queue') return aiQueueBuilder;
      return createMockQueryBuilder();
    });
  });

  describe('GET /api/posts/:postId/messages', () => {
    it('should return nested message tree', async () => {
      const messages = [
        { id: 'm1', content: 'Hello', parent_message_id: null, depth: 0 },
        { id: 'm2', content: 'Reply', parent_message_id: 'm1', depth: 1 },
      ];
      messagesBuilder._result = { data: messages, error: null, count: 1 };

      const res = await request(app).get('/api/posts/p1/messages');

      expect(res.status).toBe(200);
      expect(res.body.messages).toBeDefined();
      expect(res.body.pagination).toBeDefined();
    });
  });

  describe('POST /api/posts/:postId/messages', () => {
    it('should create a top-level message', async () => {
      mockAuthToken(mockAdmin);
      postsBuilder._result = { data: { id: 'p1', message_count: 3 }, error: null };
      const newMsg = { id: 'm3', post_id: 'p1', user_id: mockUser.id, content: 'New comment', depth: 0 };
      messagesBuilder._result = { data: newMsg, error: null };

      const res = await request(app)
        .post('/api/posts/p1/messages')
        .set('Authorization', 'Bearer test-token')
        .send({ content: 'New comment' });

      expect(res.status).toBe(201);
      expect(res.body.content).toBe('New comment');
    });

    it('should create a reply message', async () => {
      mockAuthToken(mockAdmin);
      postsBuilder._result = { data: { id: 'p1', message_count: 3 }, error: null };

      // First single() returns post, second returns parent message, third returns new message
      let callCount = 0;
      const parentMsg = { depth: 1, post_id: 'p1' };
      const newMsg = { id: 'm4', content: 'Reply', depth: 2, parent_message_id: 'm1' };

      postsBuilder.single.mockResolvedValue({ data: { id: 'p1', message_count: 3 }, error: null });
      messagesBuilder.single.mockImplementation(() => {
        callCount++;
        if (callCount === 1) return Promise.resolve({ data: parentMsg, error: null });
        return Promise.resolve({ data: newMsg, error: null });
      });

      const res = await request(app)
        .post('/api/posts/p1/messages')
        .set('Authorization', 'Bearer test-token')
        .send({ content: 'Reply', parent_message_id: '11111111-1111-1111-1111-111111111111' });

      expect(res.status).toBe(201);
    });

    it('should return 404 if post does not exist', async () => {
      mockAuthToken(mockAdmin);
      postsBuilder._result = { data: null, error: { message: 'not found' } };

      const res = await request(app)
        .post('/api/posts/p1/messages')
        .set('Authorization', 'Bearer test-token')
        .send({ content: 'New comment' });

      expect(res.status).toBe(404);
    });

    it('should return 400 for max nesting depth', async () => {
      mockAuthToken(mockAdmin);
      postsBuilder._result = { data: { id: 'p1', message_count: 3 }, error: null };
      messagesBuilder._result = { data: { depth: 5, post_id: 'p1' }, error: null };

      const res = await request(app)
        .post('/api/posts/p1/messages')
        .set('Authorization', 'Bearer test-token')
        .send({ content: 'Deep reply', parent_message_id: '11111111-1111-1111-1111-111111111111' });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('depth');
    });

    it('should return 401 without auth', async () => {
      const res = await request(app)
        .post('/api/posts/p1/messages')
        .send({ content: 'New comment' });

      expect(res.status).toBe(401);
    });
  });

  describe('PUT /api/messages/:id', () => {
    it('should update own message', async () => {
      mockAuthToken(mockAdmin);
      let callCount = 0;
      messagesBuilder.single.mockImplementation(() => {
        callCount++;
        if (callCount === 1) return Promise.resolve({ data: { user_id: mockUser.id, deleted: false }, error: null });
        return Promise.resolve({ data: { id: 'm1', content: 'Updated' }, error: null });
      });

      const res = await request(app)
        .put('/api/messages/m1')
        .set('Authorization', 'Bearer test-token')
        .send({ content: 'Updated content' });

      expect(res.status).toBe(200);
    });

    it('should return 403 for other user message', async () => {
      mockAuthToken(mockAdmin);
      messagesBuilder._result = { data: { user_id: 'other-user', deleted: false }, error: null };

      const res = await request(app)
        .put('/api/messages/m1')
        .set('Authorization', 'Bearer test-token')
        .send({ content: 'Updated content' });

      expect(res.status).toBe(403);
    });

    it('should return 400 for deleted message', async () => {
      mockAuthToken(mockAdmin);
      messagesBuilder._result = { data: { user_id: mockUser.id, deleted: true }, error: null };

      const res = await request(app)
        .put('/api/messages/m1')
        .set('Authorization', 'Bearer test-token')
        .send({ content: 'Updated content' });

      expect(res.status).toBe(400);
    });
  });

  describe('DELETE /api/messages/:id', () => {
    it('should soft-delete own message', async () => {
      mockAuthToken(mockAdmin);
      let callCount = 0;
      messagesBuilder.single.mockImplementation(() => {
        callCount++;
        if (callCount === 1) return Promise.resolve({ data: { user_id: mockUser.id }, error: null });
        return Promise.resolve({ data: { id: 'm1', deleted: true }, error: null });
      });

      const res = await request(app)
        .delete('/api/messages/m1')
        .set('Authorization', 'Bearer test-token');

      expect(res.status).toBe(200);
      expect(res.body.deleted).toBe(true);
    });

    it('should return 403 for other user message', async () => {
      mockAuthToken(mockAdmin);
      messagesBuilder._result = { data: { user_id: 'other-user' }, error: null };

      const res = await request(app)
        .delete('/api/messages/m1')
        .set('Authorization', 'Bearer test-token');

      expect(res.status).toBe(403);
    });
  });

  describe('POST /api/messages/:id/like', () => {
    it('should like a message', async () => {
      mockAuthToken(mockAdmin);
      messagesBuilder._result = { data: { id: 'm1', likes_count: 5 }, error: null };
      likesBuilder._result = { data: null, error: null };

      const res = await request(app)
        .post('/api/messages/m1/like')
        .set('Authorization', 'Bearer test-token');

      expect(res.status).toBe(201);
      expect(res.body.liked).toBe(true);
    });

    it('should return 404 for non-existent message', async () => {
      mockAuthToken(mockAdmin);
      messagesBuilder._result = { data: null, error: { message: 'not found' } };

      const res = await request(app)
        .post('/api/messages/nonexistent/like')
        .set('Authorization', 'Bearer test-token');

      expect(res.status).toBe(404);
    });
  });

  describe('DELETE /api/messages/:id/like', () => {
    it('should unlike a message', async () => {
      mockAuthToken(mockAdmin);
      likesBuilder._result = { data: null, error: null };
      messagesBuilder._result = { data: { likes_count: 4 }, error: null };

      const res = await request(app)
        .delete('/api/messages/m1/like')
        .set('Authorization', 'Bearer test-token');

      expect(res.status).toBe(200);
      expect(res.body.liked).toBe(false);
    });
  });
});
