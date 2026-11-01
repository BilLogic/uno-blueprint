#!/usr/bin/env node
/**
 * Editing a dependency where it sits: one function, and the declarations that
 * make it the same kind of write as its siblings.
 *
 * THE BEHAVIOUR IS PERFORMED IN THE MIGRATION, not here, because it needs a
 * database and a pull request's unit run has none. The migration builds a
 * fixture, changes an edge's kind and then its target through the new
 * function, and raises unless one row survives each time, the returned row is
 * the row as it stood, and feeding that row straight back puts the edge where
 * it started. CI replays it on a stock Postgres.
 *
 * What is here is the DECLARATION side: the signature, the grants, the one
 * statement that writes, and the proof's own claims. Each is shown going red
 * against a copy with the declaration cut out, because a search that found
 * nothing passes exactly as loudly as a search that agreed.
 *
 * Run: npm test
 */
import { test } from 'vitest'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { sweep } from '../sweep.mjs'

const REPO_ROOT = process.cwd()
const app = sweep({ subject: 'app', root: REPO_ROOT })

/**
 * A file of this tree, or a file of the application wherever it sits.
 *
 * The migrations are this tree's — a deployment applies them from here and
 * keeps no copy — and the two `src/…` modules below are the APPLICATION's,
 * which a deployment reads out of `node_modules/uno-blueprint`
 * rather than from beside its `scripts/`. Resolving both against
 * `process.cwd()` named a file that is not there, so the check that holds the
 * canvas and the migration to one word failed where a deployment ran it. The
 * split is the same one `check-database-names.mjs` makes and is made the same
 * way: a path starting `src/` is the application's, which the `app` sweep
 * resolves through the overlay, and everything else is this tree's. Both halves
 * REFUSE a file that is absent — a subject that is gone is this check's subject
 * gone, not a smaller one — which is why the sweep's null is asserted away
 * rather than returned.
 */
const read = (path) => {
  if (!/^src(?:\/|$)/.test(path)) return readFileSync(resolve(REPO_ROOT, path), 'utf8')
  const text = app.read(path)
  assert.ok(text !== null, `no ${path} under ${app.base}: this test has no subject`)
  return text
}

const EDIT_MIGRATION =
  'supabase/migrations/21000226000000_a_dependency_can_be_edited_where_it_sits.sql'
/** Where the sibling that only ever deletes an edge was granted. */
const SIBLING_MIGRATION = 'supabase/migrations/20260818001000_authoring_operations.sql'

/** The `update` statement inside the new function, and nothing else. */
export function updateStatement(sql) {
  const match = sql.match(/update public\.cell_dependencies d\b[\s\S]*?where d\.id = previous\.id;/)
  return match ? match[0] : ''
}

/** Every `raise exception` message the file can produce. */
export function raiseMessages(sql) {
  return [...sql.matchAll(/raise exception\s+'([^']*)'/g)].map((m) => m[1])
}

/**
 * Which band a line of migration SQL falls in. A file starts in the core and
 * stays there until a `-- @recipe` line; `-- @core` returns — the same rule
 * the generator that splits the two halves applies.
 */
export function bandAt(sql, index) {
  let band = 'core'
  for (const line of sql.slice(0, index).split('\n')) {
    if (/^\s*--\s*@recipe\b/.test(line)) band = 'recipe'
    else if (/^\s*--\s*@core\b/.test(line)) band = 'core'
  }
  return band
}

/**
 * The execute privileges a file hands out on one function, as sorted
 * `verb role band` strings: `revoke public core`, `grant authenticated recipe`.
 * Roles in one statement are split, so `from public, anon` reads as two.
 */
