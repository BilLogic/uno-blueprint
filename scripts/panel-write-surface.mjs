#!/usr/bin/env node
/**
 * Every (table, column) the authoring UI writes directly, and the tables whose
 * rows it therefore has to be allowed to reach.
 *
 * The panel editors are the largest family and the reason this file exists, but
 * they are not the whole of it: the evidence form, the findings list, the slice
 * editor and the cell's placement rows write the same way. None of them go
 * through the definer RPCs. They call `.from(t).update({…})` under the caller's
 * own privileges (see `src/lib/*Mutations.ts`), so a field is saveable only when
 * a grant and an RLS policy are BOTH right on the deployed database. Both have
 * been missing, separately, inside three migrations of each other, and neither
 * failure is loud. A missing grant is a 42501 the panel surfaces as "permission
 * denied for table …". A missing policy is worse: under RLS an UPDATE nobody is
 * allowed to make matches zero rows and returns 200, so `requireRowsWritten`
 * reports the row as DELETED. And both are invisible on a laptop, because local
 * authoring holds the dev service key and `service_role` bypasses RLS entirely.
 *
 * 21000126000000 swept the grants once by hand and 21000127000000 swept them
 * again after the first sweep missed `phases.summary`; 21000128000000 added the
 * policy the grant sweep could not see. A one-time sweep is the wrong
 * instrument for a surface that grows every time a panel gains a field. This
 * list is the standing one: `check:seed-load` asks the real database, after the
 * real recipe applies, whether each of these is writable — the question the
 * save asks, six minutes before a deployed author asks it.
 *
 * THE QUESTION IS ASKED AS THE ROLE, not of the catalogue. It used to read
 * `pg_policies` for a policy on the table, for that command, naming
 * `authenticated` — and a policy that exists and admits nobody satisfies an
 * existence test. Every table here carries a RESTRICTIVE
 * `<table>_update_service_only` — most from the service-account tier,
 * `services` from 21000212000000, `stakeholders` and `cell_touchpoints` from
 * 21000213000000, which gave those two the same pair the other twelve had
 * always used. So the old test could not tell "an author may write this" from
 * "only a service account may", which is precisely the pair whose difference is
 * silent (#369).
 * `set local role authenticated`, a representative claim, attempt the write,
 * roll it back — that cannot be satisfied by a policy that refuses, and it
 * subsumes the grant half, because a write the grant forbids does not happen
 * either.
 *
 * AND IT IS ASKED TWICE, as two different people. `authenticated` is one
 * Postgres role and two audiences: an AUTHOR carries `app_metadata.role =
 * 'service'` and must be able to write every one of these; a signed-in READER
 * of the deployed board carries the same grants and must change nothing. The
 * second probe is what stops the first from being vacuous — a check that only
 * ever proves a write succeeded would pass just as well on a database that let
 * everybody write.
 *
 * KEEP THIS IN STEP with the mutation modules. A field added to a panel and not
 * added here is exactly the field the next migration will forget to grant.
 *
 * THE TABLES ARE NO LONGER HAND-KEPT. `scripts/tests/the-surface-is-the-writers.test.mjs`
 * walks `src/` for direct table writes and holds this map to what it finds, in
 * both directions: a table written by the app and named neither here nor in
 * `OUTSIDE_THE_SURFACE` fails, and so does an entry nothing writes any more.
 * That test exists because this list had drifted six tables wide — `cells`,
 * `cell_touchpoints`, `evidence`, `audit_findings`, `slices` and `slides` were
 * all written by the app and absent from it, and a declaration with a hole in
 * it is worse than none: a reader consulting it to answer "may the app change
 * this table?" gets the wrong answer, and every check built on it inherits the
 * hole in silence.
 *
 * THE COLUMNS ARE STILL HAND-KEPT, and cannot be otherwise: a payload is as
 * often `.update(next)` or `.update(patch)` as it is a literal, so no scan of
 * the source can name them. What holds them instead is
 * `src/types/database.ts` — the same test asserts that every column named here
 * is a column the schema has, so a rename fails loudly rather than quietly
 * pointing the assertion at nothing. That check earns its place twice over: a
 * column the table does not have is a 42703 from inside the probe loop, which
 * reaches CI as "the fresh-database seed load failed" rather than as the
 * column's name.
 *
 * THE VERBS ARE NOT HAND-KEPT EITHER, and for the same reason the tables
 * stopped being. This map asserted the UPDATE path and only that, while the app
 * also inserted and deleted `evidence`, `slices`, `slides` and `stakeholders`,
 * and inserted `audit_findings` — one verb wide instead of one table wide, the
 * same hole in
 * a different axis. `writeSurfaceEntries` now takes each entry's verbs from
 * `writtenVerbsByTable`, the same scan that finds the tables, so an insert added
 * to a module that already updates is covered the moment it is written and
 * cannot be forgotten here.
 *
 * UPDATE keeps its column list, because the deployment really does grant it
 * column by column and `set c = c` is refused on a column the author does not
 * hold. INSERT and DELETE are asked table-wide: the recipe grants them
 * table-wide, and a column list for them would be precision the grants do not
 * have.
 */

