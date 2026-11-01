#!/usr/bin/env node
/**
 * The partition: where the marks put a statement, and what happens to a recipe
 * fragment when the core renames the table under it.
 *
 * The rename-following is the part worth pinning. A recipe fragment written in
 * 20260729120000 says `public.layers`; by the end of the core replay that table
 * is `public.lanes`, and the fragment is applied AFTER the whole core. Two
 * different rules move it there — a word-boundary rule for identifiers and a
 * substring rule for the names of dependent objects — and the difference
 * between them is why `"layers_update_auth"` becomes `"lanes_update_auth"`
 * while `public.layers` becomes `public.lanes`.
 *
 * Run: npm test
 */
import { test } from 'vitest'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  applyRename,
  generate,
  partition,
  renamesIn,
  statements,
  supabaseLeaks,
  CORE_FILE,
  RECIPE_FILE,
} from '../generate-portable-core.mjs'

const ROOT = fileURLToPath(new URL('../../', import.meta.url))

/**
 * A repository file, read.
 *
 * The generated schema and the recipe are THIS tree's — a deployment applies
 * its own migrations — so they stay a plain path off the repository root.
 * Nothing here reads the application: the inventory check's own fixtures moved
 * to `schema-inventory.test.mjs`, where the file they read about is the
 * subject rather than a lodger.
 */
const read = (path) => readFileSync(join(ROOT, path), 'utf8')

test('a file is core until a mark says otherwise, and the mark carries its reason', () => {
  const { core, recipe } = partition(
    [
      'create table public.cells (id uuid);',
      '-- @recipe — the anon grant',
      'grant select on public.cells to anon;',
      '-- @core',
      'create index cells_id_idx on public.cells (id);',
    ].join('\n'),
  )
  assert.deepEqual(core, [
    'create table public.cells (id uuid);',
    'create index cells_id_idx on public.cells (id);',
  ])
  assert.deepEqual(recipe, ['-- the anon grant', 'grant select on public.cells to anon;'])
})

test('the renames a core fragment performs are read out of it in order', () => {
  const ops = renamesIn(
    [
      'alter table public.layers rename to lanes;',
      'alter table public.lanes rename column layer_role to lane_role;',
      "select public.__rename_schema_objects('layer', 'lane');",
    ].join('\n'),
  )
  assert.deepEqual(ops, [
    { kind: 'identifier', from: 'layers', to: 'lanes' },
    { kind: 'column', table: 'lanes', from: 'layer_role', to: 'lane_role' },
    { kind: 'object-name', from: 'layer', to: 'lane' },
  ])
})

test('a function rename follows into an earlier recipe grant', () => {
  // A recipe fragment that granted a function by its old name would refuse to
  // apply on top of a core that renamed it.
  const { recipe } = generate([
    {
      name: '001_fn.sql',
      sql: [
        'create function public.confirm_cell(p uuid) returns void language sql as $$ select $$;',
        '-- @recipe',
        'grant execute on function public.confirm_cell(uuid) to authenticated;',
      ].join('\n'),
    },
    { name: '002_rename.sql', sql: 'alter function public.confirm_cell(uuid) rename to approve_cell;' },
  ])
  assert.match(recipe, /grant execute on function public\.approve_cell\(uuid\) to authenticated;/)
  assert.doesNotMatch(recipe, /confirm_cell/)
})

test('a column rename stops at the table it happened on', () => {
  // 21000116000000 renamed `findings.note` to `summary`. `paths.note` is a
  // different column that happens to share the spelling, and the grant list
  // 20260818000000 wrote for `paths` predates the rename. A text-global rule
  // rewrote that list to `(name, summary, summary, kind)` — two `summary`
  // entries, no `note` — which dropped the grant on the column the path
  // panel writes on every save.
  const { recipe } = generate([
    {
      name: '001_tables.sql',
      sql: [
        'create table public.findings (id uuid, note text);',
        'create table public.paths (id uuid, name text, note text);',
        '-- @recipe',
        'grant update (name, note) on public.paths to authenticated;',
        'grant update (note) on public.findings to authenticated;',
      ].join('\n'),
    },
    { name: '002_rename.sql', sql: 'alter table public.findings rename column note to summary;' },
  ])
  assert.match(recipe, /grant update \(name, note\) on public\.paths to authenticated;/)
  assert.match(recipe, /grant update \(summary\) on public\.findings to authenticated;/)
})