export function executeAcl(sql, fn) {
  const pattern = new RegExp(
    `(grant|revoke)\\s+execute\\s+on\\s+function\\s+public\\.${fn}\\([^)]*\\)\\s+(?:to|from)\\s+([a-z_,\\s]+?);`,
    'gi',
  )
  const out = []
  for (const match of sql.matchAll(pattern)) {
    const band = bandAt(sql, match.index)
    for (const role of match[2].split(',').map((r) => r.trim()).filter(Boolean)) {
      out.push(`${match[1].toLowerCase()} ${role} ${band}`)
    }
  }
  return out.sort()
}

/* --------------------------------------------------------- the new function */

test('the edit is one function, and every argument is required', () => {
  const sql = read(EDIT_MIGRATION)
  // Four arguments, all required. A default on any of them would make an
  // omitted argument a silent erase — an update told nothing about the note
  // would clear it — rather than a loud "function does not exist".
  const signature =
    /create or replace function public\.update_cell_dependency\(\s*dependency_id uuid,\s*kind text,\s*target_cell_id uuid,\s*note text\s*\)/i
  assert.match(sql, signature)
  assert.doesNotMatch(sql, /update_cell_dependency\([^)]*default/i)
  assert.match(sql, /security definer/i)
  assert.match(sql, /if not public\.is_service_account\(\) then/)

  // Red: a signature that grew a default stops matching.
  assert.doesNotMatch(sql.replace(/note text\s*\)/, 'note text default null)'), signature)
})

test('it is granted exactly as the sibling that deletes an edge is', () => {
  const sql = read(EDIT_MIGRATION)
  const mine = executeAcl(sql, 'update_cell_dependency')
  const sibling = executeAcl(read(SIBLING_MIGRATION), 'clear_cell_dependency')

  // The PUBLIC revoke is core — Postgres grants EXECUTE to PUBLIC on every
  // new function, on any Postgres. The anon revoke and the authenticated
  // grant are the recipe's, because they name roles only a Supabase
  // deployment has.
  assert.deepEqual(mine, [
    'grant authenticated recipe',
    'revoke anon recipe',
    'revoke public core',
  ])
  assert.deepEqual(mine, sibling)

  // Red: a grant the siblings do not carry is caught, and so is a grant that
  // slipped into the core, where a stock Postgres has no such role.
  const wider = `${sql}\ngrant execute on function public.update_cell_dependency(uuid, text, uuid, text) to service_role;\n`
  assert.notDeepEqual(executeAcl(wider, 'update_cell_dependency'), sibling)
  const coreGrant = sql.replace(/--\s*@recipe[^\n]*\n/, '\n')
  assert.notDeepEqual(executeAcl(coreGrant, 'update_cell_dependency'), sibling)
})

test('it carries the note and leaves the name as it stood', () => {
  const statement = updateStatement(read(EDIT_MIGRATION))
  assert.notEqual(statement, '', 'the function has no update statement')
  // The note travels on every write, including the ones that are not about it:
  // an update told nothing about the note would clear it on a kind change.
  assert.match(statement, /note = nullif\(btrim\(update_cell_dependency\.note\), ''\)/)
  assert.match(statement, /kind = update_cell_dependency\.kind/)
  assert.match(statement, /target_cell_id = update_cell_dependency\.target_cell_id/)
  // `name` is not the panel's to edit. The function neither reads nor writes
  // it, so an edit in place leaves it exactly as the row held it.
  assert.doesNotMatch(statement, /\bname\s*=/)

  // Red: the assertion above finds a reinstated write.
  assert.match(
    statement.replace('kind = update_cell_dependency.kind', 'name = null, kind = update_cell_dependency.kind'),
    /\bname\s*=/,
  )
})

test('the returned row is the row as it stood', () => {
  const sql = read(EDIT_MIGRATION)
  // `previous`, captured and locked before the update — an inverse built from
  // the row as it now stands would redo the edit rather than undo it.
  assert.match(sql, /for update;/)
  for (const field of ['id', 'source_cell_id', 'target_cell_id', 'kind', 'note']) {
    assert.match(
      sql,
      new RegExp(`'${field}', previous\\.${field}`),
      `the returned row does not carry ${field} as it stood`,
    )
  }
})

