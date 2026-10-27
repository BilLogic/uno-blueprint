/**
 * Divider positions during a lane reorder.
 *
 * The line of interaction and line of visibility are derived from lane roles
 * (CONTEXT.md § Line of visibility), not stored on a row. During a drag they
 * must follow the previewed order's boundary — staying put for a same-side
 * swap, gliding only when that boundary moves — rather than riding the
 * translated lane that happened to precede them at gesture start.
 */
import {
  CUSTOMER_ACTIONS_ROLE,
  FRONTSTAGE_ACTIONS_ROLE,
  FRONTSTAGE_TOUCHPOINTS_ROLE,
  BACKSTAGE_ACTIONS_ROLE,
  SUPPORT_ACTIONS_ROLE,
} from '@/lib/laneRoles'

export type StructureDividerKind =
  | 'interaction'
  | 'visibility'
  | 'internal-interaction'

export type StructureLaneRole = string | null | undefined

/**
 * Index of the lane after which the divider draws for this ordered role list.
 * `-1` when the board has no such boundary.
 */
export function dividerAnchorIndex(
  kind: StructureDividerKind,
  roles: readonly StructureLaneRole[],
): number {
  if (kind === 'interaction') {
    let last = -1
    for (let index = 0; index < roles.length; index++) {
      if (roles[index] === CUSTOMER_ACTIONS_ROLE) last = index
    }
    return last
  }
  if (kind === 'visibility') {
    let last = -1
    for (let index = 0; index < roles.length; index++) {
      const role = roles[index]
      if (role === FRONTSTAGE_ACTIONS_ROLE) last = index
      else if (role === FRONTSTAGE_TOUCHPOINTS_ROLE) {
        const next = roles[index + 1]
        if (next !== FRONTSTAGE_ACTIONS_ROLE) last = index
      }
    }
    return last
  }
  for (let index = 0; index < roles.length; index++) {
    if (
      roles[index] === BACKSTAGE_ACTIONS_ROLE &&
      roles[index + 1] === SUPPORT_ACTIONS_ROLE
    ) {
      return index
    }
  }
  return -1
}

/**
 * How far a divider must translate so it sits after the previewed anchor,
 * using the same projected lane offsets as neighbouring rows.
 *
 * Returns `0` when the boundary does not move (same-side reorder) or when
 * either order has no such line.
 */
export function dividerTranslateForPreview(options: {
  kind: StructureDividerKind
  ids: readonly string[]
  previewIds: readonly string[]
  rolesById: ReadonlyMap<string, StructureLaneRole>
  /** Original top (or left) of each lane, parallel to `ids`. */
  starts: readonly number[]
  /** Original extent of each lane, parallel to `ids`. */
  extents: readonly number[]
  /** Projected translate for each lane id. */
  offsets: ReadonlyMap<string, number>
}): number {
  const rolesFor = (order: readonly string[]) =>
    order.map((id) => options.rolesById.get(id) ?? null)
  const from = dividerAnchorIndex(options.kind, rolesFor(options.ids))
  const to = dividerAnchorIndex(options.kind, rolesFor(options.previewIds))
  if (from < 0 || to < 0) return 0
  const indexById = new Map(options.ids.map((id, index) => [id, index]))
  const endAfter = (order: readonly string[], anchor: number) => {
    const id = order[anchor]!
    const original = indexById.get(id)!
    return (
      options.starts[original]! +
      options.extents[original]! +
      (options.offsets.get(id) ?? 0)
    )
  }
  // The original order has no projected offsets yet.
  const originalEnd =
    options.starts[from]! + options.extents[from]!
  return endAfter(options.previewIds, to) - originalEnd
}

/** Corridor nodes that decorate a lane row but are not the lane itself. */
export const STRUCTURE_LANE_CORRIDOR_SELECTOR = [
  '[data-blueprint-wrap-corridor]',
  '[data-blueprint-rail-corridor]',
  '[data-blueprint-loop-corridor]',
].join(', ')

/**
 * Axis-aligned box for reorder geometry: the union of parts, with lane
 * corridors trimmed off the trailing edge so a wrap band under the last
 * recipient lane does not travel as if it were lane content.
 */
export function measureStructureParts(
  parts: HTMLElement[],
  axis: 'lane' | 'step',
): DOMRect {
  const boxes = parts
    .map((part) => part.getBoundingClientRect())
    .filter((box) => box.width && box.height)
  if (boxes.length === 0) return new DOMRect(0, 0, 0, 0)
  const left = Math.min(...boxes.map((box) => box.left))
  const top = Math.min(...boxes.map((box) => box.top))
  const right = Math.max(...boxes.map((box) => box.right))
  let bottom = Math.max(...boxes.map((box) => box.bottom))
  if (axis === 'lane') {
    let slack = 0
    for (const part of parts) {
      for (const corridor of part.querySelectorAll<HTMLElement>(
        STRUCTURE_LANE_CORRIDOR_SELECTOR,
      )) {
        slack = Math.max(slack, corridor.getBoundingClientRect().height)
      }
    }
    bottom = Math.max(top, bottom - slack)
  }
  return new DOMRect(left, top, right - left, bottom - top)
}
