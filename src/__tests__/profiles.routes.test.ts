import { createMockQueryBuilder, createMockSupabaseAdmin, mockUser, mockAuthToken, MockQueryBuilder } from './setup.js';

const mockAdmin = createMockSupabaseAdmin({});

jest.mock('../config/database', () => ({
  supabase: mockAdmin,
  supabaseAdmin: mockAdmin,
}));

import request from 'supertest';
import app from '../app.js';

describe('Profile Routes', () => {
  let profilesBuilder: MockQueryBuilder;
  let postsBuilder: MockQueryBuilder;
  let bookmarksBuilder: MockQueryBuilder;

  beforeEach(() => {
    jest.clearAllMocks();
    profilesBuilder = createMockQueryBuilder();
    postsBuilder = createMockQueryBuilder();
    bookmarksBuilder = createMockQueryBuilder();

    mockAdmin.from.mockImplementation((table: string) => {
      if (table === 'profiles') return profilesBuilder;
      if (table === 'posts') return postsBuilder;
      if (table === 'bookmarks') return bookmarksBuilder;
      return createMockQueryBuilder();
    });
  });

  // ---------- GET /api/profiles/:id ----------

  describe('GET /api/profiles/:id', () => {
    const profileData = {
      id: mockUser.id,
      username: 'johndoe',
      name: 'John Doe',
      bio: 'Food enthusiast',
      interests: ['pizza', 'sushi'],
      profile_picture_url: null,
      created_at: '2024-01-01T00:00:00Z',
    };

    it('should return a profile when found', async () => {
      profilesBuilder._result = { data: profileData, error: null };

      const res = await request(app).get(`/api/profiles/${mockUser.id}`);

      expect(res.status).toBe(200);
      expect(res.body).toEqual(profileData);
      expect(mockAdmin.from).toHaveBeenCalledWith('profiles');
      expect(profilesBuilder.select).toHaveBeenCalled();
      expect(profilesBuilder.eq).toHaveBeenCalledWith('id', mockUser.id);
      expect(profilesBuilder.single).toHaveBeenCalled();
    });

    it('should return 404 when profile is not found', async () => {
      profilesBuilder._result = { data: null, error: { message: 'Not found' } };

      const res = await request(app).get('/api/profiles/22222222-2222-2222-2222-222222222222');

      expect(res.status).toBe(404);
      expect(res.body).toEqual({ error: 'Profile not found' });
    });
  });

  // ---------- PUT /api/profiles/:id ----------

  describe('PUT /api/profiles/:id', () => {
    const updatedProfile = {
      id: mockUser.id,
      username: 'johndoe',
      name: 'John Updated',
      bio: 'New bio',
      interests: ['tacos'],
      profile_picture_url: null,
      created_at: '2024-01-01T00:00:00Z',
    };

    it('should update own profile successfully', async () => {
      mockAuthToken(mockAdmin);
      profilesBuilder._result = { data: updatedProfile, error: null };

      const res = await request(app)
        .put(`/api/profiles/${mockUser.id}`)
        .set('Authorization', 'Bearer test-token')
        .send({ name: 'John Updated', bio: 'New bio', interests: ['tacos'] });

      expect(res.status).toBe(200);
      expect(res.body).toEqual(updatedProfile);
      expect(profilesBuilder.update).toHaveBeenCalledWith({
        name: 'John Updated',
        bio: 'New bio',
        interests: ['tacos'],
      });
      expect(profilesBuilder.eq).toHaveBeenCalledWith('id', mockUser.id);
      expect(profilesBuilder.single).toHaveBeenCalled();
    });

    it('should return 403 when updating another user\'s profile', async () => {
      mockAuthToken(mockAdmin);

      const otherId = '22222222-2222-2222-2222-222222222222';
      const res = await request(app)
        .put(`/api/profiles/${otherId}`)
        .set('Authorization', 'Bearer test-token')
        .send({ name: 'Hacker' });

      expect(res.status).toBe(403);
      expect(res.body).toEqual({ error: "Cannot update another user's profile" });
    });

    it('should return 401 when not authenticated', async () => {
      const res = await request(app)
        .put(`/api/profiles/${mockUser.id}`)
        .send({ name: 'No Auth' });

      expect(res.status).toBe(401);
      expect(res.body).toEqual({ error: 'Authentication required' });
    });
  });

  // ---------- GET /api/profiles/:id/posts ----------

  describe('GET /api/profiles/:id/posts', () => {
    const postsData = [
      {
        id: 'post-1',
        title: 'Great pizza',
        content: 'Loved the margherita...',
        ai_summary: null,
        message_count: 5,
        last_activity_at: '2024-01-15T10:30:00Z',
        created_at: '2024-01-10T08:00:00Z',
        business: { id: 'biz-1', name: 'Pizza Palace', category: 'restaurant' },
      },
    ];

    it('should return paginated posts for a user', async () => {
      // The route makes two calls to .from('posts'):
      // 1. count query
      // 2. data query
      // Both go through the same postsBuilder since mockAdmin.from returns it.
      // The count query uses the thenable (no .single()), the data query also uses thenable.
      postsBuilder._result = { data: postsData, error: null, count: 1 };

      const res = await request(app).get(`/api/profiles/${mockUser.id}/posts?page=1&limit=10`);

      expect(res.status).toBe(200);
      expect(res.body.posts).toEqual(postsData);
      expect(res.body.pagination).toEqual({
        page: 1,
        limit: 10,
        total: 1,
        totalPages: 1,
      });
      expect(mockAdmin.from).toHaveBeenCalledWith('posts');
      expect(postsBuilder.eq).toHaveBeenCalledWith('creator_id', mockUser.id);
      expect(postsBuilder.order).toHaveBeenCalledWith('created_at', { ascending: false });
    });

    it('should use default pagination when no params provided', async () => {
      postsBuilder._result = { data: [], error: null, count: 0 };

      const res = await request(app).get(`/api/profiles/${mockUser.id}/posts`);

      expect(res.status).toBe(200);
      expect(res.body.pagination).toEqual({
        page: 1,
        limit: 20,
        total: 0,
        totalPages: 0,
      });
    });
  });

  // ---------- GET /api/profiles/:id/bookmarks ----------

  describe('GET /api/profiles/:id/bookmarks', () => {
    const bookmarksData = [
      {
        created_at: '2024-01-15T10:30:00Z',
        business: {
          id: 'biz-1',
          name: 'Pizza Palace',
          category: 'restaurant',
          average_rating: 4.5,
        },
      },
    ];

    it('should return bookmarks for the authenticated user', async () => {
      mockAuthToken(mockAdmin);
      bookmarksBuilder._result = { data: bookmarksData, error: null, count: 1 };

      const res = await request(app)
        .get(`/api/profiles/${mockUser.id}/bookmarks?page=1&limit=20`)
        .set('Authorization', 'Bearer test-token');

      expect(res.status).toBe(200);
      expect(res.body.bookmarks).toEqual([
        {
          business: bookmarksData[0]?.business,
          bookmarked_at: '2024-01-15T10:30:00Z',
        },
      ]);
      expect(res.body.pagination).toEqual({
        page: 1,
        limit: 20,
        total: 1,
        totalPages: 1,
      });
      expect(mockAdmin.from).toHaveBeenCalledWith('bookmarks');
      expect(bookmarksBuilder.eq).toHaveBeenCalledWith('user_id', mockUser.id);
    });

    it('should return 403 when viewing another user\'s bookmarks', async () => {
      mockAuthToken(mockAdmin);

      const otherId = '22222222-2222-2222-2222-222222222222';
      const res = await request(app)
        .get(`/api/profiles/${otherId}/bookmarks`)
        .set('Authorization', 'Bearer test-token');

      expect(res.status).toBe(403);
      expect(res.body).toEqual({ error: "Cannot view another user's bookmarks" });
    });

    it('should return 401 when not authenticated', async () => {
      const res = await request(app)
        .get(`/api/profiles/${mockUser.id}/bookmarks`);

      expect(res.status).toBe(401);
      expect(res.body).toEqual({ error: 'Authentication required' });
    });
  });
});
