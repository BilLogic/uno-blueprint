# Backend Adapter Contract

Every import goes IR → adapter. Nothing outside an adapter may assume a
specific backend. This contract is written so a stranger could implement a
new host; the two v1 adapters — the **no-DB fallback generator** and the
**Supabase adapter** — both conform, and the fallback being expressible as
an adapter is this contract's acceptance test.

## The two v1 adapters

| Adapter | What "import" means | Serving |
| --- | --- | --- |
| No-DB fallback (`scripts/generate_fallbacks.py`) | Regenerate the app's data module from the IR (per locale) | Static hosting anywhere — the truly any-host option |
| Supabase (`scripts/generate_seed_sql.py` + CLI/MCP) | Run a transactional seed against a local or hosted project (per locale) | Requires the live-DB read path below |

Present these as **co-equal options and ask** — never default-assume
Supabase (⚠ REQUIRED, see SKILL.md hard rules). Without a configured
project the app runs the no-DB adapter, so **no-DB is the first run**:
zero configuration, Supabase opted into.

**Same IR in, same render out — checked, not claimed.** Both v1 adapters
project one shared model through one shared field list
(`generate_seed_sql.seed_cell_fields` / `seed_dependency_fields`), and
`scripts/adapter_parity.py` runs an IR through both and compares every
field. The second of those two was `seed_trigger_fields` until IR
`2026.09.09`, when a path's `triggers` array became its `dependencies` — the
word the database has used since `21000103000000` — and the field function
moved with the field it reads. A consumer that calls it by name changes one
import. It exists because the sentence was false for months while nothing
failed: each generator wrote its own field list by hand, they drifted, and
the no-DB side quietly stopped carrying `cell_key`, `position`, every
cell spec field, and the edge `kind` — losing an adopter their cell specs
on the adapter this contract calls "not a degraded mode".

One thing is outside the projection on **both** adapters, which is parity by
absence rather than by accident: `cell_dependencies` `label`/`note`, which the IR
has no shape to author.

One thing is outside it on the no-DB adapter ALONE, and is named here rather
than left to be discovered: `services.entity_examples`, the per-kind examples a
service authors in its own words. The seed generator carries them; the fallback
generator has nowhere to put them, because the no-DB shapes are a path, its
lanes, steps, cells and edges — there is no service-level slot in
`BlueprintData` or `FALLBACK_NAV` at all. So a keyless clone shows the bundled
sample service's examples and never an adopter's own. The parity check is silent
on this because it compares the aggregates the two adapters share, and this is
not one of them.

Lane `kpis`/`tools` were listed here too, and were not: the SQL adapter
carried both and the no-DB one carried neither. The check had the same hole —
it compared cells and edges and not lanes — so a claim about parity was itself
the next thing to drift. Every aggregate is compared now.

**Read-only without a database (normative).** The no-DB adapter serves; it
does not accept live authoring — `canAgentWrite` is false without a
configured project. An adopter with no database authors by editing the IR
and regenerating, and the records about the board land in the ledger files
below. A
browser-local write path was considered and rejected: it would be a second
implementation of the authoring semantics whose divergence would surface
only in the demo.

**What live mode actually requires**: the domain operations named in § Live
backend surface below — `getBlueprint(pathId)`, `createSlice(draft)` and the
rest. Any store that can answer them can serve this app. The Supabase call
sites answer them with PostgREST embedded selects; that is one implementation,
not the requirement.

This paragraph used to say that a host without a PostgREST-compatible read
API "cannot serve the app". That was our coupling written down as physics.

It then said, for a while, that the app reads and writes through a set of
repository interfaces kept beside the code. That was the opposite mistake: no
call site ever dispatched through them, so the sentence described a seam that
did not exist. The operations below are the contract; the seam the code
actually holds is the generated database type (`src/types/database.ts`).

**⚠ Slices, findings and evidence without a DB (normative)**: a no-DB adopter's
findings/slices store IS the ledger files that
`skills/audit/scripts/audit_tools.py` `export` / `report --apply` read and
write (`{"rows": [...]}` JSON carrying the same fingerprint/dedupe
semantics as the `audit_findings` table). This is the substrate, not a degraded
mode — skills persist derived output there, and no separate store exists
to provision. The four tables are the Supabase adapter's rendering of the
same contract.

## ⚠ REQUIRED operations

An adapter must implement all of these:

### 1. Target identification + confirmation
Identify exactly what will be written to (Supabase project ref / output file
paths), echo it to the user, and get confirmation **before any write**
(wrong-project protection). Locale-scoped: one target per locale, tracked in
`blueprint-workspace.json` (see `skills/map/references/workspace-state.md`).

