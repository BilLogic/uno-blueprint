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

The user picks one per locale (§1). Without a configured project the app
runs the no-DB adapter, so **no-DB is the first run**: zero configuration,
Supabase opted into.

**Same IR in, same render out — checked, not claimed.** Both v1 adapters
project one shared model through one shared field list
(`generate_seed_sql.seed_cell_fields` / `seed_dependency_fields`), and
`scripts/adapter_parity.py` runs an IR through both and compares every
field. Each generator reads the shared list rather than its own, so neither
side can drop a field the other carries.

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

Lanes, cells and edges are all compared, lane `kpis`/`tools` included.

**Read-only without a database (normative).** The no-DB adapter serves; it
does not accept live authoring — `canAgentWrite` is false without a
configured project. An adopter with no database authors by editing the IR
and regenerating, and the records about the board land in the ledger files
below. A
browser-local write path was considered and rejected: it would be a second
implementation of the authoring semantics whose divergence would surface
only in the demo.

**What live mode actually requires**: the domain operations named in
[`docs/connectors/backend-contract.md`](../docs/connectors/backend-contract.md)
— `getBlueprint(pathId)`, `createSlice(draft)` and the rest. Any store that can answer them can serve this app. The Supabase call
sites answer them with PostgREST embedded selects; that is one implementation,
not the requirement.

The operations below are the contract; the seam the code holds is the
generated database type (`src/types/database.ts`).

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
**⚠ REQUIRED — the backend is the user's choice.** Present the no-DB
fallback and live-DB as co-equal options and ask which, per locale, with
the trade-off: fallback = zero infra, static hosting anywhere; live-DB =
Supabase or a store that answers `docs/connectors/backend-contract.md`.
Supabase is one answer among two, chosen by the user.

Identify exactly what will be written to (Supabase project ref / output file
paths), echo it to the user, and get confirmation **before any write**
(wrong-project protection). Locale-scoped: one target per locale, tracked in
`blueprint-workspace.json` (see `skills/map/references/workspace-state.md`).

**Connector reachable (live-DB).** Confirm the Supabase MCP can see the
project before importing. A connector added mid-session (e.g. `claude mcp
add` for the import account) goes live at the next Claude Code reload: when
the target is unreachable even though the user just authenticated, say so
and prompt the reload, rather than retrying.

**Multi-account Supabase:** a connector sees ONE account/org. A bare
`permission denied` / "project not found" means the connected account
cannot see the target project — the SQL is fine; retrying changes nothing.
Connect one connector per account, the same pattern as multiple
Slack/Notion/Figma connectors, and use that account's tools for its target,
addressed per § 7 "MCP tool addressing".

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
insert in the order `references/data-model.md` § import order gives. A deliberately-invalid IR
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
being refused by the unique constraint — the model ADR 0003 states. And a
target seeded under the older key-derived ids stays idempotent: its rows keep
the ids they were born with, and a re-import updates them in place.

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
- Anon/publishable key, and any other key a skill handles (image-model keys
  such as Gemini `AIza…` or OpenAI `sk-…`): allowed in `.env` **only after
  verifying the file is gitignored**, and nowhere else on disk or in chat.
  The anon key, publishable by design, may also live in a host's build-env
  settings.
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

## Conformance checklist for a new adapter

- [ ] Target echo + user confirmation before first write
- [ ] Provisioning is repeatable (safe to run on an already-provisioned target)
- [ ] Import is one transaction; invalid IR leaves target untouched
- [ ] Re-import of unchanged IR is a no-op state-wise
- [ ] Pre-import diff warns on out-of-band target changes
- [ ] Post-import read-back counts match the IR
- [ ] No secret ever lands in a committable file

## Per-locale artifacts

One bilingual IR → one artifact set per locale (two seed files / two fallback
modules), each imported to its own target. No `locale` column exists; mixing
locales in one target renders duplicate trees the frontend cannot filter.

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

Serving the app live, beyond import, is
[`docs/connectors/backend-contract.md`](../docs/connectors/backend-contract.md);
each heading below points at its section there. They carry no number, so
§ 1–§ 7 here always mean the required operations above; each keeps its old
anchor.

### Two conformance levels

[`docs/connectors/backend-contract.md` § Two conformance levels](../docs/connectors/backend-contract.md#two-conformance-levels).

### Proving an implementation

[`docs/connectors/backend-contract.md` § Proving an implementation](../docs/connectors/backend-contract.md#proving-an-implementation).

### How the Supabase adapter renders it

[`docs/connectors/backend-contract.md` § How the Supabase adapter renders it](../docs/connectors/backend-contract.md#how-the-supabase-adapter-renders-it).

<a id="1-the-authoring-rpc-roster"></a>

### Backend surface: the authoring RPC roster

[`docs/connectors/backend-contract.md` § 1. The authoring RPC roster](../docs/connectors/backend-contract.md#1-the-authoring-rpc-roster).

<a id="2-the-direct-table-write-surface"></a>

### Backend surface: the direct table-write surface

[`docs/connectors/backend-contract.md` § 2. The direct table-write surface](../docs/connectors/backend-contract.md#2-the-direct-table-write-surface).

<a id="3-non-transactional-multi-statement-writes-exist"></a>

### Backend surface: non-transactional multi-statement writes exist

[`docs/connectors/backend-contract.md` § 3. Non-transactional multi-statement writes exist](../docs/connectors/backend-contract.md#3-non-transactional-multi-statement-writes-exist).

<a id="4-read-timeout"></a>

### Backend surface: read timeout

[`docs/connectors/backend-contract.md` § 4. Read timeout](../docs/connectors/backend-contract.md#4-read-timeout).

<a id="5-findings-dedupe-semantics-and-operators"></a>

### Backend surface: findings dedupe semantics and operators

[`docs/connectors/backend-contract.md` § 5. Findings dedupe semantics and operators](../docs/connectors/backend-contract.md#5-findings-dedupe-semantics-and-operators).

### Auth contract

[`docs/connectors/backend-contract.md` § Auth contract](../docs/connectors/backend-contract.md#auth-contract).