import { loadAppModule } from './app-module.mjs'
import { directTableWrites, writtenVerbsByTable } from './direct-table-writes.mjs'

const { CELL_FIELDS } = await loadAppModule('lib/cellFields.ts')

/**
 * `table: [columns]`. The columns are the ones a mutation module writes — named
 * in an `.update({…})` payload, or in the `columns` of a spec level handed to
 * `src/lib/specMutations.ts`, which builds the payload the six spec levels share.
 * Each one is written for real by the probe, so an insert-only column would be
 * asking the database the wrong question. Spelled as the database spells them,
 * not as the TypeScript spells them.
 *
 * The VERBS are not here: they come from the writers. An entry that lists
 * columns and is never UPDATEd by anything fails the surface test, which is the
 * one claim about verbs this file can still get wrong.
 */
export const PANEL_WRITE_SURFACE = {
  // src/lib/stepSpecMutations.ts
  steps: ['summary'],
  // src/lib/serviceSpecMutations.ts
  services: ['summary', 'entity_examples'],
  // src/lib/phaseSpecMutations.ts
  phases: ['summary', 'business_impact', 'operational_requirements'],
  // src/lib/scenarioSpecMutations.ts
  scenarios: ['summary'],
  paths: ['summary', 'note', 'status'],
  // src/lib/laneSpecMutations.ts
  lanes: ['owner_team', 'kpis', 'tools', 'stakeholder_id'],
  // src/lib/stakeholderMutations.ts
  stakeholders: ['name', 'kind', 'summary', 'aliases'],
  // src/lib/serviceSpecMutations.ts (the Service panel's second row)
  business_models: ['funding', 'pricing', 'delivery_cost', 'revenue_model', 'partners'],
  // The cell's two direct-write routes, off the descriptors: a field whose
  // `writeRoute` is `content` goes through src/lib/cellContentMutations.ts and
  // one whose route is `spec` through src/lib/cellSpecMutations.ts — one table,
  // two mutations, and the reason the grant for it arrives in three separate
  // migrations. The `rpc` fields are not here; they move through a definer
  // function, which holds its own privileges. Read rather than copied, so a
  // field added to a panel is a column this check probes in the same edit —
  // which is precisely the way this list used to fall behind.
  cells: CELL_FIELDS.filter(
    (field) => field.writeRoute === 'content' || field.writeRoute === 'spec',
  ).map((field) => field.key),
  // src/lib/touchpointMutations.ts — the cell panel's placement rows.
  cell_touchpoints: ['summary', 'role'],
  // src/lib/evidenceMutations.ts. The form also inserts and deletes, and those
  // two verbs are asserted table-wide off the scan rather than named here.
  evidence: ['kind', 'title', 'note'],
  // src/lib/findingMutations.ts — exactly the columns `toPatch` builds, which
  // is exactly the column list the recipe grants. `check_key` and `service_id`
  // are written on insert only and are NOT updatable; naming either here would
  // assert a privilege the deployment deliberately withholds. The insert itself
  // is covered, table-wide, by the verb the scan reads off that same module.
  audit_findings: ['severity', 'summary', 'run_id', 'cell_ids', 'cell_keys', 'source', 'status'],
  // src/lib/sliceMutations.ts. Slides are replaced wholesale — deleted and
  // reinserted — so the only slide column the editor UPDATES is
  // `shows_all_images`. The members live in `slide_images`, which is replaced
  // as a set and listed in OUTSIDE_THE_SURFACE.
  slices: ['title', 'summary', 'kind', 'actor', 'authorship'],
  slides: ['shows_all_images'],
}

