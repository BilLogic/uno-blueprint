#!/usr/bin/env node
/**
 * Render the generated sections of `references/interface-schema-map.md`, and
 * hold the document to its sources.
 *
 *   npm run interface-map            rewrite the generated sections
 *   npm run check:interface-map      fail if they have drifted (the CI gate)
 *
 * The map moved out of `CONTEXT.md` in #137. It went there in the first place
 * because that was the file people read to learn the vocabulary; it left
 * because a glossary that also carries ninety lines of reference is read by
 * every session that wanted one word. Under `references/` it is a disclosed
 * reference: one pointer in `AGENTS.md`, read when a session touches a panel —
 * and at a path a deployment could import, which is what `references/` means
 * here (`docs/adr/0004-reference-paths-are-a-published-interface.md`).
 *
 * TWO HALVES, AND ONLY ONE OF THEM IS WRITTEN BY HAND. The binding table is
 * rendered from `LABEL_COLUMNS`, and the coverage line under it from the
 * `COMMENT ON` statements in `supabase/generated/portable-core.schema.sql` —
 * the dump of what the portable core builds, which is also what every bound
 * name is held against, so a label pointing at a column the catalogue does not
 * have fails here. The prose around both is hand-written, because why two words
 * differ is a decision and no catalogue holds decisions.
 *
 * The coverage line COUNTS the catalogue's comments rather than reprinting
 * them; `renderCoverage`'s own header says why, and the short version is that
 * two of them are stale in a way the markdown sweep cannot see.
 *
 * IT IS THE STATIC CATALOGUE, and that is the same trade
 * `scripts/tests/documented-value-sets.test.mjs` already takes: the dump
 * describes what the portable core BUILDS, not what any deployed database
 * holds. It needs no credential, so `--check` can be a required gate rather
 * than a job that runs when somebody remembers — and the live half is already
 * covered, because `check:identifiers` sweeps `pg_catalog` itself in the
 * Postgres job.
 *
 * Modelled on `scripts/generate-docs-index.mjs`: write by default, `--check`
 * to fail on drift.
 *
 * Run: node scripts/generate-interface-schema-map.mjs   (also: npm run interface-map)
 * CI-check: node scripts/generate-interface-schema-map.mjs --check
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { SCHEMA, schemaInventory } from './check-instance-vocabulary.mjs'
import {
  LABEL_COLUMNS,
  boundNames,
  commentsFromSchema,
  namesNotInCatalog,
  renderBinding,
  renderCoverage,
  splice,
} from './interface-schema-map.mjs'

/** The tree this script runs in: the working directory — never this file's location; `sweep.mjs` says why. */
const REPO_ROOT = process.cwd()
export const DOC = 'references/interface-schema-map.md'

/** The document as its sources render it, and what a run should report. */
export function render(doc, { inventory, comments }, map = LABEL_COLUMNS) {
  const missing = namesNotInCatalog(inventory, map)
  const next = splice(
    splice(doc, 'binding', renderBinding(map), DOC),
    'coverage',
    renderCoverage(comments, map),
    DOC,
  )
  return { next, missing }
}

function main() {
  const check = process.argv.includes('--check')
  const path = resolve(REPO_ROOT, DOC)
  const dump = readFileSync(SCHEMA, 'utf8')
  const sources = { inventory: schemaInventory(dump), comments: commentsFromSchema(dump) }
  const doc = readFileSync(path, 'utf8')
  const { next, missing } = render(doc, sources)

  const failures = []
  if (missing.length > 0) {
    failures.push(
      `${DOC} binds ${missing.length} name(s) the catalogue does not have: ${missing.join(', ')}. ` +
        'A label pointed at a column that is not there is the defect this map exists to end — ' +
        'fix the name in scripts/interface-schema-map.mjs, or add the migration that creates it.',
    )
  }
  if (check) {
    if (next !== doc) {
      failures.push(
        `${DOC} is not what its sources render — scripts/interface-schema-map.mjs or the ` +
          'catalogue changed and the document did not. Run: npm run interface-map',
      )
    }
  } else if (next !== doc) {
    writeFileSync(path, next)
    console.log(`wrote ${DOC}`)
  }

  if (failures.length > 0) {
    for (const failure of failures) console.error(`[interface-map] ${failure}`)
    process.exitCode = 1
    return
  }
  const described = boundNames().filter((name) =>
    sources.comments.has(name.includes('.') ? `column:${name}` : `table:${name}`),
  ).length
  console.log(
    `[interface-map] ${LABEL_COLUMNS.length} labels bind ${boundNames().length} names, ` +
      `all in the catalogue, ${described} of them described by a comment` +
      `${check ? ' — the document is what they render' : ''}.`,
  )
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main()
