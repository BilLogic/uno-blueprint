/**
 * Divider positions during a lane reorder.
 *
 * The line of interaction and line of visibility are derived from lane roles
 * (CONTEXT.md § Line of visibility), not stored on a row. During a drag the
 * preview must show the next layout: lanes and dividers share one projected
 * stack so a divider gap cannot be left behind while the line itself glides
 * (or the reverse). Same-side reorders keep each line fixed; crossing a line
 * moves it with the same motion as neighbouring rows.
 */
import { interactionLineAnchorIndex } from '@/lib/blueprintLayout'
import {
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

const DIVIDER_KINDS: readonly StructureDividerKind[] = [
  'interaction',
  'visibility',
  'internal-interaction',
]

/**
 * Index of the lane after which the divider draws for this ordered role list.
 * `-1` when the board has no such boundary.
 */
export function dividerAnchorIndex(
  kind: StructureDividerKind,
  roles: readonly StructureLaneRole[],
): number {
  if (kind === 'interaction') {
    return interactionLineAnchorIndex(
      roles.map((role, index) => ({ name: `lane-${index}`, role })),
    )
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
 * One coherent drag preview: lane offsets and divider translates from the
 * same projected stack. Divider-sized gaps travel with their derived
 * boundary instead of staying glued to the original slot index.
 */
export function projectLaneDragPreview(options: {
  ids: readonly string[]
  previewIds: readonly string[]
  rolesById: ReadonlyMap<string, StructureLaneRole>
  starts: readonly number[]
  extents: readonly number[]
  /** Measured top (axis start) of each divider at gesture start. */
  dividerStarts: ReadonlyMap<StructureDividerKind, number>
}): {
  laneOffsets: Map<string, number>
  dividerTranslates: Map<StructureDividerKind, number>
} {
  const rolesFor = (order: readonly string[]) =>
    order.map((id) => options.rolesById.get(id) ?? null)
  const originalRoles = rolesFor(options.ids)
  const previewRoles = rolesFor(options.previewIds)

  const originalAnchor = new Map(
    DIVIDER_KINDS.map((kind) => [kind, dividerAnchorIndex(kind, originalRoles)]),
  )
  const previewAnchor = new Map(
    DIVIDER_KINDS.map((kind) => [kind, dividerAnchorIndex(kind, previewRoles)]),
  )

  const dividerGapByKind = new Map<StructureDividerKind, number>()
  let laneGapSum = 0
  let laneGapCount = 0
  for (let index = 0; index < options.ids.length - 1; index++) {
    const gap =
      options.starts[index + 1]! -
      options.starts[index]! -
      options.extents[index]!
    let dividerKind: StructureDividerKind | undefined
    for (const kind of DIVIDER_KINDS) {
      if (originalAnchor.get(kind) === index) dividerKind = kind
    }
    if (dividerKind) dividerGapByKind.set(dividerKind, gap)
    else {
      laneGapSum += gap
      laneGapCount++
    }
  }
  const laneGap = laneGapCount > 0 ? laneGapSum / laneGapCount : 0

  /** Preview lane index → divider kind that should follow it. */
  const dividerAfterPreview = new Map<number, StructureDividerKind>()
  for (const kind of DIVIDER_KINDS) {
    const anchor = previewAnchor.get(kind)!
    if (anchor >= 0 && options.dividerStarts.has(kind)) {
      dividerAfterPreview.set(anchor, kind)
    }
  }

  const indexById = new Map(options.ids.map((id, index) => [id, index]))
  const laneOffsets = new Map<string, number>()
  const dividerTranslates = new Map<StructureDividerKind, number>()
  let cursor = options.starts[0]!

  for (let index = 0; index < options.previewIds.length; index++) {
    const id = options.previewIds[index]!
    const original = indexById.get(id)!
    laneOffsets.set(id, cursor - options.starts[original]!)
    cursor += options.extents[original]!

    const kind = dividerAfterPreview.get(index)
    if (kind) {
      const origin = options.dividerStarts.get(kind)!
      dividerTranslates.set(kind, cursor - origin)
      cursor += dividerGapByKind.get(kind) ?? laneGap
    } else if (index < options.previewIds.length - 1) {
      cursor += laneGap
    }
  }

  // Kinds present at start but with no preview anchor keep a zero translate
  // so cancel/reset still has an entry to restore from motion.
  for (const kind of options.dividerStarts.keys()) {
    if (!dividerTranslates.has(kind)) dividerTranslates.set(kind, 0)
  }

  return { laneOffsets, dividerTranslates }
}

/**
 * @deprecated Prefer {@link projectLaneDragPreview}; kept for focused
 * translate assertions that already hold projected lane offsets.
 */
export function dividerTranslateForPreview(options: {
  kind: StructureDividerKind
  ids: readonly string[]
  previewIds: readonly string[]
  rolesById: ReadonlyMap<string, StructureLaneRole>
  starts: readonly number[]
  extents: readonly number[]
  offsets: ReadonlyMap<string, number>
}): number {
  const dividerStarts = new Map<StructureDividerKind, number>()
  const roles = options.ids.map((id) => options.rolesById.get(id) ?? null)
  const from = dividerAnchorIndex(options.kind, roles)
  if (from < 0) return 0
  dividerStarts.set(
    options.kind,
    options.starts[from]! + options.extents[from]!,
  )
  const { dividerTranslates } = projectLaneDragPreview({
    ids: options.ids,
    previewIds: options.previewIds,
    rolesById: options.rolesById,
    starts: options.starts,
    extents: options.extents,
    dividerStarts,
  })
  return dividerTranslates.get(options.kind) ?? 0
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
