import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  invalidateCellBoard,
  invalidateQueries,
  invalidateStructure,
  queryClient,
  resetStructureInvalidation,
  STRUCTURE_DEBOUNCE_MS,
} from '@/lib/queryClient'
import { STRUCTURE_KEYS, queryKeys } from '@/lib/queryKeys'

/**
 * The invalidation contract: keys are single-element strings matched by
 * PREFIX on element zero. Mutation modules call `invalidateQueries(<prefix>)`
 * or `invalidateStructure()` with keys from the builder — with
 * `staleTime: Infinity` a missed key stays stale until a reload, so the
 * predicate's reach is load-bearing.
 */

function seed(key: string, data: unknown = []) {
  queryClient.setQueryData([key], data)
}

function isStale(key: string): boolean {
  const query = queryClient.getQueryCache().find({ queryKey: [key] })
  if (!query) throw new Error(`no cached query for ${key}`)
  return query.state.isInvalidated
}

afterEach(() => {
  queryClient.clear()
})

describe('invalidateQueries (prefix predicate)', () => {
  it('invalidates every key starting with the prefix', () => {
    seed(queryKeys.canvasBlueprints.of('a'))
    seed(queryKeys.canvasBlueprints.of('b'))
    invalidateQueries(queryKeys.canvasBlueprints.prefix)
    expect(isStale(queryKeys.canvasBlueprints.of('a'))).toBe(true)
    expect(isStale(queryKeys.canvasBlueprints.of('b'))).toBe(true)
  })

  it('leaves keys outside the prefix untouched', () => {
    seed(queryKeys.canvasBlueprints.of('a'))
    seed(queryKeys.servicePhases.of('first'))
    invalidateQueries(queryKeys.canvasBlueprints.prefix)
    expect(isStale(queryKeys.servicePhases.of('first'))).toBe(false)
  })

  it('matches the bare prefix key itself', () => {
    seed(queryKeys.servicePhases.of('first'))
    invalidateQueries(queryKeys.servicePhases.prefix)
    expect(isStale(queryKeys.servicePhases.of('first'))).toBe(true)
  })
})

describe('invalidateStructure', () => {
  afterEach(() => {
    resetStructureInvalidation()
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('sweeps every structural prefix at once for a lone call', () => {
    vi.useFakeTimers()
    seed(queryKeys.servicePhases.of('first'))
    seed(queryKeys.canvasBlueprints.of('a'))
    invalidateStructure()
    expect(isStale(queryKeys.servicePhases.of('first'))).toBe(true)
    expect(isStale(queryKeys.canvasBlueprints.of('a'))).toBe(true)
  })

  it('collapses a burst into one immediate and one trailing sweep', () => {
    vi.useFakeTimers()
    const spy = vi.spyOn(queryClient, 'invalidateQueries')
    for (let i = 0; i < 5; i++) {
      invalidateStructure()
      vi.advanceTimersByTime(STRUCTURE_DEBOUNCE_MS / 2)
    }
    expect(spy).toHaveBeenCalledTimes(STRUCTURE_KEYS.length)
    vi.advanceTimersByTime(STRUCTURE_DEBOUNCE_MS)
    expect(spy).toHaveBeenCalledTimes(2 * STRUCTURE_KEYS.length)
  })

  it('sweeps at once again after the window closes', () => {
    vi.useFakeTimers()
    const spy = vi.spyOn(queryClient, 'invalidateQueries')
    invalidateStructure()
    vi.advanceTimersByTime(STRUCTURE_DEBOUNCE_MS)
    expect(spy).toHaveBeenCalledTimes(STRUCTURE_KEYS.length)
    invalidateStructure()
    expect(spy).toHaveBeenCalledTimes(2 * STRUCTURE_KEYS.length)
  })
})

describe('invalidateCellBoard', () => {
  it('refetches the grid and the one board whose cached rows hold the cell', () => {
    seed(queryKeys.servicePhases.of('first'))
    seed(queryKeys.canvasBlueprints.of('a'), [{ id: 'p1', cells: [{ id: 'c1' }] }])
    seed(queryKeys.canvasBlueprints.of('b'), [{ id: 'p2', cells: [{ id: 'c2' }] }])
    invalidateCellBoard('c1')
    expect(isStale(queryKeys.servicePhases.of('first'))).toBe(true)
    expect(isStale(queryKeys.canvasBlueprints.of('a'))).toBe(true)
    expect(isStale(queryKeys.canvasBlueprints.of('b'))).toBe(false)
  })

  it('refetches every board when the writer knows no cell', () => {
    seed(queryKeys.canvasBlueprints.of('a'), [{ id: 'p1', cells: [{ id: 'c1' }] }])
    seed(queryKeys.canvasBlueprints.of('b'), [{ id: 'p2', cells: [{ id: 'c2' }] }])
    invalidateCellBoard(null)
    expect(isStale(queryKeys.canvasBlueprints.of('a'))).toBe(true)
    expect(isStale(queryKeys.canvasBlueprints.of('b'))).toBe(true)
  })
})