/**
 * The tables the app writes directly that are deliberately NOT on the surface,
 * each with the reason it is not.
 *
 * Listed, or explained — not silence. A reader who comes here to ask whether
 * the app may change a table has to find every table it writes named somewhere
 * on this page, and an omission has to be distinguishable from an oversight.
 *
 * Every entry is asserted to still be written by something, so an exemption for
 * a table nothing touches any more fails rather than sitting here forever.
 */
export const OUTSIDE_THE_SURFACE = [
  {
    table: 'agent_sessions',
    because:
      'the agent transcript, not blueprint data. It is best-effort by design: the deployed read-only site has no write policy on it and every call there fails quietly on purpose, so asserting that `authenticated` may update it would assert the opposite of the intent. See src/lib/agent/persistence.ts, which the write-boundary contract exempts for the same reason.',
  },
  {
    table: 'agent_messages',
    because:
      'the other half of the same transcript, written by the same module under the same best-effort contract.',
  },
  {
    table: 'slide_images',
    because:
      "a set is replaced rather than patched: the editor deletes the slide's members and inserts the next set in one write, so there is no column list to grant for UPDATE.",
  },
]

/**
 * Each surface entry with the verbs its writers actually use, in declaration
 * order.
 *
 * `verbs` is derived, never declared: `writtenVerbsByTable` reads them off the
 * same walk of the application that finds the tables. An entry whose table
 * nothing writes any more comes back with no verbs and therefore asks the
 * database nothing — `evaluateWriteSurface` reports that rather than letting the
 * check pass on an empty question.
 *
 * The scan takes no argument here, and that is the point: `directTableWrites`
 * receives the application from the `app` subject of `scripts/sweep.mjs`, so a
 * deployment that reads it out of `node_modules/uno-blueprint/src` derives
 * the same verbs from the same modules. A root spelled here would have been a
 * second answer to that question, and the deployment is where the two would
 * have disagreed — silently, with every entry coming back verbless at once.
 */
export function writeSurfaceEntries() {
  const verbs = writtenVerbsByTable(directTableWrites())
  return Object.entries(PANEL_WRITE_SURFACE).map(([table, columns]) => ({
    table,
    columns,
    verbs: verbs.get(table) ?? [],
  }))
}

/**
 * Who the question is asked as.
 *
 * `authenticated` is one Postgres role and two entirely different people. The
 * app's own gate says so: `realCanWrite` in `src/contexts/SupabaseProvider.tsx`
 * is `isServiceAccount || isEditPreview`, and the comment beside it calls the
 * restrictive policies "the wall". So an AUTHOR is a signed-in session whose
 * JWT carries `app_metadata.role = 'service'`, and a VIEWER is a signed-in
 * session without it — a reader of the deployed board, who may hold every grant
 * the author holds and must still change nothing.
 *
 * The claims are what the shim's `auth.jwt()` reads back out of
 * `request.jwt.claims`, which is what Supabase's own `auth.jwt()` reads. They
 * are set with `set_config(…, true)` inside the probe's subtransaction, so a
 * probe cannot leave a claim behind for the next one.
 */
export const AUTHOR = {
  who: 'author',
  claims: {
    sub: '11111111-1111-4111-8111-111111111111',
    role: 'authenticated',
    app_metadata: { role: 'service' },
  },
}

export const VIEWER = {
  who: 'viewer',
  claims: {
    sub: '22222222-2222-4222-8222-222222222222',
    role: 'authenticated',
    app_metadata: {},
  },
}

