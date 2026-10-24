import { useEntityDetailOptional } from '@/contexts/EntityDetailContext'
import { STEP_COLUMN_GAP, STEP_COLUMN_WIDTH } from '@/lib/blueprintLayout'
import { buildSideBySideLabelRowSpecs } from '@/lib/sideBySideCompareLayout'
import { STRUCTURE_PLACEHOLDER_ID } from '@/lib/structureDraftPreview'
import type { BlueprintData } from '@/types/blueprint'

/** Move the whole panel with its real added track, sharing growth around the boundary. */
export function useStructureInsertionOffset(blueprints: BlueprintData[]) {
  const context = useEntityDetailOptional()
  const draft = context?.selection?.draft
  const insertion = draft ?? context?.seam
  const inScope =
    insertion &&
    blueprints.some(
      (board) =>
        board.path.id === insertion.pathId ||
        insertion.pathIds?.includes(board.path.id),
    )
  if (!inScope || !insertion.centered) return { left: 0, top: 0 }
  const size = draft
    ? insertion.kind === 'step'
      ? STEP_COLUMN_WIDTH
      : buildSideBySideLabelRowSpecs(blueprints).find(
          (row) => row.lane?.id === STRUCTURE_PLACEHOLDER_ID,
        )?.height ?? 0
    : context?.seam?.size ?? 0
  return {
    left:
      insertion.kind === 'step'
        ? draft
          ? -(size + STEP_COLUMN_GAP) / 2
          : `calc(-1 * (var(--structure-seam-progress, 1) * ${size}px + ${STEP_COLUMN_GAP}px) / 2)`
        : 0,
    top:
      insertion.kind === 'lane'
        ? draft
          ? -size / 2
          : `calc(var(--structure-seam-progress, 1) * ${-size / 2}px)`
        : 0,
  }
}