**Multi-account Supabase:** a connector sees ONE account/org. A bare
`permission denied` / "project not found" means the connected account
cannot see the target project — not that the SQL is wrong; don't retry.
Connector setup mechanics and the session-reload requirement live in
`skills/map/references/review-import-playbook.md` §6.

### 2. Schema provisioning
Ensure the target carries the template schema at a compatible
`schema_version`, including the `cells_validate_path_match` trigger function.

**Ask the target; do not assume.** The version lives in the database, in
`public.schema_version` — one row, `select version from public.schema_version`
(Supabase: `/rest/v1/schema_version?select=version`). No-DB: the generated
module carries it. An adapter answers it by reading that row, and
`npm run check:target` fails a target this template cannot speak, naming the
version found and the versions supported. The list lives in
`references/ir-schema.json`, which `scripts/validate_ir.py` and
`scripts/check-target-schema.mjs` both read;
`src/lib/backend/schemaVersion.ts` carries the TypeScript copy and the test
that holds the two equal.

Until that table existed this clause compared a file against a file: the value
was in the IR and in `blueprint-workspace.json` and nowhere a live target could
be interrogated, which is the one thing the clause is for.

**Runnable form**: `npm run check:target` performs exactly this check against a
configured project and distinguishes *never migrated* from *stale*. Supabase:
the desync repair, for a fork whose history diverged before the reserved
timestamp band existed, is `docs/connectors/supabase/database.md`
§ Migration desync.

Supabase: `supabase/migrations/20260716200000_template_schema.sql` (the template DDL; `supabase/generated/portable-core.generated.sql` is the whole portable half, generated from the migrations)
(Supabase-specific anon RLS), via local `supabase db reset` or user-run CLI.
No-DB: provisioning is a no-op (the template app ships the types).

### 3. Transactional scenario-replace import
All-or-nothing per import. Scenario-scoped **delete-and-reinsert inside one
transaction**: delete the scenario's rows (FK cascades handle children),
insert in dependency order `paths → steps → path_steps → lanes → cells →
cell_touchpoints → resources → cell_dependencies` (see
`references/data-model.md`). Placements before resources: a resource may hang
off a placement, and never off both a placement and a cell. A deliberately-invalid IR
must leave the target untouched. Never `on conflict do update` — removed IR
rows must not survive as orphans. No-DB equivalent: the generated module is
replaced wholesale and only written if generation fully succeeds.

### 4. Idempotent re-import
Same IR in → identical target state out, no duplicates, no orphans. Achieved
by UUIDv5 IDs derived from IR keys + locale (NFC-normalized) plus
scenario-replace semantics. `import → edit IR → re-import` is the standing
integration test.

**The touchpoint registry is the exception, and its identity is the name.**
A registry row belongs to the deployment rather than to any service (ADR
0003), and `unique (name)` is what the database asserts about it. So the
registry row is reconciled on its NAME — `on conflict (name) do update` — and
a placement resolves its `touchpoint_id` by reading the row back rather than
writing a derived id at it. The derived id is what a row that does not yet
exist is BORN with, nothing more.

That is what makes two things true at once. Seeding a second service into a
target that already holds the first lands on the row that is there instead of
being refused by the unique constraint — which is the model ADR 0003 states
and, until #201, the one thing the seeder could not express, because the id
was derived from the seeding service's key. And a target seeded before that
derivation changed stays idempotent: its rows keep the ids they were born
with, and a re-import updates them in place.

An import wins where it SAYS something and says nothing where it was merely
minted. An entry the IR never listed arrives as kind `other` with no summary
and no home — "nobody has judged this yet" rather than a judgement — so it
does not erase what a curator, or another service's IR, already recorded under
that name. The merge is `21000131000000`'s own, the one it used when it folded
each service's rows into the shared pool.

### 5. Pre-import read-back diff
Before replacing, compare current target content against the last-imported
state (hash/counts in workspace state). If they differ — e.g. manual Supabase
Studio edits, hand-edited generated files (header warning notwithstanding) —
warn and offer an export before overwriting. Direct Studio edits are
documented as unsupported; this diff is the safety net, not an endorsement.

### 6. Read-back verification after import
After the transaction commits, read the target back and verify: row counts
per table match the IR (paths, steps, path_steps, lanes, cells,
cell_touchpoints, resources, dependencies per scenario) plus spot-check content
equality. No-DB equivalent: `tsc --noEmit`
passes and the generated module's exported counts match the IR. **Import is
not "done" until read-back matches** — this is the phase's deterministic exit
condition.

