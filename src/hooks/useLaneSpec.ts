import { useCallback } from 'react'
import { useSupabaseQuery, type QueryResult } from '@/hooks/useSupabaseQuery'
import { queryKeys } from '@/lib/queryKeys'

export type LaneSpec = {
  id: string
  pathId?: string
  name: string
  role: string | null
  ownerTeam: string
  kpis: string[]
  tools: string[]
  /** Which member of the cast this lane is; null on a structural row. */
  stakeholderId: string | null
  scenarioId: string
  scenarioName: string
  phaseName: string
  /**
   * Every lane in this scenario carrying the same label — the rows a save
   * writes to. A lane belongs to ONE path, so a scenario with four paths has
   * four "Blueprint owner" lanes and editing the one you clicked would leave the
   * other three saying something else.
   */
  siblingLaneIds: string[]
}

/** jsonb arrays of loose shape — kept as the strings a human typed. */
function toStrings(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value
    .map((entry) => (typeof entry === 'string' ? entry : String(entry ?? '')))
    .map((entry) => entry.trim())
    .filter(Boolean)
}

/**
 * One lane's spec, and the sibling rows a save touches.
 *
 * Two round-trips rather than one: the sibling lanes cannot be found until the
 * lane's own scenario is known. There was a third — a count of the cells on
 * those siblings — which the panel never rendered (`PanelIdentity` gets
 * `meta=""`; the cells are on screen behind the drawer) and which has been
 * dropped rather than left as a round trip nobody reads.
 */
export function useLaneSpec(laneId: string | null): QueryResult<LaneSpec | null> {
  const fallback = useCallback(() => null, [])

  return useSupabaseQuery<LaneSpec | null>(
    queryKeys.laneSpec.of(laneId ?? 'none'),
    async (client, signal) => {
      if (!laneId) return null

      const { data: lane, error } = await client
        .from('lanes')
        .select(
          'id, path_id, name, lane_role, owner_team, kpis, tools, stakeholder_id, paths!inner(scenario_id, scenarios!inner(name, phases!inner(name)))',
        )
        .eq('id', laneId)
        .abortSignal(signal)
        .maybeSingle()
      if (error) throw new Error(error.message)
      if (!lane) return null

      const path = lane.paths as unknown as {
        scenario_id: string
        scenarios: { name: string; phases: { name: string } }
      }
      const scenarioId = path.scenario_id

      const { data: siblings, error: siblingError } = await client
        .from('lanes')
        .select('id, paths!inner(scenario_id)')
        .eq('name', lane.name)
        .eq('paths.scenario_id', scenarioId)
        .abortSignal(signal)
      if (siblingError) throw new Error(siblingError.message)

      const siblingLaneIds = (siblings ?? []).map((row) => row.id)

      return {
        id: lane.id,
        pathId: lane.path_id,
        name: lane.name,
        role: lane.lane_role ?? null,
        ownerTeam: lane.owner_team ?? '',
        kpis: toStrings(lane.kpis),
        tools: toStrings(lane.tools),
        stakeholderId: lane.stakeholder_id ?? null,
        scenarioId,
        scenarioName: path.scenarios.name,
        phaseName: path.scenarios.phases.name,
        siblingLaneIds,
      }
    },
    fallback,
  )
}
