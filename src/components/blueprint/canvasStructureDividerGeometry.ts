/**
 * Divider positions during a lane reorder.
 *
 * Semantic lines (interaction, visibility, internal interaction) are derived
 * from lane roles (CONTEXT.md § Line of visibility). They stay fixed for the
 * whole gesture: a lane may only reorder inside the section those lines bound.
 * Crossing a line is refused (ban cursor, no new landing); foreign sections
 * dim after lift. Same-section swaps slide neighbours; divider translates stay 0.
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
 * Inclusive index range for one reorder section (lanes between fixed lines).
 */
export type LaneSectionRange = {
  start: number
  end: number
}

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
 * Contiguous sections split after each present divider anchor.
 * A board with no dividers is one section spanning every lane.
 */
export function laneSectionBounds(
  roles: readonly StructureLaneRole[],
): LaneSectionRange[] {
  const count = roles.length
  if (count === 0) return []
  const cuts: number[] = []
  for (const kind of DIVIDER_KINDS) {
    const anchor = dividerAnchorIndex(kind, roles)
    if (anchor >= 0 && anchor < count - 1) cuts.push(anchor)
  }
  const unique = [...new Set(cuts)].sort((a, b) => a - b)
  const sections: LaneSectionRange[] = []
  let start = 0
  for (const cut of unique) {
    sections.push({ start, end: cut })
    start = cut + 1
  }
  sections.push({ start, end: count - 1 })
  return sections
}

/**
 * Section that owns `index`, or a single-lane range when the index is alone.
 */
export function sectionRangeForIndex(
  roles: readonly StructureLaneRole[],
  index: number,
): LaneSectionRange {
  const sections = laneSectionBounds(roles)
  return (
    sections.find(
      (section) => index >= section.start && index <= section.end,
    ) ?? { start: index, end: index }
  )
}

/**
 * Splice `from` → `to` only when both seats sit inside `[start, end]`.
 * Out-of-range `to` clamps to the section; lifting from outside is a no-op.
 */
export function orderWithinSection(
  ids: readonly string[],
  from: number,
  to: number,
  section: LaneSectionRange,
): string[] {
  if (from < section.start || from > section.end) return [...ids]
  const target = Math.max(section.start, Math.min(section.end, to))
  if (target === from) return [...ids]
  const next = [...ids]
  next.splice(target, 0, ...next.splice(from, 1))
  return next
}

/**
 * One coherent drag preview: lanes slide inside their section; dividers stay put.
 */
export function projectLaneDragPreview(options: {
  ids: readonly string[]
  previewIds: readonly string[]
  rolesById: ReadonlyMap<string, StructureLaneRole>
  starts: readonly number[]
  extents: readonly number[]
  /** Measured top (axis start) of each divider at gesture start. */
  dividerStarts: ReadonlyMap<StructureDividerKind, number>
  /** Inclusive section that may reorder; others stay at offset 0. */
  section: LaneSectionRange
}): {
  laneOffsets: Map<string, number>
  dividerTranslates: Map<StructureDividerKind, number>
} {
  const { section } = options
  const indexById = new Map(options.ids.map((id, index) => [id, index]))
  const laneOffsets = new Map<string, number>()
  for (const id of options.ids) laneOffsets.set(id, 0)

  const dividerTranslates = new Map<StructureDividerKind, number>()
  for (const kind of options.dividerStarts.keys()) {
    dividerTranslates.set(kind, 0)
  }

  if (section.end < section.start) return { laneOffsets, dividerTranslates }

  let gapSum = 0
  let gapCount = 0
  for (let index = section.start; index < section.end; index++) {
    gapSum +=
      options.starts[index + 1]! -
      options.starts[index]! -
      options.extents[index]!
    gapCount += 1
  }
  const laneGap = gapCount > 0 ? gapSum / gapCount : 0

  const previewInSection = options.previewIds.filter((id) => {
    const original = indexById.get(id)
    return (
      original !== undefined &&
      original >= section.start &&
      original <= section.end
    )
  })

  let cursor = options.starts[section.start]!
  for (const id of previewInSection) {
    const original = indexById.get(id)!
    laneOffsets.set(id, cursor - options.starts[original]!)
    cursor += options.extents[original]! + laneGap
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
  const section = sectionRangeForIndex(roles, from)
  const { dividerTranslates } = projectLaneDragPreview({
    ids: options.ids,
    previewIds: options.previewIds,
    rolesById: options.rolesById,
    starts: options.starts,
    extents: options.extents,
    dividerStarts,
    section,
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
 * Axis-aligned box for reorder geometry: the union of parts.
 *
 * Lanes and steps use the same full measured box — the grid track the reader
 * sees. Trimming arrow corridors made the lane landing shorter than the row
 * (steps never had that trim, which is why their projector looked right).
 * Mid-drag, corridors collapse to height 0 so the track and the chrome match.
 */
export function measureStructureParts(
  parts: HTMLElement[],
  _axis: 'lane' | 'step',
): DOMRect {
  const boxes = parts
    .map((part) => part.getBoundingClientRect())
    .filter((box) => box.width && box.height)
  if (boxes.length === 0) return new DOMRect(0, 0, 0, 0)
  const left = Math.min(...boxes.map((box) => box.left))
  const top = Math.min(...boxes.map((box) => box.top))
  const right = Math.max(...boxes.map((box) => box.right))
  const bottom = Math.max(...boxes.map((box) => box.bottom))
  return new DOMRect(left, top, right - left, bottom - top)
}