test('a statement is cut at a semicolon, and never at one inside a body', () => {
  const sql = [
    'grant update (note) on public.paths to authenticated;',
    "do $p$ begin raise exception 'a; b'; end $p$;",
    'grant update (note) on public.findings to authenticated;',
  ].join('\n')
  assert.equal(statements(sql).length, 3)
  assert.equal(statements(sql).join(''), sql)
})

test('an identifier rename stops at a word boundary; an object-name rename does not', () => {
  const fragment =
    'create policy "layers_update_auth" on public.layers for update to authenticated using (true);'
  const afterTable = applyRename(fragment, {
    kind: 'identifier',
    from: 'layers',
    to: 'lanes',
  })
  // The policy NAME is untouched by the table rename — an underscore is a word
  // character, so `layers_update_auth` never matched.
  assert.match(afterTable, /"layers_update_auth" on public\.lanes/)

  const afterObjects = applyRename(afterTable, {
    kind: 'object-name',
    from: 'layer',
    to: 'lane',
  })
  assert.match(afterObjects, /"lanes_update_auth" on public\.lanes/)
})

test('a recipe fragment is carried forward through a rename in a later migration', () => {
  const { recipe } = generate([
    {
      name: '001_tables.sql',
      sql: [
        'create table public.layers (id uuid);',
        '-- @recipe',
        'grant select on public.layers to anon;',
      ].join('\n'),
    },
    { name: '002_rename.sql', sql: 'alter table public.layers rename to lanes;' },
  ])
  assert.match(recipe, /grant select on public\.lanes to anon;/)
  assert.doesNotMatch(recipe, /public\.layers/)
})

test('a column-scoped grant loses a column a later migration drops', () => {
  // 21000119000000 dropped `cell_touchpoints.screenshots` and `.url`; the
  // grant 21000113000000 wrote under its recipe mark still named both, and
  // the recipe refused to apply on top of the core it was written for.
  const { recipe } = generate([
    {
      name: '001_tables.sql',
      sql: [
        'create table public.cell_touchpoints (id uuid, name text, screenshots text[], url text);',
        '-- @recipe',
        'grant update (name, screenshots, url)',
        '  on public.cell_touchpoints to authenticated;',
        'grant select on public.cell_touchpoints to anon;',
      ].join('\n'),
    },
    {
      name: '002_drop.sql',
      sql: 'alter table public.cell_touchpoints\n  drop column screenshots,\n  drop column url;',
    },
  ])
  assert.deepEqual(renamesIn('alter table public.cell_touchpoints\n  drop column screenshots,\n  drop column url;'), [
    { kind: 'dropped-column', table: 'cell_touchpoints', column: 'screenshots' },
    { kind: 'dropped-column', table: 'cell_touchpoints', column: 'url' },
  ])
  assert.match(recipe, /grant update \(name\)\s+on public\.cell_touchpoints to authenticated;/)
  assert.match(recipe, /grant select on public\.cell_touchpoints to anon;/)
  assert.doesNotMatch(recipe, /screenshots/)
})

test('prose about a Supabase primitive is not a dependency on one', () => {
  assert.deepEqual(
    supabaseLeaks(
      [
        '-- the anon role reads this through auth.uid()',
        "comment on table public.cells is 'stamped with auth.uid() for authenticated callers';",
        'create table public.cells (id uuid);',
      ].join('\n'),
    ),
    [],
  )
})

test('an unmarked grant in the core is named, and named as what it is', () => {
  const leaks = supabaseLeaks('grant select on public.cells to anon, authenticated;')
  assert.deepEqual(leaks, ['the anon role: anon', 'the authenticated role: authenticated'])
})

test('the committed portable core carries no Supabase primitive', () => {
  assert.deepEqual(supabaseLeaks(read(`supabase/generated/${CORE_FILE}`)), [])
})

test('the recipe is where every Supabase primitive went', () => {
  const recipe = read(`supabase/generated/${RECIPE_FILE}`)
  assert.match(recipe, /auth\.uid\(\)/)
  assert.match(recipe, /storage\.objects/)
  assert.match(recipe, /to authenticated/)
})

test('both generated files say they are generated, in their first lines', () => {
  for (const name of [CORE_FILE, RECIPE_FILE]) {
    assert.match(read(`supabase/generated/${name}`).slice(0, 400), /GENERATED FILE — DO NOT EDIT/)
  }
})

