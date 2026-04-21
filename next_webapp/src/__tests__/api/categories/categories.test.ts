/**
 * @jest-environment node
 *
 * Tests for categories API endpoints:
 * - POST /api/categories (Create category)
 * - GET /api/categories (Fetch all + filtering)
 * - PUT /api/categories/[id] (Update category)
 * - DELETE /api/categories/[id] (Delete category)
 *
 * All Supabase calls are mocked — no real DB work happens here.
 */

// ─── Mocks ──────────────────────────────────────────────────────────────────

jest.mock('next/server', () => ({
  NextResponse: {
    json: jest.fn().mockImplementation((body: unknown, init?: { status?: number }) => ({
      status: init?.status ?? 200,
      json: jest.fn().mockResolvedValue(body),
      _body: body,
    })),
  },
}));

jest.mock('@/library/supabaseClient', () => ({
  supabase: { from: jest.fn() },
}));

jest.mock('../../../app/api/library/errorResponse', () => ({
  errorResponse: jest.fn().mockImplementation((message: string, status: number, code: string) => ({
    status,
    json: jest.fn().mockResolvedValue({ success: false, message, code }),
    _body: { success: false, message, code },
  })),
}));

jest.mock('../../../app/api/library/auth', () => ({
  getAuthUser: jest.fn(),
}));

jest.mock('../../../models/Category', () => ({
  validateCreateCategory: jest.fn(),
  validateUpdateCategory: jest.fn(),
  sanitizeCategoryInput: jest.fn().mockImplementation((data: any) => data),
}));

// ─── Imports ─────────────────────────────────────────────────────────────────

import { POST, GET } from '../../../app/api/categories/route';
import { PUT, DELETE } from '../../../app/api/categories/[id]/route';
import { supabase } from '../../../library/supabaseClient';
import { getAuthUser } from '../../../app/api/library/auth';
import { validateCreateCategory, validateUpdateCategory } from '../../../models/Category';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeRequest(body?: object, headers?: Record<string, string>, url = 'http://localhost:3000/api/categories') {
  const headersMap = new Map(Object.entries(headers ?? {}));
  return {
    headers: { get: (key: string) => headersMap.get(key) ?? null },
    json: jest.fn().mockResolvedValue(body ?? {}),
    url,
  } as any;
}

function makeChain(result: { data: unknown; error: unknown; count?: number }) {
  const chain: Record<string, jest.Mock> = {};
  chain.select     = jest.fn().mockReturnValue(chain);
  chain.insert     = jest.fn().mockReturnValue(chain);
  chain.update     = jest.fn().mockReturnValue(chain);
  chain.delete     = jest.fn().mockReturnValue(chain);
  chain.eq         = jest.fn().mockReturnValue(chain);
  chain.neq        = jest.fn().mockReturnValue(chain);
  chain.ilike      = jest.fn().mockReturnValue(chain);
  chain.order      = jest.fn().mockReturnValue(chain);
  chain.single     = jest.fn().mockResolvedValue(result);
  chain.maybeSingle = jest.fn().mockResolvedValue({ data: null, error: null });
  // For queries that resolve directly (no .single())
  Object.defineProperty(chain, 'then', {
    get: () => Promise.resolve(result).then.bind(Promise.resolve(result)),
  });
  return chain;
}

// Mock data
const MOCK_CATEGORY = {
  id: 1,
  category_name: 'Technology',
  description: 'Tech related use cases',
  created_at: '2026-03-22T11:09:32.253182+00:00',
  updated_at: null,
  created_by: 9,
};

const MOCK_USER = { id: 9, email: 'admin@test.com', role_id: 1 };

// Admin headers
const ADMIN_HEADERS = { 'x-user-id': '9', 'x-user-role-id': '1', 'x-user-role': 'admin' };
const USER_HEADERS  = { 'x-user-id': '9', 'x-user-role-id': '2', 'x-user-role': 'user' };

// ─── Tests: POST /api/categories ─────────────────────────────────────────────

