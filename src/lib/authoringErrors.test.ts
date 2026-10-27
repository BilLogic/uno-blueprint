/**
 * The translation table, and the class of bug that emptied one row of it.
 *
 * `lanes_path_row_unique` sat in `TRANSLATIONS` for months explaining a lane
 * collision no constraint could raise: nothing has ever carried that name, the
 * object on those two columns was `lanes_path_row_idx`, a plain non-unique
 * index, and the branch was dead the day it was written. A matcher on a name
 * that does not exist fails silently — the author gets the fallback, or the
 * generic duplicate line, and nobody learns that a translation went missing.
 *
 * So two halves. The first drives real database text through
 * `toAuthoringError`, in the shape Postgres actually emits, because a test that
 * invents the error text can agree with a matcher that is wrong about it. The
 * second reads the module as source and holds every identifier-shaped matcher
 * against `supabase/generated/portable-core.schema.sql` — the dump of what the
 * migration series builds, carrying only the names it ends up holding. That is
 * precisely the check the dead entry would have failed.
 */
import { readFileSync } from 'node:fs'
import type { PostgrestError } from '@supabase/supabase-js'
import { describe, expect, it } from 'vitest'
import { toAuthoringError } from '@/lib/authoringErrors'
import { sourceOf } from '@/lib/sourceTree'

const SOURCE = sourceOf('lib/authoringErrors.ts')
const SCHEMA = readFileSync(
  new URL('../../supabase/generated/portable-core.schema.sql', import.meta.url),
  'utf8',
)

const postgrest = (
  message: string,
  details: string,
  code: string,
): PostgrestError =>
  ({ name: 'PostgrestError', message, details, hint: '', code }) as PostgrestError

/**
 * The shape the decision that a lane's position is unique within its path
 * proves in its own post-conditions: two lanes
 * forced into one slot inside a transaction, with the deferred check run at
 * the end. Deferral is why this is the only shape that reaches a person — a
 * reorder that merely passes through a collision never raises at all.
 */
const LANE_COLLISION = postgrest(
  'duplicate key value violates unique constraint "lanes_path_position_unique"',
  'Key (path_id, "position")=(17d54a45-65ab-4670-8035-fb7bc0a0b256, 0) already exists.',
  '23505',
)

describe('a lane collision, in the words the database uses', () => {
  it('is named as lanes rather than as a generic duplicate', () => {
    const error = toAuthoringError(LANE_COLLISION)
    expect(error.message).toBe(
      'Two lanes ended up in the same position. Reload and try the move again.',
    )
  })

  it('beats the generic `duplicate key value` entry, which also matches it', () => {
    // Both entries match this text; only the order of the table decides. If the
    // specific one is ever moved below the generic one the author is told
    // "something with that name or position already exists here", which is
    // true, unhelpful, and indistinguishable from a name clash.
    const generic = toAuthoringError(
      postgrest(
        'duplicate key value violates unique constraint "cells_lane_step_slot_unique"',
        'Key (lane_id, step_id, "position")=(17d54a45-65ab-4670-8035-fb7bc0a0b256, 9d7c0f2c-1a3e-4f52-9f6b-2c8d5a1b4e07, 0) already exists.',
        '23505',
      ),
    )
    expect(generic.message).toBe(
      'Something with that name or position already exists here.',
    )
  })

  it('keeps the database text on `.raw`, and off the screen', () => {
    const error = toAuthoringError(LANE_COLLISION)
    expect(error.raw).toContain('lanes_path_position_unique')
    expect(error.message).not.toContain('lanes_path_position_unique')
  })
})

/**
 * A reopen racing a twin that is already open: the finding write reads for an
 * open row with the same fingerprint, finds none, and inserts — while another
 * write does the same. The partial unique index over open fingerprints refuses
 * the second, which is the index doing its job, not a name clash.
 */
const FINDING_TWIN = postgrest(
  'duplicate key value violates unique constraint "audit_findings_open_fingerprint_idx"',
  'Key (service_id, fingerprint)=(17d54a45-65ab-4670-8035-fb7bc0a0b256, missing-owner:9d7c0f2c) already exists.',
  '23505',
)

describe('an open finding twin, in the words the database uses', () => {
  it('says the finding is already open rather than asking for a rename', () => {
    // The generic duplicate line matches this text too, and would tell the
    // author "something with that name or position already exists here" — a
    // name they never typed.
    expect(toAuthoringError(FINDING_TWIN).message).toBe(
      'That finding is already open — reload to see the one that exists.',
    )
  })

  it('keeps the database text on `.raw`, and off the screen', () => {
    const error = toAuthoringError(FINDING_TWIN)
    expect(error.raw).toContain('audit_findings_open_fingerprint_idx')
    expect(error.message).not.toContain('fingerprint')
  })
})

/** Every `match:` literal in the module, in table order. */
function matchers(source: string): string[] {
  return [...source.matchAll(/match:\s*'([^']+)'/g)].map((m) => m[1])
}

/** Every constraint and index name the generated schema ends up holding. */
function schemaNames(schema: string): string[] {
  const names: string[] = []
  for (const m of schema.matchAll(/\bADD CONSTRAINT\s+([a-z_][a-z0-9_]*)/gi)) {
    names.push(m[1].toLowerCase())
  }
  for (const m of schema.matchAll(
    /\bCREATE\s+(?:UNIQUE\s+)?INDEX\s+([a-z_][a-z0-9_]*)/gi,
  )) {
    names.push(m[1].toLowerCase())
  }
  return names
}

describe('the translations that name a database object', () => {
  // Identifier-shaped only. Postgres phrases such as "duplicate key value"
  // name no database object and are not subject.
  const identifiers = matchers(SOURCE).filter((m) =>
    /^[a-z][a-z0-9_]*_[a-z0-9_]+$/.test(m),
  )
  const created = schemaNames(SCHEMA)

  it('is not an empty subject', () => {
    // Three today. If this reaches zero the check below has stopped checking.
    expect(identifiers.length).toBeGreaterThanOrEqual(3)
  })

  it('reads a schema dump that has names in it', () => {
    expect(created.length).toBeGreaterThan(20)
  })

  for (const identifier of identifiers) {
    it(`${identifier} is a name the schema actually creates`, () => {
      // Substring rather than equality, because that is what the module itself
      // does: a matcher may name a constraint whose error text carries a longer
      // index name. What it may not do is name nothing.
      expect(
        created.some((name) => name.includes(identifier)),
        `the generated schema creates nothing named like \`${identifier}\` — the matcher is dead text`,
      ).toBe(true)
    })
  }
})

describe('human cell-validation refusals', () => {
  it.each([
    'This lane no longer exists. Reload the canvas',
    'Choose a lane on this path',
    'This step is not on this path. Reload the canvas',
  ])('preserves the actionable server sentence: %s', (message) => {
    const error = toAuthoringError(postgrest(message, '', 'P0001'))
    expect(error.message).toBe(message)
    expect(error.raw).toContain(message)
  })
})
