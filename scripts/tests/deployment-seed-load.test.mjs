#!/usr/bin/env node
/**
 * The parsing and the skip decision in `check:deployment-seed-load`.
 *
 * The check itself needs a Postgres and a deployment checkout, so it does not
 * run in CI and cannot be tested here. Everything it does BEFORE it touches a
 * database can be, and those are the parts that fail quietly: a config format
 * read slightly wrong loads the wrong files in the wrong order and reports a
 * dependency failure as a finding; a skip that misfires turns "I could not look"
 * into "I looked and it was fine".
 *
 * Run: npm test
 */
import { test } from 'vitest'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  chooseDeployment,
  expandSeedEntries,
  fileNeverRan,
  groupFailures,
  isDownstream,
  parsePsqlErrors,
  readSeedFiles,
  resolveNamedSeeds,
  resolveSeedFiles,
  seedFlags,
  seedSectionFromConfig,
  seededTables,
} from '../check-deployment-seed-loads.mjs'

const CONFIG = `
[db]
port = 54322

[db.seed]
# If enabled, seeds the database after migrations during a db reset.
enabled = true
sql_paths = [
  "./seed.sql",
  "./seeds/second.sql",
  "./seeds/first.sql",
]

[db.network_restrictions]
enabled = false
`

test('the seed list is read in the order the deployment states it', () => {
  assert.deepEqual(seedSectionFromConfig(CONFIG), {
    enabled: true,
    sqlPaths: ['./seed.sql', './seeds/second.sql', './seeds/first.sql'],
  })
})

test('the section stops at the next table, so a later array is not read as seeds', () => {
  const withTrailer = `${CONFIG}\nsql_paths = ["./not-a-seed.sql"]\n`
  assert.deepEqual(seedSectionFromConfig(withTrailer).sqlPaths, [
    './seed.sql',
    './seeds/second.sql',
    './seeds/first.sql',
  ])
})

test('a config that states no seed section, or disables it, says so', () => {
  assert.equal(seedSectionFromConfig('[db]\nport = 54322\n'), null)
  assert.equal(seedSectionFromConfig('[db.seed]\nenabled = false\n').enabled, false)
})

test('a glob expands sorted, and a plain entry is left alone', () => {
  const list = (dir) => (dir === 'seeds' ? ['b.sql', 'a.sql', 'notes.md'] : ['seed.sql'])
  assert.deepEqual(expandSeedEntries(['./seed.sql', './seeds/*.sql'], list), [
    'seed.sql',
    'seeds/a.sql',
    'seeds/b.sql',
  ])
})

test('a seed with no config beside it is the whole seed', () => {
  const dir = mkdtempSync(join(tmpdir(), 'deployment-seed-'))
  mkdirSync(join(dir, 'supabase'))
  const seed = join(dir, 'supabase', 'seed.sql')
  writeFileSync(seed, 'select 1;\n')
  assert.deepEqual(resolveSeedFiles(seed), [seed])
})

/** A supabase directory holding `seed.sql`, `seeds/one.sql` and the given config. */
function deployment(sqlPaths) {
  const dir = mkdtempSync(join(tmpdir(), 'deployment-seed-'))
  const supabase = join(dir, 'supabase')
  mkdirSync(join(supabase, 'seeds'), { recursive: true })
  writeFileSync(join(supabase, 'seed.sql'), 'select 1;\n')
  writeFileSync(join(supabase, 'seeds', 'one.sql'), 'select 1;\n')
  writeFileSync(
    join(supabase, 'config.toml'),
    `[db.seed]\nenabled = true\nsql_paths = [${sqlPaths.map((p) => `"${p}"`).join(', ')}]\n`,
  )
  return supabase
}

test("the config's list wins over the named file, in the order it states", () => {
  const supabase = deployment(['./seeds/one.sql', './seed.sql'])
  assert.deepEqual(resolveSeedFiles(join(supabase, 'seed.sql')), [
    join(supabase, 'seeds', 'one.sql'),
    join(supabase, 'seed.sql'),
  ])
})

test('an entry with no file behind it stops the check instead of being dropped', () => {
  const supabase = deployment(['./seed.sql', './seeds/one.sql', './seeds/gone.sql'])
  // Dropping it would load the rest out of dependency order and report every
  // row that then failed as knock-on, with the cause absent from the output.
  assert.throws(() => resolveSeedFiles(join(supabase, 'seed.sql')), (error) => {
    assert.match(error.message, /seeds\/gone\.sql/)
    assert.match(error.message, /is not there/)
    assert.match(error.message, /sql_paths/)
    assert.equal(error.cause?.code, 'ENOENT')
    return true
  })
})

test('an entry that resolves to a directory stops it too, and says so differently', () => {
  const supabase = deployment(['./seed.sql', './seeds'])
  assert.throws(() => resolveSeedFiles(join(supabase, 'seed.sql')), (error) => {
    assert.match(error.message, /is not a file/)
    assert.equal(error.cause, undefined)
    return true
  })
})