describe('POST /api/categories', () => {

  beforeEach(() => {
    jest.clearAllMocks();
    (validateCreateCategory as jest.Mock).mockReturnValue(null); // no validation error by default
  });

  test('valid category creation by admin → 201 success', async () => {
    (getAuthUser as jest.Mock).mockReturnValue({ userId: 9, isAuthenticated: true, isAdmin: true });

    (supabase.from as jest.Mock).mockImplementation((table: string) => {
      if (table === 'categories') {
        const chain = makeChain({ data: MOCK_CATEGORY, error: null });
        chain.maybeSingle = jest.fn().mockResolvedValue({ data: null, error: null }); // no duplicate
        return chain;
      }
      if (table === 'user') return makeChain({ data: MOCK_USER, error: null });
      return makeChain({ data: null, error: null });
    });

    const res = await POST(makeRequest({ category_name: 'Technology', description: 'Tech use cases' }, ADMIN_HEADERS));
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.success).toBe(true);
    expect(body.message).toBe('Category created successfully');
  });

  test('non-admin user → 403 forbidden', async () => {
    (getAuthUser as jest.Mock).mockReturnValue({ userId: 9, isAuthenticated: true, isAdmin: false });

    const res = await POST(makeRequest({ category_name: 'Technology' }, USER_HEADERS));
    const body = await res.json();

    expect(res.status).toBe(403);
    expect(body.code).toBe('FORBIDDEN');
  });

  test('unauthenticated user → 401 unauthorized', async () => {
    (getAuthUser as jest.Mock).mockReturnValue({ userId: null, isAuthenticated: false, isAdmin: false });

    const res = await POST(makeRequest({ category_name: 'Technology' }));
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body.code).toBe('UNAUTHORIZED');
  });

  test('validation error (empty category name) → 400', async () => {
    (getAuthUser as jest.Mock).mockReturnValue({ userId: 9, isAuthenticated: true, isAdmin: true });
    (validateCreateCategory as jest.Mock).mockReturnValue('Category name is required');

    const res = await POST(makeRequest({ category_name: '' }, ADMIN_HEADERS));
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.code).toBe('VALIDATION_ERROR');
  });

  test('duplicate category name → 400', async () => {
    (getAuthUser as jest.Mock).mockReturnValue({ userId: 9, isAuthenticated: true, isAdmin: true });

    (supabase.from as jest.Mock).mockImplementation((table: string) => {
      if (table === 'categories') {
        const chain = makeChain({ data: MOCK_CATEGORY, error: null });
        chain.maybeSingle = jest.fn().mockResolvedValue({ data: { id: 1 }, error: null }); // duplicate found
        return chain;
      }
      return makeChain({ data: null, error: null });
    });

    const res = await POST(makeRequest({ category_name: 'Technology' }, ADMIN_HEADERS));
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.code).toBe('DUPLICATE_CATEGORY');
  });

  test('DB insert error → 500', async () => {
    (getAuthUser as jest.Mock).mockReturnValue({ userId: 9, isAuthenticated: true, isAdmin: true });

    (supabase.from as jest.Mock).mockImplementation((table: string) => {
      if (table === 'categories') {
        const chain = makeChain({ data: null, error: { message: 'DB error' } });
        chain.maybeSingle = jest.fn().mockResolvedValue({ data: null, error: null });
        return chain;
      }
      return makeChain({ data: null, error: null });
    });

    const res = await POST(makeRequest({ category_name: 'Technology' }, ADMIN_HEADERS));
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body.success).toBe(false);
  });

});

// ─── Tests: GET /api/categories ──────────────────────────────────────────────

