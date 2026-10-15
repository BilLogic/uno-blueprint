---
summary: Research note — what it takes to serve the in-app agent's 51 tools from one MCP server over Supabase for a host like Cursor; which tools move as they are, which need reshaping, which stay canvas-only, where the roster and admission live, and the auth model.
---

# What the agent's tools need to run outside the browser

**For** whoever specs the owner agent's tool server.
**Answers** can the tools under `src/lib/agent/tools/` be served from one MCP
server over Supabase, what does the official Supabase MCP server already
cover, and where do the roster, admission and keys go.

Every claim below names the file (or the external doc) it comes from. Paths
are relative to the repository root as of `origin/main` at v2.8.7.

## The short answer

- **Most of the tools are already host-agnostic functions.** A tool is
  `{ name, surface, args (zod), availability, run(args, ctx) }`
  (`src/lib/agent/tools/definition.ts`), and `run` only reaches the outside
  world through `ctx`. The agent harness already bundles `TOOL_DEFINITIONS`,
  `sessionRoster` and `admitToolCall` with rolldown and runs them in Node
  (`scripts/agent-harness/app-surface.entry.ts`), and the write path already
  runs through `supabase-js` in Node against PostgREST as an authenticated
  service account (`scripts/run-slice-over-postgrest.mjs`,
  `scripts/mint-service-claim.mjs`). So the server is a new `ToolContext`
  provider plus an MCP adapter, not a port.
- **Of 51 tools: 21 reads and all 20 writes can be served; 10 stay in the
  canvas.** The 10 are the 8 interface tools and the 2 reads of live UI
  (`get_ui_state`, `list_ui_commands`). Three reads (`list_sessions`,
  `get_session`, `get_change_history`) and the write path's ledger need
  reshaping because they read browser state.
- **The official Supabase MCP server is not a substitute.** It is a
  developer tool (`execute_sql`, `apply_migration`, logs, advisors, edge
  functions) acting with the developer's account permissions; it has no
  per-RPC tools, no notion of a service, a scope or the authoring ledger, and
  Supabase's own guidance is not to hand it to end users. It is the right
  thing for *us* building the project, not for the owner's agent.
- **Host it as a Supabase Edge Function using Supabase Auth as the OAuth 2.1
  server**, so every call carries the owner's own JWT and the existing grants,
  RLS and `is_service_account()` gate apply unchanged. Do not use the service
  role key.

## How a tool reaches the world today

`ToolContext` (`src/lib/agent/tools/definition.ts`) is the whole seam:

| Field | What it is in the browser | What the server must supply |
| --- | --- | --- |
| `client` | the shared `supabase-js` client, signed in as the reader | a `supabase-js` client built per request from the caller's JWT |
| `scope` | the active service, resolved once from the URL slug (`serviceScope.ts`) | a service the host names (argument, or a per-connection default) |
| `session` | `{ id, attributed }` — `attributed` sets a module-global in `authoringSession.ts` | a session id per MCP connection, and attribution passed explicitly (see Risks) |
| `ui` | the canvas bridge (`uiBridge.ts`) | nothing — the interface tools are not served |
| `offlineBoard` | bundled sample for the no-database trial | not needed — the server always has a database |
| `roster` | `sessionRoster(mode)` | the same function, with a server mode |
| `meaning` | `{ index, apiKey }` from the reader's browser-held key | an embedding key held by the server (see Auth) |
| `signal` | Stop button | the MCP request's cancellation |

The provider adapters (`src/lib/agent/providers/*`), `loop.ts`, skills, the
composer and `settings.ts` (BYO keys in `localStorage`) do not move: in Cursor
the host owns the model, the loop and the key.

## Inventory

Surface and availability are read off each definition in
`src/lib/agent/tools/definitions/*.ts`; the table or RPC off the function the
tool calls (`read.ts`, `search.ts`, `authoringRpc.ts`, the `*Mutations.ts`
modules) and the migrations under `supabase/migrations/`.

### Reads (23)

