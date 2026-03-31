/**
 * Chainable Supabase mock builder.
 * Создаёт mock-объект с fluent API: .from().select().eq().single()
 *
 * Использование:
 *   const mock = createSupabaseMock({
 *     user_access: { data: { access_type: "subscription", ... }, error: null }
 *   });
 */
import { vi } from "vitest";

interface MockResponse {
  data: unknown;
  error: { code?: string; message?: string } | null;
  count?: number;
}

type TableOverrides = Record<string, MockResponse>;

function createChainableQuery(response: MockResponse) {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {};

  // Все chainable методы возвращают chain (this-like)
  const chainMethods = [
    "select", "eq", "neq", "gt", "gte", "lt", "lte",
    "is", "in", "order", "limit", "range",
    "not", "or", "filter", "match",
  ];

  for (const method of chainMethods) {
    chain[method] = vi.fn().mockReturnValue(chain);
  }

  // Terminal методы — возвращают Promise с результатом
  chain.single = vi.fn().mockResolvedValue(response);
  chain.maybeSingle = vi.fn().mockResolvedValue(response);

  // Мутирующие методы — тоже chainable, но с terminal
  chain.insert = vi.fn().mockResolvedValue({ error: null });
  chain.upsert = vi.fn().mockResolvedValue({ error: null });
  chain.update = vi.fn().mockReturnValue(chain);
  chain.delete = vi.fn().mockReturnValue(chain);

  // select с count — используется как terminal (возвращает {count})
  const originalSelect = chain.select;
  chain.select = vi.fn((...args: unknown[]) => {
    // Если вызван с {count: "exact", head: true} — вернуть count
    if (typeof args[1] === "object" && args[1] !== null && "count" in (args[1] as Record<string, unknown>)) {
      return { ...chain, then: (resolve: (val: unknown) => void) => resolve({ count: response.count ?? 0, error: null }) };
    }
    return originalSelect(...args);
  });

  return chain;
}

export function createSupabaseMock(overrides: TableOverrides = {}) {
  const defaults: TableOverrides = {
    user_access: { data: null, error: { code: "PGRST116", message: "not found" } },
    payments: { data: null, error: null },
    jobs: { data: null, error: null },
  };

  const config = { ...defaults, ...overrides };

  return {
    from: vi.fn((table: string) => {
      const response = config[table] || { data: null, error: null };
      return createChainableQuery(response);
    }),
    rpc: vi.fn().mockResolvedValue({ data: 5, error: null }),
    auth: {
      admin: {
        getUserById: vi.fn().mockResolvedValue({
          data: { user: null },
          error: null,
        }),
      },
      getUser: vi.fn().mockResolvedValue({
        data: { user: null },
        error: null,
      }),
    },
  };
}