/* ------------------------------------------------------------- the proof */

test('the proof holds a service claim, and skips where none can be held', () => {
  const sql = read(EDIT_MIGRATION)
  // The claim the function's first line asks for, set as the GUC Supabase
  // reads it from. A GUC, not a role: the core replays onto a stock Postgres
  // where `authenticated` is not a role at all.
  assert.match(sql, /request\.jwt\.claims/)
  assert.match(sql, /"app_metadata":\{"role":"service"\}/)
  // Behind the portable shim no session can be a service account. Asked
  // rather than assumed, and skipped with a notice rather than faked.
  assert.match(sql, /raise notice\s*\n?\s*'edit-in-place proof skipped/)

  // Red.
  assert.doesNotMatch(sql.replace(/raise notice\s*\n?\s*'edit-in-place proof skipped/g, ''), /edit-in-place proof skipped/)
})

test('the proof pins one row per edit, performs the undo, and gives its fixture back', () => {
  const messages = raiseMessages(read(EDIT_MIGRATION))
  const has = (fragment) => messages.some((m) => m.includes(fragment))
  // The defect the function exists to fix: through the upsert, a kind change
  // leaves two rows and a target change leaves three.
  assert.ok(has('a kind change left'), 'nothing asserts the row count after a kind change')
  assert.ok(has('a target change left'), 'nothing asserts the row count after a target change')
  assert.ok(has('the edited row is gone'), 'nothing asserts the surviving row is the one edited')
  assert.ok(has('the returned row is not the row as it stood'), 'the returned row is not checked')
  assert.ok(has('undo left the edge as'), 'the undo is not performed')
  assert.ok(has('the name did not survive the edit'), 'nothing asserts the edit left the name alone')
  assert.ok(has('the edit-in-place fixture survived the rollback'), 'nothing checks the fixture was given back')

  // Red: the messages are what carry the claims, so a proof reduced to its
  // fixture stops satisfying any of them.
  assert.equal(
    raiseMessages(read(EDIT_MIGRATION).replace(/raise exception\s+'a kind change left[^;]*;/, '')).some(
      (m) => m.includes('a kind change left'),
    ),
    false,
  )
})

test('the drawn kind the proof counts is the kind the canvas filters on', () => {
  // "leads_to draws an arrow and enables does not, and that survives a kind
  // change" is two claims in two places. The migration proves the data half —
  // the count of `leads_to` rows goes to 0 and back to 1 across the change —
  // and this is the line that makes that count the thing that draws.
  // Both arrangements draw from `getComparePathArrowData`; the filter there is
  // the one the canvas runs.
  const arrows = read('src/lib/sideBySideCompareLayout.ts')
  assert.match(arrows, /kind \?\? 'leads_to'\) === 'leads_to'/)
  assert.match(read(EDIT_MIGRATION), /kind = 'leads_to'/)
})

/* ---------------------------------------------------------------- the app */

test('the wrapper sends the four arguments and nothing else', () => {
  const rpc = read('src/lib/authoringRpc.ts')
  const body = rpc.match(/export function updateCellDependency\(([\s\S]*?)\n\}/)?.[0] ?? ''
  assert.notEqual(body, '', 'updateCellDependency is gone')
  const sent = body.match(/call<[^>]+>\(client, 'update_cell_dependency', \{([\s\S]*?)\}\)/)?.[1] ?? ''
  const keys = [...sent.matchAll(/^\s*([a-z_]+):/gm)].map((m) => m[1]).sort()
  assert.deepEqual(keys, ['dependency_id', 'kind', 'note', 'target_cell_id'])

  // Red: a wrapper that also sent the name would be caught.
  const widened = sent.replace('note:', 'name: null,\n    note:')
  assert.notDeepEqual([...widened.matchAll(/^\s*([a-z_]+):/gm)].map((m) => m[1]).sort(), keys)
})
