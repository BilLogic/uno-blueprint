/**
 * How the slice lists group their rows — one taxonomy for the desktop sidebar
 * and the mobile drawer, so a new slice kind is one edit here.
 */

/** Group order. A kind outside the list falls into `custom`. */
export const SLICE_TYPE_GROUPS = ['journey', 'step', 'lane', 'cell', 'custom'] as const

/** One group of the slice list. */
export type SliceTypeGroup = (typeof SLICE_TYPE_GROUPS)[number]

/**
 * The group's heading, in sentence case. A slice kind is stored lowercase, so
 * the heading is a string of its own rather than the kind capitalised by CSS.
 */
export const SLICE_GROUP_TITLE: Record<SliceTypeGroup, string> = {
  journey: 'Journey',
  step: 'Step',
  lane: 'Lane',
  cell: 'Cell',
  custom: 'Custom',
}

/**
 * The group a stored slice kind belongs to.
 *
 * @param sliceKind - the slice's stored kind, any case
 * @returns its group, or `custom` for a kind the list does not name
 */
export function sliceKindGroup(sliceKind: string): SliceTypeGroup {
  const type = sliceKind.toLowerCase()
  return SLICE_TYPE_GROUPS.find((group) => group === type) ?? 'custom'
}