| Tool | Hits | Browser-only? |
| --- | --- | --- |
| `get_reference` | bundled reference docs + `agent.references` from config (`tools/references.ts`) | No. Better served as MCP resources; Cursor can also read `references/` from the workspace |
| `list_references` | same | No |
| `list_blueprint` | `phases`, `scenarios`, `paths`, `steps`, `lanes`, `cells` (`read.ts`) | No |
| `search_blueprint` | deployment RPC `search_blueprint` (not shipped by this schema — `docs/connectors/supabase/database.md`), `phases` for scoping, plus an embedding call with the reader's key (`embedQuestion.ts`) | No, but the embedding key moves server-side |
| `get_blueprint` | `paths` with nested reads | No |
| `compare_blueprint` | `paths` | No |
| `get_cell` | `cells` | No |
| `list_slices` / `get_slice` | `slices` | No |
| `list_owner_tags` | `cells` | No |
| `list_stakeholders` | `stakeholders` | No |
| `list_lanes` | `lanes` | No |
| `list_cell_dependencies` | `cell_dependencies` | No |
| `list_evidence` / `get_evidence` | `evidence` | No |
| `get_business_model` | `business_models` | No |
| `measure_deletion_impact` | RPC `deletion_impact`, slice selects (`deletionSafety.ts`) | No |
| `list_findings` | `audit_findings` | No |
| `list_sessions` | `agentSessionsSnapshot()` — `localStorage` (`sessions.ts`) | **Yes** — reshape onto `agent_sessions` |
| `get_session` | `localStorage` list + `agent_messages` (`persistence.ts`) | Half — reshape onto `agent_sessions`/`agent_messages` only |
| `get_change_history` | in-memory ledger `sessionSnapshot()` (`authoringSession.ts`) | **Yes** — reshape onto `authoring_changes` |
| `get_ui_state` | `ctx.ui.uiState()` | **Yes** — canvas-only |
| `list_ui_commands` | the live command registry (`uiCommands.ts`) | **Yes** — canvas-only |

### Interface (8) — all canvas-only

`open_phase`, `open_scenario`, `focus_cell`, `open_cell_panel`,
`set_canvas_mode`, `set_sidebar`, `annotate_cells`, `ui_command`. Each is
`ctx.ui.<x>(…)` and nothing else (`definitions/interface.ts`). `ui_command`
fires whatever control a mounted surface registered, and is a write when
that control says `mutates` — undo reverts through the delete RPCs
(`uiCommands.ts`). There is no canvas behind an MCP host, so none of these is
served. The nearest server-side equivalent is a link: a tool result can carry
the canvas URL for a cell or phase (`boardAddress.ts`, `urlViewState.ts`)
for the owner to open.

### Writes (20) — all servable; the ledger needs reshaping

Every write is `defineWriteTool`: write surface, unavailable to trial and
mobile, run inside `ctx.session.attributed(...)`.

| Tool | RPC / table |
| --- | --- |
| `create_stakeholder`, `update_stakeholder` | `stakeholders` insert/update (`stakeholderMutations.ts`) |
| `create_phase` | RPC `create_phase` |
| `create_scenario`, `duplicate_scenario` | RPCs `create_scenario`, `duplicate_scenario` |
| `create_path`, `duplicate_path`, `update_path` | RPCs `create_path`, `duplicate_path`, `rename_path` |
| `create_step` | RPC `add_step` |
| `create_lane` | RPC `add_lane` |
| `upsert_cell`, `update_cell` | RPC `upsert_cell`, `cells` update, RPCs `sync_cell_touchpoints` / `sync_cell_resources` (`cellSave.ts`, `cellContentMutations.ts`, `cellSpecMutations.ts`) |
| `create_cell_dependency` | RPC `set_cell_dependency` |
| `create_slice`, `update_slice`, `replace_slides` | RPCs `create_slice`, `replace_slides`; `slices`/`slides`/`slide_images` (`sliceMutations.ts`) |
| `create_evidence`, `update_evidence` | `evidence` insert/update |
| `create_finding`, `update_finding` | `audit_findings` insert/update (`findingMutations.ts`) |

The mutation modules are plain `supabase-js` and already run in Node (the
cell-edit slice drives them over PostgREST). What is browser-bound around them:

1. **The ledger is written by the client, not the database.** Each write
   module calls `recordChange` (`authoringSession.ts`), which keeps an
   in-memory list and appends to `authoring_changes` through the RPC
   `record_authoring_change`, fire-and-forget (`authoringLog.ts`), once a
   writer was installed beside the shared client (`SupabaseProvider.tsx`).
   A server must install that writer per request, or every agent write
   lands unlogged — and the map's impact check reads that log.