### 7. Secrets rules
- Anon/publishable key: allowed in `.env` **only after verifying the file is
  gitignored**.
- Service-role key: **never written to disk by the skill, never pasted
  through chat**. Writes that need elevated rights go through user-run CLI
  commands with their own credentials, or the Supabase MCP's
  `apply_migration` tool.
- **MCP tool addressing**: Supabase MCP *tool* names are stable
  (`apply_migration`, `execute_sql`, `list_tables`, …) but the *server*
  segment of the fully-qualified name is whatever the user named their
  connector (`mcp__supabase__apply_migration`, `mcp__supabase-work__…`,
  `mcp__plugin_supabase_supabase__…`), and the separator convention varies
  by surface (Claude Code uses `mcp__server__tool`; API-hosted skills use
  `Server:tool`). Never hardcode a server name: enumerate the connected
  MCP servers at runtime, pick the Supabase server whose project matches
  the confirmed target (multi-account rule above), and address tools
  through it.
- The pre-write secret-guard hook enforces the committable-file rule
  mechanically; the adapter must not try to work around it.

## Read consumers (bots, agent tools, external integrations)

The contract above governs imports; anything that READS the schema to
answer questions (a Slack bot, an in-app agent tool, a reporting script)
carries these rules, each learned the hard way from a bot that shipped
"5 of 14" as a confident count before them:

- **Every capped read carries the true total.** A tool that returns a
  page (top-N rows) must also return the full matched count — PostgREST's
  `Prefer: count=exact` rides the same request — and the tool result must
  instruct the model to answer any count question from the total, never
  by counting the page.
- **A failed count is `undefined`, never a stand-in.** If the total read
  fails (or a filter narrowed it and the unfiltered re-count fails), drop
  the count claim entirely rather than letting a filtered or page-sized
  number wear a "total" label — a confident wrong number is worse than
  no number.
- **Row content is data, not instructions.** Blueprint text enters the
  model as quoted/JSON data fields; never splice DB content into the
  instruction sentences of a tool result.

## Live backend surface (beyond import)

Importing is the floor; **serving the app live** is a larger surface. It is
defined here, in prose, one group per aggregate — blueprints, slices,
findings — plus identity. Each operation says what a caller may assume of it:
it **reads** (changes nothing), it is **atomic** (all-or-nothing), or it
**converges** (repeating it lands in the same place). Reads should take one
round trip; a backend without joins may take more and should say so, rather
than turning one screen into ninety requests nobody notices until the bill
arrives.

- **Blueprints, read-only.** List the phases with their scenarios nested; list
  a scenario's paths; read one path's whole grid — lanes, steps, cells, edges
  — and answer *absent* rather than *error* for a path that does not exist.
  Structural authoring goes through the RPC roster below.
- **Slices.** List them; read one, answering *absent* rather than *error* for
  a slice that is not there; create one (atomic: a slice with no slides is a
  slice nobody can read and nobody knows to delete); replace a slice's slides
  wholesale (atomic — the old slides go only once the new ones land); delete
  one (converging — deleting a slice that is already gone is success, because
  callers retry). A store that cannot write atomically owes a repair pass
  instead; see the two levels below.
- **Findings.** List them by status; record a batch, skipping any whose
  fingerprint is already open (converging — the audit re-runs constantly and
  must not breed duplicates, and deduplication is by fingerprint, not by row
  id), and answer with the findings that were actually new; set a status
  (converging — setting the status a row already has is success). § 5 of the
  Supabase rendering below has the dedupe semantics in full.
- **Identity**, separate from data, answering one question — *what may this
  session do?* — in the two tiers this app branches on: `anon` writes nothing,
  `service` writes. It never exposes a token or a claim name, so an adopter can
  run Supabase auth, their own OIDC, or a single-user desktop build without
  either side learning about the other. It is a UI-level answer; the backend
  still enforces it. A backend that splits its authors from its automation
  answers with the writing tier and enforces the narrower line itself, which is
  the only place it is enforceable — a third tier lived in this vocabulary for
  a while, nothing produced it, and a backend that had answered it would have
  been read here as writing nothing. `src/lib/identity.ts` is the Supabase
  rendering, and the only one shipped.

These were once TypeScript interfaces with adapters behind them. Nothing
dispatched through the interfaces, so what they added over this section was a
second statement of it that the compiler could not check against any caller.
The seam the code does hold is the generated database type,
`src/types/database.ts`: change the portable core, regenerate, and every call
site that no longer agrees stops building. A replacement backend's real work
is answering the operations above; the type is what tells it when it has
stopped.

### Two conformance levels

