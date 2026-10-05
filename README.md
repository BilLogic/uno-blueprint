# Uno Blueprint

Get your human and AI teammates on the same page.

An open-source toolkit for context engineering: a canvas for your team, a harness for your agents. One service blueprint that people read as a canvas and agents read as structured data, for product teams whose context is spread across PRDs, designs, code, dashboards and threads.

[Website](https://uno-blueprint.netlify.app) · [Try the demo](https://uno-blueprint.netlify.app/demo/) · [Agent guide](https://uno-blueprint.netlify.app/uno-blueprint.md)

## Quick start

One command writes a workspace, installs it, and prints the lines that start the canvas. It needs Node 22 or later, and no database to start.

```bash
npm create uno-blueprint@latest
cd uno-blueprint
npm run dev
```

The canvas opens on http://localhost:5173 with a sample blueprint. Other package managers work the same way:

```bash
pnpm create uno-blueprint   # then: cd uno-blueprint && pnpm dev
yarn create uno-blueprint   # Yarn 1 (Classic); then: yarn dev
bun create uno-blueprint    # then: bun dev
```

Yarn 2 and later skip the setup scripts the template needs, so they are refused. The folder name, `--no-install` and the other options are in [SETUP.md § 1](./SETUP.md#1-start-a-workspace) and [the initialiser's README](./packages/create-uno-blueprint/README.md).

Then add the skills to the coding agent you already use. In Claude Code:

```bash
claude plugin marketplace add BilLogic/uno-blueprint
claude plugin install ub@ub-marketplace
```

That installs the four skills as slash commands, in any project. Cursor, Codex and other agents read `AGENTS.md` in the workspace, which routes each skill name to its instructions: see [In other coding agents](#in-other-coding-agents).

To work on the template itself, clone it instead:

```bash
git clone https://github.com/BilLogic/uno-blueprint.git
cd uno-blueprint
npm install
npm run dev
```

## Why a map

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="./docs/assets/why-now.dark.svg">
  <img src="./docs/assets/why-now.svg" alt="Why teams need a service blueprint — checked at a quarterly, twice-yearly or yearly review, it drifts out of date between reviews; checked almost daily, by people and agents, it stays true">
</picture>

Your context is everywhere. Your agents need a map. MCP connects your agents to your tools. Uno Blueprint shows them how it all fits together, so they find the right context the first time.

A service blueprint lays one service out step by step, by who does the work, and links every cell to the sources behind it. Your docs stay in their tools; the blueprint organizes what they hold and links back. Because agents read it every day, the team has a reason to keep it accurate.

## What's inside

### A canvas for your team

A React app (Vite, [shadcn/ui](https://ui.shadcn.com/), Tailwind v4) that renders the blueprint as a grid of lanes and steps. See how your whole service works, keep it accurate together, weigh one path against another, and tailor it for every stakeholder.

- **Get up to speed.** See the service end to end, then open any step for the detail.
- **Keep it current.** Check a cell against its source and fix it in place.
- **Compare paths.** Line up a scenario's paths on one shared step axis, with dependency arrows between cells.
- **Tailor it.** Cut the map down to what each stakeholder needs, present it, or print it to PDF.

The same blueprint opens on a phone, and the built-in agent answers questions against it on your own model key.

### A harness for your agents

Four skills teach your agents to build the map from your docs, keep it accurate, and test changes against it. Agents draft, check and suggest. Drafts need sign-off, and every edit can be undone.

| Skill | What it does | Where it ends |
| --- | --- | --- |
| [`ub:map`](./skills/map/SKILL.md) | Draft a blueprint from your docs, a working session, or a diagram exported from another tool; resume an existing workspace | a validated `blueprint/blueprint.json`, signed off per scenario |
| [`ub:slice`](./skills/slice/SKILL.md) | Cut a view for one audience: a `journey`, `lane`, `step`, `cell` or `custom` set | a slice document that still points at the cells it cites |
| [`ub:audit`](./skills/audit/SKILL.md) | List gaps, conflicts and stale sources, one check at a time | findings with a severity, for you to triage; nothing is changed for you |
| [`ub:whatif`](./skills/whatif/SKILL.md) | Trace a change before you make it | the cells it would reach, on a copy |

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="./docs/assets/skill-architecture.dark.svg">
  <img src="./docs/assets/skill-architecture.svg" alt="The skill set and agent fleet — four skills against the shared references each links and the fresh-context agents each hands its reading to">
</picture>

Each skill carries its own playbooks and scripts. The heavy reading happens in five fresh-context agents (`document-reader`, `blueprint-reviewer`, `auditor`, `impact-tracer`, `render-checker`), each returning a short summary rather than its raw material. `ub:map` runs one pipeline: sources, one validated blueprint file, preview and adversarial review, sign-off per scenario, import, then verify and deploy. Every phase ends at a deterministic gate. Each skill is walked, with its own figure, in [guide/03 — The plugin](./docs/guide/03-the-plugin.md).

#### In other coding agents

The repo ships the four skills under `.agents/skills/` as well, so a checkout or a workspace works in coding agents that read that folder, with no plugin install. Checked by hand:

| Agent | How you call a skill |
| --- | --- |
| Claude Code (plugin) | `/ub:map` |
| Cursor | `ub:map`, or describe a map task |
| Codex | `$ub:map` |

Gemini CLI, Copilot and Windsurf document the same `.agents/skills/` convention and are expected to find the skills too. Any other agent that reads markdown can run them from `AGENTS.md`. Why you edit `skills/` and sync the mirror: [guide/03 § In other coding agents](./docs/guide/03-the-plugin.md#5-in-other-coding-agents).

### Works on top of MCP

Uno Blueprint works on top of MCP, not instead of it. `ub:map` reads a FigJam or Figma board through MCP when one is connected, and writes to a Supabase project through the Supabase MCP or your own CLI credentials, never with a service-role key on disk. The rules are in [references/adapter-contract.md](./references/adapter-contract.md).

### One blueprint, every place you work

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="./docs/assets/four-ways-in.dark.svg">
  <img src="./docs/assets/four-ways-in.svg" alt="Four ways into one shared context — the app, the in-app agent and agentic tools read and write it; a Slack bot you build, dashed because the template does not ship it, only reads">
</picture>

The template ships three ways in: the app, the in-app agent (sign in and bring your own model key), and your coding agent. All three work from one shared context layer, so what any of them reads is what the others wrote. The fourth, dashed, is a pattern you build: a Slack bot that holds only the publishable key, reads what a deployment publishes, and answers with links back to the exact cell. It has to honour the [read-consumer section of the adapter contract](./references/adapter-contract.md#read-consumers-bots-agent-tools-external-integrations); [guide/02](./docs/guide/02-using-it-in-practice.md) describes the shape, and [guide/04](./docs/guide/04-operations.md) covers who may do what.

## How a blueprint is laid out

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="./docs/assets/data-model-hierarchy.dark.svg">
  <img src="./docs/assets/data-model-hierarchy.svg" alt="How a blueprint is organized, as a staircase stepping down and to the right — a service holds phases in order and may loop back; one phase opens into a deck of scenarios; one scenario branches into paths (happy, variants, exceptions); and the happy path opens into a grid of lanes and steps">
</picture>

Service, phase, scenario, path. A **service** holds ordered **phases**, which can loop back. A phase holds **scenarios**: the specific situations that can happen during it. A scenario holds **paths**: the main route, plus its variants and exceptions. One path is one blueprint.

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="./docs/assets/blueprint-anatomy.dark.svg">
  <img src="./docs/assets/blueprint-anatomy.svg" alt="Inside one path — lanes as rows, steps as columns, a cell where they cross, leads-to arrows between cells, and the three lines falling between the lanes">
</picture>

Lanes are rows, one actor each: User, Frontstage, Backstage, Support. Steps are columns, one moment in time each. Where a lane meets a step, one **cell** holds the detail: owner, status, value, dependencies and the sources behind it. The lines of interaction, visibility and internal interaction fall between the lanes they separate. Lane colours follow a semantic `lane_role`, so labels are free-form in any language.

The full model is in [guide/01 — The blueprint model](./docs/guide/01-the-blueprint-model.md) and the vocabulary in [CONTEXT.md](./CONTEXT.md). Lane roles, step ordering, import order and layouts are specified in [references/data-model.md](./references/data-model.md) and [docs/connectors/supabase/database.md](./docs/connectors/supabase/database.md).

## Get set up

Hand this section to your agent; it can run all of it. Each subsection also works as manual steps. [SETUP.md](./SETUP.md) is the long form, with a success check for every step.

### Run locally

The [Quick start](#quick-start) is the whole of it. With no `VITE_SUPABASE_*` variables the app runs in **no-database mode** and renders the bundled sample, generated by [`scripts/generate_sample_blueprint.mjs`](./scripts/generate_sample_blueprint.mjs) into both `src/data/sampleBlueprint.ts` (the offline fallback) and `supabase/seed.sql` (the database seed).

### Add a database

Your blueprint lives in your own database. Supabase is the reference setup and works as shipped:

```bash
cp .env.example .env
npm run supabase:start       # local stack (Docker)
npm run supabase:reset       # applies migrations + sample seed
npm run dev
```

Copy `API URL` and `anon key` from the CLI output into `.env`. For a hosted project: `supabase link`, `supabase db push`, then `supabase db query --file supabase/seed.sql --linked`, and set `.env` from **Settings → API**. Keep every key and connection string in `.env`, never in a tracked file.

Then run `npm run check:target` once. It asks the database which schema it carries. The app falls back to bundled content when it cannot reach a project, so a page that renders does not prove the migration ran.

> **Exposure note:** every table carries a public `SELECT` policy (read-only anon access). Anything you deploy is publicly readable, so keep client-sensitive content out of a public deployment.

`supabase/seed.sql` is the **meta-blueprint**: the service blueprint of this template itself. One generator emits it and the no-database fallback from the same source, so both serve the same content. Replace it with your own service ([SETUP.md § 5](./SETUP.md#5-put-your-own-content-in)); until then it doubles as documentation.

### The portable Postgres core

**The portable Postgres core is the contract. Supabase is one conformant reference recipe, fully supported and not required.** Neon, Firebase Data Connect, RDS or a self-hosted Postgres take the core plus a small data layer you write against the adapter contract.

The migrations carry partition marks, [scripts/generate-portable-core.mjs](./scripts/generate-portable-core.mjs) emits both halves from them, and every pull request applies the core to a stock `postgres:17` with no Supabase in front of it, then the recipe on top. If the core stops being portable, the build goes red.

| File | What it is |
| --- | --- |
| [supabase/generated/portable-core.generated.sql](./supabase/generated/portable-core.generated.sql) | **The contract.** Tables, columns, constraints, indexes, views, triggers, function bodies. Runs on any Postgres. |
| [supabase/generated/supabase-recipe.generated.sql](./supabase/generated/supabase-recipe.generated.sql) | **One recipe.** `auth.uid()` defaults, the anon / authenticated / service_role grants, RLS policies, the storage bucket. The shipped app runs on this. |
| [supabase/generated/portable-core.schema.sql](./supabase/generated/portable-core.schema.sql) | **The same core, as the database it builds.** `pg_dump --schema-only` of a stock Postgres that replayed the series. You apply the series; you read this. |

All three are generated. Edit a migration, then run `npm run generate:portable-core` and `npm run generate:portable-schema`; CI reverts a hand-edit.

- **What the app reads and writes through** is the generated database type, [`src/types/database.ts`](./src/types/database.ts): every table, column and RPC signature the core declares, emitted from the migrations and re-checked by CI. Change the core, regenerate the type, and every call site that no longer agrees stops building.
- **What a store has to answer** to serve the app live is [references/adapter-contract.md](./references/adapter-contract.md) § Live backend surface. The shipped Supabase call sites are the worked example.

Where your work starts:

- **Auth stops at the anon / authenticated split.** The tier reader ([`src/lib/identity.ts`](./src/lib/identity.ts)) asks the database one question, what this session may do, and leaves how you answer it to you. Supabase Auth is the shipped recipe.
- **One blueprint workspace per database.** There is no tenant column, and RLS does not scope by one.
- **Backup and restore belong to your host.** `supabase/migrations/` is append-only: an undo is a new migration.
- **Migration ops stop at the shipped chain.** `db push` and `db reset` are supported; branching, squashing and multi-environment promotion are yours. Desync has a runbook: [docs/connectors/supabase/database.md § Migration desync](./docs/connectors/supabase/database.md).
- **Adapters for other backends, and hosting, are yours to bring.**

### Deploy

Any static host works: the build always produces a plain `dist/`. Live-database mode needs `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` at **build time**. `netlify.toml` carries the build command, the `dist/` publish folder, the Node version and the redirect table: a 404 for `/assets/*` above the SPA fallback (`/* /index.html 200`). `public/_headers` carries the CSP and the one-year immutable cache for `/assets/*`. `npm run check:hosting` holds both files. Blueprint-specific gotchas: [skills/map/references/deploy-notes.md](./skills/map/references/deploy-notes.md).

To serve from a path (`https://example.org/demo/` rather than a domain root), set `BASE_PATH=/demo/` at build time. The output lands in `dist/demo/`, every URL the app reads or writes keeps the prefix, and the build writes the redirect and cache rules for `/demo/`. Details, and the one-line Netlify rewrite for showing the app under a path on another site: [guide/04 § Serving from a path](./docs/guide/04-operations.md#serving-from-a-path).

## Reference

### Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Vite dev server |
| `npm run build` | Typecheck + production build |
| `npm run lint` | ESLint |
| `npm test` | Skill-mirror check, then the Vitest suite |
| `npm run test:ir` | Round-trip test suite for the blueprint pipeline (`scripts/tests/run_tests.sh`) |
| `npm run supabase:start` / `stop` / `reset` | Local Supabase stack |
| `npm run check:target` | Ask the configured database which schema it carries |
| `npm run generate:database-types` / `check:database-types` | Regenerate `src/types/database.ts` from the database the portable core builds, or diff it against what is committed |
| `node scripts/generate_sample_blueprint.mjs` | Regenerate the sample content (fallback module + seed) |
| `python3 scripts/validate_ir.py <blueprint.json>` | Validate a blueprint file (stdlib only) |
| `python3 scripts/generate_fallbacks.py <blueprint.json> --locale <tag> --register` | Blueprint to no-database data module + offline nav, into this repository's own marker blocks |
| `python3 scripts/generate_fallbacks.py <blueprint.json> --locale <tag> --registry-out <path> --nav-out <path>` | The same two halves as standalone modules, for a deployment that mounts this package |
| `python3 scripts/generate_seed_sql.py <blueprint.json> --locale <tag>` | Blueprint to transactional Supabase seed |
| `python3 scripts/compute_signoff_hash.py <blueprint.json>` | Per-scenario sign-off content hashes |
| `python3 skills/audit/scripts/audit_tools.py` | Helpers the audit checks run on |
| `python3 skills/slice/scripts/slice_tools.py` | Helpers for composing and validating a slice |

The checks to run before pushing are in [SETUP.md § Before you push](./SETUP.md#before-you-push).

### Repo map

| Path | Purpose |
| --- | --- |
| [INDEX.md](./INDEX.md) | Where to find things: routes by task, generated from the docs' frontmatter |
| [CONTEXT.md](./CONTEXT.md) | The domain language: scenario, path, phase, step, cell, lane, the visibility line, dependency, need, slice, finding |
| [SETUP.md](./SETUP.md) | Getting the repository running, and the checks to run before pushing |
| [AGENTS.md](./AGENTS.md) | The agent router: which skill answers which intent |
| [.claude-plugin/plugin.json](./.claude-plugin/plugin.json) | Claude Code plugin manifest; this makes the repo installable as a plugin |
| [skills/](./skills/) | Four skills, one directory each (`map`, `slice`, `audit`, `whatif`): `SKILL.md` entry point plus that skill's own `references/` and `scripts/` |
| [agents/](./agents/) | Five subagents: `document-reader`, `blueprint-reviewer` (adversarial pre-sign-off review), `render-checker`, `auditor` (one check at a time, blind to the others), `impact-tracer` (walks the dependency graph) |
| [references/](./references/) | Shared core every skill uses: data model, blueprint schema, adapter contract, canvas adapter, lane-role and lane vocabularies, the interface-to-schema map, customization, audit playbook |
| [scripts/](./scripts/) | Shared blueprint pipeline: validator, fallback and seed generators, sign-off hasher, tests |
| [hooks/](./hooks/) | Session status, blueprint auto-validation on edit, service-role secret guard |
| `src/components/blueprint/` | Blueprint grid, paths, dependency arrows |
| [src/styles/](./src/styles/) | The token layers, in the order they resolve: `colors.css` (the ramps), `semantic.css` (what each colour is *for*), `theme.css` (the Tailwind bindings), `themes/` (light and dark) |
| `src/lib/classList.ts`, `typeWeight.ts`, `typeInk.ts` | The type doctrine, enforced: one working weight, 600 for headings only, and ink named as a rung rather than dialled as an opacity. [ADR 0012](./docs/adr/0012-a-rung-owns-size-and-leading.md) |
| `src/components/editor/` | Canvas and slide editor shell |
| [src/lib/laneRoles.ts](./src/lib/laneRoles.ts) | `lane_role` rendering contract |
| [src/data/blueprintFallbacks.ts](./src/data/blueprintFallbacks.ts) | No-database fallback registry (sample content) |
| [supabase/migrations/](./supabase/migrations/) | Schema migrations: base template plus the authoring and agent-surface layers |
| [supabase/seed.sql](./supabase/seed.sql) | Generated sample seed |
| [supabase/generated/](./supabase/generated/) | The portable core and the Supabase recipe, generated from the migrations' partition marks |
| [docs/guide/](./docs/guide/) | The four guides: the model, using it, the plugin, operations |
| [docs/adr/](./docs/adr/) | The decisions, numbered. The list is [docs/adr/overview.md](./docs/adr/overview.md) |
| [docs/connectors/supabase/](./docs/connectors/supabase/) | The reference recipe as an operated database: columns, row-level security, the migration desync runbook |
| [docs/engineering/](./docs/engineering/) | Cutting a release, and every guard behind a red build |
| [docs/guidelines/](./docs/guidelines/) | Writing documentation here, and proposing a change |
| [docs/assets/](./docs/assets/) | Every figure in this README and the guides |
| [docs/erd.mmd](./docs/erd.mmd) | Attribute-level ERD |

## Going deeper

| Guide | Who it is for | What it covers |
| --- | --- | --- |
| [01 — The blueprint model](./docs/guide/01-the-blueprint-model.md) | Anyone reading or authoring a blueprint | What each part of a blueprint is, down to one cell and a slice |
| [02 — Using it in practice](./docs/guide/02-using-it-in-practice.md) | The designer or PM fitting it into their week | What a team does with it, day to day |
| [03 — The plugin](./docs/guide/03-the-plugin.md) | The adopter installing it, the engineer extending it | How the skills and agents work, and what lands on disk |
| [04 — Operations](./docs/guide/04-operations.md) | Whoever runs it | Who may do what, and what happens when it changes |

Every other document, with what it answers, and the routing table an agent matches its task against, is in [INDEX.md](./INDEX.md); [docs/overview.md](./docs/overview.md) says what the folders mean. Work in flight lives in [issues](https://github.com/BilLogic/uno-blueprint/issues), so you can see what is already under way before proposing something.

## Credits

Built by Bill Guo and Meryem Marasli. MIT license: see [LICENSE](./LICENSE).
