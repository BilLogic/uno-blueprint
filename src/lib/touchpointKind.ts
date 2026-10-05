/**
 * What sort of thing a touchpoint is, as the registry records it.
 *
 * `touchpoints.kind` is a property of the registry entry, not of a placement:
 * a portal is an app wherever it is used. The CHECK on the column holds the
 * vocabulary, and the write leaves it to the CHECK; this list exists because
 * an editor has to offer the six words before anybody has typed one, and a
 * free-text box would teach that the seventh is allowed.
 */

/** The six values `touchpoints_kind_check` admits, in the order the editor offers them. */
export const TOUCHPOINT_KINDS = [
  'app',
  'document',
  'physical',
  'channel',
  'service',
  'other',
] as const

export type TouchpointKind = (typeof TOUCHPOINT_KINDS)[number]

/** Each value as the select names it: the word itself, in sentence case. */
export const TOUCHPOINT_KIND_OPTIONS: ReadonlyArray<{ value: TouchpointKind; label: string }> =
  TOUCHPOINT_KINDS.map((value) => ({
    value,
    label: value.charAt(0).toUpperCase() + value.slice(1),
  }))
