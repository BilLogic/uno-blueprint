#!/usr/bin/env node
/**
 * Emit the portable Postgres core and the Supabase recipe from the migrations.
 *
 * The package has always claimed a partition — "this half runs on any
 * Postgres, that half is how Supabase enforces it" — and for a year the claim
 * lived in the header comment of a file nobody executed. `schema.reference.sql`
 * was hand-refreshed beside a tree that moved underneath it, which is the drift
 * surface this estate keeps paying for. So the partition is now marked in the
 * migrations, which ARE executed, and both halves are generated from the marks.
 *
 * The marks are two directives, on their own line, in migration SQL:
 *
 *   -- @recipe — why this half is Supabase's
 *   -- @core
 *
 * A file starts in the core and stays there until a `@recipe` line; `@core`
 * returns. Everything between them goes to the recipe. That is the whole
 * syntax: no per-statement annotation, no second copy of any SQL.
 *
 * Two files come out:
 *
 *   supabase/generated/portable-core.generated.sql
 *   supabase/generated/supabase-recipe.generated.sql
 *
 * The core applies to a stock `postgres:17` with no shim and no Supabase; the
 * recipe applies on top of it. CI does both on every pull request, which is
 * what makes the claim a fact rather than a sentence.
 *
 * Both paths are read and written under the tree the command was run in. The
 * migrations arrive from the `migrations` subject and the two files are written
 * beside them, under `process.cwd()`; where this script's own file sits says
 * nothing about which tree is being generated, and a generator that resolved
 * its output off its own location would write into the package a deployment
 * installed.
 *
 *   node scripts/generate-portable-core.mjs            # write both files
 *   node scripts/generate-portable-core.mjs --check    # regenerate and diff
 *
 * ---------------------------------------------------------------------------
 * The one hard part: the recipe speaks the CURRENT vocabulary.
 *
 * The core is a replay of history, and history includes ten renames in the
 * 21000103..21000109 band. Replay the core and `public.layers` is `public.lanes`
 * by the end of it. A recipe fragment written in 20260729120000 still says
 * `layers`, and applying it after the core would fail on a table that no longer
 * exists under that name.
 *
 * So the renames the core performs are followed through into every recipe
 * fragment that predates them. The map is not hand-written — a second
 * hand-maintained artifact is the thing this script exists to delete. It is
 * read out of the core stream itself, from the statements that do the
 * renaming:
 *
 *   alter table public.X rename to Y            identifier X → Y
 *   alter function public.f(…) rename to g      identifier f → g
 *   alter table public.T rename column A to B   identifier A → B
 *   select public.__rename_schema_objects(a, b) substring a → b, in the names
 *                                               of dependent objects only
 *
 * The third mirrors what that function does in the catalog (see
 * 21000102000000): a substring `replace()` over constraint, index, policy and
 * trigger NAMES. In a recipe fragment those names are the quoted policy names,
 * so the substitution is confined to double-quoted text — which is why
 * "layers_update_auth" becomes "lanes_update_auth" and `public.layers` becomes
 * `public.lanes`, by two different rules, exactly as the database does it.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { sweep } from './sweep.mjs'

const OUT_DIR = resolve(process.cwd(), 'supabase/generated')

export const CORE_FILE = 'portable-core.generated.sql'
export const RECIPE_FILE = 'supabase-recipe.generated.sql'

const DIRECTIVE = /^--\s*@(recipe|core)\b\s*(?:—|-{1,2}|:)?\s*(.*)$/

/**
 * Split one migration into its two halves, keeping line order within each.
 *
 * The directive line itself is not SQL. Its trailing prose is the reason the
 * partition falls where it does, which is the most useful comment in either
 * output file, so it is carried across as a comment rather than dropped.
 */
export function partition(sql) {
  const core = []
  const recipe = []
  let half = core
  for (const line of sql.split('\n')) {
    const directive = DIRECTIVE.exec(line)
    if (directive) {
      const [, which, reason] = directive
      half = which === 'recipe' ? recipe : core
      if (reason.trim() !== '') half.push(`-- ${reason.trim()}`)
      continue
    }
    half.push(line)
  }
  return { core: trim(core), recipe: trim(recipe) }
}

