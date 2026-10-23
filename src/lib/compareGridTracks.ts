import { STRUCTURE_SEAM_ID } from '@/lib/structureDraftPreview'
import type { CompareModel } from '@/lib/compareSlots'
import type { BlueprintData } from '@/types/blueprint'

/**
 * The compare canvas's column axis as the GRIDS consume it — one view model
 * shared by the stacked bands and the merged grid, so both are drawn
 * against the same canonical step axis. Derived from the compare model,
 * never the DOM. (Fold/pleats retired 2026-08-17 — every track is a plain
 * column now; the `kind` discriminant stays so track consumers read the
 * same shape they always did.)
 */

/** One canonical step column. */
export type CompareGridColumn = {
  key: string
  seamSize?: number
  label: string
  /** This column's backing step id per path — absent path ⇒ inert spacer. */
  stepIdByPath: Readonly<Record<string, string>>
  /** Column-level verdict !== 'shared'. */
  divergent: boolean
}

export type CompareGridTrack = { kind: 'column' } & CompareGridColumn

/**
 * With a model: the canonical column axis. Without one (a single path, or a
 * selection whose blueprints have not all arrived) each path's own steps
 * become their own columns, in band order — there is nothing to align yet.
 */
export function buildCompareGridTracks(
  model: CompareModel | null,
  blueprints: readonly BlueprintData[],
): CompareGridTrack[] {
  if (!model) {
    return blueprints.flatMap((blueprint) =>
      [...blueprint.steps]
        .sort((a, b) => a.position - b.position)
        .map(
          (step): CompareGridTrack => ({
            kind: 'column',
            key: `${blueprint.path.id}:${step.id}`,
            label: step.name,
            seamSize: step.seamSize,
            stepIdByPath: { [blueprint.path.id]: step.id },
            divergent: false,
          }),
        ),
    )
  }

  const tracks = model.columns.map(
    (column): CompareGridTrack => ({
      kind: 'column',
      key: column.columnKey,
      label: column.label,
      seamSize: blueprints
        .flatMap((board) => board.steps)
        .find((step) => Object.values(column.stepIdByPath).includes(step.id))
        ?.seamSize,
      stepIdByPath: column.stepIdByPath,
      divergent: column.verdict !== 'shared',
    }),
  )
  // A hover must not participate in content matching: its empty cells would
  // rematch canonical moments and move the opener. Insert into the stable axis.
  const seamBoard = blueprints.find((board) =>
    board.steps.some((step) => step.seamSize !== undefined),
  )
  const seamIndex =
    seamBoard?.steps.findIndex((step) => step.seamSize !== undefined) ?? -1
  if (seamBoard && seamIndex >= 0) {
    const seam = seamBoard.steps[seamIndex]
    const next = seamBoard.steps[seamIndex + 1]
    const previous = seamBoard.steps[seamIndex - 1]
    const at = next
      ? tracks.findIndex((track) =>
          Object.values(track.stepIdByPath).includes(next.id),
        )
      : previous
      ? tracks.findIndex((track) =>
          Object.values(track.stepIdByPath).includes(previous.id),
        ) + 1
      : 0
    tracks.splice(at < 0 ? tracks.length : at, 0, {
      kind: 'column',
      key: STRUCTURE_SEAM_ID,
      label: seam.name,
      seamSize: seam.seamSize,
      divergent: false,
      stepIdByPath: Object.fromEntries(
        blueprints
          .filter((board) =>
            board.steps.some((step) => step.seamSize !== undefined),
          )
          .map((board) => [board.path.id, STRUCTURE_SEAM_ID]),
      ),
    })
  }
  return tracks
}
