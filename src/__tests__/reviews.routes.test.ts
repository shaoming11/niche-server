import { createMockQueryBuilder, createMockSupabaseAdmin, mockUser, mockAuthToken, MockQueryBuilder } from './setup.js';

const mockAdmin = createMockSupabaseAdmin({});

jest.mock('../config/database', () => ({
  supabase: mockAdmin,
  supabaseAdmin: mockAdmin,
}));

import request from 'supertest';
import app from '../app.js';

describe('Review Routes', () => {
  let reviewsBuilder: MockQueryBuilder;
  let businessesBuilder: MockQueryBuilder;

  beforeEach(() => {
    jest.clearAllMocks();
    reviewsBuilder = createMockQueryBuilder();
    businessesBuilder = createMockQueryBuilder();
    mockAdmin.from.mockImplementation((table: string) => {
      if (table === 'reviews') return reviewsBuilder;
      if (table === 'businesses') return businessesBuilder;
      return createMockQueryBuilder();
    });
  });

  describe('POST /api/businesses/:businessId/reviews', () => {
    it('should create a review', async () => {
      mockAuthToken(mockAdmin);
      businessesBuilder._result = { data: { id: 'b1' }, error: null };

      let callCount = 0;
      reviewsBuilder.single.mockImplementation(() => {
        callCount++;
        if (callCount === 1) return Promise.resolve({ data: null, error: { code: 'PGRST116' } }); // no existing review
        return Promise.resolve({ data: { id: 'r1', rating: 5, comment: 'Great!', business_id: 'b1', user_id: mockUser.id }, error: null });
      });

      const res = await request(app)
        .post('/api/businesses/b1/reviews')
        .set('Authorization', 'Bearer test-token')
        .send({ rating: 5, comment: 'Great!' });

      expect(res.status).toBe(201);
    });

    it('should return 409 for duplicate review', async () => {
      mockAuthToken(mockAdmin);
      businessesBuilder._result = { data: { id: 'b1' }, error: null };
      reviewsBuilder._result = { data: { id: 'r-existing' }, error: null };

      const res = await request(app)
        .post('/api/businesses/b1/reviews')
        .set('Authorization', 'Bearer test-token')
        .send({ rating: 5, comment: 'Great!' });

      expect(res.status).toBe(409);
    });

    it('should return 404 for non-existent business', async () => {
      mockAuthToken(mockAdmin);
      businessesBuilder._result = { data: null, error: { message: 'not found' } };

      const res = await request(app)
        .post('/api/businesses/b1/reviews')
        .set('Authorization', 'Bearer test-token')
        .send({ rating: 5, comment: 'Great!' });

      expect(res.status).toBe(404);
    });

    it('should return 400 for invalid rating', async () => {
      mockAuthToken(mockAdmin);

      const res = await request(app)
        .post('/api/businesses/b1/reviews')
        .set('Authorization', 'Bearer test-token')
        .send({ rating: 6, comment: 'Great!' });

      expect(res.status).toBe(400);
    });

    it('should return 401 without auth', async () => {
      const res = await request(app)
        .post('/api/businesses/b1/reviews')
        .send({ rating: 5 });

      expect(res.status).toBe(401);
    });
  });

  describe('PUT /api/reviews/:id', () => {
    it('should update own review', async () => {
      mockAuthToken(mockAdmin);
      let callCount = 0;
      reviewsBuilder.single.mockImplementation(() => {
        callCount++;
        if (callCount === 1) return Promise.resolve({ data: { user_id: mockUser.id }, error: null });
        return Promise.resolve({ data: { id: 'r1', rating: 4, comment: 'Updated' }, error: null });
      });

      const res = await request(app)
        .put('/api/reviews/r1')
        .set('Authorization', 'Bearer test-token')
        .send({ rating: 4, comment: 'Updated' });

      expect(res.status).toBe(200);
    });

    it('should return 403 for other user review', async () => {
      mockAuthToken(mockAdmin);
      reviewsBuilder._result = { data: { user_id: 'other-user' }, error: null };

      const res = await request(app)
        .put('/api/reviews/r1')
        .set('Authorization', 'Bearer test-token')
        .send({ rating: 4 });

      expect(res.status).toBe(403);
    });

    it('should return 404 for non-existent review', async () => {
      mockAuthToken(mockAdmin);
      reviewsBuilder._result = { data: null, error: { message: 'not found' } };

      const res = await request(app)
        .put('/api/reviews/r1')
        .set('Authorization', 'Bearer test-token')
        .send({ rating: 4 });

      expect(res.status).toBe(404);
    });
  });

  describe('DELETE /api/reviews/:id', () => {
    it('should delete own review', async () => {
      mockAuthToken(mockAdmin);
      reviewsBuilder._result = { data: { user_id: mockUser.id }, error: null };

      const res = await request(app)
        .delete('/api/reviews/r1')
        .set('Authorization', 'Bearer test-token');

      expect(res.status).toBe(204);
    });

    it('should return 403 for other user review', async () => {
      mockAuthToken(mockAdmin);
      reviewsBuilder._result = { data: { user_id: 'other-user' }, error: null };

      const res = await request(app)
        .delete('/api/reviews/r1')
        .set('Authorization', 'Bearer test-token');

      expect(res.status).toBe(403);
    });
  });
});
