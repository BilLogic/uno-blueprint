#!/usr/bin/env node
/**
 * Who owns each record about the board — checked against the write surface.
 *
 * `evidence`, `findings`, `slices` and `slides` have had two collective nouns
 * and lost both, because no one word was true of all four. What replaced the
 * noun is an OWNER per record, and that claim is not a preference: a table's
 * owner is whoever may CHANGE it, and the set of things that may change it is
 * the write surface — read here through `tool-sources.mjs`'s own
 * `toolsOnSurface` rather than a second parser of the definitions.
 *
 * Three rules:
 *
 *   1. every tool the table credits is on the write roster — a renamed or
 *      deleted tool fails here rather than leaving GLOSSARY.md quietly wrong
 *   2. every write tool that NAMES one of these records is assigned an owner —
 *      a `delete_slice` nobody added to the table fails here
 *   3. GLOSSARY.md's own table PARSES to the rows below — not "the file
 *      mentions these words somewhere", which `findings` and `slices` would
 *      satisfy from a dozen other paragraphs, but the three rows themselves
 *
 * The SUBJECT of rule 2 is the tool NAME, deliberately: a tool called
 * `refresh_board` that happened to write `slices` would pass. The name is what
 * a reader of the roster has, and what a table actually writes is the
 * mutation modules' business.
 *
 * Rule 2 has already done its one job. `evidence` claimed NO tools and was
 * owned by "nobody" — true of the roster, not a position — until
 * `create_evidence` and `update_evidence` landed, at which point this test
 * failed until somebody said whose the table was. That is the check the
 * collective nouns never had — both were adopted, both went stale, and nothing
 * anywhere noticed.
 *
 * Run: npm test
 */
import { test } from 'vitest'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { toolSources, toolsOnSurface } from '../tool-sources.mjs'

const ROOT = fileURLToPath(new URL('../..', import.meta.url))

/** GLOSSARY.md is a file of this tree; every deployment holds it beside this test. */
const read = (path) => readFileSync(join(ROOT, path), 'utf8')

/**
 * The ownership table, as GLOSSARY.md states it.
 *
 * `owner` is prose on purpose — it is the phrase a person should write in a
 * sentence, and "nobody" has to be sayable for the evidence row to be honest.
 */
export const RECORD_OWNERS = [
  {
    records: ['slices', 'slides', 'slice_shares'],
    tools: ['create_slice', 'update_slice', 'replace_slides', 'share_slice', 'unshare_slice'],
    owner: 'the slice',
  },
  {
    records: ['audit_findings'],
    tools: ['create_finding', 'update_finding'],
    owner: 'the audit',
  },
  // The cell is the claim the source grounds — see GLOSSARY.md, where this row
  // read "nobody" for as long as the panel was evidence's only writer.
  {
    records: ['evidence'],
    tools: ['create_evidence', 'update_evidence'],
    owner: 'the cell',
  },
]

/** The record words a tool name may carry, and so the rows that claim them. */
const RECORD_WORDS = ['slice', 'slide', 'finding', 'evidence']

/** Tools the table credits that the write roster does not have. */
export function creditedButUnreal(rows, roster) {
  const real = new Set(roster)
  return rows.flatMap((row) => row.tools.filter((tool) => !real.has(tool)))
}

/** Write tools naming one of these records that no row claims. */
export function writesWithNoOwner(rows, roster) {
  const claimed = new Set(rows.flatMap((row) => row.tools))
  return roster
    .filter((tool) => RECORD_WORDS.some((word) => tool.includes(word)))
    .filter((tool) => !claimed.has(tool))
    .sort()
}

/**
 * The ownership table as GLOSSARY.md draws it, parsed back into rows.
 *
 * Parsed rather than searched for. `findings` and `slices` appear in a dozen
 * other paragraphs of that file, so "the document mentions the word" is
 * satisfied by a table that has been mangled — which is exactly the drift this
 * rule is for. The rows themselves are the claim, so the rows are what is read.
 */
export function ownershipTable(markdown) {
  const lines = markdown.split('\n')
  const head = lines.findIndex((line) => line.startsWith('| record | written by | belongs to |'))
  if (head < 0) throw new Error('no ownership table found in GLOSSARY.md')

  const rows = []
  for (const line of lines.slice(head + 2)) {
    if (!line.startsWith('|')) break
    const cells = line.split('|').slice(1, -1)
    if (cells.length !== 3) throw new Error(`ownership row is not three columns: ${line}`)
    const [records, tools, owner] = cells
    rows.push({
      records: [...records.matchAll(/`([a-z_]+)`/g)].map(([, name]) => name),
      tools: [...tools.matchAll(/`([a-z_]+)`/g)].map(([, name]) => name),
      owner: owner.replaceAll('*', '').trim(),
    })
  }
  return rows
}

