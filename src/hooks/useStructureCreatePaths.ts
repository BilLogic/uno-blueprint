import { useState, useEffect } from 'react'
import { useStructurePaths } from './useStructurePaths'
import {
  useEntityDetailOptional,
  type StructureDraft,
} from '@/contexts/EntityDetailContext'
import type {
  OrderPath,
  PathOrder,
} from '@/components/blueprint/PathOrderSection'

export const NEW_STRUCTURE_ITEM = 'new'

/** Reads the scenario once; all membership and ordering afterwards is unwritten draft state. */
export function useStructureCreatePaths(
  draft: StructureDraft | undefined,
  name = '',
  role?: string,
) {
  const result = useStructurePaths(draft ? { kind: draft.kind, pathId: draft.pathId, scenarioId: draft.kind === 'lane' ? draft.scenarioId : undefined } : null)
  const paths = result.status === 'ready' ? result.data : []
  const [value, setValue] = useState<PathOrder[] | null>(null)
  const clicked = paths.find((path) => path.id === draft?.pathId) ?? paths[0]
  const defaultOrder = (path: OrderPath) => {
    const base = path.items.map((row) => row.id)
    const index =
      draft?.atPosition === undefined
        ? clicked?.items.length ?? 0
        : (clicked?.items.findIndex(
            (row) => (row.position ?? 0) >= draft.atPosition!,
          ) ?? -1) < 0
        ? clicked?.items.length ?? 0
        : clicked!.items.findIndex(
            (row) => (row.position ?? 0) >= draft.atPosition!,
          )
    const previous = clicked?.items[index - 1]
    const next = clicked?.items[index]
    const anchor =
      previous &&
      path.items.findIndex((row) =>
        draft?.kind === 'step'
          ? row.id === previous.id
          : row.name.trim().toLowerCase() ===
            previous.name.trim().toLowerCase(),
      )
    const following =
      next &&
      path.items.findIndex((row) =>
        draft?.kind === 'step'
          ? row.id === next.id
          : row.name.trim().toLowerCase() === next.name.trim().toLowerCase(),
      )
    const at =
      path.id === clicked?.id
        ? Math.min(index, base.length)
        : previous
        ? typeof anchor === 'number' && anchor >= 0
          ? anchor + 1
          : base.length
        : typeof following === 'number' && following >= 0
        ? following
        : 0
    base.splice(at, 0, NEW_STRUCTURE_ITEM)
    return base
  }
  const initial = paths
    .filter(
      (path) => draft?.pathIds?.includes(path.id) || path.id === clicked?.id,
    )
    .sort((a, b) => (a.id === clicked?.id ? -1 : b.id === clicked?.id ? 1 : 0))
    .map((path) => ({ pathId: path.id, order: defaultOrder(path), moved: [] }))
  const selected = value ?? initial
  const selectedPathId = selected.some((entry) => entry.pathId === clicked?.id)
    ? clicked?.id
    : selected[0]?.pathId
  if (paths.length && value === null) setValue(selected)
  const preview = useEntityDetailOptional()
  const serialized = JSON.stringify({
    name,
    clickedPathId: selectedPathId,
    kind: draft?.kind,
    role,
    orders: selected,
    paths,
  })
  const publish = preview?.setPreview
  useEffect(() => {
    if (draft && publish) publish(JSON.parse(serialized))
  }, [serialized, publish, draft])
  return {
    paths,
    value: selected,
    onChange: setValue,
    defaultOrder,
    status: result.status,
    clickedPathId: selectedPathId,
  }
}
