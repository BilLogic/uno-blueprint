/**
 * Section window for a new-lane create draft: which neighbours and roles the
 * insert gap may use, bounded by the same semantic lines as the board.
 */
import {
  dividerAnchorIndex,
  sectionRangeForIndex,
  type StructureDividerKind,
  type StructureLaneRole,
} from './canvasStructureDividerGeometry'
import {
  BACKSTAGE_ACTIONS_ROLE,
  BACKSTAGE_TOUCHPOINTS_ROLE,
  CUSTOMER_ACTIONS_ROLE,
  FRONTSTAGE_ACTIONS_ROLE,
  FRONTSTAGE_TOUCHPOINTS_ROLE,
  PARTNER_ACTIONS_ROLE,
  STORYBOARD_ROLE,
  SUPPORT_ACTIONS_ROLE,
  type CanonicalLaneRole,
} from '@/lib/laneRoles'
import {
  INTERACTION_LINE_LABEL,
  INTERNAL_INTERACTION_LINE_LABEL,
  VISIBILITY_LINE_LABEL,
} from '@/lib/blueprintLayout'

const DIVIDER_LABEL: Record<StructureDividerKind, string> = {
  interaction: INTERACTION_LINE_LABEL,
  visibility: VISIBILITY_LINE_LABEL,
  'internal-interaction': INTERNAL_INTERACTION_LINE_LABEL,
}

const BAND_ROLES: Record<string, readonly CanonicalLaneRole[]> = {
  aboveInteraction: [
    STORYBOARD_ROLE,
    CUSTOMER_ACTIONS_ROLE,
    PARTNER_ACTIONS_ROLE,
  ],
  frontstage: [FRONTSTAGE_TOUCHPOINTS_ROLE, FRONTSTAGE_ACTIONS_ROLE],
  backstage: [BACKSTAGE_TOUCHPOINTS_ROLE, BACKSTAGE_ACTIONS_ROLE],
  support: [SUPPORT_ACTIONS_ROLE],
}

export type LaneInsertSection = {
  /** Inclusive indices into the full path order (includes the new item). */
  start: number
  end: number
  lineAbove: string | null
  lineBelow: string | null
  allowedRoles: readonly CanonicalLaneRole[]
}

/**
 * Which divider, if any, draws after lane `index` in this role list.
 *
 * @param roles - Roles in display order.
 * @param index - Lane index after which a line may fall.
 */
function dividerKindAfter(
  roles: readonly StructureLaneRole[],
  index: number,
): StructureDividerKind | null {
  for (const kind of [
    'interaction',
    'visibility',
    'internal-interaction',
  ] as const) {
    if (dividerAnchorIndex(kind, roles) === index) return kind
  }
  return null
}

/**
 * Roles a create draft may pick for the band between two bounding lines.
 *
 * @param above - Divider above the section, or null at the top of the board.
 * @param below - Divider below the section, or null at the bottom.
 */
function rolesForBand(
  above: StructureDividerKind | null,
  below: StructureDividerKind | null,
): readonly CanonicalLaneRole[] {
  if (above === null && below === 'interaction') return BAND_ROLES.aboveInteraction
  if (above === 'interaction' && below === 'visibility') return BAND_ROLES.frontstage
  if (above === 'visibility' && below === 'internal-interaction')
    return BAND_ROLES.backstage
  if (above === 'internal-interaction' && below === null) return BAND_ROLES.support
  if (above === null && below === null) {
    return [
      ...BAND_ROLES.aboveInteraction,
      ...BAND_ROLES.frontstage,
      ...BAND_ROLES.backstage,
      ...BAND_ROLES.support,
    ]
  }
  if (below === 'interaction' || above === null) return BAND_ROLES.aboveInteraction
  if (below === 'visibility' || above === 'interaction') return BAND_ROLES.frontstage
  if (below === 'internal-interaction' || above === 'visibility')
    return BAND_ROLES.backstage
  return BAND_ROLES.support
}

/**
 * Section window around a new lane in one path's draft order.
 *
 * Computed from the existing lanes' divider geometry, then expanded to include
 * the new id — so a null role on the draft seat cannot shift the lines.
 *
 * @param order - Full identity order including the new-item id.
 * @param roleById - Role (or null) for each existing lane id.
 * @param newId - Id of the unwritten lane in `order`.
 */
export function laneInsertSectionForOrder(
  order: readonly string[],
  roleById: ReadonlyMap<string, StructureLaneRole>,
  newId: string,
): LaneInsertSection {
  const newIndex = order.indexOf(newId)
  if (newIndex < 0 || order.length === 0) {
    return {
      start: 0,
      end: Math.max(0, order.length - 1),
      lineAbove: null,
      lineBelow: null,
      allowedRoles: rolesForBand(null, null),
    }
  }

  const existing = order.filter((id) => id !== newId)
  const existingRoles = existing.map((id) => roleById.get(id) ?? null)
  const following = order.slice(newIndex + 1).find((id) => id !== newId)
  const insertAmongExisting = following
    ? existing.indexOf(following)
    : existing.length
  const seat =
    insertAmongExisting < existing.length
      ? insertAmongExisting
      : Math.max(0, existing.length - 1)
  const section =
    existing.length === 0
      ? { start: 0, end: 0 }
      : sectionRangeForIndex(existingRoles, seat)

  const sectionIds = new Set(
    existing.length === 0
      ? [newId]
      : [...existing.slice(section.start, section.end + 1), newId],
  )
  let start = order.length
  let end = -1
  for (const [index, id] of order.entries()) {
    if (!sectionIds.has(id)) continue
    start = Math.min(start, index)
    end = Math.max(end, index)
  }

  const aboveKind =
    existing.length > 0 && section.start > 0
      ? dividerKindAfter(existingRoles, section.start - 1)
      : null
  const belowKind =
    existing.length > 0 && section.end < existing.length - 1
      ? dividerKindAfter(existingRoles, section.end)
      : null

  const present = new Set<CanonicalLaneRole>()
  for (const id of sectionIds) {
    if (id === newId) continue
    const role = roleById.get(id)
    if (role) present.add(role as CanonicalLaneRole)
  }
  const band = rolesForBand(aboveKind, belowKind)
  const allowedRoles = [
    ...band.filter((role) => present.size === 0 || present.has(role)),
    ...[...present].filter((role) => !band.includes(role)),
  ]

  return {
    start,
    end,
    lineAbove: aboveKind ? DIVIDER_LABEL[aboveKind] : null,
    lineBelow: belowKind ? DIVIDER_LABEL[belowKind] : null,
    allowedRoles: allowedRoles.length > 0 ? allowedRoles : band,
  }
}
