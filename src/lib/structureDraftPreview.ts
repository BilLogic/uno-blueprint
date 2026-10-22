import type { BlueprintData } from '@/types/blueprint'
import type { StructurePreview } from '@/contexts/EntityDetailContext'

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