2. **Attribution is a module-global** (`agentAttribution` in
   `authoringSession.ts`), set for the span of one call. Safe in a
   single-reader tab; wrong in a server handling concurrent calls. It has to
   travel with the call (the `ToolContext`, or an `AsyncLocalStorage`).
3. **Cache freshness** — the writes invalidate React Query keys
   (`authoringRpc.ts` `FRESHNESS`, `queryClient.ts`). Harmless no-ops off the
   browser, but they pull React Query into the server bundle; the server
   should stub them. An open canvas will not see a server write until it
   refetches — Realtime or a refetch-on-focus is a separate question.

## What moves as-is, what needs reshaping, what stays

**Moves to the one MCP server unchanged in behaviour (38):** the 18 database
reads, the 20 writes, served from the same definitions — zod `args` become
the MCP `inputSchema` through the existing `toolSpec()` (JSON Schema, input
side), `run` returns the same text.

**Needs reshaping (5):**

- `list_sessions`, `get_session` — read `agent_sessions` / `agent_messages`
  (tables exist, scoped by `created_by = auth.uid()`,
  `20260819000000_agent_surface.sql`) instead of `localStorage`. Whether an
  MCP-host conversation is a "session" at all is a host question: Cursor
  keeps its own chat history, which the server cannot see.
- `get_change_history` — read `authoring_changes` filtered by
  `agent_session_id`, not the tab's in-memory list.
- `get_reference`, `list_references` — serve as MCP resources (or keep as
  tools; the host can also read `references/` from a workspace clone).
- `search_blueprint` — the embedding key moves from the reader's browser to
  a server secret, and stays off unless the deployment's schema carries the
  function, as today.

**Stays canvas-only (10):** the 8 interface tools, `get_ui_state`,
`list_ui_commands`. They remain in the in-app agent, which keeps its own
loop; the MCP server never lists them.

Not tools, but also canvas-only today: the scoped revert (`revert_my_changes`
is a UI command reading the in-memory ledger) and deletes (only a human, in
the confirm dialog — `measure_deletion_impact` says so verbatim).

## Where the roster and admission live

Both are pure and already one-sourced for this exact reuse:

- **Roster** (`roster.ts`): `sessionRoster(mode)` filters `TOOL_DEFINITIONS`
  by `agent.enabledTools` and by mode. The server calls it once per
  connection to build `tools/list`, with a server mode:
  `sampleTrial: false`, `mobileReading: false`,
  `allowWrites: is_service_account()` for the caller, `searchOffered` from the
  deployment config. The interface tools need an explicit exclusion — a new
  availability flag (e.g. `host: boolean`) or a gate on `surface !==
  'interface'` — rather than a hand-kept list, which is the drift ADR 0021
  item 4 forbids.
- **Admission** (`admission.ts`): `admitToolCall({ mode, name, facts })` runs
  per `tools/call`. Of its live facts, `aborted` maps to MCP cancellation and
  `isWrite` to the definition's surface (no `ui_command` on the server). The
  other two — `writesThisSend` (the 5-write batch etiquette) and
  `repeatRead` — are counted per **turn**, and an MCP server never sees a
  turn: the host owns the loop. Options: count per connection over a time
  window, drop them, or move the etiquette into the skill text. This is a
  decision for the spec, not a port.
- **Config**: the browser sets the roster's allowlist, references, doctrine
  and search plan from `DeploymentConfig` at boot
  (`DeploymentConfigContext.tsx`). The server needs the same config values
  per Supabase project — one project per pilot business, so one config per
  deployment of the function.

## Auth and keys

- **Model key**: gone from our side. In Cursor the host's model calls the
  tools; `settings.ts`'s BYO-key store and the provider adapters stay with
  the in-app agent only.
- **Database identity: the owner's JWT, never the service role.** Every write
  RPC asserts `public.is_service_account()`; under the tier recipe that reads
  `auth.jwt() -> 'app_metadata' ->> 'role' = 'service'`
  (`20260818002000_service_account_tier.sql`), and `record_authoring_change`
  is granted to `authenticated` only
  (`21000215000000_every_authoring_write_leaves_a_record.sql`). A service-role
  key would bypass RLS, fail the tier gate, and erase who did what; an
  owner's JWT passes all of it and makes viewers read-only for free.