/**
 * Surface tables whose write policies do not yet tell an author from a reader,
 * with the reason each one is still like that.
 *
 * The VIEWER half of the probe is skipped for these and the reason is printed
 * on every green run, so the gap is something the check says out loud rather
 * than something a reader has to notice is missing. Closing one is deleting its
 * line here; the probe then starts proving it, and nothing goes red on the fix.
 *
 * Not a way to opt out of the check: the AUTHOR half still runs, so a table
 * listed here is still asserted to be writable by the people who edit it.
 *
 * EMPTY, and that is the state to keep it in. It held one entry, `services` —
 * the single surface table the service-account tier never reached, because
 * 20260818002000 could not restrict a write policy that did not exist yet and
 * 21000128000000 wrote that policy afterwards as `using (true)`. The entry was
 * the smaller claim the check could still honestly make while the migration was
 * owed; 21000212000000 pays it, and deleting the line is what turns the viewer
 * probe on for the table. The next entry here is a debt somebody took on
 * deliberately, in writing, and it should read that way.
 */
export const ANY_SIGNED_IN_USER_MAY_WRITE = {}

/**
 * A row to write, for the surface tables the sample seed leaves empty.
 *
 * The probe is an attempted UPDATE and DELETE, and both match zero rows on an
 * empty table for reasons that have nothing to do with permission. Four surface
 * tables are empty after the seed on purpose — `evidence` and `business_models`
 * because an offline reader could never see restricted rows, `stakeholders` and
 * `audit_findings` because the sample has none — so the probe stands one row up
 * in each, as the OWNER, inside the transaction it rolls back.
 *
 * Each is guarded by `where not exists`, so a seed that starts populating one of
 * these tables silently retires its fixture and the probe writes real content
 * instead. The values are the smallest thing the table's own CHECK constraints
 * accept; they are never read.
 */
export const PROBE_FIXTURES = {
  stakeholders:
    "insert into public.stakeholders (name, kind)\n" +
    "select 'write-surface probe', 'team'\n" +
    ' where not exists (select 1 from public.stakeholders)',
  business_models:
    'insert into public.business_models (service_id)\n' +
    'select id from public.services\n' +
    ' where not exists (select 1 from public.business_models)\n' +
    ' order by id limit 1',
  evidence:
    'insert into public.evidence (service_id, kind, title, proposition_question_key)\n' +
    "select id, 'doc', 'write-surface probe', 'understand' from public.services\n" +
    ' where not exists (select 1 from public.evidence)\n' +
    ' order by id limit 1',
  audit_findings:
    'insert into public.audit_findings\n' +
    '  (service_id, run_id, source, check_key, severity, fingerprint)\n' +
    "select id, gen_random_uuid(), 'audit', 'write-surface-probe', 'info', 'write-surface-probe'\n" +
    '  from public.services\n' +
    ' where not exists (select 1 from public.audit_findings)\n' +
    ' order by id limit 1',
}

/**
 * `{ label, who, verb, table, column }` for every write the probe attempts, in
 * one place. The builder and the evaluator both read this list, so the labels
 * cannot drift apart the way two hand-written copies of them would.
 *
 * A label is `<who> <verb> <what>`: `author update evidence.title`,
 * `viewer delete evidence`.
 *
 * Two probes per verb, and they are the same statement asked twice:
 *
 *   1. the AUTHOR must write. UPDATE is asked column by column, because the
 *      deployment grants it column by column and `set c = c` is refused on a
 *      column the author does not hold. INSERT and DELETE are asked table-wide,
 *      because that is how the recipe grants them.
 *   2. the VIEWER must not. Once per verb, not once per column: a policy is
 *      table-wide, and the author's probe on the same column has already proved
 *      the grant, so a refusal the viewer meets and the author did not can only
 *      be the policy. That pairing is what makes the second probe evidence
 *      about RLS rather than about grants.
 */
export function writeSurfaceAssertions() {
  const assertions = []
  for (const { table, columns, verbs } of writeSurfaceEntries()) {
    for (const verb of verbs) {
      const lower = verb.toLowerCase()
      if (verb === 'UPDATE') {
        for (const column of columns) {
          assertions.push({
            label: `author update ${table}.${column}`,
            who: AUTHOR.who,
            verb,
            table,
            column,
          })
        }
      } else {
        assertions.push({ label: `author ${lower} ${table}`, who: AUTHOR.who, verb, table })
      }
      if (ANY_SIGNED_IN_USER_MAY_WRITE[table] !== undefined) continue
      assertions.push({
        label: `viewer ${lower} ${table}`,
        who: VIEWER.who,
        verb,
        table,
        column: verb === 'UPDATE' ? columns[0] : undefined,
      })
    }
  }
  return assertions
}

