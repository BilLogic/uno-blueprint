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

### Optional host authoring operations

`authoringRpc.ts` also exports `renameStep`, `moveCell` and
`insertCellAtPosition`. These are opt-in host capabilities, absent from the
portable core. Installing this client does not install their RPCs. A host
must supply the matching operations and its existing write-tier guard:

| RPC | Arguments | Success receipt |
| --- | --- | --- |
| `rename_step` | `step_id`, `expected_name`, `new_name` | `id`, `change_id` |
| `move_cell` | `cell_id`, `expected_source`, `destination` | `id`, `change_id` |
| `insert_cell_at_position` | `path_id`, `lane_id`, `step_id`, `at_position`, `content`, `status` | `id`, `change_id`, `cell_key` |

A move's coordinates contain `path_id`, `lane_id`, `step_id` and `position`.
The host must reject stale expected values and occupied slots, preserve
identities on rename/move, and atomically record each write with its inverse
in `authoring_changes`. Names are exact strings, including surrounding
spaces. Insertion creates a new identity and never overwrites an existing
cell. These wrappers require nonempty receipt identities and a matching
identity for rename/move. Missing RPCs and malformed receipts throw; a failed
receipt requires read-back before retry because the server may have committed.
The caller must still verify the row and ledger against the approved edit.

The wrappers construct supported session inverses from their typed operation
arguments and returned identity; they never hydrate a server-provided inverse.
They skip a second client append. Undo of rename/move uses the same guarded
host operation and validates its new receipt, without adding a session entry.
Insertion's captured delete is for human undo; automation must not execute it.
No UI affordance or agent tool is added by these exports.

`cellContentMutations.updateCellStatus` supports blank cells: it captures the
old status, compares it with the caller's expected status, updates only that
column with the same guard, and requires a returned row. Text and placements
stay intact. It awaits `recordChange`'s durable writer and returns the change
ID. The column update and append are separate requests: an append failure is
a **partial write**, reported as such with the inverse retained in the session.
Read back before recovery; retrying blindly can lose the pre-write state.
Status undo uses the branded session inverse and suppresses another client
append, like existing panel undo. The ordinary best-effort logging mode is
unchanged.

Client regression tests use the in-memory database boundary to check
arguments, receipts, read-back and session behavior. They do not prove SQL
transactions, grants, row policies or a hosted deployment. Hosts must prove
those properties against their own migrations before enabling these operations.

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