/** The same tree, with a `[db.seed]` a deployment has deliberately emptied. */
function withSeedSection(body) {
  const dir = mkdtempSync(join(tmpdir(), 'deployment-seed-'))
  const supabase = join(dir, 'supabase')
  mkdirSync(join(supabase, 'seeds'), { recursive: true })
  writeFileSync(join(supabase, 'seed.sql'), 'select 1;\n')
  writeFileSync(join(supabase, 'seeds', 'one.sql'), 'select 1;\n')
  writeFileSync(join(supabase, 'config.toml'), `[db.seed]\n${body}\n`)
  return supabase
}

test('a [db.seed] the deployment emptied is a refusal, not a fallback to one file', () => {
  // THE DEFECT, pinned. A deployment that has taken its seed list out of
  // `config.toml` — to keep `db push --include-seed` from reaching it — used
  // to fall through to the named file, so this check read ONE of a deployment's
  // twenty-three seed files, found the tables that the other twenty-two fill
  // empty, and reported that as the anon role being unable to see them. It
  // named the wrong subsystem and prescribed a grant that was already granted.
  for (const body of [
    'enabled = false\nsql_paths = []',
    'enabled = false\nsql_paths = ["./seed.sql", "./seeds/one.sql"]',
    'sql_paths = []',
  ]) {
    const supabase = withSeedSection(body)
    assert.throws(() => resolveSeedFiles(join(supabase, 'seed.sql')), (error) => {
      assert.match(error.message, /\[db\.seed\]/)
      assert.match(error.message, /--seed/)
      return true
    })
  }
})

test('no [db.seed] at all still means the named file is the whole seed', () => {
  // The case that WORKS, asserted beside the one that did not, because the fix
  // is a distinction between them and a distinction can be drawn too far.
  const dir = mkdtempSync(join(tmpdir(), 'deployment-seed-'))
  const supabase = join(dir, 'supabase')
  mkdirSync(supabase, { recursive: true })
  writeFileSync(join(supabase, 'seed.sql'), 'select 1;\n')
  writeFileSync(join(supabase, 'config.toml'), '[db]\nport = 54322\n')
  assert.deepEqual(resolveSeedFiles(join(supabase, 'seed.sql')), [join(supabase, 'seed.sql')])
})

test('named seeds are the seed, in the order they were named', () => {
  const supabase = withSeedSection('enabled = false\nsql_paths = []')
  const one = join(supabase, 'seeds', 'one.sql')
  const base = join(supabase, 'seed.sql')
  // Explicit wins: an operator who names the files has answered the question
  // the config could not, so nothing else is consulted — not even the section
  // that would otherwise refuse.
  assert.deepEqual(resolveNamedSeeds([one, base]), [one, base])
  assert.deepEqual(resolveNamedSeeds([base, one]), [base, one])
})

test('a named seed that is not there stops the check, like an entry that is not', () => {
  const supabase = withSeedSection('enabled = false\nsql_paths = []')
  assert.throws(
    () => resolveNamedSeeds([join(supabase, 'seeds', 'gone.sql')]),
    /gone\.sql/,
  )
})

test('a glob is held to the same rule as a name it expands to', () => {
  const supabase = deployment(['./seeds/*.sql'])
  assert.deepEqual(resolveSeedFiles(join(supabase, 'seed.sql')), [
    join(supabase, 'seeds', 'one.sql'),
  ])
  mkdirSync(join(supabase, 'seeds', 'two.sql'))
  assert.throws(() => resolveSeedFiles(join(supabase, 'seed.sql')), /two\.sql is not a file/)
})

test('the seed text is read straight off the listing, and a gone path throws', () => {
  const dir = mkdtempSync(join(tmpdir(), 'deployment-seed-'))
  const first = join(dir, 'a.sql')
  const second = join(dir, 'b.sql')
  writeFileSync(first, 'insert into public.services (id) values (1);\n')
  writeFileSync(second, 'insert into public.cells (id) values (2);\n')
  assert.deepEqual(seededTables(readSeedFiles([first, second])), ['services', 'cells'])

  // Not skipped: the check's result counts these files, so a set it shrank
  // quietly would be a green that measured something else.
  assert.throws(() => readSeedFiles([first, join(dir, 'gone.sql')]), { code: 'ENOENT' })
  // And a path that is there but unreadable stays a different fact, as
  // the sweep's `read` keeps it for the listings that are deliberately stale.
  assert.throws(() => readSeedFiles([first, dir]), (error) => error.code !== 'ENOENT')
})

test('only the ERROR lines are failures; notices and detail lines are not', () => {
  const stderr = [
    'psql:supabase/seed.sql:11: ERROR:  relation "public.old_name" does not exist',
    'LINE 1: insert into public.old_name (id)',
    'psql:supabase/seed.sql:70: ERROR:  column "old_column" of relation "phases" does not exist',
    'psql:supabase/seed.sql:70: DETAIL:  Failing row contains (…)',
    'NOTICE:  renamed 11 objects',
  ].join('\n')
  assert.deepEqual(parsePsqlErrors(stderr), [
    {
      file: 'supabase/seed.sql',
      line: 11,
      message: 'relation "public.old_name" does not exist',
    },
    {
      file: 'supabase/seed.sql',
      line: 70,
      message: 'column "old_column" of relation "phases" does not exist',
    },
  ])
})

