import type { Json } from '@/types/database'

/** One `cells.value_props` entry: value generated for one beneficiary. */
export type ValueProp = {
  for: string
  value: string
}

/**
 * The list as the spec write stores it: each entry trimmed, and a row blank
 * on both sides dropped — the row an author added and never filled in.
 *
 * One rule for the write and for the editor's "has this changed", so the
 * editor never offers to save a list the write would store unchanged.
 */
export function normalizeValueProps(entries: readonly ValueProp[]): ValueProp[] {
  return entries
    .map((entry) => ({ for: entry.for.trim(), value: entry.value.trim() }))
    .filter((entry) => entry.for || entry.value)
}

/** Parse the value_props JSONB array; malformed entries are dropped. */
export function parseValueProps(raw: Json | null | undefined): ValueProp[] {
  if (!Array.isArray(raw)) return []
  return raw.flatMap((entry) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return []
    const record = entry as Record<string, Json | undefined>
    if (typeof record.for !== 'string' || typeof record.value !== 'string') {
      return []
    }
    return [{ for: record.for, value: record.value }]
  })
}