- **How the host gets that JWT**: Supabase documents exactly this shape — an
  MCP server as an Edge Function (`createMcpHandler`, Streamable HTTP),
  Supabase Auth as the OAuth 2.1 authorization server with dynamic client
  registration, `withSupabase({ auth: 'user' })` handing the handler a
  client scoped to the user so "anything the tools read or write goes
  through RLS" ([Supabase: Build your own MCP server](https://supabase.com/docs/guides/getting-started/byo-mcp)).
  Constraints from the same page: asymmetric JWT signing keys required (legacy
  HS256 rejected), a consent screen we host, `verify_jwt = false` on the
  function, stateless — no MCP sampling.
- **Embedding key** for ranked search: an Edge Function secret.
- **Secrets rule** stands: nothing in the repo; function secrets via
  `supabase secrets`, local in the gitignored `.env`.

## The official Supabase MCP server, against our RPCs

From [Supabase: Model context protocol](https://supabase.com/docs/guides/getting-started/mcp)
and [supabase-community/supabase-mcp](https://github.com/supabase-community/supabase-mcp):

| It exposes | Relevance to the owner agent |
| --- | --- |
| `list_tables`, `list_extensions`, `list_migrations`, `apply_migration`, `execute_sql` | Raw SQL as the developer. Could read the blueprint, but skips scope, the ledger, the tier gate and every refusal sentence the tools carry |
| `query_logs`, `get_advisors` | Ours, for operating the project |
| `get_project_url`, `get_publishable_keys`, `generate_typescript_types` | Ours, for setup |
| edge functions (list, get, deploy, secrets) | Ours — how the tool server itself is deployed |
| account, branching, storage, docs | Ours |

It authenticates by OAuth or a personal access token and "operates under the
context of your developer permissions"; `read_only=true` runs queries as a
read-only Postgres user; `project_ref` scopes it to one project; and the docs
warn against giving it "to customers or end users" and about prompt
injection through query results. It has no per-function tools — our 30-odd
authoring RPCs would be reached only as SQL text. The companion
`@supabase/mcp-server-postgrest` (`postgrestRequest`, `sqlToRest`) does call
PostgREST with an anon key, service key or user JWT, so it would respect RLS
with a user JWT — but it is generic CRUD: no argument schemas, no ledger, no
scope, no refusals. Neither replaces the tool definitions; both are useful to
the people building the project.

## Open risks

1. **Unlogged writes.** If the server forgets the authoring-log writer, or
   the fire-and-forget append fails, an agent write lands with no
   `authoring_changes` row and the owner-confirmed impact check misses it.
   Consider moving the append into the write RPCs themselves, as the six
   delete functions already do in their own transaction
   (`21000215000000_every_authoring_write_leaves_a_record.sql`) — a schema
   change, so a decision.
2. **Attribution under concurrency.** The module-global attribution
   misbadges concurrent calls on a shared server instance. Must be
   per-request before anything else ships.
3. **Turn-scoped etiquette has no turn.** Batch limit and repeat-read cannot
   be enforced as written; the host decides how many writes a reply makes.
4. **Canvas freshness.** An owner with the canvas open will not see a write
   made from Cursor until a refetch. Realtime subscriptions are not wired
   today.
5. **Bundle weight and browser imports.** The write modules import React
   Query invalidation and storage-upload helpers (`sliceMutations.ts` →
   `illustrationUpload.ts`). The harness proves the reads and definitions
   bundle for Node; the writes need their freshness hooks injected rather
   than imported. Unverified until a Deno/Edge build is tried.
6. **Edge runtime fit.** Edge Functions are Deno; the definitions use zod v4
   and `supabase-js`, both Deno-compatible, but the bundle has never been
   built for Deno. Stateless also means per-connection roster state (and any
   batch counter) has to live in the request or the database.
7. **Prompt injection through blueprint text.** Cell text, evidence and
   transcripts the owner hands the agent are untrusted input, and with
   writes enabled the agent can be steered into edits. The owner's JWT bounds
   the blast radius to what the owner can do; the tier gate and the ledger
   (risk 1) are the recovery.
8. **Search function absent by default.** `search_blueprint` needs a function
   this schema does not ship; each pilot project either adds one or runs
   without ranked search.