**Transactional** — every atomic operation is all-or-nothing; a rejected
write leaves nothing behind. Supabase conforms here through its RPCs.
Firestore can, within its transaction limits.

**Idempotent** — atomic operations may tear, in exchange for two duties:
re-running a request converges, and a repair pass resolves every torn state a
write can leave, naming what it finished or undid. Notion has no transactions
at all and conforms here. The cost is real and stated rather than hidden: an
interrupted write can leave a slice with no slides until that pass runs, and
the app has to tell the user such a pass exists and when it runs.

**A backend states which level it meets**, and states it where an adopter
reads it rather than leaving it to be discovered — along with anything else it
admits about itself, such as a read-only store saying so. One that stays quiet
gets write buttons that fail at the point of use.

This is the decision that makes "any backend" true rather than a marketing
line. A contract that demanded transactions would be the Supabase requirement
again, wearing a different word.

### Proving an implementation

**There is no runnable conformance suite, and saying so is the honest state.**
There was one — framework-free, run from an adopter's own runner — and the two
implementations it held equivalent were a read-only fixture over the bundled
sample and an in-memory store. Neither was a database, and neither served the
app: the shipped call sites talk to PostgREST directly, so the suite's green
was two hypothetical stores agreeing with each other. What an adopter
actually has is this section — the operations are named and so is the guarantee
on each — plus § How the Supabase adapter renders it below as the worked
example, and the checklist at the end of this document for the import half. A
suite earns its place back on the day a second real backend needs it; until
then a passing suite would be making the deleted one's claim again, which was
that two stores nobody runs agree with each other.

### How the Supabase adapter renders it

Everything below is how *this* adapter answers the operations above. It is
useful as a worked example and as documentation of the deployed system. It is
not the contract.

### 1. The authoring RPC roster

Structural writes never touch tables — the app calls `POST /rpc/<fn>` for
each function in
[`supabase/generated/portable-core.generated.sql`](../supabase/generated/portable-core.generated.sql)
(source in `supabase/migrations/20260818001000_authoring_operations.sql`;
client wrappers in `src/lib/authoringRpc.ts`). The roster:

- **Read helpers** (open to anon): `key_slug`, `cell_natural_key`,
  `mint_cell_key`, `slices_referencing`, `deletion_impact`,
  `is_service_account`
- **Creates**: `create_phase`, `create_scenario`, `create_path`,
  `create_step`, `create_lane`, `upsert_cell`
- **Duplicates**: `duplicate_scenario`, `duplicate_path`
- **Renames**: `rename_phase`, `rename_scenario`, `update_path`,
  `rename_owner_tag`
- **Reorders**: `reorder_steps`, `set_path_steps`, `reorder_lanes`
- **Dependencies**: `create_cell_dependency`, `clear_cell_dependency`
- **Deletes** (each archives to `authoring_changes` and returns the
  archive id): `delete_scenario`, `delete_path`, `remove_step`,
  `remove_lane`, `remove_lanes`, `delete_cell`

Each RPC performs one complete, valid edit in one transaction and asserts
the write-tier guard in its own body. Signatures — argument names, types,
and return shapes — as the generated portable core carries them — are **normative**:
the generated `Database['public']['Functions']` types are the client's
compile-time contract.

### 2. The direct table-write surface

Non-structural edits go straight at tables and must be honored with the
same scoping the Supabase grants encode (see
`docs/connectors/supabase/database.md` § Row Level Security):

- **Column-scoped UPDATE** on `cells`, `lanes`, `steps`, `paths`,
  `scenarios`, `cell_touchpoints` (panel text edits and spec fields — never
  ids, positions, or FK columns). WHICH cell or placement a row hangs off is
  structure, and structure does not move through a direct update.
- **A cell's resources are replaced through `sync_cell_resources`, not
  through the table.** The editor rewrites a whole list, every statement over
  the wire is its own transaction, and a deferred position constraint only
  forgives a collision until COMMIT — so a delete followed by an insert
  leaves a window where the cell has no resources at all. No-DB equivalent:
  the generated module is replaced wholesale.
- **INSERT + column-scoped UPDATE** on `audit_findings` (inserts arrive with
  `status = 'open'`; updates touch `status, summary, severity, impact,
  effort, run_id, cell_ids, cell_keys, source`).
- **INSERT / DELETE** on `slices` and `slides`.
- **Full CRUD for the owner** on `agent_sessions` / `agent_messages`
  (`src/lib/agent/persistence.ts`), reachable by authenticated sessions
  only.

