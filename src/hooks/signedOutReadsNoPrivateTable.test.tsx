// @vitest-environment jsdom
/**
 * A signed-out reader never asks for a table the database refuses them.
 *
 * Evidence, the edit history (and `trash`, the recovery list over it) and audit
 * findings are for signed-in readers: `anon` holds no SELECT on any of them,
 * so a request for one fails for every visitor on every load, as a refused
 * request in the console. The fake client below refuses those four to a
 * signed-out reader, as the database does, and records every relation it is
 * asked for.
 *
 * Two surfaces read these while a board is open: the recovery-archive probe
 * behind the structure menus, and the cell panel's Evidence tab. Signed out,
 * neither sends its read; signed in, both still do.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, renderHook, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const supabase = vi.hoisted(() => ({
  client: null as unknown,
  signedIn: false,
}))

vi.mock('@/contexts/SupabaseProvider', () => ({
  useSupabase: () => ({
    client: supabase.client,
    configured: true,
    session: null,
    isLoading: false,
    canWrite: supabase.signedIn,
    isDevAuthoring: false,
    isEditPreview: false,
    canAgent: supabase.signedIn,
    canReadPrivate: supabase.signedIn,
  }),
}))

vi.mock('@/contexts/activeService', () => ({
  useActiveServiceId: () => 'svc-1',
}))

import { CellEvidenceTab } from '@/components/blueprint/CellEvidenceTab'
import { useArchiveAvailable } from '@/hooks/useArchiveAvailable'
import { QUERY_DEFAULTS } from '@/lib/queryClient'

const SIGNED_IN_ONLY = new Set(['evidence', 'trash', 'authoring_changes', 'audit_findings'])

/** Every relation asked for this test, in order. */
let named: string[] = []

function fakeSupabase() {
  return {
    from(table: string) {
      named.push(table)
      const denied = SIGNED_IN_ONLY.has(table) && !supabase.signedIn
      const result = denied
        ? { data: null, error: { message: `permission denied for table ${table}` } }
        : { data: [], error: null }
      const api: Record<string, unknown> = {
        then: (resolve: (value: unknown) => unknown) => Promise.resolve(result).then(resolve),
      }
      for (const verb of ['select', 'order', 'limit', 'eq', 'abortSignal']) {
        api[verb] = () => api
      }
      return api
    },
  }
}

function wrapper({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: QUERY_DEFAULTS } })}
    >
      {children}
    </QueryClientProvider>
  )
}

beforeEach(() => {
  named = []
  supabase.client = fakeSupabase()
})

afterEach(() => {
  cleanup()
})

describe('the recovery-archive probe', () => {
  it('is not sent for a signed-out reader, who has nothing to delete', async () => {
    supabase.signedIn = false
    const { result } = renderHook(() => useArchiveAvailable(), { wrapper })
    // Give a read the chance to go out before asserting none did.
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(result.current).toBe(false)
    expect(named).not.toContain('trash')
  })

  it('is sent for a signed-in reader and answers available', async () => {
    supabase.signedIn = true
    const { result } = renderHook(() => useArchiveAvailable(), { wrapper })
    await waitFor(() => expect(result.current).toBe(true))
    expect(named).toContain('trash')
  })
})

describe('the Evidence tab', () => {
  it('asks a signed-out reader to sign in and sends no evidence read', async () => {
    supabase.signedIn = false
    render(<CellEvidenceTab cellId="cell-1" />, { wrapper })
    expect(screen.getByText('Sign in to see the evidence behind this cell.')).toBeDefined()
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(named).not.toContain('evidence')
  })

  it('reads the evidence for a signed-in author', async () => {
    supabase.signedIn = true
    render(<CellEvidenceTab cellId="cell-1" />, { wrapper })
    await waitFor(() => expect(named).toContain('evidence'))
  })
})
