import { createMockQueryBuilder, createMockSupabaseAdmin, mockUser, mockAuthToken, MockQueryBuilder } from './setup.js';

const mockAdmin = createMockSupabaseAdmin({});

jest.mock('../config/database', () => ({
  supabase: mockAdmin,
  supabaseAdmin: mockAdmin,
}));

import request from 'supertest';
import app from '../app.js';

describe('Bookmark Routes', () => {
  let bookmarksBuilder: MockQueryBuilder;
  let businessesBuilder: MockQueryBuilder;

  beforeEach(() => {
    jest.clearAllMocks();
    bookmarksBuilder = createMockQueryBuilder();
    businessesBuilder = createMockQueryBuilder();
    mockAdmin.from.mockImplementation((table: string) => {
      if (table === 'bookmarks') return bookmarksBuilder;
      if (table === 'businesses') return businessesBuilder;
      return createMockQueryBuilder();
    });
  });

  describe('POST /api/bookmarks', () => {
    it('should create a bookmark', async () => {
      mockAuthToken(mockAdmin);
      businessesBuilder._result = { data: { id: 'b1' }, error: null };
      bookmarksBuilder._result = { data: { user_id: mockUser.id, business_id: 'b1', created_at: '2024-01-01' }, error: null };

      const res = await request(app)
        .post('/api/bookmarks')
        .set('Authorization', 'Bearer test-token')
        .send({ business_id: 'b1' });

      expect(res.status).toBe(201);
      expect(res.body.business_id).toBe('b1');
    });

    it('should return 400 without business_id', async () => {
      mockAuthToken(mockAdmin);

      const res = await request(app)
        .post('/api/bookmarks')
        .set('Authorization', 'Bearer test-token')
        .send({});

      expect(res.status).toBe(400);
    });

    it('should return 404 for non-existent business', async () => {
      mockAuthToken(mockAdmin);
      businessesBuilder._result = { data: null, error: { message: 'not found' } };

      const res = await request(app)
        .post('/api/bookmarks')
        .set('Authorization', 'Bearer test-token')
        .send({ business_id: 'nonexistent' });

      expect(res.status).toBe(404);
    });

    it('should return 401 without auth', async () => {
      const res = await request(app)
        .post('/api/bookmarks')
        .send({ business_id: 'b1' });

      expect(res.status).toBe(401);
    });
  });

  describe('DELETE /api/bookmarks/:businessId', () => {
    it('should remove a bookmark', async () => {
      mockAuthToken(mockAdmin);
      bookmarksBuilder._result = { data: null, error: null };

      const res = await request(app)
        .delete('/api/bookmarks/b1')
        .set('Authorization', 'Bearer test-token');

      expect(res.status).toBe(204);
    });

    it('should return 401 without auth', async () => {
      const res = await request(app).delete('/api/bookmarks/b1');
      expect(res.status).toBe(401);
    });
  });
});
