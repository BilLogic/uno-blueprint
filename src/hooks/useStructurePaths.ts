import { useCallback } from 'react'
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
  return useSupabaseQuery<OrderPath[]>(
    source
      ? queryKeys.structureCreatePaths.of(
          `${source.kind}:${source.onlyPath ? 'path' : 'scenario'}:${
            source.onlyPath ? source.pathId : source.scenarioId ?? source.pathId
          }`,
        )
      : null,
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
          'id,name,lanes(id,name,position),path_steps(position,steps(id,name))',
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
            ? [...path.lanes].sort((a, b) => a.position - b.position)
            : [...path.path_steps]
                .sort((a, b) => a.position - b.position)
                .map((row) => ({ ...row.steps, position: row.position })),
      }))
    },
    fallback,
  )
}