/** Drop leading and trailing blank lines; keep the shape in between. */
function trim(lines) {
  let start = 0
  let end = lines.length
  while (start < end && lines[start].trim() === '') start += 1
  while (end > start && lines[end - 1].trim() === '') end -= 1
  return lines.slice(start, end)
}

/**
 * The renames — and the column drops — a core fragment performs, in the
 * order it performs them.
 *
 * Only these four forms change anything a recipe fragment can name. A rename
 * this misses shows up as a recipe that will not apply, which is a CI failure
 * and not a silent one. A drop is the same class of change: a column-scoped
 * grant written in 21000113000000 still named `screenshots` after
 * 21000119000000 dropped it, and the recipe refused to apply on top of the
 * core it was written for. A dropped TABLE is that same argument one size up —
 * the row-level security, the policy and the grants a fragment wrote for a
 * table the core later drops describe a relation that is not there by the time
 * the recipe runs, and Postgres dropped every one of them with the table, so
 * the fragment says what the database holds either way.
 *
 * A table rename is global — the name is unique in the schema, so every
 * mention of it is a mention of that table. A COLUMN rename is not: a column
 * name is unique only within its table, and `note`, `description`, `status`
 * and `position` are each spelled the same way on several tables at once.
 * So a column rename carries the table it happened on, and is applied only
 * where that table is spoken of. Without the table it is a text rule with no
 * idea what it is renaming — `findings.note → summary` in 21000116000000 read
 * `grant update (name, description, note, path_type) on public.paths` and
 * emitted `(name, summary, summary, kind)`, which silently deleted the grant
 * on `paths.note` and refused every save the path panel makes.
 */
export function renamesIn(sql) {
  const ops = []
  const table = /^\s*alter table (?:if exists )?(?:public\.)?(\w+)\s+rename to (\w+);/gim
  const column = /^\s*alter table (?:if exists )?(?:public\.)?(\w+)\s+rename column\s+(\w+)\s+to\s+(\w+);/gim
  const objects = /^\s*select public\.__rename_schema_objects\(\s*'([^']+)'\s*,\s*'([^']+)'\s*\);/gim
  // A function rename is global, as a table rename is: no two functions here
  // share a name, so every mention of the old one is a mention of that one.
  const fn = /^\s*alter function (?:public\.)?(\w+)\s*\([^)]*\)\s+rename to (\w+);/gim
  // One `alter table` may drop several columns in one statement.
  const alter = /^\s*alter table (?:if exists )?(?:public\.)?(\w+)\b([^;]*);/gim
  const dropped = /\bdrop column (?:if exists )?(\w+)/gi
  const droppedTable = /^\s*drop table (?:if exists )?(?:public\.)?(\w+)\s*(?:cascade|restrict)?\s*;/gim
  const found = []
  for (const [match, from, to] of sql.matchAll(table)) {
    found.push([sql.indexOf(match), { kind: 'identifier', from, to }])
  }
  for (const [match, table_, from, to] of sql.matchAll(column)) {
    found.push([sql.indexOf(match), { kind: 'column', table: table_, from, to }])
  }
  for (const [match, from, to] of sql.matchAll(fn)) {
    found.push([sql.indexOf(match), { kind: 'identifier', from, to }])
  }
  for (const [match, from, to] of sql.matchAll(objects)) {
    found.push([sql.indexOf(match), { kind: 'object-name', from, to }])
  }
  for (const [match, table_, body] of sql.matchAll(alter)) {
    for (const [, column_] of body.matchAll(dropped)) {
      found.push([sql.indexOf(match), { kind: 'dropped-column', table: table_, column: column_ }])
    }
  }
  for (const [match, table_] of sql.matchAll(droppedTable)) {
    found.push([sql.indexOf(match), { kind: 'dropped-table', table: table_ }])
  }
  found.sort((a, b) => a[0] - b[0])
  for (const [, op] of found) ops.push(op)
  return ops
}