test('psql exiting non-zero with nothing to report means the file never ran', () => {
  const finding = { file: 'a.sql', line: 1, message: 'relation "x" does not exist' }
  assert.equal(fileNeverRan(1, []), true)
  assert.equal(fileNeverRan(0, []), false)
  // A seed that sets ON_ERROR_STOP in its own text exits non-zero with real
  // findings attached, and those findings are what this check is for.
  assert.equal(fileNeverRan(3, [finding]), false)
})

test('a knock-on failure is one of three shapes, and nothing else is', () => {
  assert.equal(isDownstream('insert or update on table "lanes" violates foreign key constraint "x"'), true)
  assert.equal(isDownstream('cells: lane_id does not exist'), true)
  assert.equal(isDownstream('current transaction is aborted, commands ignored until end of transaction block'), true)
  assert.equal(isDownstream('column "picture" of relation "cells" does not exist'), false)
})

test('current cell trigger refusals stay downstream of their missing parents', () => {
  const messages = [
    'This lane no longer exists. Reload the canvas',
    'Choose a lane on this path',
    'This step is not on this path. Reload the canvas',
  ]
  const failures = messages.map((message, index) => ({ file: 'seed.sql', line: index + 2, message }))
  failures.push({ file: 'seed.sql', line: 1, message: 'column "old_name" of relation "paths" does not exist' })
  const groups = groupFailures(failures)
  assert.equal(groups[0].message, failures[3].message)
  assert.deepEqual(groups.slice(1).map((group) => group.downstream), [true, true, true])
})

test('root causes come first, commonest first, with at most three examples each', () => {
  const failures = [
    ...Array.from({ length: 4 }, (_, i) => ({
      file: 'a.sql',
      line: i,
      message: 'lanes violates foreign key constraint "lanes_path_id_fkey"',
    })),
    { file: 'a.sql', line: 9, message: 'column "picture" of relation "cells" does not exist' },
    { file: 'b.sql', line: 1, message: 'column "picture" of relation "cells" does not exist' },
    { file: 'b.sql', line: 2, message: 'relation "public.old_name" does not exist' },
  ]
  const groups = groupFailures(failures)
  assert.deepEqual(
    groups.map((g) => [g.message, g.count, g.downstream]),
    [
      ['column "picture" of relation "cells" does not exist', 2, false],
      ['relation "public.old_name" does not exist', 1, false],
      ['lanes violates foreign key constraint "lanes_path_id_fkey"', 4, true],
    ],
  )
  assert.deepEqual(groups[2].examples, ['a.sql:0', 'a.sql:1', 'a.sql:2'])
})

test('the tables read back are the ones the seed INSERTS into, once each', () => {
  const sql = [
    'insert into public.services (id) values (1);',
    'INSERT INTO public.services (id) values (2);',
    'update public.cells set picture = null;',
    'delete from public.phases;',
    'insert into  public.cell_dependencies (id) values (3);',
  ].join('\n')
  assert.deepEqual(seededTables(sql), ['services', 'cell_dependencies'])
})

test('exactly one deployment beside this checkout is the one it runs against', () => {
  const candidates = [
    { dir: '/w/another-copy', name: 'uno-blueprint', hasSeed: true },
    { dir: '/w/their-app', name: 'their-app', hasSeed: true },
    { dir: '/w/no-database', name: 'other', hasSeed: false },
  ]
  assert.deepEqual(chooseDeployment(candidates, 'uno-blueprint'), {
    dir: '/w/their-app',
  })
})

test('none and several both skip, and the message says which it was', () => {
  const none = chooseDeployment(
    [{ dir: '/w/another-copy', name: 'uno-blueprint', hasSeed: true }],
    'uno-blueprint',
  )
  assert.match(none.skip, /no checkout beside this one/)

  const several = chooseDeployment(
    [
      { dir: '/w/their-app', name: 'their-app', hasSeed: true },
      { dir: '/w/other-app', name: 'other-app', hasSeed: true },
    ],
    'uno-blueprint',
  )
  assert.match(several.skip, /2 checkouts/)
  assert.match(several.skip, /their-app, other-app/)
  assert.match(several.skip, /--seed/)
})

test('--seed takes the next argument, and refuses to swallow the next flag', () => {
  assert.deepEqual(seedFlags(['--seed', '../their-app/supabase/seed.sql']), [
    '../their-app/supabase/seed.sql',
  ])
  assert.deepEqual(seedFlags([]), [])
  assert.throws(() => seedFlags(['--seed']))
  assert.throws(() => seedFlags(['--seed', '--verbose']))
  // A deployment whose seed is many files has to be able to say so, which is
  // the whole reason the flag stopped being singular.
  assert.deepEqual(seedFlags(['--seed', 'a.sql', '--seed', 'b.sql']), ['a.sql', 'b.sql'])
  assert.deepEqual(seedFlags(['--seed', 'a.sql,b.sql']), ['a.sql', 'b.sql'])
  assert.deepEqual(seedFlags(['--seed', ' a.sql , b.sql ']), ['a.sql', 'b.sql'])
})
