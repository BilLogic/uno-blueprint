import type { BlueprintLabelRowSpec } from '@/lib/sideBySideCompareLayout'
import { STRUCTURE_PLACEHOLDER_ID } from '@/lib/structureDraftPreview'

/** Keep the whole destination visible while its create panel is open. */
export function StructureLaneDraftZone({
  rows,
}: {
  rows: BlueprintLabelRowSpec[]
}) {
  const index = rows.findIndex(
    (row) => row.lane?.id === STRUCTURE_PLACEHOLDER_ID,
  )
  if (index < 0) return null
  return (
    <div
      aria-hidden
      data-structure-insert-zone="lane"
      className="pointer-events-none z-50"
      style={{ gridColumn: '1 / -1', gridRow: index + 1 }}
    />
  )
}