// ---------------------------------------------------------------------------
// The matchers
// ---------------------------------------------------------------------------

test('creditedButUnreal names a tool the table invented', () => {
  // The bug: a rename lands in specs.ts, the glossary keeps the old word, and a
  // reader looking up who owns slices is told to call a tool nobody has.
  const roster = ['create_slice', 'update_slice']
  const rows = [{ records: ['slices'], tools: ['create_slice', 'rename_slice'], owner: 'the slice' }]
  assert.deepEqual(creditedButUnreal(rows, roster), ['rename_slice'])
})

test('writesWithNoOwner names a write nobody claimed', () => {
  // The bug: a new write tool arrives and the table is not extended, so the
  // ownership answer silently stops covering the whole surface — the way a
  // collective noun stops covering its set.
  const roster = ['create_slice', 'delete_slice', 'set_finding_status']
  const rows = [{ records: ['slices'], tools: ['create_slice'], owner: 'the slice' }]
  assert.deepEqual(writesWithNoOwner(rows, roster), ['delete_slice', 'set_finding_status'])
})

test('a further evidence write would need an owner before it shipped', () => {
  // What happened once will happen again: the row now credits two tools, and a
  // third arriving without a line here is the same silent hole rule 2 caught
  // the first time. `delete_evidence` is the obvious next one and does not
  // exist as a tool — the agent has no deletes at all.
  assert.deepEqual(writesWithNoOwner(RECORD_OWNERS, ['delete_evidence']), ['delete_evidence'])
})

test('ownershipTable reads the rows, not the words around them', () => {
  // The bug it catches: `findings` and `slices` are common words in that file,
  // so a rule that only asked "does the glossary mention them" stayed green
  // while the table itself said something else.
  const table = [
    '| record | written by | belongs to |',
    '| --- | --- | --- |',
    '| `slices` | `create_slice` | the slice |',
    '| `evidence` | no agent tool at all | **nobody** |',
    '',
    'Prose after it mentioning `findings`, which is not a row.',
  ].join('\n')
  assert.deepEqual(ownershipTable(table), [
    { records: ['slices'], tools: ['create_slice'], owner: 'the slice' },
    { records: ['evidence'], tools: [], owner: 'nobody' },
  ])
})

test('a write tool that names no record is not this file’s business', () => {
  // The subject, stated by exercising it: four records, not the write surface
  // at large. `upsert_cell` changes a square of the board itself, and the
  // board is what all four are ABOUT.
  const roster = ['upsert_cell', 'create_phase', 'duplicate_path', 'rename_path']
  assert.deepEqual(writesWithNoOwner(RECORD_OWNERS, roster), [])
})

// ---------------------------------------------------------------------------
// The repository
// ---------------------------------------------------------------------------

/**
 * The roster, read out of the application wherever this tree keeps it.
 *
 * A deployment has no `src` — it reads the application out of
 * `node_modules/uno-blueprint` — and the `app` sweep refuses a
 * tree that has it in neither place. That refusal is the point: `toolSurfaces`
 * throws on a source with no definitions in it, but an EMPTY roster would
 * have satisfied both rules below, because a table can credit no unreal tool and
 * orphan no write when there are no writes to orphan.
 */
const ROSTER = toolsOnSurface(toolSources(ROOT), 'write')

test('every tool the ownership table credits is one the agent has', () => {
  const unreal = creditedButUnreal(RECORD_OWNERS, ROSTER)
  assert.deepEqual(
    unreal,
    [],
    'GLOSSARY.md credits a write tool that is not on the roster: ' + unreal.join(', '),
  )
})

test('every write tool that names one of these records has an owner', () => {
  const orphans = writesWithNoOwner(RECORD_OWNERS, ROSTER)
  assert.deepEqual(
    orphans,
    [],
    'a write tool touches one of these records and no row says whose it is: ' + orphans.join(', '),
  )
})

test('GLOSSARY.md’s table parses to exactly the rows this file enforces', () => {
  assert.deepEqual(ownershipTable(read('GLOSSARY.md')), RECORD_OWNERS)
})
