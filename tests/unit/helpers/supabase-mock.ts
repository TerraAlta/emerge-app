/**
 * Minimal chainable fake of the Supabase client for component tests.
 * `tables[name]` is what `.single()/.maybeSingle()/await` resolves to for that
 * table; every call is recorded in `calls` so tests can assert on writes.
 */
import { vi } from 'vitest'

export type Result = { data: any; error: any }

export function makeSupabaseMock(opts: {
  user?: { id: string; email?: string } | null
  tables?: Record<string, Result | ((op: string, payload?: any, filters?: any[]) => Result | Promise<Result>)>
  upload?: () => Promise<{ error: any }>
}) {
  const calls: Array<{ table: string; op: string; payload?: any; filters: any[] }> = []
  function builder(table: string) {
    const state = { op: 'select', payload: undefined as any, filters: [] as any[] }
    const resolve = (): Promise<Result> => {
      calls.push({ table, op: state.op, payload: state.payload, filters: state.filters })
      const t = opts.tables?.[table]
      const r = typeof t === 'function' ? t(state.op, state.payload, state.filters) : t ?? { data: null, error: null }
      return Promise.resolve(r)
    }
    const b: any = {
      select: () => b, insert: (p: any) => { state.op = 'insert'; state.payload = p; return b },
      update: (p: any) => { state.op = 'update'; state.payload = p; return b },
      upsert: (p: any) => { state.op = 'upsert'; state.payload = p; return b },
      delete: () => { state.op = 'delete'; return b },
      eq: (...a: any[]) => { state.filters.push(['eq', ...a]); return b },
      neq: (...a: any[]) => { state.filters.push(['neq', ...a]); return b },
      in: () => b, is: () => b, order: () => b, limit: () => b, gte: () => b, lt: () => b, not: () => b, contains: () => b, ilike: () => b, or: () => b, range: () => b,
      single: resolve, maybeSingle: resolve,
      then: (ok: any, err: any) => resolve().then(ok, err),
    }
    return b
  }
  const client = {
    from: vi.fn((t: string) => builder(t)),
    rpc: vi.fn(async () => ({ data: [], error: null })),
    auth: {
      getUser: vi.fn(async () => ({ data: { user: opts.user ?? null }, error: null })),
      getSession: vi.fn(async () => ({ data: { session: opts.user ? { access_token: 't' } : null } })),
      onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: () => {} } } })),
      signOut: vi.fn(async () => ({ error: null })),
    },
    storage: {
      from: vi.fn(() => ({
        upload: vi.fn(opts.upload ?? (async () => ({ error: null }))),
        getPublicUrl: (p: string) => ({ data: { publicUrl: `https://cdn.test/${p}` } }),
      })),
    },
  }
  return { client, calls }
}
