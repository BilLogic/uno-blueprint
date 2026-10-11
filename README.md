# Uno Blueprint

Get your human and AI teammates on the same page.

An open-source toolkit for context engineering: a canvas for your team, a harness for your agents. One service blueprint that people read as a canvas and agents read as structured data. Your product knowledge is spread across PRDs, designs, code, dashboards and threads; the blueprint shows how it fits together.

[Website](https://uno-blueprint.netlify.app) · [Try the demo](https://uno-blueprint.netlify.app/demo/) · [Agent guide](https://uno-blueprint.netlify.app/uno-blueprint.md) · [Changelog](./CHANGELOG.md) · [Latest release](https://github.com/BilLogic/uno-blueprint/releases/latest)

## Your context is everywhere. Your agents need a map.

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="./docs/assets/why-now.dark.svg">
  <img src="./docs/assets/why-now.svg" alt="Why teams need a service blueprint — checked at a quarterly, twice-yearly or yearly review, it drifts out of date between reviews; checked almost daily, by people and agents, it stays true">
</picture>

MCP connects your agents to your tools. Uno Blueprint works on top of it, not instead of it, and shows them how it all fits together, so they find the right context the first time. `ub:map` reads a FigJam or Figma board through MCP when one is connected, and writes to Supabase through the Supabase MCP or your own CLI credentials: [references/adapter-contract.md](./references/adapter-contract.md).

A blueprint lays one service out step by step, by who does the work, and links every cell to the sources behind it. Your docs stay in their tools. The blueprint organizes what they hold and links back.

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
yarn create uno-blueprint   # Yarn 1 (Classic); then: cd uno-blueprint && yarn dev
bun create uno-blueprint    # then: cd uno-blueprint && bun dev
```

Yarn 2 and later, the folder name, `--no-install` and the other options are in [SETUP.md § 1](./SETUP.md#1-start-a-workspace) and [the initialiser's README](./packages/create-uno-blueprint/README.md).

Then add the skills to the coding agent you already use. In Claude Code:

```bash
claude plugin marketplace add BilLogic/uno-blueprint
claude plugin install ub@ub-marketplace
```

That installs the skills as slash commands, in any project. Cursor and Codex find them in `.agents/skills/`, and any other agent routes through `AGENTS.md`: see [In other coding agents](#in-other-coding-agents).

To work on the template itself, clone it instead:

```bash
git clone https://github.com/BilLogic/uno-blueprint.git
cd uno-blueprint
npm install
npm run dev
```

## Example requests

Once the skills are installed, ask your coding agent in plain words:

- Read the docs in this folder and draft a blueprint of our checkout. List what you could not find.
- Who owns payment retries in checkout? Cite the cell.
- What breaks if we add a guest checkout? Change nothing yet.
- Audit the checkout blueprint: steps with no owner, conflicts, stale sources.
- Cut the support team's lane out of the checkout blueprint for a new hire.

## What's inside

### A canvas for your team

A React app (Vite, [shadcn/ui](https://ui.shadcn.com/), Tailwind v4). See how your whole service works, keep it accurate together, weigh one path against another, and tailor it for every stakeholder.

### A harness for your agents

Four skills teach your agents to build the map from your docs, keep it accurate, and test changes against it. Agents draft, check and suggest. Drafts need sign-off before they land.

| Skill | What it does |
| --- | --- |
| [`ub:map`](./skills/map/SKILL.md) | Draft a blueprint from your docs. |
| [`ub:slice`](./skills/slice/SKILL.md) | Cut a view for one audience: a journey, lane, step, cell or custom set. |
| [`ub:audit`](./skills/audit/SKILL.md) | List gaps, conflicts and stale sources, ranked by what to fix first. |
| [`ub:whatif`](./skills/whatif/SKILL.md) | Trace a change before you make it. |

How each skill works, and the agents and hooks around them: [guide/03 — The plugin](./docs/guide/03-the-plugin.md).

#### In other coding agents

The repo ships the skills under `.agents/skills/` as well, so a checkout or a workspace works in coding agents that read that folder, with no plugin install. Checked by hand:

| Agent | How you call a skill |
| --- | --- |
| Claude Code (plugin) | `/ub:map` |
| Cursor | `ub:map`, or describe a map task |
| Codex | `$ub:map` |

Gemini CLI, Copilot and Windsurf document the same `.agents/skills/` convention and are expected to find the skills too. Any other agent that reads markdown can run them from `AGENTS.md`. Why you edit `skills/` and sync the mirror: [guide/03 § In other coding agents](./docs/guide/03-the-plugin.md#5-in-other-coding-agents).

### One blueprint, every place you work

- **In the app.** Ask the built-in agent and watch it point at the blueprint. Sign in and bring your own model key.
- **With your coding agent.** Run the four skills from Claude Code, Cursor, or any agent that reads markdown.
- **In your team Slack.** Put a bot on the same blueprint, and answers arrive where the questions are asked. You build this one; the template does not ship it. It reads with the publishable key under the [adapter contract's read-consumer rules](./references/adapter-contract.md#read-consumers-bots-agent-tools-external-integrations).
- **On your phone.** Take the blueprint with you. Read any journey and jump to any step.

## How a blueprint is laid out

Service > phase > scenario > path. One path is one blueprint: a grid of lanes (one actor each: the customer, frontstage, backstage, support and others) and steps. Where a lane meets a step, one cell holds the detail: owner, status, value, dependencies and the sources behind it. The full model is in [guide/01 — The blueprint model](./docs/guide/01-the-blueprint-model.md); the specification is [references/data-model.md](./references/data-model.md).

## Add a database

The canvas runs on its sample blueprint until your team is ready to share one. Your blueprint then lives in your own database. Supabase is the reference setup and works as shipped:

```bash
cp .env.example .env
npm run supabase:start       # local stack (Docker)
npm run supabase:reset       # applies migrations + sample seed
npm run dev
```

Copy `API URL` and `anon key` from the CLI output into `.env`, then run `npm run check:target`: it asks the database which schema it carries, because a page that renders does not prove the migration ran. Keep every key and connection string in `.env`, never in a tracked file. Most tables are publicly readable, so keep client-sensitive content out of a public deployment.

A hosted project, the exposure note table by table, any other Postgres host through the portable core, what stays yours to bring, and deploying: [SETUP.md § Adopting it for a team](./SETUP.md#adopting-it-for-a-team).

## Reference

### Scripts

The everyday ones:

| Command | Description |
| --- | --- |
| `npm run dev` | Vite dev server |
| `npm run build` | Typecheck + production build |
| `npm test` | Skill-mirror check, then the Vitest suite |
| `npm run lint` | ESLint |
| `npm run sync:skills` | Refresh the vendored skill copies after editing `skills/` or `references/` |
| `npm run supabase:start` / `stop` / `reset` | Local Supabase stack |

The checks to run before pushing are in [SETUP.md § Before you push](./SETUP.md#before-you-push); every guard CI runs, and how to read its failure, is in [docs/engineering/checks.md](./docs/engineering/checks.md). The blueprint pipeline's scripts are documented by the skills that run them.

### Repo map

| Path | Purpose |
| --- | --- |
| [INDEX.md](./INDEX.md) | Where to find things: routes by task, generated from the docs' frontmatter |
| [CONTEXT.md](./CONTEXT.md) | The domain language: scenario, path, phase, step, cell, lane, touchpoint, the line of visibility, dependency, slice, finding |
| [SETUP.md](./SETUP.md) | Getting the repository running, adopting it for a team, and the checks to run before pushing |
| [AGENTS.md](./AGENTS.md) | The agent router: which skill answers which intent |
| [CHANGELOG.md](./CHANGELOG.md) | What changed in each release, and what a deployment does to upgrade |
| [.claude-plugin/](./.claude-plugin/) | The Claude Code plugin manifest that makes the repo installable as a plugin |
| [.agents/skills/](./.agents/skills/) | The skills' `SKILL.md` files, mirrored for other coding agents. Generated by `npm run sync:skills` |
| [packages/](./packages/) | The initialiser behind `npm create uno-blueprint` |
| [skills/](./skills/) | Four skills, one directory each, with their own `references/` and `scripts/` |
| [agents/](./agents/) | Five subagents the skills dispatch in a fresh context |
| [references/](./references/) | The shared core every skill uses: data model, schema, adapter contract, vocabularies |
| [scripts/](./scripts/) | The shared blueprint pipeline, the generators and the guards |
| [hooks/](./hooks/) | Session status, auto-validation on edit, the secret guard |
| [src/](./src/) | The canvas app: React components, the token layers, the no-database fallback |
| [public/](./public/) | Static files the app serves as they are: icons and the hosting headers |
| [supabase/](./supabase/) | Migrations, the generated seed, and the generated portable core |
| [render-walk/](./render-walk/) | The browser walk over every view of the sample board |
| [evals/](./evals/) | The skill evals: does the right skill fire, and does it behave |
| [assets/](./assets/) | The workspace handoff template `ub:map` fills in |
| [docs/](./docs/) | Guides, decisions, connectors, engineering procedure and figures; [docs/overview.md](./docs/overview.md) says which is which |

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
