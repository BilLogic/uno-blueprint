// @vitest-environment jsdom
/**
 * The read lifetime, asserted through the hook that owns it.
 *
 * `readLifetime.test.ts` covers the pieces — the deadline and the retry
 * policy. This file covers the thing those pieces were assembled for: a read
 * whose consumer has gone away is CANCELLED, not merely ignored. That the
 * fetcher is handed an `AbortSignal` is a fact the type already states and no
 * test needs to repeat; that abandoning the read ENDS it is behaviour, and it
 * is what these cases fail on.
 *
 * Every fetcher here answers only when it is cancelled, which is the shape of
 * the slow request the feature exists for. Against a wrapper that hands the
 * fetcher no signal, they never answer at all — so a regression reads as "the
 * abandoned read was never cancelled" rather than as a type error somewhere
 * further up.
 */
import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useSupabaseQuery } from '@/hooks/useSupabaseQuery'
import { QUERY_DEFAULTS } from '@/lib/queryClient'
import type { Database } from '@/types/database'
import type { SupabaseClient } from '@supabase/supabase-js'

const supabase = vi.hoisted(() => ({ configured: true }))

vi.mock('@/contexts/SupabaseProvider', () => ({
  useSupabase: () => ({
    client: supabase.configured ? ({} as SupabaseClient<Database>) : null,
    configured: supabase.configured,
  }),
}))

/**
 * A request that answers only when its signal fires.
 *
 * The signal is typed optional on purpose: this is the one place where being
 * handed nothing must produce a hanging read rather than a thrown error, so
 * that the assertion which fails is the one about cancellation.
 */
function cancellable(signal: AbortSignal | undefined): Promise<never> {
  return new Promise((_resolve, reject) => {
    signal?.addEventListener('abort', () => reject(new Error('aborted')))
  })
}

/** Stable, as every caller's fallback must be. */
const noFallback = () => null

function wrapper({ children }: { children: ReactNode }) {
  // A client of its own per case, on the app's own read policy: the module
  // singleton is shared with every other suite in the run.
  const client = new QueryClient({ defaultOptions: { queries: QUERY_DEFAULTS } })
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

afterEach(() => {
  supabase.configured = true
})

describe('useSupabaseQuery (read lifetime)', () => {
  it('cancels the read when its consumer leaves', async () => {
    let started = false
    let seen: AbortSignal | undefined

    const { unmount } = renderHook(
      () =>
        useSupabaseQuery<string>(
          'leaving-view',
          (_client, signal) => {
            started = true
            seen = signal
            return cancellable(signal)
          },
          noFallback,
        ),
      { wrapper },
    )
    await waitFor(() => expect(started).toBe(true))

    unmount()

    await waitFor(() => expect(seen?.aborted).toBe(true))
  })

  it('cancels the superseded read when the key changes, and keeps the newer answer', async () => {
    const signals: (AbortSignal | undefined)[] = []
    let settleFirst: (value: string) => void = () => {}

    const { result, rerender } = renderHook(
      ({ key }: { key: string }) =>
        useSupabaseQuery<string>(
          key,
          (_client, signal) => {
            signals.push(signal)
            if (signals.length === 1) {
              // Deliberately settleable: the first read is asked for its
              // answer AFTER it has been abandoned, which is the late
              // arrival this whole contract is about.
              return new Promise<string>((resolve) => {
                settleFirst = resolve
              })
            }
            return Promise.resolve('the newer answer')
          },
          noFallback,
        ),
      { wrapper, initialProps: { key: 'scenario:first' } },
    )
    await waitFor(() => expect(signals).toHaveLength(1))

    rerender({ key: 'scenario:second' })
    await waitFor(() =>
      expect(result.current).toEqual({
        status: 'ready',
        data: 'the newer answer',
        source: 'database',
      }),
    )

    // The abandoned request is over — this is what the port adds, and what
    // fails without it.
    expect(signals[0]?.aborted).toBe(true)
    expect(signals[1]?.aborted).toBe(false)

    // And its answer, arriving now, does not displace the one on screen.
    settleFirst('the answer nobody is waiting for')
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(result.current).toEqual({
      status: 'ready',
      data: 'the newer answer',
      source: 'database',
    })
  })
})

describe('useSupabaseQuery (no database)', () => {
  it('names the missing connection without a vendor', () => {
    supabase.configured = false

    const { result } = renderHook(
      () => useSupabaseQuery<string>('offline', () => Promise.resolve('n/a'), noFallback),
      { wrapper },
    )

    expect(result.current).toEqual({
      status: 'error',
      message: 'No database connected',
      fallback: null,
    })
    expect(result.current.status === 'error' && result.current.message).not.toMatch(
      /Supabase/i,
    )
  })
})
