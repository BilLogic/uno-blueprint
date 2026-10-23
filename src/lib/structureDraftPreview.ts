import type { BlueprintData } from '@/types/blueprint'
import type {
  StructurePreview,
  StructureSeam,
} from '@/contexts/EntityDetailContext'

export const STRUCTURE_PLACEHOLDER_ID = 'structure-placeholder'

/** The board reads a draft projection; database rows and the query cache stay untouched. */
export function previewStructureDraft(
  blueprints: BlueprintData[],
  preview: StructurePreview,
): BlueprintData[] {
  return blueprints.map((blueprint) => {
    const order = preview.orders.find(
      (order) => order.pathId === blueprint.path.id,
    )
    if (!order) return blueprint
    const name = preview.name.trim() || `New ${preview.kind}`
    if (preview.kind === 'step')
      return {
        ...blueprint,
        steps: order.order.flatMap((id, position) => {
          if (id === 'new')
            return [{ id: STRUCTURE_PLACEHOLDER_ID, name, position }]
          const step = blueprint.steps.find((step) => step.id === id)
          return step ? [{ ...step, position }] : []
        }),
      }
    return {
      ...blueprint,
      lanes: order.order.flatMap((id, position) => {
        if (id === 'new')
          return [
            {
              id: STRUCTURE_PLACEHOLDER_ID,
              name,
              role: preview.role || null,
              position,
            },
          ]
        const lane = blueprint.lanes.find((lane) => lane.id === id)
        return lane ? [{ ...lane, position }] : []
      }),
    }
  })
}

export const STRUCTURE_SEAM_ID = 'structure-seam'

/** A hover uses the same rendered projection as a draft, with a narrow track.
 * Saved positions remain intact so each opener keeps its stable address. */
export function previewStructureSeam(
  blueprints: BlueprintData[],
  seam: StructureSeam,
): BlueprintData[] {
  const clicked = blueprints.find((board) => board.path.id === seam.pathId)
  if (!clicked) return blueprints
  const items = seam.kind === 'step' ? clicked.steps : clicked.lanes
  const index =
    seam.atPosition === undefined
      ? items.length
      : items.findIndex((item) => item.position >= seam.atPosition!)
  const anchor = items[index < 0 ? items.length : index]
  return blueprints.map((board) => {
    if (
      seam.kind === 'step' &&
      board.path.id !== seam.pathId &&
      !seam.pathIds?.includes(board.path.id)
    )
      return board
    const rows = seam.kind === 'step' ? board.steps : board.lanes
    const at = anchor
      ? rows.findIndex((item) =>
          seam.kind === 'step'
            ? item.id === anchor.id
            : item.name === anchor.name,
        )
      : rows.length
    const insertAt = at < 0 ? rows.length : at
    const next = [...rows]
    next.splice(insertAt, 0, {
      id: STRUCTURE_SEAM_ID,
      name: 'Insertion seam',
      position:
        (rows[insertAt]?.position ?? (rows.at(-1)?.position ?? 0) + 1) - 0.5,
      seamSize: seam.size,
    })
    return seam.kind === 'step'
      ? { ...board, steps: next }
      : { ...board, lanes: next }
  })
}
