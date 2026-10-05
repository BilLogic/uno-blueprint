import { useCallback } from 'react'
import { useSupabaseQuery, type QueryResult } from '@/hooks/useSupabaseQuery'
import { queryKeys } from '@/lib/queryKeys'

export type RegistryTouchpoint = { id: string; name: string; kind: string }

/**
 * The registry a placement can link to: every touchpoint in the deployment.
 *
 * The registry is the deployment's, not the service's, and under the decision
 * that a service owns its journey and shares the catalog the unscoped read is
 * CORRECT rather than a latent bug — a touchpoint minted for one service is
 * reachable from any of them, which is the whole point of a shared pool. It
 * resolved a cell's owning service through its path, scenario and phase while
 * a touchpoint still carried a `service_id`; the join went with the column.
 *
 * Still keyed by the cell, because that is what the panel has and the key
 * keeps each panel's query cached separately.
 */
export function useRegistryTouchpoints(
  cellId: string | null,
): QueryResult<RegistryTouchpoint[]> {
  const fallback = useCallback(() => [], [])
  return useSupabaseQuery<RegistryTouchpoint[]>(
    cellId ? queryKeys.registryTouchpoints.of(cellId) : null,
    async (client, signal) => {
      const { data, error } = await client
        .from('touchpoints')
        .select('id, name, kind')
        .order('name')
        .abortSignal(signal)
      if (error) throw error
      return (data ?? []).map((row) => ({ id: row.id, name: row.name, kind: row.kind }))
    },
    fallback,
  )
}

/** A cell's name-only placements — the rows a "Link to registry" acts on. */
export type NameOnlyPlacement = { id: string; name: string }

export function useNameOnlyPlacements(
  cellId: string | null,
): QueryResult<NameOnlyPlacement[]> {
  const fallback = useCallback(() => [], [])
  return useSupabaseQuery<NameOnlyPlacement[]>(
    cellId ? queryKeys.nameOnlyPlacements.of(cellId) : null,
    async (client, signal) => {
      const { data, error } = await client
        .from('cell_touchpoints')
        .select('id, name')
        .eq('cell_id', cellId!)
        .is('touchpoint_id', null)
        .order('position')
        .abortSignal(signal)
      if (error) throw error
      return (data ?? []).flatMap((row) =>
        row.name ? [{ id: row.id, name: row.name }] : [],
      )
    },
    fallback,
  )
}

/** One registry entry, whole, as the touchpoint editor opens it. */
export type TouchpointEntryRead = {
  id: string
  name: string
  kind: string
  summary: string | null
  url: string | null
  iconUrl: string | null
  /**
   * How many placements name this entry. One placement per cell — the pair is
   * unique — so this is the number of steps an edit to the entry reaches.
   */
  placements: number
}

/**
 * A registry entry and its reach, read when the touchpoint editor opens.
 *
 * Its own query because the board does not carry it. The board joins a
 * placement's registry row for the name, kind and icon only, and it holds the
 * boards of one service while the registry is the deployment's: a count taken
 * off the boards in memory would leave out every step in another service that
 * uses the same entry, and those are exactly the steps a rename rewrites. One
 * request answers both — the row, and the placements counted beside it.
 *
 * Gated on an id, so nothing is read until the editor is opened.
 */
export function useTouchpointEntry(
  touchpointId: string | null,
): QueryResult<TouchpointEntryRead | null> {
  const fallback = useCallback(() => null, [])
  return useSupabaseQuery<TouchpointEntryRead | null>(
    touchpointId ? queryKeys.touchpointEntry.of(touchpointId) : null,
    async (client, signal) => {
      const { data, error } = await client
        .from('touchpoints')
        .select('id, name, kind, summary, url, icon_url, cell_touchpoints(count)')
        .eq('id', touchpointId!)
        .abortSignal(signal)
        .maybeSingle()
      if (error) throw error
      if (!data) return null
      const counted = data.cell_touchpoints as unknown as { count: number }[] | null
      return {
        id: data.id,
        name: data.name,
        kind: data.kind,
        summary: data.summary,
        url: data.url,
        iconUrl: data.icon_url,
        placements: counted?.[0]?.count ?? 0,
      }
    },
    fallback,
  )
}
