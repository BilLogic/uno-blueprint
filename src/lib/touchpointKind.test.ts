import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { TOUCHPOINT_KIND_OPTIONS, TOUCHPOINT_KINDS } from '@/lib/touchpointKind'

/*
 * The editor's list is a copy of the column's CHECK, so it is held against
 * the CHECK: a seventh kind added to the schema and not here would be a value
 * the select cannot show, and one added here and not there a Save the
 * database refuses.
 */
const SCHEMA = readFileSync(
  new URL('../../supabase/generated/portable-core.schema.sql', import.meta.url),
  'utf8',
)

describe('the touchpoint kinds', () => {
  it('are exactly the values touchpoints_kind_check admits', () => {
    const check =
      /CONSTRAINT touchpoints_kind_check CHECK \(\(kind = ANY \(ARRAY\[([^\]]*)\]\)\)\)/.exec(SCHEMA)
    expect(check, 'touchpoints_kind_check is not in the dump').toBeTruthy()
    const admitted = [...check![1].matchAll(/'([a-z_]+)'::text/g)].map((match) => match[1])
    expect([...TOUCHPOINT_KINDS].sort()).toEqual(admitted.sort())
  })

  it('names each value in sentence case', () => {
    expect(TOUCHPOINT_KIND_OPTIONS.map((option) => option.label)).toEqual([
      'App',
      'Document',
      'Physical',
      'Channel',
      'Service',
      'Other',
    ])
  })
})
