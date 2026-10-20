/**
 * The check that keeps `GLOSSARY.md` a glossary, proven by glossaries that break
 * it (#137).
 *
 * A guard seen only passing is not evidence. The committed glossary passes
 * today and would pass just as quietly if the check had stopped looking, so
 * every rule is driven from a fixture that violates it — a code fence, a table
 * of column names, a section that defines nothing — and the committed file is
 * asserted last, as one case among several rather than as the whole suite.
 *
 * Fixtures rather than the real file: `findings` is pure, so a failing branch
 * can be asserted without the document the check protects ever being edited.
 *
 * The two rules the acceptance criteria name — a code fence, a column table —
 * were also run against the committed glossary by hand, red then restored to
 * the same checksum, because a fixture proves the parser and only the real file
 * proves the wiring.
 */
import { test } from 'vitest'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { join, resolve } from 'node:path'

import {
  SUBJECT,
  TERM_ROW,
  findings,
  namesAColumn,
  sectionsIn,
  sweep,
} from '../check-glossary-only.mjs'

const ROOT = resolve(new URL('../..', import.meta.url).pathname)

/** A glossary that passes: a heading, a term row, and prose about it. */
const GLOSSARY = [
  '# Domain language',
  '',
  '## The blueprint',
  '',
  '**Cell** — what one actor does at one moment, at a lane and a step.',
  '',
  'A cell with no evidence is an assumption; that state is derived.',
  '',
].join('\n')

test('a glossary of headings, prose and term rows passes', () => {
  assert.deepEqual(findings(GLOSSARY), [])
})

/* ------------------------------------------- the subject, before the rules */

test('a glossary that defines nothing fails, rather than breaking no rule', () => {
  // The three rules are refusals, so an emptied file breaks none of them and
  // used to print `0 term rows` in the same green as a whole one.
  for (const empty of ['', '# Domain language\n', '# Domain language\n\nProse and no rows.\n']) {
    const found = findings(empty)
    assert.equal(found.length, 1, JSON.stringify(empty))
    assert.match(found[0], /^GLOSSARY\.md:1 defines no term at all/)
  }
})

test('one term row is enough to have a subject, and the rules then apply', () => {
  const oneRow = '**Cell** — what one actor does at one moment.\n'
  assert.deepEqual(findings(oneRow), [])
  assert.equal(findings(`${oneRow}\n\`\`\`sql\nselect 1;\n\`\`\`\n`).length, 1)
})

/* ------------------------------------------------------- rule 1: fences */

test('a fenced code block fails, and the failure names its line', () => {
  const found = findings(`${GLOSSARY}\n\`\`\`sql\nselect content from cells;\n\`\`\`\n`)
  assert.equal(found.length, 1)
  assert.match(found[0], /^GLOSSARY\.md:9 a fenced code block/)
})

test('a tilde fence is a fence too, and an unclosed one still fails', () => {
  assert.equal(findings(`${GLOSSARY}~~~\nselect 1;\n~~~\n`).length, 1)
  assert.equal(findings(`${GLOSSARY}\`\`\`\nselect 1;\n`).length, 1)
})

/* ------------------------------------------------- rule 2: column tables */

test('a table naming columns fails, once per row and naming the spans', () => {
  const found = findings(
    [
      GLOSSARY,
      '| The interface says | The schema says |',
      '|---|---|',
      '| **Content** | `cells.content` |',
      '| **Author note** | `paths.note` |',
      '',
    ].join('\n'),
  )
  assert.equal(found.length, 2)
  assert.match(found[0], /a table row naming `cells\.content`/)
  assert.match(found[1], /a table row naming `paths\.note`/)
})

test('a table of bare names is not a column table, and stays allowed', () => {
  // The table the glossary actually draws: who writes what. No cell of it is a
  // `table.column`, so it is not a finding — which is why the rule is "no table
  // names a column" and not "no tables".
  const allowed = [
    GLOSSARY,
    '| record | written by | belongs to |',
    '| --- | --- | --- |',
    '| `slices`, `slides` | `create_slice`, `replace_slides` | the slice |',
    '| `audit_findings` | `create_finding` | the audit |',
    '',
  ].join('\n')
  assert.deepEqual(findings(allowed), [])
})

test('the column test knows a path and a sentence from a name', () => {
  assert.equal(namesAColumn('cells.content'), true)
  assert.equal(namesAColumn('audit_findings.check_key'), true)
  assert.equal(namesAColumn('references/data-model.md'), false)
  assert.equal(namesAColumn('GLOSSARY.md'), false)
  assert.equal(namesAColumn('scripts/validate_ir.py'), false)
  assert.equal(namesAColumn('one thing. another'), false)
})

test('a column named inside prose is prose, and only a table row is the subject', () => {
  assert.deepEqual(findings(`${GLOSSARY}Table \`cells\`: \`cells.content\` holds it.\n`), [])
})

test('a column table inside a fence is reported once, as the fence', () => {
  const found = findings(`${GLOSSARY}\`\`\`\n| **Content** | \`cells.content\` |\n\`\`\`\n`)
  assert.equal(found.length, 1)
  assert.match(found[0], /a fenced code block/)
})

/* ------------------------------------------------ rule 3: every section */

test('a section that defines no term fails, and the failure names the heading', () => {
  const found = findings(`${GLOSSARY}## The rename map\n\nThese renames landed across the series.\n`)
  assert.equal(found.length, 1)
  assert.match(found[0], /§ The rename map defines no term/)
})

test('a bold sentence is not a term row — the em dash is what makes one', () => {
  assert.equal(TERM_ROW.test('**Cell** — what one actor does at one moment.'), true)
  assert.equal(TERM_ROW.test('**Evidence is the one with no owner**, and that is visible.'), false)
  assert.equal(TERM_ROW.test('**Not a UI word.** The interface says Function.'), false)
})

test('sections are found by heading depth, and the title is not one', () => {
  const sections = sectionsIn(`${GLOSSARY}### The writing vocabulary\n\n**Pointer** — a line.\n`.split('\n'))
  assert.deepEqual(
    sections.map((one) => one.heading),
    ['The blueprint', 'The writing vocabulary'],
  )
})

/* ---------------------------------------------------- the committed file */

test('the committed glossary passes, and the report says what it counted', () => {
  const { failures, terms } = sweep()
  assert.deepEqual(failures, [])
  assert.ok(terms > 20, `only ${terms} term rows in ${SUBJECT} — is it still a glossary?`)
})

test('the script exits 0 and names its subject', () => {
  const run = spawnSync(process.execPath, [join(ROOT, 'scripts', 'check-glossary-only.mjs')], {
    cwd: ROOT,
    encoding: 'utf8',
  })
  assert.equal(run.status, 0, `${run.stdout}${run.stderr}`)
  assert.match(run.stdout, /\[glossary\] GLOSSARY\.md is \d+ term rows/)
})