describe('GET /api/categories', () => {

  beforeEach(() => jest.clearAllMocks());

  test('fetch all categories → 200 success', async () => {
    (getAuthUser as jest.Mock).mockReturnValue({ userId: 9, isAuthenticated: true, isAdmin: true });

    const categories = [MOCK_CATEGORY, { ...MOCK_CATEGORY, id: 2, category_name: 'Health' }];

    (supabase.from as jest.Mock).mockImplementation(() => {
      const chain: any = {};
      chain.select = jest.fn().mockReturnValue(chain);
      chain.order  = jest.fn().mockReturnValue(chain);
      chain.ilike  = jest.fn().mockReturnValue(chain);
      // Resolve the query directly
      chain.then   = undefined;
      jest.spyOn(chain, 'order').mockResolvedValue({ data: categories, error: null });
      return chain;
    });

    const res = await GET(makeRequest(undefined, ADMIN_HEADERS));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
  });

  test('unauthenticated request → 401', async () => {
    (getAuthUser as jest.Mock).mockReturnValue({ userId: null, isAuthenticated: false, isAdmin: false });

    const res = await GET(makeRequest(undefined, {}));
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body.code).toBe('UNAUTHORIZED');
  });

  test('fetch with search filter → 200 filtered results', async () => {
    (getAuthUser as jest.Mock).mockReturnValue({ userId: 9, isAuthenticated: true, isAdmin: true });

    (supabase.from as jest.Mock).mockImplementation(() => {
      const chain: any = {};
      chain.select = jest.fn().mockReturnValue(chain);
      chain.order  = jest.fn().mockReturnValue(chain);
      chain.ilike  = jest.fn().mockResolvedValue({ data: [MOCK_CATEGORY], error: null });
      return chain;
    });

    const res = await GET(makeRequest(
      undefined,
      ADMIN_HEADERS,
      'http://localhost:3000/api/categories?search=tech'
    ));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
  });

});

// ─── Tests: PUT /api/categories/[id] ─────────────────────────────────────────

describe('PUT /api/categories/[id]', () => {

  beforeEach(() => {
    jest.clearAllMocks();
    (validateUpdateCategory as jest.Mock).mockReturnValue(null);
  });

  test('valid update by admin → 200 success', async () => {
    (getAuthUser as jest.Mock).mockReturnValue({ userId: 9, isAdmin: true });

    (supabase.from as jest.Mock).mockImplementation((table: string) => {
      if (table === 'categories') {
        const chain = makeChain({ data: MOCK_CATEGORY, error: null });
        chain.maybeSingle = jest.fn().mockResolvedValue({ data: null, error: null });
        return chain;
      }
      if (table === 'user') return makeChain({ data: MOCK_USER, error: null });
      return makeChain({ data: null, error: null });
    });

    const res = await PUT(
      makeRequest({ category_name: 'Updated Tech' }, ADMIN_HEADERS),
      { params: { id: '1' } }
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.message).toBe('Category updated successfully');
  });

  test('non-admin → 403 forbidden', async () => {
    (getAuthUser as jest.Mock).mockReturnValue({ userId: 9, isAdmin: false });

    const res = await PUT(
      makeRequest({ category_name: 'Updated' }, USER_HEADERS),
      { params: { id: '1' } }
    );
    const body = await res.json();

    expect(res.status).toBe(403);
    expect(body.code).toBe('FORBIDDEN');
  });

  test('unauthenticated → 401', async () => {
    (getAuthUser as jest.Mock).mockReturnValue({ userId: null, isAdmin: false });

    const res = await PUT(
      makeRequest({ category_name: 'Updated' }, {}),
      { params: { id: '1' } }
    );
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body.code).toBe('UNAUTHORIZED');
  });

  test('invalid ID → 400', async () => {
    (getAuthUser as jest.Mock).mockReturnValue({ userId: 9, isAdmin: true });

    const res = await PUT(
      makeRequest({ category_name: 'Updated' }, ADMIN_HEADERS),
      { params: { id: 'abc' } }
    );
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.code).toBe('INVALID_ID');
  });

  test('validation error → 400', async () => {
    (getAuthUser as jest.Mock).mockReturnValue({ userId: 9, isAdmin: true });
    (validateUpdateCategory as jest.Mock).mockReturnValue('Category name cannot be empty');

    const res = await PUT(
      makeRequest({ category_name: '' }, ADMIN_HEADERS),
      { params: { id: '1' } }
    );
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.code).toBe('VALIDATION_ERROR');
  });

  test('category not found → 404', async () => {
    (getAuthUser as jest.Mock).mockReturnValue({ userId: 9, isAdmin: true });

    (supabase.from as jest.Mock).mockImplementation(() =>
      makeChain({ data: null, error: { code: 'PGRST116', message: 'Not found' } })
    );

    const res = await PUT(
      makeRequest({ category_name: 'Updated' }, ADMIN_HEADERS),
      { params: { id: '999' } }
    );
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body.code).toBe('NOT_FOUND');
  });

  test('duplicate category name → 400', async () => {
    (getAuthUser as jest.Mock).mockReturnValue({ userId: 9, isAdmin: true });

    (supabase.from as jest.Mock).mockImplementation((table: string) => {
      if (table === 'categories') {
        const chain = makeChain({ data: MOCK_CATEGORY, error: null });
        chain.maybeSingle = jest.fn().mockResolvedValue({ data: { id: 2 }, error: null }); // duplicate
        return chain;
      }
      return makeChain({ data: null, error: null });
    });

    const res = await PUT(
      makeRequest({ category_name: 'Health' }, ADMIN_HEADERS),
      { params: { id: '1' } }
    );
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.code).toBe('DUPLICATE_CATEGORY');
  });

});