/**
 * The whole probe, as one script: stand a row up in every surface table, become
 * the role, attempt each write, and roll the lot back.
 *
 * Read as SQL rather than as a catalogue, because the catalogue cannot answer
 * the question. `exists(select 1 from pg_policies …)` is satisfied by a policy
 * that admits nobody, and every one of these tables carries one — a RESTRICTIVE
 * `<table>_update_service_only` beside the permissive policy it narrows. A
 * viewer meeting it matches zero rows and gets a 200 back. Becoming the role
 * cannot be satisfied that way: the write either happens or it does not.
 *
 * Every probe is its own subtransaction, ended by a sentinel exception whether
 * it succeeded or failed, so no probe can see another's row — a DELETE that
 * worked does not empty the table the next UPDATE needs, and the claims and the
 * `set local role` roll back with it.
 *
 * How an outcome is read:
 *
 *   - `wrote`    rows changed, or the statement reached an integrity constraint.
 *                A unique or foreign-key violation is proof of admission rather
 *                than a refusal: it is raised by an index or a trigger AFTER the
 *                WITH CHECK has passed, and the INSERT probe copies an existing
 *                row, so the constraints that run BEFORE it — NOT NULL, CHECK —
 *                are satisfied by construction.
 *   - `zero`     the statement ran and matched no row. This is the silence the
 *                whole check exists for.
 *   - `refused`  42501 — a missing grant, or a policy predicate the role may
 *                not even evaluate. The message says which.
 *   - `norow`    the table was empty, so the probe asked nothing. A failure, not
 *                a pass: add a fixture.
 *   - `error`    anything else, which is this file being wrong about the schema
 *                rather than the database being wrong about permission. A column
 *                the table does not have lands here, loudly, instead of passing
 *                as a write that happened.
 *
 * Runs as a role member of `authenticated`; the owner in CI is the superuser the
 * scratch database is created by.
 */
export function buildWriteSurfaceSql() {
  const rows = writeSurfaceAssertions().map(({ label, who, verb, table, column }) => {
    const claims = JSON.stringify((who === AUTHOR.who ? AUTHOR : VIEWER).claims)
    return `  (${q(label)}, ${q(claims)}, ${q(verb)}, ${q(table)}, ${column === undefined ? 'null' : q(column)})`
  })
  return `begin;

${Object.values(PROBE_FIXTURES).map((sql) => `${sql};`).join('\n\n')}

create temporary table write_surface_result (label text, verdict text, detail text)
  on commit drop;

do $probe$
declare
  p record;
  cols text;
  stmt text;
  n bigint;
  verdict text;
  detail text;
begin
  for p in select * from (values
${rows.join(',\n')}
  ) as v(label, claims, verb, tbl, col) loop
    execute format('select count(*) from public.%I', p.tbl) into n;
    if n = 0 then
      insert into write_surface_result values (p.label, 'norow', '');
      continue;
    end if;
    if p.verb = 'INSERT' then
      -- Every column but the generated key, so the copy satisfies NOT NULL and
      -- every CHECK the table has without this file knowing what they are.
      select string_agg(quote_ident(a.attname), ', ' order by a.attnum) into cols
        from pg_attribute a
       where a.attrelid = format('public.%I', p.tbl)::regclass
         and a.attnum > 0 and not a.attisdropped
         and not (a.atthasdef and exists (
               select 1 from pg_constraint c
                where c.conrelid = a.attrelid and c.contype = 'p'
                  and a.attnum = any (c.conkey)));
      stmt := format('insert into public.%I (%s) select %s from public.%I limit 1',
                     p.tbl, cols, cols, p.tbl);
    elsif p.verb = 'DELETE' then
      stmt := format('delete from public.%I where ctid = (select ctid from public.%I limit 1)',
                     p.tbl, p.tbl);
    else
      stmt := format('update public.%I set %I = %I where ctid = (select ctid from public.%I limit 1)',
                     p.tbl, p.col, p.col, p.tbl);
    end if;
    verdict := 'wrote';
    detail := '';
    begin
      perform set_config('request.jwt.claims', p.claims, true);
      set local role authenticated;
      execute stmt;
      get diagnostics n = row_count;
      if n = 0 then verdict := 'zero'; end if;
      -- Undo the write whether or not it worked. A probe that left its row
      -- behind would be answering the next probe's question, not its own.
      raise exception 'write-surface probe' using errcode = 'UB001';
    exception
      when sqlstate 'UB001' then null;
      when insufficient_privilege then
        verdict := 'refused';
        detail := replace(sqlerrm, '|', '/');
      when others then
        -- Class 23 is an integrity constraint, raised by an index or a trigger
        -- AFTER the WITH CHECK ran: the row was admitted and then rejected for
        -- a reason that is not permission. Anything else is this file being
        -- wrong about the schema — a column the table does not have is a 42703
        -- — and must not be read as a write that happened.
        verdict := case when sqlstate like '23%' then 'wrote' else 'error' end;
        detail := sqlstate || ' ' || replace(sqlerrm, '|', '/');
    end;
    insert into write_surface_result values (p.label, verdict, detail);
  end loop;
end
$probe$;

select label || '|' || verdict || '|' || detail from write_surface_result;

rollback;
`
}

