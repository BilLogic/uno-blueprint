---
summary: Customizing a deployment of the template — theming and brand dials, the deployment config fields that replaced its own files, composition claims, ranked agent search, and bundling the agent's tool definitions for an eval harness.
---

# Customizing a deployment

**For** the engineer fitting the template to one organisation.
**Answers** which knob do I turn, and where does it live?

Upgrading a workspace to a new template release, lane roles and layouts are
in `references/customization.md`.

## 1. Theming & branding

- `brand.name` on the deployment config — the workspace/product name in app
  chrome (the wordmark and the workspace title). `src/config.ts`'s `ORG_NAME` is the
  template's own default, the last step of the fallback chain, not a file a
  deployment edits; see § 2.
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

  **Edge weight is three dials.** The neutral borders come in three steps
  of translucent ink, and each step is a per-theme dial in both theme files:

  | Dial | Token | Light | Dark | Job |
  | --- | --- | --- | --- | --- |
  | `--border-alpha-resting` | `--border` | 8.3% | 8% | the edge every surface and cell sits behind |
  | `--border-alpha-hover` | `--border-strong` | 15.8% | 15% | the edge under a pointer, and marks drawn on the canvas ground |
  | `--border-alpha-hot` | `--border-stronger` | 39% | 45% | the edge of the thing being acted on |

  Each dial is stated at `--contrast: 0.5`. `--contrast` then scales the
  step's distance above a fixed floor along the same ramp as the other
  neutral rungs, so light's 0.53 renders the three at about 9%, 17% and
  42%. Turning `--contrast` moves all three together and keeps the ladder in
  order: `border-muted` below `--border`, `--input` and `--border-overlay`
  between `--border` and `--border-strong`, and `--border-stronger` on top.
  `src/styles/tokens.test.ts` sweeps the knob from 0 to 1 and fails on a
  crossing. Set the dials, not `--border` itself: an override of the token
  leaves the other two steps behind. All three dials are on the dial
  rosters: `DIALS` in `src/styles/tokens.test.ts` and `AUTHORED_PER_THEME`
  in `src/lib/themeDials.test.ts`. The print block in
  `src/styles/print.css` restates light's values, so a retune of light's
  dials has to be copied there.
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

## 2. Deployment inputs and their config homes

A deployment that reads the application out of the package keeps no file of
its own inside `src`. Every input a deployment used to hold there as its own
copy has a field on the deployment config instead, and the template's file at
the old path is the template's default, reached only when the field is absent.
Four of them arrived with the overlay; the cover and the accent had homes
already and are listed so the table is the whole answer.

| Config field | What it replaced | How it is read |
| --- | --- | --- |
| `brand.name` | `src/config.ts` — `ORG_NAME`, the org's copy of the wordmark | The workspace title resolves `content.workspaceTitle ?? cover.title ?? brand.name ?? ORG_NAME`, and every surface a person sees reads that chain. One read does not: the workspace breadcrumb label in `src/types/nav.ts` is built from `ORG_NAME` at module scope, for a breadcrumb component nothing renders yet — the owned-content test holds it unrendered until it is carried in from the config. |
| `brand.accent` | `src/config.ts` — the org's accent | Read for its hue and written onto the root as `--hue` — the dial both fills share — as a layout effect by the config provider; the template leaves it unset. § 1 says what that moves and what it does not. |
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
build with no board to find.

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

## 3. Composition claims: what a deployment still documents

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

## 4. Agent search

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

## 5. Bundling the agent's tool definitions

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
