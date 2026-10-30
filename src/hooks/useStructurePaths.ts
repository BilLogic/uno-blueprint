import { useCallback, useSyncExternalStore } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useSupabaseQuery } from './useSupabaseQuery'
import { queryKeys } from '@/lib/queryKeys'
import type { OrderPath } from '@/components/blueprint/PathOrderSection'

export type StructurePathSource = {
  kind: 'step' | 'lane'
  scenarioId?: string
  pathId?: string
  onlyPath?: boolean
}

/** The same ordered path read feeds both the draft and saved-item rails. */
export function useStructurePaths(source: StructurePathSource | null) {
  const fallback = useCallback(() => null, [])
  const queryClient = useQueryClient()
  const key = source
    ? queryKeys.structurePaths.of(
        `${source.kind}:${source.onlyPath ? 'path' : 'scenario'}:${
          source.onlyPath ? source.pathId : source.scenarioId ?? source.pathId
        }`,
      )
    : null
  const result = useSupabaseQuery<OrderPath[]>(
    key,
    async (client, signal) => {
      if (!source) return []
      let scenarioId = source.scenarioId
      if (!scenarioId && !source.onlyPath) {
        const { data, error } = await client
          .from('paths')
          .select('scenario_id')
          .eq('id', source.pathId!)
          .abortSignal(signal)
          .single()
        if (error) throw error
        scenarioId = data.scenario_id
      }
      const { data, error } = await client
        .from('paths')
        .select(
          'id,name,lanes(id,name,position,lane_role),path_steps(position,steps(id,name))',
        )
        .eq(
          source.onlyPath ? 'id' : 'scenario_id',
          source.onlyPath ? source.pathId! : scenarioId!,
        )
        .order('name')
        .abortSignal(signal)
      if (error) throw error
      return data.map((path) => ({
        id: path.id,
        name: path.name,
        items:
          source.kind === 'lane'
            ? [...path.lanes]
                .sort((a, b) => a.position - b.position)
                .map((lane) => ({ ...lane, role: lane.lane_role ?? null }))
            : [...path.path_steps]
                .sort((a, b) => a.position - b.position)
                .map((row) => ({ ...row.steps, position: row.position })),
      }))
    },
    fallback,
  )
  // Subscribe locally: structural sharing can preserve the data reference
  // when Undo returns the original rows, but it is still a new saved read.
  const subscribe = useCallback(
    (notify: () => void) => queryClient.getQueryCache().subscribe(notify),
    [queryClient],
  )
  const snapshot = useCallback(
    () => queryClient.getQueryState([key])?.dataUpdatedAt,
    [queryClient, key],
  )
  const readAt = useSyncExternalStore(subscribe, snapshot, snapshot)
  return result.status === 'ready' ? { ...result, readAt } : result
}