// ─── Tests: DELETE /api/categories/[id] ──────────────────────────────────────

describe('DELETE /api/categories/[id]', () => {

  beforeEach(() => jest.clearAllMocks());

  test('valid delete by admin → 200 success', async () => {
    (getAuthUser as jest.Mock).mockReturnValue({ userId: 9, isAdmin: true });

    (supabase.from as jest.Mock).mockImplementation((table: string) => {
      if (table === 'categories') return makeChain({ data: MOCK_CATEGORY, error: null });
      if (table === 'usecases') return makeChain({ data: [], error: null, count: 0 });
      return makeChain({ data: null, error: null });
    });

    const res = await DELETE(
      makeRequest(undefined, ADMIN_HEADERS),
      { params: { id: '1' } }
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.message).toBe('Category deleted successfully');
  });

  test('non-admin → 403 forbidden', async () => {
    (getAuthUser as jest.Mock).mockReturnValue({ userId: 9, isAdmin: false });

    const res = await DELETE(
      makeRequest(undefined, USER_HEADERS),
      { params: { id: '1' } }
    );
    const body = await res.json();

    expect(res.status).toBe(403);
    expect(body.code).toBe('FORBIDDEN');
  });

  test('unauthenticated → 401', async () => {
    (getAuthUser as jest.Mock).mockReturnValue({ userId: null, isAdmin: false });

    const res = await DELETE(
      makeRequest(undefined, {}),
      { params: { id: '1' } }
    );
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body.code).toBe('UNAUTHORIZED');
  });

  test('invalid ID → 400', async () => {
    (getAuthUser as jest.Mock).mockReturnValue({ userId: 9, isAdmin: true });

    const res = await DELETE(
      makeRequest(undefined, ADMIN_HEADERS),
      { params: { id: 'abc' } }
    );
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.code).toBe('INVALID_ID');
  });

  test('category not found → 404', async () => {
    (getAuthUser as jest.Mock).mockReturnValue({ userId: 9, isAdmin: true });

    (supabase.from as jest.Mock).mockImplementation(() =>
      makeChain({ data: null, error: { message: 'Not found' } })
    );

    const res = await DELETE(
      makeRequest(undefined, ADMIN_HEADERS),
      { params: { id: '999' } }
    );
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body.code).toBe('CATEGORY_NOT_FOUND');
  });

  test('category in use by use cases → 400', async () => {
    (getAuthUser as jest.Mock).mockReturnValue({ userId: 9, isAdmin: true });

    (supabase.from as jest.Mock).mockImplementation((table: string) => {
      if (table === 'categories') return makeChain({ data: MOCK_CATEGORY, error: null });
      if (table === 'usecases') return makeChain({ data: [], error: null, count: 3 }); // 3 use cases using this category
      return makeChain({ data: null, error: null });
    });

    const res = await DELETE(
      makeRequest(undefined, ADMIN_HEADERS),
      { params: { id: '1' } }
    );
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.code).toBe('CATEGORY_IN_USE');
  });

});
