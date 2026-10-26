---
summary: What a store answers to serve the app live, beyond import — the operations per aggregate, the two conformance levels, and the Supabase rendering of them, from the authoring RPC roster and the direct table writes to the read timeout, findings dedupe and the auth contract.
---

# Backend contract

**For** someone implementing a backend that serves the app live.
**Answers** what a store has to answer beyond import, and how the Supabase
adapter answers it.

Import — the target, provisioning, the scenario-replace transaction, read-back
and secrets — is
[`references/adapter-contract.md`](../../references/adapter-contract.md). This
document starts where import ends.

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
  answers with the writing tier and enforces the narrower line itself, the
  only place it is enforceable. `src/lib/identity.ts` is the Supabase
  rendering, and the only one shipped.

The seam the code holds is the generated database type,
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

No runnable conformance suite exists; the operations above plus the import
checklist in [`references/adapter-contract.md`](../../references/adapter-contract.md#conformance-checklist-for-a-new-adapter)
are the bar, with § How the Supabase adapter renders it below as the worked
example.

### How the Supabase adapter renders it

Everything below is how *this* adapter answers the operations above. It is
useful as a worked example and as documentation of the deployed system. It is
not the contract.

### 1. The authoring RPC roster

Structural writes never touch tables — the app calls `POST /rpc/<fn>` for
each function in
[`supabase/generated/portable-core.generated.sql`](../../supabase/generated/portable-core.generated.sql)
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

### Structure authoring signatures

A host serving this app must implement the following portable operations, with
these argument names and PostgreSQL types. Every write and inverse uses the
host's author-tier guard, performs its checks under the same locks as its write,
and either succeeds atomically or refuses without changing data.

| RPC | Arguments | Return |
| --- | --- | --- |
| `reorder_steps` | `path_id uuid`, `step_ids uuid[]`, `expected_ids uuid[]` | `jsonb` order receipt |
| `reorder_lanes` | `path_id uuid`, `lane_ids uuid[]`, `expected_ids uuid[]` | `jsonb` order receipt |
| `rename_step_name` | `step_id uuid`, `new_name text` | `jsonb` step receipt |
| `rename_lane` | `lane_id uuid`, `new_name text` | `jsonb` lane receipt |
| `update_step_with_details` | `step_id uuid`, `name text`, `summary text` | `jsonb` step receipt |
| `update_lane_with_details` | `lane_id uuid`, `lane_ids uuid[]`, `name text`, `details jsonb` | `jsonb` lane receipt |
| `restore_step_details` | `snapshot jsonb` | `void` |
| `restore_lane_details` | `snapshot jsonb` | `void` |
| `undo_structure_add` | `snapshot jsonb` | `void` |
| `undo_structure_order` | `snapshot jsonb` | `void` |

An order receipt is `{kind, path_id, before, after}`. Both orders are arrays of
`{id, position}`. Forward reorder requires a complete identity permutation and
compares the stored identity order with `expected_ids` under a path lock; a stale
view raises `This path changed. Reload and try again`. Order Undo compares the
complete current order with `after`, refusing a newer reorder with
`This path changed since Move. Reload before undoing this change`, then restores
the exact positions in `before`.

A step receipt is `{step_id, name, summary, after}`. A lane receipt is
`{lane_id, name, rows: [{id, owner_team, stakeholder_id, kpis, tools}], after}`.
Before-values and `after` (the complete saved row) are captured by the server,
not supplied from the client's previous name. Restore requires the current row
to match `after` exactly or raises `This step changed since your save` (or
`This lane changed since your save`). Lane saves affect only `lane_id`;
`lane_ids` is retained for wire compatibility and never fans properties out.

An Add receipt is `{kind, ids, before, after}`, where before/after map path IDs
to `{id, position}` arrays. Add Undo requires non-empty matching path maps,
complete membership coverage for all deleted identities, matching current after
orders, and non-negative contiguous before positions containing exactly the
surviving identities. Malformed or incomplete receipts raise
`This change cannot be undone. Reload the canvas`; a changed order raises
`This path changed since Add. Reload before undoing this change`. Any cell on a
new identity, including an empty cell and its attached evidence, resources and
dependencies, prevents deletion with `This step has content since Add. Delete
it instead if you mean to` (or the lane equivalent).

Apply migrations 309–311 with the matching app and regenerate database types.
Custom reorder callers must supply `expected_ids`; old Undo receipts without
after-values are refused. Legacy `reorder_steps(path_id uuid, step_ids uuid[])`,
`reorder_lanes(path_id uuid, lane_ids uuid[])` and
`reorder_lanes(scenario_id uuid, lane_names text[])` remain authorized reload
stubs: `Reload: the app was updated`. They never perform a write.

### Optional host authoring operations

A deployment may supply additional named RPCs under
[ADR 0033](../adr/0033-a-deployment-may-supply-optional-host-operations.md).
The portable core remains the minimum; installing the template client does
not install these operations. Hosts supply their existing write-tier guard
and the exact contracts used by `authoringRpc.ts`:

| RPC | Arguments | Success receipt |
| --- | --- | --- |
| `rename_step` | `step_id`, `expected_name`, `new_name` | `id`, `change_id` |
| `move_cell` | `cell_id`, `expected_source`, `destination` | `id`, `change_id` |
| `insert_cell_at_position` | `path_id`, `lane_id`, `step_id`, `at_position`, `content`, `status` | `id`, `change_id`, `cell_key` |

Coordinates contain `path_id`, `lane_id`, `step_id` and `position`. Hosts
reject stale expected values and occupied slots, preserve identities on
rename/move, and atomically record each write with its inverse. Names are
exact strings, including surrounding spaces. Insertion creates a new
identity, never overwrites an existing cell, and requires content and an
explicit status. Receipts require nonempty, nonzero row/change identities;
rename/move must return the requested identity, insertion a nonempty key.
Missing operations and malformed receipts fail. A failed receipt requires
read-back before retry because the server may have committed. Callers still
verify the row and durable record against the approved edit.

The status-only column mutation captures and guards the old status, updates
only that column and requires a returned row. Blank text and placements stay
intact. Its column update and durable append are separate requests: a failed
append is a partial write, not an atomic rollback. A matching same-status
request does nothing; a stale expectation still fails.

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
