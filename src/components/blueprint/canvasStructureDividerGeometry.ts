/**
 * Divider positions during a lane reorder.
 *
 * Semantic lines (interaction, visibility, internal interaction) are derived
 * from lane roles (GLOSSARY.md § Line of visibility). They stay fixed for the
 * whole gesture: a lane may only reorder inside the section those lines bound.
 * Crossing a line is refused (ban cursor, no new landing); foreign sections
 * dim after lift. Same-section swaps slide neighbours; divider translates stay 0.
 */
import { interactionLineAnchorIndex, visibilityLineAnchorIndex } from '@/lib/blueprintLayout'
import {
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
    return visibilityLineAnchorIndex(roles.map((role, index) => ({ name: `lane-${index}`, role })))
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
 * Routing corridors keep their layout space during the gesture. The reorder
 * projector assigns that space to its destination seat, not to its lane.
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