/**
 * Cut a fragment into statements, so a column rename can ask which table a
 * given piece of SQL is talking about.
 *
 * Splitting on `;` is only correct if the `;` inside a dollar-quoted function
 * or `do` body does not count, and those bodies are everywhere in this schema.
 * So the scan tracks the two quoting forms that can hide a semicolon —
 * `'…'` (with `''` escaping) and `$tag$…$tag$` — and cuts nowhere else. The
 * pieces include their delimiters and their leading comments, and joining them
 * back reproduces the input exactly; a rule that only rewrites some of them
 * therefore leaves the rest byte-identical.
 */
export function statements(sql) {
  const pieces = []
  let start = 0
  let i = 0
  while (i < sql.length) {
    const char = sql[i]
    if (char === "'") {
      i += 1
      while (i < sql.length && !(sql[i] === "'" && sql[i + 1] !== "'")) {
        i += sql[i] === "'" ? 2 : 1
      }
      i += 1
      continue
    }
    const tag = /^\$[A-Za-z_]\w*\$|^\$\$/.exec(sql.slice(i))
    if (tag) {
      const close = sql.indexOf(tag[0], i + tag[0].length)
      i = close === -1 ? sql.length : close + tag[0].length
      continue
    }
    if (char === ';') {
      pieces.push(sql.slice(start, i + 1))
      start = i + 1
    }
    i += 1
  }
  if (start < sql.length) pieces.push(sql.slice(start))
  return pieces
}

/** One rename, applied to a recipe fragment that predates it. */
export function applyRename(sql, op) {
  if (op.kind === 'identifier') {
    return sql.replace(new RegExp(`\\b${op.from}\\b`, 'g'), op.to)
  }
  if (op.kind === 'column') {
    // Scoped to the table it happened on. A statement that never names the
    // table cannot be naming that table's column, so it is left alone — which
    // is what keeps `findings.note → summary` out of the grant list on
    // `paths`. A statement that names two tables gets both their renames,
    // which is the same answer the database gives: both columns did move.
    const word = new RegExp(`\\b${op.from}\\b`, 'g')
    const speaksOf = new RegExp(`\\b(?:public\\.)?${op.table}\\b`, 'i')
    return statements(sql)
      .map((piece) => (speaksOf.test(piece) ? piece.replace(word, op.to) : piece))
      .join('')
  }
  if (op.kind === 'dropped-table') {
    // The table is gone by the time the recipe runs, and Postgres took its
    // policy and its grants with it, so a fragment that still enables RLS on
    // it or grants SELECT on it describes nothing. The statements come out
    // and a comment says which drop removed them, so the recipe reads as a
    // record of what happened rather than as a file with a hole in it.
    const speaksOf = new RegExp(`\\b(?:public\\.)?${op.table}\\b`, 'i')
    let removed = 0
    const kept = statements(sql).filter((piece) => {
      if (piece.trim() === '' || !speaksOf.test(piece)) return true
      removed += 1
      return false
    })
    if (removed === 0) return sql
    return `${kept.join('')}\n-- ${removed} statement(s) on public.${op.table} are not here: a later\n-- migration drops that table, and its policy and grants went with it.\n`
  }
  if (op.kind === 'dropped-column') {
    // A column-scoped grant on the table loses the column from its list.
    // Postgres drops the grant with the column, so the fragment says what
    // the database holds either way; this only keeps it applying. A policy
    // that reads the column is the migration author's to rewrite — it
    // would be wrong, not just stale.
    const grant = new RegExp(
      `(\\bgrant\\s+(?:select|insert|update|references)\\s*\\()([^)]*)(\\)\\s*on\\s+(?:public\\.)?${op.table}\\b)`,
      'gi',
    )
    return sql.replace(grant, (whole, open, list, close) => {
      const kept = list
        .split(',')
        .map((name) => name.trim())
        .filter((name) => name && name !== op.column)
      return `${open}${kept.join(', ')}${close}`
    })
  }
  // Dependent-object names. In a recipe fragment those are the quoted policy
  // names, and `__rename_schema_objects` replaces the substring wherever it
  // sits inside one — `layers_update_auth` under ('layer','lane') becomes
  // `lanes_update_auth`, which a word-boundary rule would never produce.
  return sql.replace(/"([^"\n]*)"/g, (whole, name) =>
    name.includes(op.from) ? `"${name.split(op.from).join(op.to)}"` : whole,
  )
}

