import { createMockQueryBuilder, createMockSupabaseAdmin, mockUser, mockAuthToken, MockQueryBuilder } from './setup';

const mockAdmin = createMockSupabaseAdmin({});

jest.mock('../config/database', () => ({
  supabase: mockAdmin,
  supabaseAdmin: mockAdmin,
}));

import request from 'supertest';
import app from '../app';

describe('Deal Routes', () => {
  let dealsBuilder: MockQueryBuilder;

  beforeEach(() => {
    jest.clearAllMocks();
    dealsBuilder = createMockQueryBuilder();
    mockAdmin.from.mockImplementation((table: string) => {
      if (table === 'deals') return dealsBuilder;
      return createMockQueryBuilder();
    });
  });

  describe('GET /api/businesses/:businessId/deals', () => {
    it('should return active deals', async () => {
      const deals = [{ id: 'd1', title: '20% off', active: true }];
      dealsBuilder._result = { data: deals, error: null };

      const res = await request(app).get('/api/businesses/b1/deals');

      expect(res.status).toBe(200);
      expect(res.body.deals).toEqual(deals);
    });
  });

  describe('POST /api/businesses/:businessId/deals', () => {
    it('should create a deal when authenticated', async () => {
      mockAuthToken(mockAdmin);
      const deal = { id: 'd2', title: 'New Deal', business_id: 'b1' };
      dealsBuilder._result = { data: deal, error: null };

      const res = await request(app)
        .post('/api/businesses/b1/deals')
        .set('Authorization', 'Bearer test-token')
        .send({ title: 'New Deal', discount_percentage: 15 });

      expect(res.status).toBe(201);
      expect(res.body.title).toBe('New Deal');
    });

    it('should return 400 without title', async () => {
      mockAuthToken(mockAdmin);

      const res = await request(app)
        .post('/api/businesses/b1/deals')
        .set('Authorization', 'Bearer test-token')
        .send({ discount_percentage: 15 });

      expect(res.status).toBe(400);
    });

    it('should return 401 without auth', async () => {
      const res = await request(app)
        .post('/api/businesses/b1/deals')
        .send({ title: 'Deal' });

      expect(res.status).toBe(401);
    });
  });

  describe('PUT /api/deals/:id', () => {
    it('should update a deal', async () => {
      mockAuthToken(mockAdmin);
      const updated = { id: 'd1', title: 'Updated Deal' };
      dealsBuilder._result = { data: updated, error: null };

      const res = await request(app)
        .put('/api/deals/d1')
        .set('Authorization', 'Bearer test-token')
        .send({ title: 'Updated Deal' });

      expect(res.status).toBe(200);
      expect(res.body.title).toBe('Updated Deal');
    });

    it('should return 404 for non-existent deal', async () => {
      mockAuthToken(mockAdmin);
      dealsBuilder._result = { data: null, error: { message: 'not found' } };

      const res = await request(app)
        .put('/api/deals/nonexistent')
        .set('Authorization', 'Bearer test-token')
        .send({ title: 'Updated' });

      expect(res.status).toBe(404);
    });
  });

  describe('DELETE /api/deals/:id', () => {
    it('should delete a deal', async () => {
      mockAuthToken(mockAdmin);
      dealsBuilder._result = { data: null, error: null };

      const res = await request(app)
        .delete('/api/deals/d1')
        .set('Authorization', 'Bearer test-token');

      expect(res.status).toBe(204);
    });

    it('should return 401 without auth', async () => {
      const res = await request(app).delete('/api/deals/d1');
      expect(res.status).toBe(401);
    });
  });
});