/** A SQL string literal, for the generated VALUES list. */
function q(text) {
  return `'${text.replace(/'/g, "''")}'`
}

/** Parse `label|verdict|detail` lines, and say what each bad one means. */
export function evaluateWriteSurface(stdout) {
  const problems = []
  const seen = new Set()
  for (const line of stdout.split('\n')) {
    const trimmed = line.trim()
    if (trimmed === '') continue
    const [label, verdict, ...rest] = trimmed.split('|')
    if (label === undefined || verdict === undefined) continue
    seen.add(label)
    const problem = explain(label, verdict, rest.join('|'))
    if (problem !== null) problems.push(problem)
  }
  for (const { label } of writeSurfaceAssertions()) {
    if (!seen.has(label)) problems.push(`${label} returned no row — the write-surface probe never reached it`)
  }
  for (const { table, verbs } of writeSurfaceEntries()) {
    if (verbs.length === 0) {
      problems.push(
        `public.${table} is on the write surface and nothing under src/ writes it, so ` +
          `this check asked the database nothing about it — remove the entry`,
      )
    }
  }
  return problems
}

/** What an outcome costs, in the words the person it costs would report it in. */
function explain(label, verdict, detail) {
  const [who, verb, what] = label.split(' ')
  const table = what.split('.')[0]
  const said = detail === '' ? '' : ` (${detail})`
  if (verdict === 'norow') {
    return (
      `public.${table} is empty, so the ${verb} probe attempted nothing — the seed ` +
      `stopped populating it, or it needs an entry in PROBE_FIXTURES`
    )
  }
  if (verdict === 'error') {
    return (
      `the ${verb} probe on public.${what} did not run${said} — the write surface ` +
      `describes a table or column this database does not have, so nothing was asked ` +
      `about it either way`
    )
  }
  if (who === 'viewer') {
    if (verdict !== 'wrote') return null
    return (
      `a signed-in reader can ${verb.toUpperCase()} public.${table} — the write policies ` +
      `there do not tell an author from a viewer, so anyone who can open the board can ` +
      `change it; add a restrictive policy on public.is_service_account(), or say why not ` +
      `in ANY_SIGNED_IN_USER_MAY_WRITE`
    )
  }
  if (verdict === 'wrote') return null
  if (verdict === 'refused') {
    return (
      `an author is refused ${verb.toUpperCase()} on public.${what}${said} — the editor ` +
      `that writes it reports "permission denied" and saves nothing; grant it in a migration`
    )
  }
  const outcome =
    verb === 'delete'
      ? `the delete matches zero rows, returns 200, and the row the author removed ` +
        `reappears on the next read`
      : `the save matches zero rows, returns 200, and is reported to the author as ` +
        `"that row no longer exists"`
  return (
    `no policy lets an author ${verb.toUpperCase()} public.${what} — under RLS ${outcome}; ` +
    `add a policy admitting public.is_service_account() in a migration`
  )
}