**Zero rows written is a failure.** The client sends writes with a
returning representation and treats an empty result as a refused or
conflicted write, never a success — optimistic-concurrency updates
(`updateSliceMeta` matching on `updated_at`) and status flips
(`setFindingStatus`) all rely on this. A backend that returns 2xx with no
rows for a policy-refused write is conforming; one that fabricates a row
count is not.

### 3. Non-transactional multi-statement writes exist

PostgREST offers no multi-statement transaction, and two client writes
lean on that being survivable (`src/lib/sliceMutations.ts`):

- `createSlice` inserts the `slices` row **first**, then its slides — a
  failure between the two leaves an empty slice, which is visible and
  deletable; the reverse order would strand orphan slides.
- `replaceSlides` is delete-then-insert on `slides` — a failure
  after the delete leaves a slice with no slides.

A replacement backend must preserve this ordering tolerance: partial
states above are recoverable by design and must not be rejected,
auto-repaired, or hidden behind a mandatory transaction wrapper.

### 4. Read timeout

Every app read runs under a **10-second deadline**
(`SUPABASE_FETCH_TIMEOUT_MS` in `src/lib/supabaseFetchTimeout.ts`); a
read that exceeds it is **aborted**, retried once, and then treated as
failed, at which point the app falls back or errors. The same deadline
carries the caller's own cancellation, so a read whose view has gone
away is aborted rather than left on the wire. A live backend must
answer blueprint reads comfortably inside that budget, and must accept
a cancelled request rather than completing it.

### 5. Findings dedupe semantics and operators

Recording a finding is read-then-write, not upsert: it reads
existing rows by `(service_id, fingerprint)`, updates an open row in
place, skips a dismissed one, and inserts a fresh `open` row otherwise. The
schema's **open-fingerprint partial unique index**
(`findings_open_fingerprint_idx` on `(service_id, fingerprint)
where status = 'open'`) is the backstop that makes the race harmless —
two concurrent recorders cannot create two open rows for one
fingerprint. A backend must enforce exactly that partial uniqueness:
uniqueness over *all* statuses would break the resolved-then-reopen path.

Reads additionally require the **array-containment operator** (`cs`) on
`audit_findings.cell_ids` — `useCellFindings` filters with
`.contains('cell_ids', [cellId])` — so `uuid[]` columns must be
queryable by containment, not just equality.

### Auth contract

The client consumes a **GoTrue-compatible session API** via
`@supabase/supabase-js` — the surface actually used is small:
`auth.getSession()`, `auth.onAuthStateChange()`,
`auth.signInWithPassword({ email, password })`, and `auth.signOut()`. A
replacement backend must issue JWTs the data API accepts and keep those
four behaviors intact.

**The tier is asked, not read off the token.** The client calls
`is_service_account()` — the same seam every write RPC asserts in its own
body and every restrictive write policy ANDs with — and takes its answer
(`src/lib/identity.ts`, consumed by
`src/contexts/SupabaseProvider.tsx`):

- no session → `anon`, settled without asking. The seam's permissive
  default answers `true` to anyone who calls it, anon included, so a
  deployed visitor is decided before the database is involved.
- signed in, the seam answers `true` → `service`: the full write gate.
- signed in, the seam answers `false` → `anon`: the board and any chat
  surfaces, and no write affordances.
- the ask fails → `anon`. The database refuses the write either way, and
  offering a save that cannot succeed is the worse of the two mistakes.

The `role` claim is **not** consulted, in either direction. It is how the
Supabase recipe happens to carry the tier, and a client that read it would
be re-deriving a rule the database owns, in a second place, where the two
can disagree — which is what handed a role-less account the whole editing
UI over a database that refused every save. A replacement backend answers
the same question however it likes and need not have a claim at all.

The answer is asked again whenever the access token changes, because it is
computed server-side from the token presented; it is held against the
account, so a token refresh updates it without blanking it.

This is still a UX gate; the backend must enforce the same tiers
server-side (the RPC in-body guard plus table policies), because a
definer-style RPC bypasses row policies entirely.

## Per-locale artifacts

One bilingual IR → one artifact set per locale (two seed files / two fallback
modules), each imported to its own target. No `locale` column exists; mixing
locales in one target renders duplicate trees the frontend cannot filter.

## Conformance checklist for a new adapter

- [ ] Target echo + user confirmation before first write
- [ ] Provisioning is repeatable (safe to run on an already-provisioned target)
- [ ] Import is one transaction; invalid IR leaves target untouched
- [ ] Re-import of unchanged IR is a no-op state-wise
- [ ] Pre-import diff warns on out-of-band target changes
- [ ] Post-import read-back counts match the IR
- [ ] No secret ever lands in a committable file
