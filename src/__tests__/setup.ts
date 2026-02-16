// Shared mock setup for all tests

// Mock environment variables before any imports
process.env.SUPABASE_URL = 'https://test.supabase.co';
process.env.SUPABASE_ANON_KEY = 'test-anon-key';
process.env.SUPABASE_ADMIN_KEY = 'test-admin-key';
process.env.GEMINI_API_KEY = 'test-gemini-key';

// ---- Chainable Supabase query builder mock ----

export interface MockQueryBuilder {
  select: jest.Mock;
  insert: jest.Mock;
  update: jest.Mock;
  delete: jest.Mock;
  upsert: jest.Mock;
  eq: jest.Mock;
  neq: jest.Mock;
  is: jest.Mock;
  gte: jest.Mock;
  lte: jest.Mock;
  order: jest.Mock;
  range: jest.Mock;
  limit: jest.Mock;
  single: jest.Mock;
  textSearch: jest.Mock;
  rpc: jest.Mock;
  // Terminal result
  _result: { data: any; error: any; count?: number | null };
}

export function createMockQueryBuilder(defaultResult?: { data: any; error: any; count?: number | null }): MockQueryBuilder {
  const result = defaultResult || { data: null, error: null, count: null };

  const builder: any = {
    _result: result,
  };

  const chainMethods = [
    'select', 'insert', 'update', 'delete', 'upsert',
    'eq', 'neq', 'is', 'gte', 'lte',
    'order', 'range', 'limit', 'textSearch',
  ];

  for (const method of chainMethods) {
    builder[method] = jest.fn().mockReturnValue(builder);
  }

  // single() resolves the chain
  builder.single = jest.fn().mockImplementation(() => {
    return Promise.resolve(builder._result);
  });

  // Make the builder itself thenable (for queries without .single())
  builder.then = (resolve: any, reject: any) => {
    return Promise.resolve(builder._result).then(resolve, reject);
  };

  return builder;
}

// ---- Mock Supabase from() ----

export type FromMockMap = Record<string, MockQueryBuilder>;

export function createMockSupabaseAdmin(fromMap: FromMockMap) {
  return {
    from: jest.fn((table: string) => {
      if (fromMap[table]) return fromMap[table];
      // Return a default builder that resolves to null
      return createMockQueryBuilder({ data: null, error: null, count: null });
    }),
    rpc: jest.fn().mockResolvedValue({ data: null, error: null }),
    auth: {
      getUser: jest.fn(),
      signUp: jest.fn(),
      signInWithPassword: jest.fn(),
      signOut: jest.fn(),
      refreshSession: jest.fn(),
    },
  };
}

// ---- Auth helper ----

export const mockUser = {
  id: '11111111-1111-1111-1111-111111111111',
  email: 'test@example.com',
  aud: 'authenticated',
  role: 'authenticated',
  app_metadata: {},
  user_metadata: {},
  created_at: '2024-01-01T00:00:00Z',
};

export function mockAuthToken(mockSupabase: any) {
  mockSupabase.auth.getUser.mockResolvedValue({
    data: { user: mockUser },
    error: null,
  });
}
