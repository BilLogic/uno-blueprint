import { useStructurePreview } from '@/contexts/EntityDetailContext'
import { useMemo } from 'react'
import { useCollapsedBlueprintLanes } from '@/hooks/useCollapsedBlueprintLanes'
import { STEP_COLUMN_WIDTH } from '@/lib/blueprintLayout'
import {
  buildCompareGridTracks,
  type CompareGridTrack,
} from '@/lib/compareGridTracks'
import type { CompareModel } from '@/lib/compareSlots'
import {
  COMPARE_LABEL_TRACK_WIDTH,
  buildSideBySideLabelRowSpecs,
  getCanonicalLanes,
  type BlueprintLabelRowSpec,
} from '@/lib/sideBySideCompareLayout'
import type { BlueprintData, BlueprintLane } from '@/types/blueprint'

export type CompareGridAxis = {
  /** Canonical lanes across the compared paths. */
  lanes: BlueprintLane[]
  /** Lane row specs (one set — both canvases share the lane axis). */
  rows: BlueprintLabelRowSpec[]
  toggleLane: (laneId: string) => void
  tracks: CompareGridTrack[]
  gridTemplateColumns: string
}

/**
 * The column + lane axis both compare canvases are drawn against — the
 * stacked bands and the merged grid. One derivation keeps the two modes
 * from drifting apart in two copies. (Fold retired 2026-08-17: the axis is
 * always the full canonical column set.)
 */
export function useCompareGridAxis(
  model: CompareModel | null,
  blueprints: BlueprintData[],
  compact = false,
): CompareGridAxis {
  const context=useStructurePreview()
  const clickedId=(context?.selection?.draft || context?.selection?.focusNext) ? context.preview?.clickedPathId : undefined
  const axisBlueprints=useMemo(()=>{const clicked=blueprints.find(blueprint=>blueprint.path.id === clickedId);return clicked ? [clicked,...blueprints.filter(blueprint=>blueprint!==clicked)] : blueprints},[blueprints,clickedId])
  const { collapsedLaneIds, toggleLane } = useCollapsedBlueprintLanes()

  const lanes = useMemo(() => getCanonicalLanes(axisBlueprints), [axisBlueprints])

  const rows = useMemo(
    () => buildSideBySideLabelRowSpecs(axisBlueprints, compact, collapsedLaneIds),
    [axisBlueprints, collapsedLaneIds, compact],
  )

  const tracks = useMemo(
    () => buildCompareGridTracks(model, blueprints),
    [blueprints, model],
  )

  // Never animated — a `gridTemplateColumns` transition would relayout the
  // whole subgrid per frame and draw arrows against intermediate geometry.
  const gridTemplateColumns = useMemo(() => {
    if (tracks.length === 0) {
      return `${COMPARE_LABEL_TRACK_WIDTH}px ${STEP_COLUMN_WIDTH}px`
    }
    return `${COMPARE_LABEL_TRACK_WIDTH}px ${tracks
      .map(() => `${STEP_COLUMN_WIDTH}px`)
      .join(' ')}`
  }, [tracks])

  return { lanes, rows, toggleLane, tracks, gridTemplateColumns }
}