const BANNER = (name) =>
  `-- ─────────────────────────────────────────────────────────────────────────\n` +
  `-- ${name}\n` +
  `-- ─────────────────────────────────────────────────────────────────────────`

const HEADER = (which, what) => `-- ${which}
--
-- ⚠ GENERATED FILE — DO NOT EDIT. Every line below was emitted from the
-- partition marks in supabase/migrations/. Edit the migration, then run
-- \`npm run generate:portable-core\`. A hand-edit is reverted by CI, which
-- regenerates this file and fails on any difference.
--
${what}
-- ─────────────────────────────────────────────────────────────────────────`

const CORE_HEADER = HEADER(
  'The portable Postgres core.',
  `-- This is the contract. It is the tables, columns, constraints, indexes,
-- views, triggers and function bodies a backend has to carry to hold a
-- service blueprint, and it applies to a stock \`postgres:17\` with nothing
-- in front of it — no Supabase, no shim, no roles that do not ship with
-- Postgres. CI proves that on every pull request.
--
-- What is NOT here is everything that names a Supabase primitive: the
-- \`auth.uid()\` column defaults, the anon / authenticated / service_role
-- grants, the RLS policies, the storage bucket. Those are the recipe, and
-- another host re-expresses them with its own auth and authorization —
-- keeping the semantics, replacing the primitives.
--
-- SECURITY DEFINER stays here on purpose. It is plain Postgres, and the
-- write RPCs need it wherever they run: they are the sanctioned write path
-- precisely because they perform one complete valid edit with the owner's
-- rights. What Supabase supplies is the caller classes those functions are
-- granted to, not the definer semantics.`,
)

const RECIPE_HEADER = HEADER(
  'The Supabase recipe — one conformant reference implementation.',
  `-- ⚠ GENERATED, and also OPTIONAL. Applied on top of the portable core, this
-- is how *Supabase* enforces the contract: request-scoped attribution from
-- \`auth.uid()\`, the anon / authenticated / service_role grants, the RLS
-- policies, the storage bucket for slice illustrations, and the optional
-- service-account tier.
--
-- It is fully supported — this is what the shipped app runs on. It is not
-- the contract. Another host writes its own recipe against the same core and
-- is just as conformant, which is the point of the partition.
--
-- Applying this needs the Supabase primitives to exist. In CI that is
-- supabase/portable/supabase-shim.sql, a harness and not something an
-- adopter installs.
--
-- Fragments carry the CURRENT vocabulary, not the one their migration was
-- written in: the core's renames are followed through. See the generator.`,
)

/**
 * Nothing in the core may name a Supabase primitive.
 *
 * The partition is a claim about what the core needs, and this is the cheapest
 * place to falsify it — an unmarked grant is caught on a laptop in
 * milliseconds instead of by a container six minutes later.
 *
 * Prose is stripped first, in both the forms this schema writes it: `--`
 * comments and the text of `comment on`. The migrations discuss anon and
 * auth.users at length, and three COMMENT bodies name them outright.
 * Describing a primitive is not depending on one. Dollar-quoted function
 * bodies are deliberately NOT stripped — an `auth.uid()` inside a definer
 * body is exactly the kind of dependency this is looking for.
 */
const FORBIDDEN = [
  [/\bauth\.\w+/g, 'the auth schema'],
  [/\bstorage\.\w+/g, 'the storage schema'],
  [/\banon\b/g, 'the anon role'],
  [/\bauthenticated\b/g, 'the authenticated role'],
  [/\bservice_role\b/g, 'the service_role role'],
]

