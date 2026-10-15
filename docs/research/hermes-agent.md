# Hermes Agent: what to borrow

Research note for the owner-agent effort. Question: how does Hermes Agent
(Nous Research) run its loop, memory, scheduler, skills and messaging
gateway; how is it installed, hosted and updated; could our package run
inside it; and what should we borrow while the blueprint stays our framework.

Read on 2026-10-15 against `main` of
[NousResearch/hermes-agent](https://github.com/NousResearch/hermes-agent)
(latest release `v0.22.2`, published the same day). Every claim cites the
first-party file it came from; `docs/…` below is shorthand for
`https://github.com/NousResearch/hermes-agent/blob/main/website/docs/…`, the
source of the official docs site at hermes-agent.nousresearch.com/docs.
Nothing was installed or run.

## Verdict in brief

- Hermes is a general personal agent whose memory is **about the user and the
  agent's own habits**: two small capped files, a full-text index over past
  sessions, and skills it writes for itself. Our agent's memory is **about the
  business**: the blueprint. Those are different jobs, and Hermes's model should
  not replace ours.
- Our skills would load in Hermes almost as-is (it reads `.agents/skills/` in a
  trusted repo), our future Supabase MCP server would plug straight in, and
  Hermes's sub-agents start in a fresh context the way our blind review needs.
  Four things would break or need guarding; see
  [Running our package inside Hermes](#running-our-package-inside-hermes).
- Worth borrowing: the periodic persist nudge (pointed at the blueprint, gated by
  the owner), the cron job shape (a prompt plus skills plus a delivery target,
  with checks before dispatch and no tool for creating cron jobs from inside a
  cron run), pairing an owner over chat, the silence token for scheduled runs
  that find nothing, and the "frozen snapshot plus live tool reads" split for
  prompt caching.

## How each part works

### The agent loop

- One class, `AIAgent`, owns the loop. run_agent.py is a facade and the body
  lives in agent/conversation_loop.py, with turn phases in agent/turn_*.py
  ([docs/developer-guide/agent-loop.md](https://github.com/NousResearch/hermes-agent/blob/main/website/docs/developer-guide/agent-loop.md)).
- A turn adds the user message, builds or reuses the cached system prompt,
  compresses first when over 50% of the context window, calls the model,
  executes any tool calls (in parallel on a thread pool unless a tool is
  interactive) and loops; it ends on a plain text reply, persisting the
  session and flushing memory (same doc, "Turn Lifecycle").
- Messages are held in the OpenAI shape internally, and three API modes
  (`chat_completions`, `codex_responses`, `anthropic_messages`) are adapters at
  the edge. That is how it stays model-agnostic (same doc, "API Modes").
- Four tools are handled by the agent itself, not the tool registry:
  `todo`, `memory`, `session_search` and `delegate_task` (same doc, "Agent-Level
  Tools").
- Budget: 500 iterations by default and 50 per sub-agent. A fallback provider
  chain covers 429, 5xx and auth errors (same doc, "Budget and Fallback").
- Compression flushes memory first, summarises the middle turns, keeps the last
  20 messages and forks a child session lineage (same doc, "Compression and
  Persistence").

### Memory

**MEMORY.md and USER.md.** Two files in `~/.hermes/memories/`, capped at 2,200
and 1,375 characters. The agent writes them with the `memory` tool (`add`,
`patch`, `remove`; there is no `read`). They go into the system prompt as a
**frozen snapshot at session start**, so a write made mid-session only shows
up in the next session. That keeps the provider's prefix cache warm. A full
store makes the write fail, and the agent consolidates entries instead of
silently dropping them. Writes are scanned for prompt injection before they
are accepted
([docs/user-guide/features/memory.md](https://github.com/NousResearch/hermes-agent/blob/main/website/docs/user-guide/features/memory.md)).
The same doc is candid about a weakness: a gateway chat is one session that
can run for weeks, and inside a single session the memory loop
(forget, recall from memory, search past sessions) "almost never gets to fire".
Users are told to `/new` at natural boundaries (same doc, "Memory Needs Session
Boundaries").

**Session search (FTS5).** Every CLI and messaging session is stored in SQLite
(`~/.hermes/state.db`) with an FTS5 index. `session_search` returns raw
messages and lets the agent scroll within a hit, with no LLM call (same doc,
"Session Search"). The README's "FTS5 session search with LLM summarization"
line ([README.md](https://github.com/NousResearch/hermes-agent/blob/main/README.md))
is older than the current doc, which says no summarisation.

**Honcho user modelling.** Honcho is an external memory provider by Plastic
Labs, installed as a catalog plugin. After turns (on a set cadence) it reasons
about the conversation server-side and builds a running model of the user.
Each turn it injects a "base context" (session summary, user representation,
peer card) and a "dialectic supplement" ("what matters right now"). Separate
peers keep two agents' views of one user apart
([docs/user-guide/features/honcho.md](https://github.com/NousResearch/hermes-agent/blob/main/website/docs/user-guide/features/honcho.md)).
Only one external provider can be active. The plugin interface is a Python
`MemoryProvider` ABC with `prefetch` before each call, `sync_turn` after each
turn, `on_pre_compress`, `on_session_end` and `on_memory_write` hooks
([docs/developer-guide/memory-provider-plugin.md](https://github.com/NousResearch/hermes-agent/blob/main/website/docs/developer-guide/memory-provider-plugin.md)).

**The periodic persist nudge.** Two settings: `memory.nudge_interval: 10` (remind
the agent to consider saving memory every 10 user turns) and
`skills.creation_nudge_interval: 15` (every 15 tool-calling iterations,
consider saving a skill)
([cli-config.yaml.example](https://github.com/NousResearch/hermes-agent/blob/main/cli-config.yaml.example)).
When a nudge fires, agent/background_review.py forks the agent in a daemon
thread. The fork replays the conversation on the same prefix cache with a
whitelist of tools and asks whether any skill or memory should be saved.
Writes go straight to the stores; the live conversation never sees them
([agent/background_review.py](https://github.com/NousResearch/hermes-agent/blob/main/agent/background_review.py)).
The review prompt in that file is a good piece of writing in its own right. It says to
capture class-level rules, not one-off narratives, and to leave out PR or ticket
numbers. It also says never to save "tool X is broken" or a sequence of failed
attempts as guidance. `write_approval: true` stages every such write for
`/memory pending` review (memory doc, "Controlling memory writes").

### Self-authored skills and the agentskills.io format

- Skills follow the [agentskills.io spec](https://agentskills.io/specification).
  The only required frontmatter is `name` (lowercase and hyphens, up to 64
  characters, matching the directory) and `description` (up to 1,024). Optional
  fields are `license`, `compatibility`, `metadata` and an experimental
  `allowed-tools`. A skill may carry `scripts/`, `references/` and `assets/`,
  with file references relative to the skill root. Loading is progressive:
  metadata first, the body on activation, then files as needed.
- Hermes adds `metadata.hermes` keys (tags, category, conditional activation,
  config prompts). Loading runs `skills_list`, then `skill_view(name)`, then
  `skill_view(name, path)`
  ([docs/user-guide/features/skills.md](https://github.com/NousResearch/hermes-agent/blob/main/website/docs/user-guide/features/skills.md)).
- The agent writes and patches skills with `skill_manage`, from the nudge
  review above or from `/learn <source>`. `/learn` turns a document, a URL or
  "what I just did" into a skill; a large source becomes a lean SKILL.md plus
  one `references/` file per chapter (same doc, "Learning a skill from
  sources").
- **Project-local skills.** Inside a git checkout Hermes looks in
  `<root>/.hermes/skills/` and `<root>/.agents/skills/`. It loads them only once
  the user runs `hermes skills trust`, scans each one for injection and
  quarantines dangerous ones. Project skills take precedence over local ones
  (same doc, "Project-Local Skills").
- A **curator** archives stale agent-created skills after weekly idle checks.
  It never deletes, and it never touches project or hub skills
  ([docs/user-guide/features/curator.md](https://github.com/NousResearch/hermes-agent/blob/main/website/docs/user-guide/features/curator.md)).
- Edits are not fenced off: "external dirs are not a write-protection
  boundary", and `skill_manage` patches an existing skill wherever it lives
  (skills doc, "External Skill Directories"). `skills.write_approval: true` is
  the gate.

### The cron scheduler

- Jobs live in `~/.hermes/cron/jobs.json` (written atomically). The gateway's
  loop ticks every 60 seconds. Schedules can be relative (`30m`), an interval
  (`every 2h`), a five-field cron expression or an ISO timestamp
  ([docs/developer-guide/cron-internals.md](https://github.com/NousResearch/hermes-agent/blob/main/website/docs/developer-guide/cron-internals.md)).
- A job is **a prompt, zero or more skills to preload, a delivery target**
  (origin chat, a platform channel, a file) and an optional `workdir`. The
  `workdir` is what loads a repo's AGENTS.md and trusted project skills; without
  it a job runs detached from any repo
  ([docs/user-guide/features/cron.md](https://github.com/NousResearch/hermes-agent/blob/main/website/docs/user-guide/features/cron.md)).
- Before dispatch, a job's credentials, skills, delivery targets and named MCP
  servers are checked. If any check fails the job is marked `blocked_config`,
  one alert goes out, and no tokens are spent. `last_status` separates `ok`,
  `delivery_queued`, `error` and `delivery_failed`, so a job that ran but never
  reached the user is visible (cron doc, "Pre-dispatch configuration
  validation"; cron internals, "`last_status` literals").
- **A cron run cannot create cron jobs.** The cron tools are disabled inside
  cron executions. The model can pin a job to the current model but cannot
  move it to a different one; that stays a user decision (cron doc).
- Script-only jobs (no LLM, stdout delivered) and webhook-triggered jobs exist
  too (cron doc, "What cron can do now").

### The messaging gateway

- One long-running process connects every platform it is configured for
  (Telegram, Discord, Slack, WhatsApp, Signal, SMS, email, Teams and about
  twenty more), keeps a session per chat, dispatches to `AIAgent`, and runs the
  cron ticker
  ([docs/user-guide/messaging/index.md](https://github.com/NousResearch/hermes-agent/blob/main/website/docs/user-guide/messaging/index.md)).
- It denies everyone by default. Access comes from per-platform allowlists or
  **DM pairing**: an unknown user gets a one-time code (expires in an hour,
  rate-limited) that the operator approves with `hermes pairing approve`.
  Allowed users are split into admins and regular users, and regular users get
  a narrow set of slash commands (same doc, "Security").
- **Silence tokens.** A final reply of exactly `[SILENT]` (or `NO_REPLY`, and so
  on) is not sent but stays in the transcript (same doc). This is how a
  scheduled job that found nothing stays quiet.
- In the other direction, `hermes mcp serve` exposes the gateway's
  conversations as a stdio MCP server, so Cursor or Claude Code can read
  history and send messages through it
  ([mcp_serve.py](https://github.com/NousResearch/hermes-agent/blob/main/mcp_serve.py)).

### MCP support

- MCP servers are configured as `mcp_servers` in config.yaml, over stdio
  (`command`/`args`) or HTTP (`url`, `headers` with `${VAR}` filled in at
  connect time, OAuth, mTLS). Tools are discovered at startup and filtered per
  server. Resources and prompts are wrapped as tools
  ([docs/user-guide/features/mcp.md](https://github.com/NousResearch/hermes-agent/blob/main/website/docs/user-guide/features/mcp.md)).
- A curated catalog (`optional-mcps/` in the repo, Nous-approved only) gives
  one-command installs (same doc, "Catalog").
- `hermes import-agent claude-code` copies `mcpServers`, CLAUDE.md (into
  MEMORY.md), `permissions` and `skills/` from `~/.claude`, but strips secrets
  and skips slash commands
  ([docs/user-guide/import-from-other-agents.md](https://github.com/NousResearch/hermes-agent/blob/main/website/docs/user-guide/import-from-other-agents.md)).

### Sub-agents

`delegate_task` starts child agents with a **completely fresh conversation**:
the only context they get is the `goal` and `context` strings, plus the
workspace's AGENTS.md chain. Children run in the background up to 10 at a
time, can carry an `output_schema` that the parent validates (one retry
allowed), and inherit the parent's toolsets without being able to widen them.
Leaf children cannot call `memory`, `clarify`, `send_message` or `cronjob`.
There are no named, file-defined agent types
([docs/user-guide/features/delegation.md](https://github.com/NousResearch/hermes-agent/blob/main/website/docs/user-guide/features/delegation.md)).

### Context files

Exactly one project context file is loaded, the first found of .hermes.md,
AGENTS.override.md, `AGENTS.md`, CLAUDE.md and `.cursorrules`. AGENTS.md
files merge from the git root down to the working directory and are picked up
in subdirectories as the agent moves into them. SOUL.md (the persona) is
global to the install
([docs/user-guide/features/context-files.md](https://github.com/NousResearch/hermes-agent/blob/main/website/docs/user-guide/features/context-files.md)).

### Terminal backends and hosting

- A **terminal backend** is where the agent's shell, file and code tools run,
  not where Hermes itself runs. The seven backends are `local`, `docker` (one
  persistent container per process), `ssh`, `singularity`, `modal`, `daytona`
  and `vercel_sandbox`. Modal and Daytona hibernate when idle
  ([docs/user-guide/features/tools.md](https://github.com/NousResearch/hermes-agent/blob/main/website/docs/user-guide/features/tools.md);
  README).
- The **gateway** (and so cron) runs wherever Hermes is installed: a laptop, a
  VPS or a Docker container with the data mounted at `/opt/data`. "Runs on a $5
  VPS" means the gateway runs there and talks to the model provider over the
  network
  ([docs/getting-started/installation.md](https://github.com/NousResearch/hermes-agent/blob/main/website/docs/getting-started/installation.md),
  "Install layout").

### Install, update, distribution, licence

- **Install:** desktop bundles (signed MSIX on Windows, a DMG for Apple
  Silicon only), a `curl … install.sh | bash` source installer (clones the
  repo, bootstraps `uv`, pins Python, Node, ripgrep and FFmpeg), Docker, Nix and
  a Termux APT package (installation doc).
- **Update:** `hermes update` moves a source checkout between published
  `vX.Y.Z` releases (the stable channel), never commit by commit, unless the
  user switches to `--set-channel main`. Desktop bundles use their platform's
  updater
  ([docs/getting-started/updating.md](https://github.com/NousResearch/hermes-agent/blob/main/website/docs/getting-started/updating.md)).
  The release channel matches our tag-pinned model.
- **Distribution of extensions:** skills through the agentskills.io hub (with
  hash and scan records in skills/.hub/lock.json), MCP through the catalog,
  Python plugins through `hermes plugins install`.
- **Licence:** MIT, copyright 2025 Nous Research
  ([LICENSE](https://github.com/NousResearch/hermes-agent/blob/main/LICENSE)).
  Borrowing ideas or code is unrestricted, provided the notice is kept on any
  copied code.

## Running our package inside Hermes

Our package is four `SKILL.md` skills (`map`, `slice`, `audit`, `whatif`),
five sub-agent prompts in `agents/`, shared `references/` and `scripts/` at the
workspace root, and a planned MCP server over one Supabase project per
business.

**What works as-is**

- Skills: `.agents/skills/` is already a mirror of `skills/` that
  `npm run sync:skills` generates, and Hermes discovers it as project skills
  once the owner runs `hermes skills trust`. Our frontmatter (`name`,
  `description`) meets the spec.
- AGENTS.md: picked up as the project context file, so the router and the
  hard rules load as they do in Cursor or Claude Code.
- MCP: a Supabase-backed server over stdio or HTTP fits `mcp_servers` with no
  changes, and the cron pre-flight check refuses to run a job whose server is
  down.
- The scheduled audit: one cron job, `skills: [audit]`, `workdir` set to the
  business's workspace, delivered to the owner's chat. This is the closest
  existing match to "the audit runs on a real schedule from day one".
- Blind review: `delegate_task` children start fresh and get only what the
  parent passes, which is the property `agents/` relies on.

**What breaks or needs guarding**

1. **Paths to `references/` and `scripts/`.** Our skills point at
   `references/…` and `scripts/…` at the workspace root (AGENTS.md: they
   "resolve against this repo root"). The spec and Hermes resolve skill files
   relative to the skill's own directory. It works only while the agent's
   working directory is the workspace root (the CLI started there, or a cron
   job with that `workdir`). A gateway chat started anywhere else would not
   find them. Fix on our side: always set the workspace as the working
   directory, or vendor `references/` under each skill in the mirror.
2. **Named sub-agents.** Hermes has no `agents/<name>.md` registry and no
   per-agent `tools:` list. The dispatching skill has to tell the model to read
   `agents/auditor.md` and pass its text as `context`. Without a tool list, an
   auditor that should be read-only inherits every tool the parent has. Our
   AGENTS.md already anticipates hosts with no sub-agent primitive; for Hermes
   the dispatch line in each skill needs to say "read the prompt file, pass it
   whole". An `output_schema` holding the findings-row shape would enforce the
   return contract as well.
3. **Self-improvement writing into our skills.** By default the background
   review and `skill_manage` can patch any skill they can reach, and
   `write_approval` is off. A Hermes instance running our package could
   quietly rewrite `skills/audit/SKILL.md` on a business's machine. That forks
   the workspace from its template tag and defeats `npm test`'s drift check.
   The curator leaves project skills alone, but the docs do not say whether
   the background review does too. Set `skills.write_approval: true`, or turn
   the review off with `auxiliary.background_review.enabled: false`, for any
   profile that runs our package.
4. **Our Claude Code hook.** `hooks/secret_guard.py` runs only in Claude Code.
   Hermes has its own hooks and approval system, so the secrets rule has to be
   enforced by the agent or ported to a Hermes hook. Its import tool already
   strips secret-looking MCP headers.

Smaller items: `ub:map`-style invocations become `/map` (project skills win
any name clash, so no collision); Hermes's memory files would grow alongside
the blueprint unless memory is pointed elsewhere (see below); and one
Hermes profile per business lines up with "one Supabase project per pilot
business", since memory, skills and cron are all scoped to a profile.

**Bottom line:** Hermes is a credible host for owners who need a chat channel
and a scheduler we don't build. It does not replace "package once,
host-agnostic". The changes above (working directory, dispatch wording, write
gates) are ones we would make for any host, not Hermes-specific forks.

## Their memory model against blueprint-as-context

| | Hermes | Our agent |
| --- | --- | --- |
| What is remembered | Facts about the user and environment, and the agent's own procedures | The business: actors, steps, lanes, cells, findings, slices |
| Shape | Free-text entries in two capped files, plus skills | Typed rows in Postgres, checked by `scripts/validate_ir.py` |
| Who writes it | The agent, unprompted (nudge plus background review); approval is opt-in | The agent proposes; the owner's canvas edit is owner-confirmed and starts an impact check (`authoring_changes`) |
| How it reaches the prompt | Frozen snapshot at session start, plus FTS5 recall on demand | Fetched through MCP at the scope needed (a slice, a cell brief) |
| Bound | Character cap, with consolidation when full | Scope, not size: the slice is the bound |
| Error correction | `/memory pending`, `hermes journey delete` | Audit roster findings, triage, canvas fixes |

Hermes caps memory because it is unstructured and costs tokens on every turn.
The blueprint is structured and queried, so it needs no cap, and one wrong
"fact" in it is a finding the audit can catch. Hermes's memory has no
equivalent of that catch. What stays useful from their side is a **small
USER.md-like store for the owner as a person** (tone, how they like updates,
when not to message). Facts about the business should never go there.

## Borrow / adapt / skip

**Borrow**

- **Cron job shape**: prompt, skills to preload, working directory, delivery
  target; pre-flight checks that refuse to spend tokens; separate statuses for
  "ran" and "delivered"; no cron-tool access inside a cron run.
- **Silence token** for scheduled audits that find nothing new, kept in the
  log but not sent.
- **DM pairing** as the way an owner (and only the owner) is admitted to a
  channel, deny by default, with admins and regular users split for future
  slice audiences.
- **Frozen snapshot plus live reads**: put a stable blueprint summary in the
  cached prompt and fetch cells through tools, so cache hits survive a long
  session.
- **The review prompt's rules for what not to save**: no ticket numbers, no
  "tool X is broken", no failed attempts recorded as a method. These read
  straight across to how our agent should write findings.

**Adapt**

- **Persist nudge → blueprint nudge.** Every N owner turns, a background fork
  replays the conversation and asks "did the owner say anything that changes
  the blueprint?" It **proposes** blueprint changes as pending, never writes
  them. The owner confirms in chat or on the canvas. This covers the "interview
  and map" loop without a separate memory store.
- **Background review → impact check.** The same fork pattern (warm cache,
  whitelisted tools, invisible to the live chat) fits running the impact check
  after an owner-confirmed edit.
- **`/learn` → ingest.** "Point it at anything" (a transcript, a doc, a Figma
  file) and have the live agent gather it with its own tools. That is our
  document-reader path, but the output is blueprint rows, not a skill.
- **MemoryProvider as an adapter, if we ever ship on Hermes**: a thin Python
  provider whose `prefetch` returns the slice relevant to the turn from our MCP
  server, so Hermes's built-in memory steps aside (single-provider rule).
- **Session boundaries**: their own docs say week-long gateway sessions starve
  the learning loop. If we offer a chat channel, start a new session per
  scheduled run and per topic, and carry continuity in the blueprint.

**Skip**

- **MEMORY.md and USER.md as the business store**: unstructured, capped, and
  written without confirmation.
- **Honcho**: a third-party service that models the user, which is the wrong
  subject for us, and it would put the owner's conversations on a further vendor.
- **Self-authored skills and the curator on our package**: our skills are a
  versioned, published interface; agents writing into them breaks the pin.
- **Building our own gateway now**: if a channel is needed before a host
  decision, running Hermes's gateway (or `hermes mcp serve` from Cursor) beats
  writing adapters.
- **Its seven terminal backends**: our agent's work is database reads and
  writes through MCP, not shell commands in a sandbox.
