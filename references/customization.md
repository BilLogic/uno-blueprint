# Customization

Every supported customization point of the template, plus the portfolio
conventions for running many client workspaces, and the template upgrade
recipe. Everything here is guidance except two hard rules, both in the
upgrade recipe: the schema-version compat check, and every bump shipping its
migration in the same change.

## Contents

- Lane roles
- Theming & branding
- Deployment inputs and their config homes
- Composition claims: what a deployment still documents
- View types & path types
- Scale
- Agent account
- Agent search
- Bundling the agent's tool definitions
- Portfolio conventions (consultants / agencies)
- Template upgrade recipe (⚠ compat check required)

## Lane roles

The canonical vocabulary is documented in `references/lane-roles.md`, and it
is **closed**: eight roles or `null`, at the database and in the IR alike.
Customization summary: display names are free-form in any language and are
where a lane's own meaning belongs; no role is mandatory; a lane none of the
eight names takes `null` and renders as a generic swimlane. There is no
org-defined role to mint — authoring refuses a ninth value rather than letting
a document validate and then be refused on import (#204), and adding one to
the set is a deliberate multi-file act, listed in `references/lane-roles.md`
§ Adding a role.

## Theming & branding

- `brand.name` on the deployment config — the workspace/product name in app
  chrome (the wordmark and the workspace title). `src/config.ts`'s `ORG_NAME` is the
  template's own default, the last step of the fallback chain, not a file a
  deployment edits; see § Deployment inputs and their config homes.
- `index.html` — browser tab title.
- `src/styles/` — the design tokens (CSS custom properties for colors,
  radii, fonts, light/dark), split across a file per concern. The blocks an
  adopter edits are marked **BRAND SEAM**, and there are two of them:
  `src/styles/themes/light.css` and `src/styles/themes/dark.css`. The
  template ships the Uno Blueprint site's teal as its accent (the values sit
  beside the primary dials in each theme file), at `--hue: 175`, on neutral
  surfaces (`--chroma: 0`). **To rebrand:** set `--hue` to your brand's OKLCH hue and
  `--primary-lightness` and `--primary-chroma` (the filled control) to your
  fill, in both theme blocks; raise `--chroma` too if the surfaces should
  carry a tint. To keep the app neutral instead, set `--primary-chroma: 0` in
  both blocks, with `--primary-lightness` at 0.205 in light and 0.922 in
  dark. Everything else derives — the border, the foreground flip and the
  focus ring follow from `src/styles/semantic.css` on their own.
  Restyle by editing tokens, not components; the shadcn components read the
  tokens.

  There is no ramp to re-type: a stepped family is named for its hue and
  lives in `src/styles/colors.css`, and the app chrome derives from these
  dials rather than from steps.

  **The identity fill follows the accent.** `--brand` is `--primary`'s
  resolved colour, so with no brand dial declared the two are *the same
  colour* — the four identity surfaces (the cover CTA, the prose link, a
  switch that is on, the path selector's mark) look exactly like the filled
  control until you say otherwise. An unbranded template has one accent, not
  two.

  Giving the identity a colour of its own is **one dial per channel**, added
  to both theme blocks. Declare only the channel you want to move; the other
  two keep following the accent.

  | Dial | What it does |
  | --- | --- |
  | `--brand-hue` | Puts the identity on a different hue from the action colour. Not to be confused with `--brand-hue-reference` in `semantic.css`, one word away: that one is the status-harmony origin, it is declared, and it stays declared. |
  | `--brand-chroma` | Tints the identity without moving its lightness — up to the sRGB ceiling, which is what the note below is about. |
  | `--brand-lightness` | Moves the fill lighter or darker. |

  **Chroma has a ceiling, and it is lower than it looks.** The most chroma
  sRGB can hold depends on the lightness it sits at, so each mode's chroma
  has to sit under that mode's own ceiling — a brand chroma declared in a
  theme block is measured at the lightness the identity has in that mode. At
  the pair this template ships, the ceiling at hue 175 is about **0.101** in
  light (L 0.536, where the light fill already sits on it) and about
  **0.145** in dark (L 0.771); rotated to hue 280 they are about **0.264**
  and **0.119**. Declare more than a mode's ceiling and the browser
  chroma-reduces it silently, which makes the number in your theme file a
  lie and freezes the next retune. A strong tint therefore needs
  `--brand-lightness` as well, moving the fill to a lightness that can carry
  the chroma you want.
  `src/lib/palette.test.ts` holds the ceiling on `--brand`'s *resolved*
  values, so it fails on a dial that overshoots rather than letting it ship
  clamped.

  Declare a dial in **both** theme files, the way every other mode-invariant
  dial is declared — the light file opens on a bare `:root`, so a dial
  written there alone reaches dark by leak rather than by choice. Which means
  a fork that sets one has **four** guards to update, not one, and they are
  deliberately separate rules rather than one list:

  1. the absence guard in `src/lib/palette.test.ts` — it fails on a
     declaration of `--brand-lightness`, `--brand-chroma` or `--brand-hue`
     (those three exact names; `--brand-hue-reference` is untouched by it) in
     any stylesheet **or** in TypeScript, because an inline custom property
     on the root element outranks every stylesheet selector;
  2. `is the action fill exactly, while no dial declares otherwise`, in the
     same file — red by construction once brand and primary differ, which is
     the whole point of setting a dial;
  3. the three separate "a dial is declared in both theme files" rosters —
     the raw-text check in `src/lib/palette.test.ts`, `DIALS` in
     `src/styles/tokens.test.ts`, and `AUTHORED_IN_BOTH` in
     `src/lib/themeDials.test.ts`. One claim, three homes, all three needing
     the new dial's name;
  4. the gamut assertion above, if the chroma you set overshoots the ceiling.

  Why the identity derives from the accent at all is
  `docs/adr/0025-brand-derives-from-primary-with-one-dial-per-channel.md`.

  **Rotating the identity's hue leaves the rest of the system on the action
  hue.** The focus ring, the surfaces and the status-harmony pull are all
  computed from `--primary-hue`: `semantic.css` leans warning, destructive and
  info a fraction of the way toward it, and pins `--success-hue` precisely
  because a brand-relative green would collide with the accent. So a
  `--brand-hue` far from `--primary-hue` gives you an identity the chrome does
  not follow, and one that can walk toward a status fill instead — two guards
  bite if it does: the just-noticeable-distance check between each status fill
  and both accents, and the contrast floor on the identity's own ink.

  **Two routes, and they are not the same knob.** `brand.accent` on the
  deployment config (below) is read for its HUE only and written onto the
  root as `--hue` — the dial *both* fills and the surfaces run on — so it
  moves the whole semantic layer together. A `--brand-*` dial moves the
  identity *away* from the action colour on one channel. An org whose
  identity IS the app's accent sets `brand.accent`; an org whose identity
  differs from its action colour sets a `--brand-*` dial. Note that
  `brand.accent` alone repaints nothing while the chroma dials are 0 — a hue
  multiplied by zero chroma is still grey — so it is the dials in the theme
  blocks that make an accent visible.
- Touchpoint cells use a neutral palette by default; a `cell_touchpoints` row
  carries the copy, screenshots and design link for one touchpoint at one moment.

### Pinning an org touchpoint palette

By default `src/lib/touchpointColors.ts` ships an **empty** `TOUCHPOINT_COLORS`
and colors each touchpoint deterministically by hashing its label into a neutral
palette. That keeps a fresh clone brand-neutral, but hash-assigned pastels
carry no meaning — two tools in the same system land on unrelated colors.

To give a client's tools coherent color families, pin them: add
`label → hex` entries to `TOUCHPOINT_COLORS` (exact touchpoint label as the key),
grouping related tools onto one family. Example:

```ts
export const TOUCHPOINT_COLORS: Record<string, string> = {
  // Customer-facing app → green family
  'Mobile App': '#DCF3E4',
  'SMS Notify': '#DCF3E4',
  // Internal platform → slate family
  'Work-order Intake': '#DCE6F5',
  'SLA Timer': '#DCE6F5',
  // External partner → amber family
  'Field Contractor': '#F8E6D0',
}
```

Any label not in the map still falls back to the deterministic hash palette,
so partial pinning is fine. Keep the map **client-specific** — do not commit
one client's labels into the shared template.

## Deployment inputs and their config homes

A deployment that reads the application out of the package keeps no file of
its own inside `src`. Every input a deployment used to hold there as its own
copy has a field on the deployment config instead, and the template's file at
the old path is the template's default, reached only when the field is absent.
Four of them arrived with the overlay; the cover and the accent had homes
already and are listed so the table is the whole answer.

| Config field | What it replaced | How it is read |
| --- | --- | --- |
| `brand.name` | `src/config.ts` — `ORG_NAME`, the org's copy of the wordmark | The workspace title resolves `content.workspaceTitle ?? cover.title ?? brand.name ?? ORG_NAME`, and every surface a person sees reads that chain. One read does not: the workspace breadcrumb label in `src/types/nav.ts` is built from `ORG_NAME` at module scope, for a breadcrumb component nothing renders yet — the owned-content test holds it unrendered until it is carried in from the config. |
| `brand.accent` | `src/config.ts` — the org's accent | Read for its hue and written onto the root as `--hue` — the dial both fills share — as a layout effect by the config provider; the template leaves it unset. § Theming & branding says what that moves and what it does not. |
| `cover` (and `content.workspaceTitle`, `content.coverTitle`) | `src/content/coverContent.ts` — the org's landing page copy | Rendered by reference: the cover page shows the deployment's own object, and the template's content module stands in only when none is supplied. |
| `agent.doctrine` | `src/lib/agent/role.md` — the deployment's own copy of the agent's role document | Laid after the template's role and the canvas adapter on every send. The template's role stays the template's; the doctrine is what one deployment adds: its house rules, its posture, its account of itself. |
| `agent.references` | Reference documents under `src/lib/agent/` — the deployment's own account, house style, whatever it authored for `get_reference` | A map of bare name to document text; the host holds the `?raw` imports. A name the template already serves is replaced, a new name is listed to the agent right after the canvas adapter. |
| `sample.nav` | `src/data/sampleNav.ts` — the board shown before a database answers | Read by the editor context as the slides shown before the first fetch answers (`fallbackSlides`); the template's generated sample stands in only when the field is absent. |
| `sample.blueprints` | `src/data/blueprintFallbacks.ts` — the CONTENT those nav rows resolve to | The registry every offline lookup goes through, or a loader that fetches one: `DeploymentConfigProvider` settles it and hands it down the tree, so the board a surface draws is the one the provider above it holds. Supply it WITH `sample.nav` — see § The offline board is two fields, and § Eagerly or behind a loader for which form. |

The generated database types are the one file a deployment keeps in its tree
on purpose, and since the overlay they are not part of the application there:
`@/types/database` resolves into the package, so a deployment's own file is the
DECLARATION of the database its project has — what its live schema check and
its agent-account generator read — rather than what anything compiles. A
deployment generates it against its own project and holds it to the template's
with `scripts/check-database-types-superset.mjs`, which asks whether every
column this package's application reads is described on the tables the
deployment does build; see `docs/connectors/supabase/database.md`.

`src/deploymentOwnedContent.test.ts` is the inventory behind this table — it
fails when a module appears in the template's content directories without a
config home, and it carries every input through the config with no file in the
application tree.

### The offline board is two fields

`sample.nav` lists the phases and scenarios; `sample.blueprints` is what each
of those scenarios draws. Both are REPLACED, never merged, and that is why one
without the other is a broken board rather than a partial one: a deployment
that named its own nav and left the content to the template got its own rows
over a registry keyed by the template's ids, which answers none of them — rows
above an empty canvas in every no-database build, and a render walk over that
build with no board to find (#754).

`scripts/generate_fallbacks.py` writes both halves in one pass, and the config
field takes the registry in exactly the shape that run emits, so a deployment
hands over what its own pipeline already produced. From the root of a
deployment that installs this package:

```bash
python3 node_modules/uno-blueprint/scripts/generate_fallbacks.py \
  <ir-file> --locale <tag> \
  --out deployment/data/generatedBlueprints.ts \
  --registry-out deployment/data/sampleBlueprints.ts \
  --nav-out deployment/data/sampleNav.ts
```

`--registry-out` and `--nav-out` are required together and refused alongside
`--register`, which is this repository's own marker rewrite and writes nothing
a deployment can use. An `--out` under a `src` is refused too: a deployment
that mounts this package must not have one, because the `@/…` alias tries the
host's root first and a `src` holding only the host's files would capture every
import the application makes of itself.

The three modules are the deployment's own generated content, held beside its
cover copy under its own root. The two the config reads name their types the
way a consumer names anything here — by package name, since no `@/…` path of a
tree without a `src` reaches them. Each opens with one line:

```ts
// deployment/data/sampleBlueprints.ts
import type { SampleBlueprintRegistry } from 'uno-blueprint'
```

```ts
// deployment/data/sampleNav.ts
import type { NavItem } from 'uno-blueprint'
```

and the config hands both halves over together:

```ts
import type { DeploymentConfig } from 'uno-blueprint'
import { SAMPLE_BLUEPRINTS } from './data/sampleBlueprints'
import { SAMPLE_NAV } from './data/sampleNav'

const config: DeploymentConfig = {
  sample: { nav: SAMPLE_NAV, blueprints: SAMPLE_BLUEPRINTS },
}
```

A deployment that generated its board against an earlier release re-runs the
generator once after adopting this one, with these flags — the modules it holds
now are what the config field reads.

`BlueprintData` — what a registry's values are — is exported beside those two,
down to `BlueprintPath`, `BlueprintLane`, `BlueprintStep`, `BlueprintCell` and
`BlueprintCellDependency`, for a deployment that reshapes an export of its own
board rather than running the generator over an IR: annotating a whole board
needs only the first, and writing the function that builds one needs the rest.

Inside this repository the same run registers against the template's own
markers instead: `--out src/data/generatedBlueprints.ts --register` rewrites
the blocks in `src/data/blueprintFallbacks.ts` and `src/data/sampleNav.ts`,
which is where `PACKAGE_SAMPLE_BLUEPRINTS` comes from — the board a clone with
no deployment config shows.

Omitting either field is the template's own half, which is the right answer for
a deployment still evaluating the template and the wrong one for a deployment
with a board of its own.

### Eagerly or behind a loader

`sample.blueprints` takes the registry itself or a function that fetches one:

```ts
sample: {
  nav: SAMPLE_NAV,
  blueprints: () =>
    import('./data/sampleBlueprints').then((m) => m.SAMPLE_BLUEPRINTS),
}
```

The two forms draw the same board wherever a board is drawn. They differ in
which builds carry it.

The registry is read on ONE condition — `isBundledSampleActive()`, which is
false the moment a database is configured. Named as a value, it is reachable
from the config module, so the bundler puts it in the entry chunk of every
build: the production build with a database carries a board nothing will ever
ask for. Named inside a dynamic import, the only reference to those bytes is
behind a chunk boundary, and they are fetched when a board is about to be drawn
and at no other time. On a registry the size of a real exported board the entry
chunk gives back the whole of it — around 1.2 MB before compression, roughly
140 kB gzipped.

**Which form to use.** A deployment whose registry is an export of a real board
wants the loader: the board is the largest thing it hands this config, and the
builds that read it are the ones with no database. A clone of this template
keeps the value, and so does any deployment whose board is small enough that a
second request costs more than the bytes save — the package's own sample is a
value for exactly that reason.

**What the loader costs.** The board reads the registry while it renders, so
`DeploymentConfigProvider` awaits the loader before it renders anything below
it. In a no-database build that is one chunk fetch before the first paint; in a
build with a database the loader is never called at all, and nothing waits. A
loader that rejects throws rather than falling back to the template's own
registry — that registry is keyed by the template's identifiers and answers a
deployment nothing, so falling back would be a deployment's chrome around a
blank canvas with no error anywhere. `App` wraps the seam in its app-scoped
error boundary, so the throw is a rendered card naming the failure and offering
a reload, with the error still logged to the console — and the render walk
fails on that boundary appearing. A deployment installs nothing to get it. A
loader that RESOLVES EMPTY is the other reading and stays silent — an empty registry is a value a deployment may mean,
and it falls back to the template's own the way an empty `sample.nav` does.

**In a build WITH a database the board handed down is the template's own**
rather than the deployment's, because the loader was never called and there is
nothing to settle. Nothing reads it there: every surface that consults it is
behind `isBundledSampleActive()`, and the two that are not are keyed by
identifiers a deployment's board does not carry, so they answer the same
nothing either way. It is the difference between the forms that
is worth knowing about, and it is a difference in what is in memory rather than
in what anyone sees.

The eager form is unchanged and needs no migration: a deployment that hands
over the value keeps working exactly as it did.

## Composition claims: what a deployment still documents

The composition documents under `docs/guidelines/composition/` claim every file
this package assembles — the ~200 under `src/components/{blueprint,editor,cover,mobile}`
— and `npm run check:harness` (`scripts/check-harness-claims.mjs`) fails when one
of them is claimed by no document, claimed twice, or claimed and gone.

A deployment runs the same script. It is one of the files a deployment holds
**byte-identical**, and it reads the composition documents out of the installed
package as well as out of the deployment's own tree. Two consequences, and they
are the whole of what a deployment has to know:

- **A release that adds a module adds no work here.** The file is the package's,
  so the claim is the package's, and it fails in the package's own build before
  any tag moves. A deployment that pins the release writes nothing.
- **A deployment claims its own trees, and only those.** `composition.claimed` in
  the deployment's `scripts/repo-config.mjs` names them — the folders holding
  assembled files it keeps outside this application. Every file under one of them
  needs a claim in a composition document of the deployment's own, and a folder
  named there that the tree does not have is a failure, not a skip.

```js
// a deployment's scripts/repo-config.mjs
composition: {
  documents: 'docs/guidelines/composition',
  claimed: ['deployment/components'],
},
```

**Overriding the prose is done by filename.** The deployment's composition folder
is laid over the package's, document for document — the same overlay rule the
application resolves per path. A deployment that disagrees with a surface's
account writes a document under the same name and takes that surface over,
`claims:` list included; a name it does not write, it inherits. Adding a
*different* name adds a surface, and that document claims the deployment's own
files.

A deployment that has no assembled files of its own sets `claimed: []` and keeps
no composition folder at all. The check then reads the package's documents only,
and is green for as long as the package's own build is.

## Layouts & path kinds

Set per scenario / per path **in the IR**, not in code: `layout`
(`stacked` | `merged`) and `kind` (`happy` | `variant` | `exception`).

`21000117000000` folded `single` into `stacked` — one path stacked is one
band — and made `merged`, until then a session-only display, a value a
scenario is stored as. Both lists got shorter at `21000116000000`. `side-by-side` and `integrated`
were one layout a reader switches between rather than two a scenario is stored
as — the client had been collapsing both to the same view on read for a while,
and `21000116000000` moved the rows to `stacked` so the seam could go.
`unhappy` and `alternative` were two spellings of one thing, and `exception`
already carries "this went wrong", so `21000116000000` folded both into
`variant`.

The stacked layout compares any two labeled variants via `variant_label` —
designed-vs-reality, before/after a redesign, or two stakeholders' conflicting
accounts. There are no hardcoded scenario or path IDs left in the template; do
not reintroduce any.

## Scale

Schema and frontend support unbounded lanes/steps/paths — more actors just
means more lanes. The validator emits **soft warnings** above ergonomic
thresholds, never errors; the shipped sample content (8 paths across 6
scenarios, one 7-lane roster, widest board 8 lanes × 10 steps, one custom
role) is the proof fixture.

## Agent account

A connected database can generate an agent-facing account of its schema —
vocabulary from `src/lib/panelTerms.ts`, table and column comments from
`public.schema_comments()`. The generator and its check live in this template;
the generated document is the deployment's own content.

```bash
npm run agent-account                 # splice the generated sections
npm run agent-account -- --record    # …and record the coverage ratchet
npm run check:agent-account            # fail if the account or the ratchet drifted
```

With no database configured, both commands print a skip and exit 0. Nothing
is generated, nothing is supplied, and the agent's `get_reference` list
is this template's own.

A deployment that has generated the account supplies it through its config —
never by teaching the template's reference loader a path:

- Put it on the deployment config: `agent: { references: { blueprint: account } }`,
  where `account` is the document's text (the host holds the `?raw` import).
  A name the template already serves replaces that document; a new name is
  listed to the agent right after the canvas adapter.

After adopting a release, the reference loader stays byte-identical to this
template's: extra names go through the config, not a path import of another
repository's file.

## Agent search

The in-app agent's ranked search (`search_blueprint`) is OFF in this template,
because this template's schema has no such function. A deployment whose
database does carry one switches it on, and lists whatever vector indexes that
database holds:

```ts
const config: DeploymentConfig = {
  agent: {
    search: {
      enabled: true,
      indexes: [
        { provider: 'google', model: 'gemini-embedding-001', dimensions: 768 },
      ],
    },
  },
}
```

- `enabled: false` or no `agent.search` at all: the tool is absent from the
  agent's roster, so nothing can call it and nobody is told they are missing
  it. The canvas adapter's read-surface row is rendered from the roster, so
  it does not list the name either; where the adapter's prose mentions the
  tool, it says a tool absent from the tool list does not exist in the
  session — a name the model cannot act on, rather than an offer.
- `enabled: true`, `indexes` empty or omitted: the tool is offered to
  everyone, and matches words and structure only.
- `enabled: true` with indexes listed: a person whose own chat provider
  matches an entry has their question embedded with their own key and gets
  meaning matching too. A person whose provider matches nothing listed is not
  offered the tool, quietly — including every Anthropic key, since Anthropic
  has no embedding model.

An entry must name an index that EXISTS, built with exactly that model at
exactly that size. Building and refreshing it is the deployment's own job,
with its own server-held credential; the template only ever embeds the
question, in the browser, with the person's key. The function contract and the
`RETRIEVAL_DOCUMENT` / `RETRIEVAL_QUERY` pairing are in
`docs/connectors/supabase/database.md`.

Adding a second provider later is a config and data change — build the index,
add the entry. No template change is needed, because the OpenAI embed path
ships here already.

## Bundling the agent's tool definitions

A deployment that runs its own eval harness bundles the template's tool
surface out of `node_modules` — `src/lib/agent/tools/specs.ts`, the definitions
under `src/lib/agent/tools/definitions/`, the rosters derived from them. That
bundle needs a `?raw` loader, and the template ships one.

The tool surface reaches the rulebook: a definition carries its `run` beside
its schema, the reference tools read `src/lib/agent/tools/referenceDocs.ts`,
and that module imports eighteen markdown documents as TEXT the way Vite reads
them — `import checkFeeVisibility from '…/check-fee-visibility.md?raw'`. The
application is a Vite application and those documents are its content, so the
import form stays. A bundler that does not know it stops on the first one:

```
[UNLOADABLE_DEPENDENCY] Could not load
  node_modules/uno-blueprint/src/lib/agent/skill/references/check-fee-visibility.md?raw
```

That is a missing loader, not a broken graph. Install it from the package
rather than keeping a copy — one import, in whatever rollup-family bundler the
harness already uses (rolldown, rollup, Vite's own build):

```js
import { viteImportsPlugin } from 'uno-blueprint/vite-imports'

const bundle = await rolldown({
  input: harnessEntry,
  // The application's `@/…` alias, pointed at the package's source.
  resolve: { alias: { '@': resolve(packageRoot, 'src') } },
  plugins: [viteImportsPlugin()],
})
```

It answers two import forms and returns null for the rest: `…?raw` evaluates
to the file's contents as a string, as it does in the browser, and an asset
(`.svg`, `.png`, `.jpg`, `.gif`, `.webp`, `.woff`/`.woff2`) evaluates to a URL
string, as it does there — the cell-budget module reads the deployment config,
and the config names the cover's figures. It is `scripts/vite-imports.mjs`,
published as the `./vite-imports` subpath, and this repo's own harness
(`scripts/agent-harness/surface.mjs`) imports the same module, so the loader a
deployment is handed is the one every harness run here proves.

Reading the documents off disk instead is a second copy of the rulebook's
paths — those paths are a published interface
(`docs/adr/0004-reference-paths-are-a-published-interface.md`), and a harness
that resolves them itself drifts from what the app imports the moment one
moves. The loader keeps one list, in the app.

## Portfolio conventions (consultants / agencies)

- **One git workspace per client**: each client gets their own template
  clone with their own `blueprint/` dir and `blueprint-workspace.json`.
  Never mix clients in one workspace or one backend target.
- Per-client env & deploy registry: each workspace's state file records its
  own per-locale targets; keep client `.env` files out of git (verified
  gitignored).
- **`HANDOFF.md` per workspace** (generated from
  `assets/HANDOFF.md.template`): the offboarding story — where the IR lives,
  how to update, how to redeploy — written for whoever inherits the
  workspace after the engagement.
- Two authors collaborate via normal git branching; sign-off is per-branch.

## Template upgrade recipe (⚠ compat check required)

The template evolves under N client workspaces. The plugin and template
version together; `blueprint-workspace.json` records the workspace's
`schema_version`.

1. **Check compat first**: compare the workspace `schema_version` with the
   new template's. Same → skip to step 4.
2. Read the template CHANGELOG between the two versions for schema and
   lane-role vocabulary changes.
3. Pull the new template into the workspace clone (git merge from the
   template remote, or re-clone + copy `blueprint/`, `.env`, `HANDOFF.md`,
   `blueprint-workspace.json` forward). Resolve conflicts in favor of the
   template for app code — workspace-local app edits are unsupported.
4. Carry the IR across the bump — do **not** hand-edit `schema_version`:

   ```
   python3 scripts/migrate_ir.py blueprint/blueprint.json \
       --workspace blueprint-workspace.json --write
   ```

   Dry-run first (drop `--write`) to read the plan. The script rewrites the
   IR's field names for each version it steps through, sets the new
   `schema_version` on the IR and the workspace state, and re-anchors sign-off
   (below). Editing the version by hand leaves the file's fields at the old
   shape while claiming the new one — the exact mis-parse the version exists
   to prevent.
5. Re-run `scripts/validate_ir.py` (vocabulary/schema drift surfaces here).
6. Re-import per `skills/map/references/review-import-playbook.md` (re-provision if the
   DDL changed), rebuild, redeploy, verify with `render-checker`.

**Never import an IR whose `schema_version` mismatches the workspace clone**
— that's the compat check the import pre-flight enforces.

### The versioning rule (⚠ hard rule for template authors)

**Every `schema_version` bump ships its migration in the same change.** A new
value in the enum in `references/ir-schema.json` and a new step in
`scripts/migrate_ir.py` land together, or neither lands. A bump without a step
tells every workspace it is out of date and hands it nothing to run — and the
IR is not re-derivable: sign-off is a human decision recorded against
content that already exists.

A version leaves the enum only when its migration stops existing, which is
also when an IR at that version stops being upgradable and the workspace must
check out the template revision that wrote it.

**The rule was broken once, at `2026.09.08`, and what it cost is worth
keeping.** `21000122000000` stamped a migrated database with that value for
the lane-role vocabulary, and neither the enum nor `scripts/migrate_ir.py`
ever learned it — so no workspace could author an IR against the version, and
a target that had run every migration in order read as a version this template
does not speak. `scripts/check-target-schema.mjs` exists to catch a target
that is behind, and for two releases it was failing the one that was exactly
right. The dependency rename that followed took `2026.09.09` rather than the
collision, because one stamp naming two shapes is worse than a gap.

The gap is closed. `to_2026_09_08` is the step that migration never shipped —
it renames a lane role carried by its retired spelling, which is what makes a
`2026.09.07` file importable into a database whose CHECK now refuses the old
word. The value was **added** to the enum, never moved: it is stamped inside
an applied migration and inside the generated portable core, and an applied
record keeps the spelling it was written with. Two lessons survive it. A bump
that lands in a migration is a bump, even when the change looks like it only
touched database identifiers — the wire format shares that namespace. And a
gap costs more the longer it stands: the debt was two releases old before
anyone ran the check against a freshly replayed database.

### Sign-off across a bump

Sign-off binds to a SHA-256 of a scenario's subtree
(`scripts/compute_signoff_hash.py`). Renames land **inside** that subtree —
2026.07.16 → 2026.08.25 moved `description` → `summary` and `layers` →
`lanes` — so a hash recorded before a bump does not match the migrated file.
Signed scenarios would silently de-sign.

`--workspace` is what prevents that. For each scenario whose recorded
`content_hash` equals its pre-migration hash, the migration replaces it with
the post-migration hash and keeps `signed_at`/`signed_by`: sound because a
step moves no authored *value* — it renames a field name, or materializes a
default the absent field already meant. A step that ever edits authored
content declares itself non-content-preserving, and the script refuses to
touch sign-off at all — those scenarios go back through review.

The cheapest answer is a bump that never enters the subtree. 2026.08.25 →
2026.08.26 gives a dependency edge an optional `kind` whose absence means the
drawn kind — what every existing edge already meant — so the step writes
nothing, every scenario hashes to the same digest as before, and `--workspace`
reports each signed scenario as already anchored. Materializing the default
into every edge would have been content-preserving too, and would have
re-hashed every signed scenario for no gain.

A recorded hash matching neither side was already stale (the scenario was
hand-edited after it was signed). The migration reports it and leaves it: it
is a re-review, not a rename. `targets[*].last_import.content_hash` is left
alone too — step 6 re-imports anyway, and that record is a claim about what a
target actually holds.

### Stale workspaces & the audit-skill fallback

Workspaces scaffolded before the audit skill split may lack its files, and
the two layouts genuinely differ: the template repo carries the split layout
(`skills/audit/SKILL.md`, check docs at `skills/audit/references/check-*.md`,
`skills/audit/scripts/audit_tools.py`), while installed-plugin layouts may be
pre-split — check docs at `references/check-*.md` with no `skills/audit/`
directory at all. A fallback that assumes one layout reports files as
missing when they merely live at the other path, so **try both paths**:
look under `skills/audit/references/` first, then `references/`, and treat
a file as absent only when neither has it.

To bring a stale workspace current, **re-vendor from the template repo**
concretely: copy `skills/audit/` (the SKILL.md, the `references/check-*.md`
docs, and `scripts/audit_tools.py`) plus `references/audit-playbook.md`
from the template repo into the workspace, then continue the upgrade recipe
above from step 4.