export function supabaseLeaks(sql) {
  const bare = sql
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .split('\n')
    .map((line) => line.replace(/--.*$/, ''))
    .join('\n')
    .replace(/\bcomment on\b[\s\S]*?'\s*;/gi, ' ')
  const leaks = []
  for (const [pattern, what] of FORBIDDEN) {
    for (const [match] of bare.matchAll(pattern)) {
      leaks.push(`${what}: ${match}`)
    }
  }
  return [...new Set(leaks)]
}

export function generate(files) {
  const coreParts = [CORE_HEADER]
  const recipeParts = [RECIPE_HEADER]
  // Recipe fragments are held until every later migration's renames are known.
  const pending = []
  for (const { name, sql } of files) {
    const { core, recipe } = partition(sql)
    const ops = renamesIn(core.join('\n'))
    for (const held of pending) {
      for (const op of ops) held.text = applyRename(held.text, op)
    }
    if (core.length > 0) coreParts.push(BANNER(name), core.join('\n'))
    if (recipe.length > 0) pending.push({ name, text: recipe.join('\n') })
  }
  for (const held of pending) recipeParts.push(BANNER(held.name), held.text)
  return {
    core: `${coreParts.join('\n\n')}\n`,
    recipe: `${recipeParts.join('\n\n')}\n`,
  }
}

/**
 * The migrations to generate from, in apply order, as `{ name, sql }`.
 *
 * The files come from the `migrations` subject rather than from a directory
 * this file resolves off its own location: what is generated is a statement
 * about the tree the command was run in, and the tree a command runs in is the
 * sweep's question. A file the listing named and the read cannot find — the
 * sweep's one null — is a FAILURE here and not a skip: the output is the whole
 * migration series concatenated, and a series quietly missing a member still
 * writes two plausible files and passes `--check` on the next run. So the
 * refusal names the file that went.
 */
function readMigrations() {
  const swept = sweep({ subject: 'migrations', what: 'migration' })
  return swept.files.map((path) => {
    const sql = swept.read(path)
    if (sql === null) {
      throw new Error(
        `${path} was listed under ${swept.base} and is no longer there: the generated ` +
          'partition is the whole series, so a member that vanished mid-run cannot be ' +
          'passed over. Re-run once the tree has settled.',
      )
    }
    return { name: basename(path), sql }
  })
}

function main() {
  const check = process.argv.includes('--check')
  const { core, recipe } = generate(readMigrations())

  const leaks = supabaseLeaks(core)
  if (leaks.length > 0) {
    console.error(
      'The portable core names things only Supabase provides:\n',
    )
    for (const leak of leaks) console.error(`  ${leak}`)
    console.error(
      '\nMark the statement that reaches for it `-- @recipe` in its migration. ' +
        'The core is what an adopter carries to a plain Postgres; it cannot ' +
        'depend on the host it is meant to be independent of.',
    )
    process.exit(1)
  }

  const outputs = [
    [CORE_FILE, core],
    [RECIPE_FILE, recipe],
  ]
  if (!check) {
    mkdirSync(OUT_DIR, { recursive: true })
    for (const [name, text] of outputs) writeFileSync(resolve(OUT_DIR, name), text)
    console.log(`wrote supabase/generated/${CORE_FILE} and ${RECIPE_FILE}`)
    return
  }

  const stale = []
  for (const [name, text] of outputs) {
    let committed = null
    try {
      committed = readFileSync(resolve(OUT_DIR, name), 'utf8')
    } catch {
      stale.push(`supabase/generated/${name} is missing`)
      continue
    }
    if (committed !== text) stale.push(`supabase/generated/${name} is out of date`)
  }
  if (stale.length > 0) {
    console.error('The generated partition no longer matches the migrations:\n')
    for (const problem of stale) console.error(`  ${problem}`)
    console.error(
      '\nA migration changed the core or the recipe and the generated output ' +
        'was not refreshed. Run `npm run generate:portable-core` and commit ' +
        'the result.',
    )
    process.exit(1)
  }
  console.log('the generated portable core and Supabase recipe match the migrations')
}

// Same shape as scripts/sync-cover-assets.mjs: comparing against a hand-built
// `file://` URL silently no-ops whenever the path needs escaping.
const isMain =
  process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)

if (isMain) main()
