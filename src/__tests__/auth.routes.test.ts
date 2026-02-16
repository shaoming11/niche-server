import { createMockQueryBuilder, createMockSupabaseAdmin, mockUser, mockAuthToken } from './setup';

// Create mock admin before importing app
const profilesBuilder = createMockQueryBuilder();
const mockAdmin = createMockSupabaseAdmin({
  profiles: profilesBuilder,
});

jest.mock('../config/database', () => ({
  supabase: mockAdmin,
  supabaseAdmin: mockAdmin,
}));

import request from 'supertest';
import app from '../app';

describe('Auth Routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Reset the profiles builder result
    profilesBuilder._result = { data: null, error: null, count: null };
  });

  // ---- POST /api/auth/register ----

  describe('POST /api/auth/register', () => {
    const validBody = {
      email: 'newuser@example.com',
      password: 'securePassword123',
      username: 'newuser',
      name: 'New User',
    };

    it('should register a new user and return 201', async () => {
      // Username check: not taken
      profilesBuilder._result = { data: null, error: null, count: null };

      // signUp returns new user
      mockAdmin.auth.signUp.mockResolvedValue({
        data: {
          user: { id: 'new-user-id', email: validBody.email },
          session: { access_token: 'token123', refresh_token: 'refresh123' },
        },
        error: null,
      });

      const res = await request(app)
        .post('/api/auth/register')
        .send(validBody);

      expect(res.status).toBe(201);
      expect(res.body.user).toEqual({
        id: 'new-user-id',
        email: validBody.email,
        username: validBody.username,
      });
      expect(res.body.session).toBeDefined();
      expect(res.body.session.access_token).toBe('token123');
      expect(mockAdmin.auth.signUp).toHaveBeenCalledWith({
        email: validBody.email,
        password: validBody.password,
      });
      // Profile insert should have been called
      expect(profilesBuilder.insert).toHaveBeenCalledWith({
        id: 'new-user-id',
        username: validBody.username,
        name: validBody.name,
      });
    });

    it('should return 409 when username is already taken', async () => {
      // Username check: taken
      profilesBuilder._result = {
        data: { id: 'existing-user-id' },
        error: null,
        count: null,
      };

      const res = await request(app)
        .post('/api/auth/register')
        .send(validBody);

      expect(res.status).toBe(409);
      expect(res.body.error).toBe('Username already taken');
      expect(mockAdmin.auth.signUp).not.toHaveBeenCalled();
    });

    it('should return 400 when validation fails (missing fields)', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({ email: 'bad-email' });

      expect(res.status).toBe(400);
      expect(res.body.errors).toBeDefined();
      expect(res.body.errors.length).toBeGreaterThan(0);
    });
  });

  // ---- POST /api/auth/login ----

  describe('POST /api/auth/login', () => {
    const loginBody = {
      email: 'test@example.com',
      password: 'securePassword123',
    };

    it('should login successfully and return user and session', async () => {
      mockAdmin.auth.signInWithPassword.mockResolvedValue({
        data: {
          user: mockUser,
          session: { access_token: 'access123', refresh_token: 'refresh123' },
        },
        error: null,
      });

      const res = await request(app)
        .post('/api/auth/login')
        .send(loginBody);

      expect(res.status).toBe(200);
      expect(res.body.user).toBeDefined();
      expect(res.body.user.id).toBe(mockUser.id);
      expect(res.body.session).toBeDefined();
      expect(mockAdmin.auth.signInWithPassword).toHaveBeenCalledWith({
        email: loginBody.email,
        password: loginBody.password,
      });
    });

    it('should return 401 for invalid credentials', async () => {
      mockAdmin.auth.signInWithPassword.mockResolvedValue({
        data: { user: null, session: null },
        error: { message: 'Invalid login credentials' },
      });

      const res = await request(app)
        .post('/api/auth/login')
        .send(loginBody);

      expect(res.status).toBe(401);
      expect(res.body.error).toBe('Invalid credentials');
    });
  });

  // ---- POST /api/auth/logout ----

  describe('POST /api/auth/logout', () => {
    it('should logout successfully when authenticated', async () => {
      mockAuthToken(mockAdmin);
      mockAdmin.auth.signOut.mockResolvedValue({ error: null });

      const res = await request(app)
        .post('/api/auth/logout')
        .set('Authorization', 'Bearer valid-token');

      expect(res.status).toBe(200);
      expect(res.body.message).toBe('Logged out successfully');
      expect(mockAdmin.auth.signOut).toHaveBeenCalled();
    });

    it('should return 401 when not authenticated', async () => {
      const res = await request(app)
        .post('/api/auth/logout');

      expect(res.status).toBe(401);
      expect(res.body.error).toBe('Authentication required');
    });
  });

  // ---- GET /api/auth/verify ----

  describe('GET /api/auth/verify', () => {
    it('should return user when authenticated', async () => {
      mockAuthToken(mockAdmin);

      const res = await request(app)
        .get('/api/auth/verify')
        .set('Authorization', 'Bearer valid-token');

      expect(res.status).toBe(200);
      expect(res.body.user).toBeDefined();
      expect(res.body.user.id).toBe(mockUser.id);
      expect(res.body.user.email).toBe(mockUser.email);
    });

    it('should return 401 when no token is provided', async () => {
      const res = await request(app)
        .get('/api/auth/verify');

      expect(res.status).toBe(401);
      expect(res.body.error).toBe('Authentication required');
    });

    it('should return 401 when token is invalid', async () => {
      mockAdmin.auth.getUser.mockResolvedValue({
        data: { user: null },
        error: { message: 'invalid token' },
      });

      const res = await request(app)
        .get('/api/auth/verify')
        .set('Authorization', 'Bearer invalid-token');

      expect(res.status).toBe(401);
      expect(res.body.error).toBe('Invalid token');
    });
  });

  // ---- POST /api/auth/refresh ----

  describe('POST /api/auth/refresh', () => {
    it('should refresh session with a valid refresh token', async () => {
      mockAdmin.auth.refreshSession.mockResolvedValue({
        data: {
          session: { access_token: 'new-access', refresh_token: 'new-refresh' },
        },
        error: null,
      });

      const res = await request(app)
        .post('/api/auth/refresh')
        .send({ refresh_token: 'valid-refresh-token' });

      expect(res.status).toBe(200);
      expect(res.body.session).toBeDefined();
      expect(res.body.session.access_token).toBe('new-access');
      expect(mockAdmin.auth.refreshSession).toHaveBeenCalledWith({
        refresh_token: 'valid-refresh-token',
      });
    });

    it('should return 400 when refresh token is missing', async () => {
      const res = await request(app)
        .post('/api/auth/refresh')
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Refresh token required');
      expect(mockAdmin.auth.refreshSession).not.toHaveBeenCalled();
    });

    it('should return 401 when refresh token is invalid', async () => {
      mockAdmin.auth.refreshSession.mockResolvedValue({
        data: { session: null },
        error: { message: 'Token expired' },
      });

      const res = await request(app)
        .post('/api/auth/refresh')
        .send({ refresh_token: 'expired-token' });

      expect(res.status).toBe(401);
      expect(res.body.error).toBe('Invalid refresh token');
    });
  });
});
