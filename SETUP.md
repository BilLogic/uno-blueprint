# Setup

Getting this repository running on your machine, for someone who has not read
anything else in it. Adopting the package rather than working on it? The
README's [Get set up](./README.md#get-set-up) is the shorter road.

## What you need

| | |
| --- | --- |
| Node | 22 or later (CI runs 22) |
| Python | 3.10 or later, standard library only — no packages to install |
| Docker | only for a local database; the app runs without one |
| Supabase CLI | only for a local database; installed as a dev dependency |

## From clone to your own content

Five steps, in order. Each one is a command and a thing you should see. If a
step does not show you its result, stop on that step — every later step will
look like it worked anyway, because this app renders bundled content whenever
it cannot reach a database. That is the one trap on this path, and it is why
each step below ends in something to *check* rather than something to look at.

### 1. Clone it and install

```bash
git clone https://github.com/BilLogic/uno-blueprint.git
cd uno-blueprint
npm install
```

**Success:** `npm install` finishes without an `npm ERR!` line.

### 2. Run it with no database at all

```bash
npm run dev
```

**Success:** <http://localhost:5173> shows a blueprint — a grid of lanes and
steps. That content is bundled in the repository, so this works before you
have configured anything. Stop here if all you want is to look at the
renderer.

### 3. Set the two variables

The app needs exactly two values to talk to a database. Copy the example file
and fill them in:

```bash
cp .env.example .env
```

```env
VITE_SUPABASE_URL=…
VITE_SUPABASE_ANON_KEY=…
```

Where they come from: for a local stack, `npm run supabase:start` prints
`API URL` and `anon key`. For a hosted project, **Settings → API**. Nothing
else in `.env` is required.

**Success:** deliberately *not* "the page still renders" — it renders either
way. Run this instead:

```bash
npm run check:target
```

It prints `the target carries schema_version …` when the database is reachable
and migrated, and says plainly when it was never migrated or is stale.

### 4. Replay the schema onto an empty database

```bash
npm run supabase:reset       # local stack: every migration, then the seed
```

For a hosted project: `supabase link`, then `supabase db push`, then
`supabase db query --file supabase/seed.sql --linked`.

**Success:** `npm run check:target` now prints a schema version, and:

```bash
npm run check:seed-load
```

prints `the generated seed loads on a fresh core + recipe and renders as
anon`. That check builds a scratch database of its own and reads the content
back with the same kind of key a browser holds, so a green line here means a
visitor would see rows rather than a blank grid.

### 5. Put your own content in

`supabase/seed.sql` is a real blueprint — of this template itself — not
filler. Replacing it is the whole adoption:

```bash
python3 scripts/validate_ir.py my-blueprint.json
python3 scripts/generate_seed_sql.py my-blueprint.json --locale en --out supabase/seed.sql
```

(Or let the agent do it: the `ub:map` skill builds the blueprint file from your
own documents.)

**Success:** load it, then prove it renders to a keyless reader the same way
step 4 did:

```bash
npm run check:deployment-seed-load -- --seed supabase/seed.sql
```

Every statement has to apply, every table the seed writes has to come back
non-empty to the anon key, and the two joins the app renders — the blueprint
grid and the service hierarchy — have to return rows. When a statement fails,
the check names the file, the line and the reason, grouped so the one root
cause is not buried under the forty rows that failed because of it.

## Before you push

```bash
npm test
npm run lint
npm run build
```

Then the guard set — every check CI runs, what each one is defending, and how
to read its failure: [docs/engineering/checks.md](./docs/engineering/checks.md).

Two of them *cannot* run in CI and are yours to run locally:
`npm run check:target` needs a live project, and
`npm run check:deployment-seed-load` needs a deployment's own seed — a
checkout CI does not have. Both are in
[checks.md § The database](./docs/engineering/checks.md).

Two guards read the tree for what it must NOT carry, and they are the pair
worth running before a comment goes in: `npm run check:standalone` for the
deployment's NAMES and `npm run check:content-coupling` for its CONTENT — a
cell id pasted out of its database, one of its lane actors, one of its
scenarios. The second names the file, the line, the value and the pattern that
caught it.

Those two read the tree for somebody else's content. The third reads it for
*this template's*, and it is the one to run after step 5:
`npm run check:sample-content` reports where the bundled sample — the
meta-blueprint, this template mapped as its own service — is still what your
deployment serves. It looks at the two places a deployment's content lives:
the seed `[db.seed]` names, and `src/data/`, the board the app renders with no
database. Three markers, named per finding so you can tell them apart: the
sample service name, its own `f0000000-…` id namespace — which names nothing,
so content can read as entirely yours and still be keyed on the template's rows —
and its six scenario titles.

**It reports and exits 0, on purpose, and it is the only check here that
does.** A fresh clone is full of sample content because step 2 asks you to run
the app against it, and a half-migrated deployment — seed replaced,
`src/data/` not yet re-registered — is a legitimate place to be for a while.
Neither is a build to fail, and a check that failed on a supported path is one
you would learn to scroll past. So it never goes red, in your CI or ours, and
what it asks of you is that you read it.

Three failures surprise people, so they are worth knowing up front. Editing
anything under `skills/` or `references/` without running
`npm run sync:skills` fails `npm test` on the drift guard, because the app
bundles a vendored copy of both and `.agents/skills/` holds a copy of each
`SKILL.md` for other coding agents. Adding a document under `docs/`
without a `summary:` in its frontmatter fails `npm run check:docs-index`,
which names the file. And changing a panel label's binding in
`scripts/interface-schema-map.mjs` without running `npm run interface-map`
fails `npm run check:interface-map`, because
[references/interface-schema-map.md](./references/interface-schema-map.md) is
generated from that list rather than kept beside it.

## Where things are

`INDEX.md` routes by task. `CONTEXT.md` defines the domain language. The
guides in [docs/guide/](./docs/guide/) walk the whole thing in four numbered
parts; [docs/overview.md](./docs/overview.md) says what else `docs/` holds and
what each folder is for.

Column reference, row-level security and the desync runbook:
[docs/connectors/supabase/database.md](./docs/connectors/supabase/database.md).
