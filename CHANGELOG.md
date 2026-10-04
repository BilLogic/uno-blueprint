# Changelog

## 2.4.0

**One command starts a workspace.** `npm create uno-blueprint@latest`
(or `pnpm`, `yarn` 1, `bun create`) downloads this release, writes it into a
new folder and installs it with the package manager that ran it; `--no-install`
writes the folder and leaves the install to you. The initialiser lives in
`packages/create-uno-blueprint/`, and this tag is the first that publishes it
to npm, with provenance, from `publish-initialiser.yml`.

### Upgrading a deployment

- **Bump the pin, and take the template's `vite.config.ts`.** It gains one
  test glob (`packages/**/*.test.mjs`) and is held byte-identical, so the
  reconciled-files gate is red until the copy matches. The glob matches
  nothing in a deployment.
- **Node 22 is now stated.** The root manifest declares `engines.node`
  `>=22`, the floor the stack already needed. A deployment still building on
  an older Node now gets an engines warning where it used to get a later
  failure.
- **Two development dependencies are now declared:** `rolldown` and
  `playwright`, both already in the tree through Vite and
  `@playwright/test`. A deployment installing with pnpm stops failing on
  `Cannot find package`; with npm nothing changes.
- **Nothing else moves for a deployment.** The initialiser, its workflow and
  its checks sit in folders a deployment does not import, and the publish
  workflow does nothing outside this repository.

### Minor Changes

- a06388a: A release tag publishes the initialiser

  Pushing a `v<version>` tag now publishes `create-uno-blueprint` to npm at that
  version, with provenance. A new workflow, `publish-initialiser.yml`, does it
  through npm's trusted publishing: the registry trusts this repository and that
  workflow file by name, so no npm token is stored anywhere.

  The workflow asks `scripts/decide-initialiser-publish.mjs` before it publishes.
  It refuses a tag that is not the version the initialiser states, a tree whose
  version statements disagree, a tag on a commit that is not on `main`, and an
  npm too old to publish without a token. A version the registry already has is
  left alone and the run is green, so re-running a tag's run is safe. A
  workspace, a fork, or a repository made from the template carries the workflow
  and is not where the package comes from, so there it does nothing.

  The package now ships a README and a LICENSE, and its manifest states
  `publishConfig.access`, `bugs` and a `homepage` that opens the README.

  The first publish and the trusted publisher are the owner's to do, once, and
  `docs/engineering/releasing.md` § 6 lists the steps. Until they are done the
  package is not on npm and the workflow's publish step fails.

- 4e23ee7: One command writes a workspace

  The template now carries an initialiser, `create-uno-blueprint`, in
  `packages/create-uno-blueprint/`. Given a folder name it downloads the release
  tarball whose tag is its own version, unpacks it there and prints what to type
  next; given none it uses `uno-blueprint`. It asks no questions, needs neither
  git nor a system `tar`, and has no runtime dependencies. A folder that already
  has files is refused, a Node below 22 is refused first, and a download that
  fails says where it tried. The workspace it writes is the whole template minus
  the initialiser's own folder.

  The version guard holds a fifth place. `npm run check:version` now fails when
  `packages/create-uno-blueprint/package.json` states a different version from
  `package.json`, and `npm run version` copies the number into it. A tree without
  that folder, which is what the initialiser writes, is held to the other four.

  The root manifest states the Node floor it has always had: `engines.node` is
  `>=22`.

- 75bae5a: The workspace is installed by whichever package manager called

  `create-uno-blueprint` now finishes the job. Once the workspace is written it
  installs the dependencies with the package manager that ran it, read from the
  `npm_config_user_agent` each of them sets: `npm create`, `pnpm create`,
  `yarn create` and `bun create` install with npm, pnpm, Yarn and Bun. Run any
  other way, it is npm. The next steps it prints are that manager's own, and the
  install is no longer one of them: `npm run dev`, `pnpm dev`, `yarn dev` or
  `bun dev`.

  `--no-install` now means what it says. The workspace is written, nothing is
  installed, and the install is back in the next steps in the caller's words.

  Yarn means Yarn 1. Yarn 2 and later do not run the `pre` scripts that `dev`
  and `build` rely on, so under them the workspace is written, nothing is
  installed, and the command exits non-zero with one line naming what can run
  it: npm, pnpm, Bun and Yarn 1.

  An install that fails leaves the workspace where it is. The command says so
  in one line naming the folder, the command to run again and why it stopped
  (the exit code, the signal that ended it, or that it could not be started),
  and exits non-zero.

  The entry function takes one more thing it would otherwise reach for:
  `install({ pm, command, args, cwd })`, answering with an exit code. One table
  holds each manager's command and arguments, and both what is run and what is
  printed are read from it. The module also exports `installWith`, the install
  when nothing replaces it, and `runInProcess`, which is `run` handed the real
  process; the bin is now that one call.

  The template declares two packages it already used. `scripts/app-module.mjs`
  and the agent harness import `rolldown` by name, and the render walk's own
  test resolves `playwright`; each was only ever installed because Vite and
  `@playwright/test` depend on them. npm, Yarn and Bun hoist both to where the
  import finds them; pnpm does not, so `npm run check:interface-map`, the
  harness and that test failed there with `Cannot find package`. Both are
  development dependencies now: `rolldown` at the range Vite asks for and
  `playwright` at the version `@playwright/test` is pinned to, so the lock file
  resolves what it already held.

  CI has a `workspace` job, once each for npm, pnpm, Yarn 1 and Bun at pinned
  versions. It writes a workspace from the commit under test, lets the
  initialiser install it with that manager, and builds it. The script it runs,
  `from-working-tree.mjs` beside the initialiser's source, hands the initialiser
  a `git archive` of the checkout in place of the release tarball; it is not
  published with the package.

### Patch Changes

- 5304272: Guide/02 no longer names a Slack bot as shipped

  The "Ways in" table in guide/02 still labelled its fourth row "the Slack bot",
  as though the template carried one, while the paragraph under it said nothing
  here is a Slack bot. The row now reads "a Slack bot you build", matching the
  README, the cover and its figure.

## 2.3.0

**Small primary-coloured text reads role ink, and role ink outranks muted
text in dark.** Links, active chips and small primary labels no longer take
their colour from the button fill, so a deep brand fill no longer drags them
under AA in dark. Role ink in dark now sits a step brighter than muted text,
which changes how dark mode looks: every role's text there is a little
brighter. Light mode is unchanged at the shipped dials.

### Upgrading a deployment

- **Bump the pin.** `vite.config.ts` and `scripts/sweep.mjs` are held
  byte-identical and their comments moved, so take the template's copies with
  the bump; the reconciled-files gate is red until you do.
- **A deployment with a deep brand fill** gets its small primary text back
  over AA in dark with no change on its side. If its own docs record the
  interim dark-mode shortfall for `text-primary`, that note is now stale.
- **A deployment that restates `--muted-foreground-level`** should know role
  ink now follows it: in either mode, role ink lands at muted plus 0.08 of the
  span, never below 0.76.
- **A deployment component that colours small text with `text-primary`**
  should move it to `text-text-primary`. The template's guard only reads the
  template's own `src/`.

### Minor Changes

- 9bfe694: Small primary-coloured text reads role ink, not the fill

  Six pieces of small text used the primary fill as their colour: the link
  button, the session "Changes" chip and its agent badge, "Create" in the owner
  tag picker, "Make slice", and the slide composer's "Drop here". A fill is tuned
  to carry ink, not to be it. Unbranded, the fill is the foreground and the
  text reads fine, but a deployment that sets a deep brand fill (lightness 0.52,
  chroma 0.095, say) saw that text fall to about 3.1–3.5:1 in dark, short of the
  4.5:1 small text needs. They now read the role ink, `--text-primary`, which is
  derived from the surface ladder and so holds AA whatever the fill. The tinted
  ground and border behind "Make slice" and the "Changes" chip are unchanged.

  The pressed label in a segmented control now reads the foreground rather than
  the fill, so the pressed state is emphasis rather than hue.

  Two icons are unchanged on purpose: the check beside the selected owner tag
  keeps the fill, and the path selector's selected-row mark keeps the brand
  identity colour (the fill, while a deployment leaves the brand dials unset).
  An icon's contrast bar is 3:1 rather than 4.5:1, and a deep brand fill still
  clears it on a dark popover. A guard now fails the suite if `text-primary`
  lands anywhere else in `src`.

  Role ink in dark mode now always sits a step brighter than muted text. It was
  drawn 76% of the way from the canvas to the foreground in both themes, but
  dark mode draws muted text at 80%, so in dark an active label read fainter
  than the resting label beside it — invisible behind a brand hue, and plain
  grey on grey in a template with no brand. `--role-ink-mix` now follows muted
  text up (muted plus 0.08, never below 0.76, never past the foreground), and
  the on-tint ink stays 0.06 above it; a test now holds that order in both
  modes. At the shipped dials light mode resolves to exactly what it did. In
  dark, every `--text-{role}` moves from about L 0.77 to 0.86 and every
  `--text-on-surface-{role}` from about 0.81 to 0.90: warning, destructive, info
  and success text reads a little brighter and softer there, and contrast only
  rises. This is why the release is a minor: dark mode looks different.

### Patch Changes

- eccaf0d: The last shared comments fit the wrap

  Three comment blocks in `vite.config.ts` and `scripts/sweep.mjs` that ran
  past the comment width are rewrapped, and the seed sweep's skip message now
  says to check out a deployment "beside this checkout" rather than "beside
  this repository" — the same words the seed list's own skip uses, and true
  whichever repository the sweep runs in.

  Comments and one message only; no behaviour changes. Both files are held
  byte-identical by a deployment, so it takes the new bytes with the pin bump.

## 2.2.3

**Shared files speak from both sides.** Comments only: the last two sentences
that read as template-only from a deployment are reworded, and four
over-wide comment lines are rewrapped. No behaviour changes.

### Upgrading a deployment

- **Bump the pin, and nothing else.** `vite.config.ts`, `scripts/sweep.mjs`
  and `scripts/tests/the-router-is-a-router.test.mjs` are held byte-identical,
  so their bytes move with this release and the reconciled-files gate goes red
  until the pin bump takes the template's copies.

### Patch Changes

- c6f1281: Shared files speak from both sides

  Two comments in files a deployment holds byte-identical still spoke as if
  only the template read them: `vite.config.ts` called the template "this
  repository", and the router suite said it differed "here" from a copy it is
  identical to. Both now say what holds wherever the file runs. Four comment
  lines that ran past the wrap in `vite.config.ts` and `scripts/sweep.mjs` are
  rewrapped.

  Comments only; no behaviour changes. A deployment takes the new bytes of
  all three files with the pin bump.

## 2.2.2

**Every shared file cites only what a deployment holds.** The files a
deployment holds byte-identical no longer name paths only the template has,
and no longer say "here" where they mean the template. The template's guard
now publishes all twenty-six of them, in three lists, and refuses a
template-only script or a file under a tree only the template keeps.
Comments and tests only; no behaviour changes.

### Upgrading a deployment

- **Bump the pin, and take thirteen files' new bytes.** `vite.config.ts`, the
  three tsconfigs, `scripts/agent-account.mjs`, `always-loaded.mjs`,
  `authoring-archivers.mjs`, `check-harness-claims.mjs`,
  `check-target-schema.mjs`, `seed-list.mjs`, `sweep.mjs`, `verdict.mjs` and
  `scripts/tests/the-router-is-a-router.test.mjs` changed. All are held
  byte-identical, so the reconciled-files gate goes red until the pin bump
  lands. Take the template's copies; no local edit is needed or allowed.
- **The published lists grew, so a shared-scripts reader has more to read.**
  `SHARED_SCRIPTS` keeps its shape and gains `erd-value-sets.mjs` and
  `one-badge-one-size.test.mjs`, which a deployment already holds. The new
  `SHARED_CONFIGS` and `SHARED_DATA` lists name the build configuration and
  the two data files. A reader that should hold the whole reconciled set to
  the template's lists reads all three; its entries are `[path, reason]`, and
  the path is the first string.

### Patch Changes

- 77d971b: Every shared file cites only what a deployment holds

  Four shared scripts still pointed at files only this template has, and now
  name the thing rather than its path: `check-target-schema.mjs` (the IR
  validator and the application's schema-version module), `agent-account.mjs`
  (the panel-terms module and the database types), `authoring-archivers.mjs`
  (the authoring-log module), and `check-harness-claims.mjs`, whose adoption
  message sent the reader to the package's customization reference by a path
  their tree lacks. The router suite's path-shaped fixtures move under `notes/`.

  Shared files that spoke as if only the template read them now say what
  holds on both sides, naming the template where they mean it.
  `always-loaded.mjs` said "here that is `AGENTS.md`" and kept a census of near
  misses only one side had. `vite.config.ts`, `tsconfig.json`,
  `tsconfig.app.json` and `tsconfig.node.json` said "here" for "in the
  template" — the second root "never reached here", `deployment/` "does not
  exist here" — which a deployment holding the same bytes reads as false.
  `sweep.mjs`, `verdict.mjs`, `seed-list.mjs`, `check-harness-claims.mjs` and
  `check-target-schema.mjs` had the same slip in a sentence each: "this tree
  here", "every check in this repository", "a deployment of this template".

  The shared-file guard grows to match. A `scripts/…` file cited from a shared
  file must be one `SHARED_SCRIPTS` or `REPO_LOCAL_IMPORTS` accounts for. A new
  `SHARED_CONFIGS` list names the build configuration a deployment holds
  byte-identical — `vite.config.ts`, the three tsconfigs, `eslint.config.js`,
  `components.json` — and `SHARED_DATA` the triage-label map and the step
  placeholder; both are held to the same rules. A third rule refuses a file
  named under a tree only the template keeps — the plugin manifest, the hook,
  the eval fixtures, the handoff template — which a deployment neither holds nor
  reads out of the package. `src/…`, the reference documents and the skills
  stay outside it: they are the package's published surface, which a
  deployment reads by fixed path.

  The published lists now match what a deployment actually holds.
  `erd-value-sets.mjs` and `one-badge-one-size.test.mjs` were held
  byte-identical by a deployment but missing from `SHARED_SCRIPTS`, so no
  template-side guard read them; both are listed now, with their reasons.

  Comments and tests only; no behaviour changes. A deployment that holds these
  files takes the new bytes with the pin bump. `SHARED_SCRIPTS` keeps its
  shape, so the deployment-side reader of that list is unaffected.

## 2.2.1

**Two shared files cite only what a deployment holds.** Comments only: the
build config no longer points a deployment's reader at files only the template
has, and one over-wide comment line is rewrapped. No behaviour changes.

### Upgrading a deployment

- **Bump the pin, and nothing else.** `vite.config.ts` and
  `scripts/always-loaded.mjs` are both held byte-identical, so their bytes
  move with this release and the reconciled-files gate goes red until the pin
  bump lands. No local edit is needed or allowed; take the template's copies.

### Patch Changes

- 3148836: Two shared files cite only what a deployment holds

  `vite.config.ts` is held byte-identical by a deployment, but its comments
  pointed at five files only this template has — the overlay module by its
  path, three test suites, and the base-path module. Read from a deployment,
  each was a pointer to nothing. They now name the thing rather than the
  path. `scripts/always-loaded.mjs` has one comment line rewrapped to the
  comment width.

  Comments only; no behaviour changes. A deployment that holds either file
  byte-identical takes the new bytes with the pin bump.

## 2.2.0

**The template follows the system theme.** A reader who has never chosen a
theme now gets their operating system's light or dark mode, and keeps
following it as the OS flips, where before the app always opened light. That
changes what a first visit looks like, which is why this is a minor.

### Upgrading a deployment

- **Nothing is required** beyond the pin bump: the change lives in
  `src/lib/theme.ts` and `src/styles/themes/dark.css`, which a deployment reads
  from the package rather than holding a copy of.
- **A deployment whose brand stylesheet restates dark dials** should know
  what the pre-load frame reads: only `--surface` switches, under
  `@media (prefers-color-scheme: dark)` on `:root:not(.light, .dark)`, and
  every other dial keeps its light value until the app stamps `.dark`. A
  restated dark `--surface` needs the same value there, or the canvas shifts
  shade once the app loads; a restated `--chroma` or `--surface-hue` only tints
  that one frame differently.
- Readers who toggled before keep their stored choice; nothing migrates it.

### Minor Changes

- c3e3446: The template follows the system theme

  With nothing stored, the app now opens in whatever light or dark mode the
  reader's operating system is set to, and keeps following it when the OS
  flips — before, it opened light regardless. A dark OS also gets a dark canvas
  before the app has loaded, rather than a white flash.

  The theme toggle stays two-state. Toggling away from what the OS prefers
  stores that choice, which then holds; toggling back onto it returns to
  following the OS. A reader who already chose keeps their choice until they
  next toggle onto their OS's setting.

## 2.1.0

**The template can be served from a path.** One build-time variable,
`BASE_PATH`, puts the app under a prefix such as `/demo/`, and every URL it
reads or writes keeps that prefix. Unset, nothing changes, which is why this is
a minor.

### Upgrading a deployment

- **At a domain root, nothing is required** beyond the usual pin bump:
  `vite.config.ts` changed, and a deployment holds it byte-identical, so copy
  the new file in with the bump.
- **To serve from a path**, set `BASE_PATH` (for example `/demo/`) under
  `[build.environment]` in `netlify.toml`.
- **Move the redirect and header rules under the prefix**: the `/assets/*`
  404 and cache block and the SPA fallback become `/demo/assets/*`, `/demo/*`
  and `/demo/index.html`, in that order. `npm run check:hosting` reads the same
  setting and holds them to it.
- **Copy the byte-identical `vite.config.ts`**, which takes `BASE_PATH` as
  Vite's `base`.
- **Add the prefixed URL to the Supabase redirect allow-list** for the
  magic link, on both origins when the app is also reached through a proxy.
- **On the fronting site, add the proxy rewrite** when the path belongs to
  another site, forwarding the path unchanged to the app's site.
- A deployment that enrols the render walk runs it with the same `BASE_PATH`
  over a build made with it.

The recipe is the README's Deploy section and
`docs/guide/04-operations.md` § Serving from a path.

### Minor Changes

- 0e07ed4: The template can be served from a path

  The app no longer assumes it lives at the root of a domain. One build-time
  variable, `BASE_PATH` (for example `/demo/`), sets where it is served. Vite
  takes it as `base`, the build is written under it (`dist/demo/…`) with
  `_headers` and `_redirects` moved back up to `dist/`, and every URL the app
  reads or writes keeps the prefix: the service slug in the path, deep links and
  the board address, the magic-link redirect, and root-relative image paths
  stored in the data (storyboard frames, touchpoint logos, cover images).
  `src/lib/basePath.ts` is where those cross the prefix.

  `npm run check:hosting` reads the same setting, from the environment or from
  `[build.environment]` in `netlify.toml`, and holds the prefixed rules to the
  same order and cache (`/demo/assets/*` → 404 above `/demo/*` →
  `/demo/index.html`). The render walk previews at the prefix and navigates
  relative to it. A new case, `render-walk/served-from-a-path.spec.ts`, asserts
  that the shareable address carries the prefix, that a cold load of it lands the
  same board, and that no request leaves the prefix. CI runs the whole walk again
  over a `/demo/` build.

  Unset, nothing changes: `base` is `/`, the output is `dist/`, and every URL is
  what it was. The recipe, including the Netlify rewrite for showing the app
  under a path on another site, is in `docs/guide/04-operations.md` § Serving
  from a path.

  Upgrading a deployment:

  - `vite.config.ts` changes, and a deployment holds it byte-identical: copy
    the new file in with the pin bump. At a domain root that is all it needs.
  - A deployment served from a path sets `BASE_PATH` in `[build.environment]`,
    moves its redirects and its `/assets/*` cache block under the prefix, and
    adds the prefixed URL to its Supabase redirect allow-list (both origins, if
    it is also reached through a proxy on another site).
  - A deployment that enrols the render walk runs it with the same `BASE_PATH`
    over a build made with it. The walk's specs now navigate to `./` rather than
    `/`.

## 2.0.0

**The template is Uno Blueprint, and everything a deployment names it by says
so.** The repository is `BilLogic/uno-blueprint`, the package is
`uno-blueprint`, the plugin is `ub` from the `ub-marketplace`, and its four
skills are `ub:map`, `ub:slice`, `ub:audit` and `ub:whatif`. What a blueprint
holds and how the app behaves are unchanged; what moves is every name a
deployment reaches the template through, which is why this is a major.

### Upgrading a deployment

- **Reinstall the plugin** from the new marketplace:
  `claude plugin marketplace add BilLogic/uno-blueprint`, then
  `claude plugin install ub@ub-marketplace`. The plugin id is `ub` and the
  marketplace id is `ub-marketplace`.
- **Pin the new tag** as `github:BilLogic/uno-blueprint#v2.0.0`, under the
  dependency key `uno-blueprint`. Install that explicit spec —
  `npm install github:BilLogic/uno-blueprint#v2.0.0` — so the lockfile's
  resolved SHA moves to the tag; a bare `npm install` leaves it where it was.
- **Rename the package in every import and path** to `uno-blueprint`: imports
  such as `uno-blueprint/styles.css`, `uno-blueprint/bootstrap`,
  `uno-blueprint/overlay` and `uno-blueprint/vite-imports`; the
  `node_modules/uno-blueprint/src` paths in `tsconfig.json` and
  `vite.config.ts`; and any script run from `node_modules/uno-blueprint/`. The
  Vite plugins are named `uno-blueprint:overlay` and
  `uno-blueprint:vite-imports`, for a config that looks either up by name.
- **Invoke the skills as `ub:map`, `ub:slice`, `ub:audit` and `ub:whatif`**
  wherever a deployment's docs, prompts or agents name one. The composer runs
  `/ub:<skill>`.
- **Import the default-config exports** as `templateDefaultConfig`,
  `templateDefaultCellBudget` and `templateDefaultAgentSearch`.
- **Expect the naming guard's new vocabulary.** `check:standalone` passes
  `uno`, `Uno Blueprint` and `ub:` names, and fails on the deployment's slug,
  its owner's name and its bot, and on any spelling of the package, the skill
  namespace, the marketplace or the repository other than the current one. A
  deployment that runs the template's guard over its own tree sees the new
  patterns.
- **Saved browser settings reset once on the default prefix.** The storage
  prefix is `ub-`, so an installation on the default prefix starts with its
  theme, remembered paths, agent sessions and placement cleared, and any model
  key pasted into the in-app agent has to be pasted again. An installation that
  set its own prefix with `configureStorageNamespace` keeps everything.
- **The local Supabase database starts empty once.** The local `project_id` is
  `uno-blueprint`, and a changed local project id resets the local Docker
  volumes. Run `supabase db reset` after the first `supabase start` to reseed.
  Hosted projects are untouched.

### Plugin contract

- The plugin is `ub` in `identifiers.json`. The skill, reference, schema, agent,
  hook and tool names under it are unchanged; they are invoked under the new
  plugin id.

### Major Changes

- 840d251: The package is `uno-blueprint`

  The repository is `BilLogic/uno-blueprint` and the package it publishes is
  named `uno-blueprint`. The plugin manifest's homepage and repository, the
  cover page's repository link, the schema `$id`s, the bundled sample's source
  links and every document point at that URL, and the naming guard holds the
  repository to that one slug.

  The seed generator's UUID namespace is a fixed constant, so a re-seed keys onto
  the rows already there.

  A deployment pins the template as `github:BilLogic/uno-blueprint#v<version>`
  under the dependency name `uno-blueprint`, and installs that explicit spec so
  the lockfile moves to the new tag. Everything it reads out of the package
  follows the name: imports such as `uno-blueprint/styles.css`,
  `uno-blueprint/bootstrap`, `uno-blueprint/overlay` and
  `uno-blueprint/vite-imports`, the `node_modules/uno-blueprint/src` paths in its
  `tsconfig.json` and `vite.config.ts`, and any script it runs from
  `node_modules/uno-blueprint/`.

  The local Supabase `project_id` is `uno-blueprint`. Changing a local project id
  resets the local Docker volumes, so the first `supabase start` after upgrading
  begins from an empty local database; run `supabase db reset` to reseed it.

- bb9700c: The skills are invoked as `ub:`

  The plugin is `ub`, installed from the `ub-marketplace`, and its four skills
  are `ub:map`, `ub:slice`, `ub:audit` and `ub:whatif`. The composer offers and
  runs `/ub:<skill>`; a bare segment such as `/audit` still only finds the skill
  and never runs it. The router, the skills, the agents, the references, the
  hooks (whose messages now open `[ub]`), the skill evals, the cover page and its
  figures, and the bundled sample blueprint all use the new names, and the app's
  default organisation name and page title are Uno Blueprint.

  A deployment reinstalls the plugin as `ub@ub-marketplace` and uses the `ub:`
  names wherever it invokes a skill. The overlay and import Vite plugins are named
  `uno-blueprint:overlay` and `uno-blueprint:vite-imports`, so a deployment
  config that looks either up by name follows them. The default-config exports
  are `templateDefaultConfig`, `templateDefaultCellBudget` and
  `templateDefaultAgentSearch`, so a deployment that imports any of them imports
  it by that name.

  The browser storage prefix is `ub-`. An installation that runs on the default
  prefix starts once with its saved settings reset: the theme, the remembered
  paths, the agent's sessions and placement, and any model key pasted into the
  in-app agent, which has to be pasted again. An installation that set its own
  prefix with `configureStorageNamespace` keeps everything.

### Patch Changes

- 224af99: Every document reads as Uno Blueprint

  The README, SETUP, CONTEXT, the guides, the ADRs, the connector notes, the
  workspace handoff template and this changelog name the template Uno Blueprint,
  the plugin `ub` and the skills `ub:map`, `ub:slice`, `ub:audit` and `ub:whatif`.
  The schema migration's header comment names the template the same way; the
  schema itself is unchanged.

  `check:standalone` now holds the package, its skill namespace and its
  marketplace to a single spelling each, as well as failing on the deployment's
  names. A deployment that runs the template's guard over its own tree sees the
  new patterns.

- f94bd63: The cover no longer promises a Slack bot

  "Where you reach it from" on the landing view, the alt text on its figure, and
  the figure's own badge all named the Slack bot as the fourth way in, beside the
  app, the in-app agent and agentic tools, as though the template shipped it. It
  does not. The cover now names the three it ships, and describes the fourth,
  drawn dashed, as a pattern a deployment can build: a reader holding only the
  publishable key, bound by the read-consumer rules in
  `references/adapter-contract.md`. The figure keeps its filename, so the
  sample's frame and the seed that point at `/cover/four-ways-in.svg` are
  unchanged.

- 8420241: The README no longer promises a Slack bot

  "Where the blueprint is used" listed the Slack bot as the fourth way in, beside
  the app, the in-app agent and agentic tools, as though the template shipped it.
  It does not, and guide/02 already said so. The README now names the three it
  ships, and describes the fourth as a pattern a deployment can build: a reader
  holding only the publishable key, bound by the read-consumer rules in
  `references/adapter-contract.md`. "Connect your agents" says the same of a
  Slack bot under "Everywhere else", and guide/04 no longer speaks of "the Slack
  bot" as though one were running. The README also says what the in-app agent
  needs: it asks you to sign in and bring your own model key.

- 194d8bf: The template can say its own name

  The template is called Uno Blueprint, and the naming guard used to fail on the
  word `uno` wherever it appeared, so the template could not name itself.
  `check:standalone` now reads the deployment's slug, its owner's name and its
  bot, and nothing else: `uno`, `Uno Blueprint` and `ub:map` pass, while the
  deployment's names still fail. The bot's pattern is bounded at both ends so it
  cannot catch the template's name or the English words that begin with the same
  three letters. The cover-content test imports the guard's patterns rather than
  keeping a copy of them.

  The glossary gains the naming rule: the Template is called Uno Blueprint, and a
  Deployment is named for its owner.

## 1.44.29

**A past session reads back with its words intact.** `get_session` already
spelled out `user`, `assistant`, `tool` and `declined`; everything else fell
through to a line that printed the kind and dropped the text. A `status` event
therefore reached the model as the bare word "status:" — a record that says
something happened and not what it said, the same grievance the declined row
was added to close. Status now shows its text. Every kind the transcript has
carries words, so every kind is written out, and a sixth kind fails the build
and the suite instead of inheriting a catch-all.

### Upgrading a deployment

- **Nothing to configure, and no migration.**
- **If an agent reads a past session**, a `status` event now carries its text.
  Kinds that already spelled themselves out are unchanged.

### Patch Changes

- d6a30d5: A past session reads back with its words intact

  `get_session` renders one line per transcript event for an agent catching up on
  an earlier conversation. `user`, `assistant`, `tool` and `declined` spelled
  themselves out; everything else fell through to a final line that printed the
  kind and nothing else. A `status` event therefore reached the model as the
  single word "status:" with its text dropped — a record saying something
  happened and not what it said, which is the grievance the declined row was
  added to close.

  `status` now shows its text. The if-chain is a switch with no default: every
  kind the transcript has carries words, so every kind is written out and there
  is nothing left for a fallback to be right about. The bare-kind line is still
  the right answer for a kind that genuinely says nothing, but it would be
  written as a case of its own — a stated choice rather than a catch-all standing
  in for one.

  A sixth event kind can no longer lose its text quietly. The renderer declares a
  `string` return and has no default, so an unhandled kind leaves a path that
  returns nothing and the build says so; the new suite's fixtures are total maps
  over the kinds, which fail to compile for the same reason.

## 1.44.28

**Nothing here changes what the app does with a blueprint.** Four of the five
are a defect each in the things that watch the app — a browser walk, a console,
a record, a caret — and the fifth is a reading change in the entity panel.

**A deployment's phone walk stops failing for a reason that was never about
the deployment.** The walk's last check asks whether a destination is readable
above the agent sheet, and it measured the CELL: its box, carrying its padding
and its row's height. Both belong to the board being looked at rather than to
the camera that framed it, so a board whose first row is a dozen pixels taller
scored zero on a jump that put a perfectly legible strip on screen. It now
measures the words. The protection that matters is untouched — text carried off
the side of the screen still fails, which is the case the check was tightened
for. This was found on a real deployment board and could not have been found
here: the bundled sample board cannot exhibit it, even with its cell padding
inflated to 130px.

**The console is clean on load, so the next report means something.** A
validation library feature-detects `new Function` by attempting it, and a
strict policy reports the attempt even though the library swallows the throw.
One refusal, every load, for a question whose answer was already settled —
`default-src 'self'` refuses eval, so the runtime parser was what ran either
way. The library's `jitless` flag says so up front instead of discovering it.
Zero refusals now. ADR 0029 records why the script policy stays strict rather
than buying silence with `'unsafe-eval'`.

**A skill that was named and did not run leaves a record.** Choosing to send a
message as plain text told the agent the skill had not run and left nothing
behind — so reading the session later, there was no sign a skill had been named
and declined. There is now a row saying so, in the transcript's quiet voice
rather than as an error, and it survives a reload.

**Accepting a suggestion mid-sentence keeps your place.** The caret used to
land at the end of the whole draft instead of after the word just completed —
reachable whenever a second near miss keeps the draft in the field. Everywhere
else a completion reaches the end of the draft, so the browser's own behaviour
happened to be the right answer; this is the one span where it was not.

**A status option says what it means once.** The entity panel's Status list
rendered `Proposed — design only` as one string, a second copy of a sentence
the status badge already owned. Each option is now the name with its meaning
beneath it, read from the same record the badge reads, and the duplicate is
deleted rather than moved.

### Upgrading a deployment

- **Nothing to configure, and no migration.**
- **If your phone render walk has been failing on the agent jump**, take this
  release — it very likely was not your board. A board with slightly taller
  rows failed a walk that was telling the truth.
- **If you watch the browser console or collect CSP reports**, the expected
  count of refusals on load is now **zero**, not one. A report means something
  new. Note that a deployment which has not yet substituted its own project ref
  into `public/_headers` still logs two placeholder warnings; those are not
  refusals.
- **If you grant your deployment `'unsafe-eval'` for an unrelated reason**, the
  validation library still will not use its generated parser — the flag is set
  unconditionally, because this package cannot read your headers. ADR 0029
  names the escape hatch.
- **If you screenshot or snapshot the entity panel's Status select**, it is
  taller: each option is two lines, and the closed control now reads the status
  name alone.

### Patch Changes

- 08ee9f9: A status option says what it means once

  Picking a status in the entity panel used to offer six one-line options with the
  meaning glued onto the name behind a dash — "Proposed — design only". The same
  six states were explained a second time, at more length and in different words,
  in the hover on the status badge, so the two sentences could disagree and did
  not have to be changed together.

  The option list now shows the name with that hover's own line beneath it in
  caption grey: "Proposed", then "Designed and discussed, with no build card
  behind it. It may never happen." One authored sentence per state, shown in both
  places. The status names themselves are unchanged, nothing stored changes, and
  the closed control still shows the name alone — there is no room on one line for
  a sentence, and the list and the badge are where the meaning is read.

  The guard that checks a definition never repeats the word above it now reads the
  select's option list too, so a meaning edited into "Live is in use today" fails
  the suite instead of shipping.

- f968ab6: Accepting a suggestion mid-sentence keeps your place, instead of throwing the
  caret to the end of the draft.

  A reader who writes `check /audit then /map this` and takes the offer on
  `/audit` gets `/ub:audit` written where the word stood — and now the caret
  sits immediately after it, with the rest of the sentence still ahead of them.
  It used to land after `this`: the token was rewritten in place, and the reader
  was moved to the end of a sentence they were half-way through. Every keystroke
  after that went to the wrong end of the message.

  **Why it survived this long.** Nothing wrote a caret at all. Assigning a
  textarea's `value` puts the caret at the end of the new text by itself, and
  every other completion in the composer is tail-anchored — the slash menu's
  lookup only matches a token that runs to the end of the draft — so "the end"
  happened to be the right answer, for the wrong reason. The near-miss rewrite
  is the one completion with prose behind it, and it inherited a behaviour that
  was never a decision.

  `completeSkillToken` now returns the caret along with the text, rather than
  leaving the offset for a caller to re-derive from the gap rule it just
  applied, and the composer's field takes that offset as a one-shot request it
  carries out after the text is on screen — which is the only moment it can,
  since the write that puts the text there is also what moves the caret. Focus
  comes back to the field with it: both of these gestures are a press on a
  button or a menu row, so the field has just lost focus, and a caret nobody is
  typing at is not a caret.

  **The mid-sentence case is pinned, and was watched failing first** — 30 where
  15 was wanted, which is exactly the length of the draft against the end of the
  completed name. The tail-anchored case is pinned beside it and its worth is
  stated where it sits rather than implied: its offset cannot tell a deliberate
  caret from the value setter's, because for a tail-anchored completion the two
  are the same number for every input there is, but it does catch a deliberate
  caret written to the wrong offset, and its focus assertion is red unless the
  completion path hands the field back.

- 03e74be: The console is clean on load, so a Content Security Policy report now means
  something new.

  Every build until now logged one CSP refusal on every load, and it was never
  yours to fix. zod builds a faster parser for object schemas by generating
  source and handing it to the `Function` constructor, and it finds out whether
  that is allowed the only way a feature detection can — by attempting it. The
  `default-src 'self'` in `public/_headers` refuses the attempt, zod catches the
  throw and falls back to its runtime parser exactly as designed, and the
  browser reports the refusal anyway: a caught `eval` error still fires a
  `securitypolicyviolation` and still logs. The guidance was to expect exactly
  one and read past it.

  `src/lib/validationJit.ts` sets zod's own `jitless` flag at the app root, which
  costs nothing under this policy — the probe was always going to fail and the
  runtime parser was always going to run, so nothing about validation changes.
  zod simply stops asking a question the policy had already answered. Verified on
  a built distribution served with the real header and driven in Chromium: one
  `securitypolicyviolation` before, zero after.

  **The script policy did not move, and will not.** `'unsafe-eval'` would have
  bought the same silence with the protection the policy exists for, and
  suppressing the report would have hidden a signal worth keeping.
  `docs/adr/0029-the-script-policy-stays-strict-and-jitless-makes-it-free.md`
  holds that argument for whoever next proposes loosening `script-src`.

  ### Upgrading a deployment

  - **Nothing to configure.** Take the release; the flag is set by the package.
  - **Re-read your baseline.** A CSP refusal in the console used to include one
    that meant nothing. It no longer does, so treat any report as a new fact
    worth chasing.
  - **Two placeholder errors are not refusals.** If your `public/_headers` still
    names `YOUR_PROJECT_REF.supabase.co`, the browser logs two "invalid source"
    errors about it and every database call is blocked. Substitute your project
    ref — that file's header says so, and it is the only console noise left on a
    fresh load.

- 713979f: The phone jump's legibility check reads the words, not the cell that holds
  them.

  **What was happening to a deployment.** The render walk's phone case ends by
  counting cells of the destination board that are "wholly on screen above the
  sheet", and it counted with each cell's bounding box. A cell's box is not the
  words in it: it carries the cell's padding and the height of the row it sits
  in, and both of those are properties of the BOARD. So a deployment whose first
  row is a shade taller than this template's — a longer step title, a little more
  padding, a theme with roomier rows — scored zero cells and went red on a walk
  that was telling the truth. The destination had rendered above the sheet, a
  strip-full of it rather than a sliver, the screenshot showed a board a person
  could read, and the earlier assertions in the same block passed. Only the last
  count failed, and it failed by a dozen pixels of padding.

  **What it does now.** Each cell's text is measured directly — the union of the
  rendered text's client rects — and the existing containment test is applied to
  that. The rect union is taken over the cell's contents rather than off a known
  element, so it does not care how a given cell is built, and cells differ.

  The protection the check was tightened for is kept exactly. Text carried off
  the side of the screen still fails it, because words go off the edge with the
  cell that holds them; text that lands below the sheet still fails it. Both were
  watched failing before this shipped. What is dropped is the part that was never
  about the camera at all — the row height and the padding, which belong to the
  board the walk was pointed at rather than to the framing the walk is judging.

  **If you run the walk against your own board,** this is the case that may have
  been red for you without a defect behind it. Nothing else in the walk changes,
  and a board that passed before passes now.

- 8837c8e: A skill a reader named and chose not to run now leaves a row in the
  transcript, so the decision survives the scroll and the reload instead of
  living only in the moment it was made.

  Typing `/audit` where the skill is `/ub:audit` invokes nothing, and the
  composer has asked about that for a while: run it under its official name, or
  send the sentence as text. Taking the second answer told the model in that
  send's prompt that no skill ran — and told nobody else anything. An hour
  later, or on a reopened session, the only trace of the decision was the token
  sitting in a sentence, which is exactly the thing that reads as an
  invocation. Half the original complaint was that nothing on screen _or in the
  transcript_ said so, and only the first half had been answered.

  Sending as text now writes a row of its own under the message: the token as
  it was typed, the skill that did not run, past tense, in the same quiet voice
  every other non-turn row speaks in. It is not dressed as a failure — the
  reader was asked a question with two answers and gave one of them — it does
  not fold away into the "N steps" accordion where tool calls and errors go,
  and it is written where every send passes through, so what the row says and
  what the model was told cannot drift apart.

  The row is a persisted event shape like any other: it rides the same
  best-effort write-through to `agent_messages` and settles at the read
  boundary, so a session opened in another browser shows it too, and
  `get_session` spells it out for an agent catching up on a past conversation
  rather than leaving it to infer from prose. Choosing to RUN the skill records
  no such row — the badge on the turn and the skill's body in that turn's
  prompt are already the evidence, and a second claim about the same fact is
  only a second thing to keep in agreement.

  **For a deployment owner:** nothing to configure and no migration. Rows of
  the new shape appear in `agent_messages` for sends where a reader declined an
  offer; a build that predates this one ignores them, and a transcript with
  none of them reads exactly as it does today.

## 1.44.27

**One data defect is fixed, and it is the reason to take this release.** Until
now, the chat's session list was merged out of the database on every attach —
a read followed by two writes — and nothing cancelled that merge when the
person signed in changed underneath it. A read still in flight across an
account switch published the previous account's sessions over the new
account's list and upserted the previous account's rows into the new
account's table, on a client already bearing the new account's token. The
panel now notices the switch and the merge declines to write. The switch it
missed is reachable without signing out: a magic link clicked while already
signed in, or an admin password sign-in over a live session.

The rest of the release is the codebase deepening behind that: twelve modules
that each replace a protocol several callers used to re-derive. A camera jump
is awaited through one module answering in one verdict, instead of a keyed
waiter map three callers re-learned — including an arm-after-commit ordering
defect that had shipped twice and is now unsayable, because the module is
handed the act that commits the selection. A tool refusal, a call's
admission, a draft's Send, the composer's field and its coloured mirror, the
selection line a shell reports and the navigation tool checks against,
whether the transcript can be read yet, and which path a scenario opens on
are each now owned in one place. The system prompt crosses to a provider as
its stable part and its volatile part rather than one string plus a character
index, so it is built once per call instead of twice.

**Two records were corrected rather than left standing.** The phone's camera
story said the bottom inset frames a board on a floored fit; on an axis the
zoom floor pushed off the strip it does not, and 1.44.26's release note said
otherwise. No geometry moved — the anchored framing was already right — but
the prose now matches the code everywhere a reader meets it. And a test
asserting where the caret lands after a skill completion could not fail: in
jsdom the value setter moves the caret there by itself. It is deleted, with
the gap and the by-hand browser evidence written in its place.

### Upgrading a deployment

- **Nothing to configure, and no migration.** Take the release for the
  account-switch fix; everything else is internal.
- **If your deployment builds against the provider input directly**, the
  system prompt now crosses as `systemStable` + `systemVolatile` instead of
  `system` plus a character index saying where the stable prefix ended. The
  adapters in this repo are updated; a fork of one is not.
- **If you grade agent behaviour with the eval harness**, tool refusals now
  come from one module shared by the loop and the harness, so a refusal your
  cases match on is worded identically in both. Re-run a case that asserts on
  refusal text.
- **If you read `1.44.26`'s note about the phone camera and the sheet**, it
  was wrong about why a destination lands where it does. Nothing to change —
  the pixels are the same — but the corrected account is in this release.

### Patch Changes

- e6efa72: A camera move toward a named target is awaited through one module, and answers
  in one jump verdict.

  `canvasJump.ts` replaces the keyed waiter map three callers each re-derived a
  protocol from — the agent's navigation tools, the agent's cell focus, and the
  phone's sheet, which gives the caret up for a jump and takes it back when the
  canvas settles. The old channel took a key and nothing else, so everything a
  caller had to know to use it correctly lived outside it: that a waiter must be
  attached before the selection commits, because the answer is published by the
  fit that selection triggers; that the phone's deadline had to outlast the
  tool's; and that a fourth outcome existed as silence, which each caller
  re-learned as a timeout of its own. The ordering defect shipped twice.

  **The module is handed the act that commits the selection.** It arms, commits,
  races, detaches both losers and answers once, so arming after the selection
  commits is unsayable rather than documented — a caller written the wrong way
  round fails to compile, because the function it would need does not exist. Two
  entry points, named for which half a reader is in: `awaitPublishedJump` for a
  verdict the canvas publishes against a target, and `awaitSelfAnsweringJump`
  for a commit that hands its own result straight back. Both take the commit, so
  the ordering mistake is unsayable at either.

  **One camera deadline of 2000 ms, with a measurement as its justification.** It
  replaces 1800 ms for the navigation tools, 1500 ms for cell focus and 2000 ms
  for the caret hand-back. Driven through a real scenario open on a phone
  viewport and read from the publisher itself, the answer arrives at a median of
  366 ms and a maximum of 422 ms — the fade, plus the canvas remount, plus the
  fit — and at a maximum of 1332 ms under a 4× CPU throttle. Nothing varied
  across the three camera sites, so there is no override to pass. The navigation
  tool's other wait — its poll of the shell's reported selection — is a
  different question on a different half and keeps its own named constant at
  1800 ms, so the sentence a model reads when that expires arrives when it
  always did.

  **Four jump verdict words — landed, cancelled, superseded, unanswered.** The
  canvas may claim the first three; `unanswered` belongs to the deadline alone,
  and the type refuses it to the publisher. A verdict and the thing it is about
  are now one shape, so the nonsense will not typecheck: a self-answering jump
  either carries the commit's own result or is silence carrying nothing, and no
  caller can test an answer for null and infer silence privately. A result that
  never became a flight at all — a cell the board does not hold — gets no
  verdict rather than borrowing `cancelled`.

  **`unanswered` is what silence is called.** A viewport that lets a flight go
  publishes nothing so the mount that takes the camera over can answer, and a
  viewport gone for good publishes nothing at all. That hand-off is guarded by
  the viewport's React harness case, which is the only test that owns a real
  unmount and a real remount; the jump module's unit suite asserts the weaker
  thing it can reach — a waiting jump stays attached through silence — under a
  name that says only that, and both tests say which is which.

  The phone's watcher keeps its generation guard, because which jump owns the
  caret is the shell's decision. It takes no verdict parameter: the caret goes
  back to the composer however the jump settled, and nothing read the word.

  Verified in a browser against the branch rather than by inspection: 22 jumps
  across desktop and phone, every one answered by the landed sentence, zero
  console errors, a same-target re-jump (no board remount) answering in 68 ms,
  a phone median of 369 ms against the 366 ms baseline, the sheet never
  disappearing under a 20 ms poll, and the caret returning to the composer every
  time from a blurred start.

- 9dd0031: One module owns every tool refusal, and a refusal crosses to the eval harness
  only when the harness can say it truthfully.

  `refusals.ts` exists so the loop and the Node harness turn a tool call away in
  the same words, because a refusal is the prompt an eval case grades a recovery
  from: reworded on one side only, the harness goes on grading a run against
  words no session says — and passes, since the sentence it judges against is its
  own. Two things were wrong with the set. The harness answered an unmapped tool
  name in a wording of its own, and the registry built its own sentence for a
  name it knows but the allow-list refuses, so "one module owns the refusals" was
  not true even inside the app.

  Both are fixed. The missing-tool refusal now comes across the harness's surface
  entry, so an invented name — the commonest thing a model gets wrong, and the
  refusal a run is likeliest to be graded on recovering from — is answered
  identically on both sides. The allow-list refusal moved into `refusals.ts`
  bytes intact as its own export, and each of the two now says at its definition
  how it differs from the other, because they are not the same sentence: one
  answers a name that is nothing here, the other a name the tool layer knows and
  a fixed surface still refuses.

  **The rule for sharing is now one rule, stated once.** Share a refusal when the
  harness has a gate of its own whose answer is the same statement AND the
  statement is true of the harness's session; otherwise it is app-only and says
  which half fails. Not the test: whether a model could reach it (a model can
  call any name on the roster), or what today's cases happen to call.

  By that rule the missing-SEARCH refusal is app-only, where it had been shared.
  The loop says it only when `search_blueprint` was never offered — a tool absent
  from a roster does not exist for that session — and the harness offers the
  whole spec table, so the app's sentence would be false of a harness run. The
  harness now answers a ranked-search call with a sentence true of its own
  environment, nothing there serving ranked search, and steers to the same two
  reads, which is the part a case grades. The sample trial's refusal is app-only
  for the same shape of reason: the harness has the no-database state but not the
  narrowed roster that goes with it. The repeat-read refusal is app-only because
  the harness implements no repeat-read guard, and the two transcript-row strings
  because the harness renders no transcript.

  The pins are pins on the RULE rather than on today's layout. Every shared
  sentence gets the same four through one helper — owned by `refusals.ts`,
  re-exported by the entry, destructured by the runner, and used where the
  runner's own gate fires — so the next refusal is one line and no sentence ends
  up guarded more loosely than its neighbours. The copy-ban for the one shared
  sentence BUILDER is over its WORDS, so a concatenation, a format string or one
  hard-coded name is caught as well as a template literal; the use-pins match the
  binding in a result position rather than the whitespace under a `case` label,
  which a reformat used to break.

- d32ef9d: A session-list merge abandons its writes when the account it read for is no
  longer the one signed in.

  **What was happening to a reader.** The chat's session list is merged out of
  the database on every attach. That merge is a read followed by two writes: the
  list the person sees, and an upsert of the sessions the database it read did
  not have. If the account changed while the read was still on the wire, the read
  still finished against the rows it started on, and then wrote its result where
  the new account's rows live. Two things came of that. The previous account's
  sessions were published over the sessions of the person now signed in, so a
  reader saw conversations that were not theirs in their own switcher. And rows
  that existed only in the previous account's table were upserted into the new
  one, where they stayed: a durable cross-account write, not a flicker a reload
  would clear.

  The way to reach it needs no sign-out in between. A magic link is mailed with
  this origin as its redirect, so following one for a second account in a tab
  already signed in as a first lands back on the page authenticated as the
  second, with one non-null session simply replacing another. A password sign-in
  performed while already signed in has the same shape.

  **The fix, in two halves.** The panel now notices. Its persistence effect is
  keyed on the signed-in account's user id, not only on the client handle — the
  client is one module singleton per page whose identity never changes and whose
  token changes underneath it, so an account switch moved nothing the effect was
  watching and the list work was never re-armed. Keying on the user id rather
  than the session object means a token refresh, which mints a new session for
  the same person, still costs nothing.

  And the merge now declines. A piece of parked persistence work is handed the
  flight it is running as, and the flight knows the era of the handle it started
  against. The merge asks whether it has been superseded after its read comes
  back and before either write, so a flight whose account has been replaced
  computes nothing and returns. The replacement's own merge is the one that
  publishes, which is what it was always meant to be.

  The era counter that the readiness module already kept was doing less than a
  comment there claimed: it suppressed the bookkeeping that followed a
  superseded flight — so the list kept its skeleton honestly — while the flight
  itself ran to completion and wrote. That comment is corrected here, scoped to
  the work that actually consults its flight, along with the one on the panel's
  effect that repeated the claim and the one that credited RLS with protecting
  the transcript read (what protects it is that its write is in memory only).

  Pinned at both seams, because a case at one is blind to the other's defect: a
  module-level pair that drives detach, forget, re-attach and re-ask with the
  first read unanswered, and a panel-level case that renders the real panel and
  changes only which account is signed in — no new client, no signed-out moment,
  nothing calling the readiness module by hand. A merge with no account change
  still converges local-only sessions upward exactly as before.

  A deployment with no database behind it is unaffected — nothing attaches
  there, so no merge ever runs.

- a13239c: A tool call's admission is one answer, derived from the same description the
  session's offer is derived from.

  `roster.ts` decided which tools a session was OFFERED. The loop decided whether
  a call was ADMITTED, in eight near-identical blocks, five of which re-stated
  conditions the roster had already applied — in a different order, agreeing with
  it only by a prose note asking the next editor to keep them in step. The
  failure that bought was not a tool running where it should not: both readers
  refused the same set. It was the WORDS. A `search_blueprint` call on a
  no-database session trips the search gate and the trial gate at once, and the
  call read back "no database is connected" about a tool the roster had withheld
  for the missing search plan. Whichever reader was written first won, so the
  order of eight blocks was part of the contract and nothing could see it.

  **One place now says which tools a session has, and in what order the question
  is asked** — one home for that order, which is not the same as the order
  ceasing to matter: it is still five sequential `if`s in `toolStanding` and
  three phases in the admission, so where a NEW gate goes is a choice a reader
  makes there, with the others in front of them. What one-sourcing buys is that
  no second reader states the order again, and so which sentence a call tripping
  two conditions reads back is a function of the description. `toolStanding` answers for one tool: offered, or withheld on a
  named ground. `sessionRoster` walks every definition through it to build the
  offer; `admission.ts` walks one call through it and adds the sentence. The
  gates apply in sequence rather than one mode gate returning for all of them,
  so the offer no longer leans on a subsumption — a tool the trial may run is a
  read, so it is one mobile may run — that holds in the definitions today and is
  invisible to a reader of the function.

  **What stayed live, because no description of a tool can carry it.** The run's
  abort signal, the write-batch count for this send, and the repeat-read record
  for this turn arrive as an explicit input, each still refusing in its own
  words. So does the write gate's INPUT: `ui_command` is a write exactly when its
  `command` argument names a mutating control, which is an argument-level fact,
  so the loop keeps its predicate and hands the answer over — in the app, one
  predicate serving both the viewer's refusal and the batch budget, as before.
  The gate's PLACE in the order is shared; only its input forks, and the fork is
  stated at the seam.

  **The eval harness's roster fork is resolved rather than left silent.** The
  harness handed a provider the whole spec table whatever its environment, so it
  offered `search_blueprint` with no index behind it and graded models in a state
  no reader can reach. No case exercised that state. Its offer is now
  `sessionRoster` handed the mode the harness is actually in, and
  `searchOffered: false` is the truth of an environment with no deployment index
  and no embedding key — so the app's missing-search refusal is true on both
  sides and is shared, and the harness's own wording of it is gone.

  **Its DISPATCH derives from the same admission answer** too, so the mobile gate, the write gate and the batch budget are
  the app's, in the app's order: the harness had mirrored those three by hand in
  an order of its own, and a `search_blueprint` call in a mobile case read back
  "the mobile shell is view-only" about a tool the app withholds for the missing
  search plan — the very failure this change removes from the loop, still live on
  the far side.

  Two things there are declared rather than closed. The widening: the harness
  says it is not a no-database trial, because it rehearses every write as a dry
  run and a roster narrowed by the missing database would offer nothing for the
  write half of the suite to call — so no case there can reach the app's
  no-database refusal, which is why that sentence stays app-only. And the fork:
  write-ness in the harness is the definition's surface, because the app's
  argument-level half answers from the live UI command registry that only an open
  surface fills, and the harness drives no canvas and serves no `ui_command` at
  all. A mutating `ui_command` is refused to a viewer and budgeted in the app,
  and is neither there.

  What pins it: an INDEPENDENT statement of what each mode should offer, read off
  each definition's own availability and surface fields — the offer and the
  admission are both held to it, so a loosened gate reds rather than comparing
  the gate to itself — plus the sentence a call failing two gates at once reads
  back, the refusal category that may cross to the harness, and the harness's
  offer for each of its modes.

- 8e661dc: One module answers "can the transcript be read yet, and tell me when", and
  owns the parking of work until it can — so a reopened session no longer comes
  back a skeleton on the strength of a race between two effects in two files.

  Reading that failure used to mean reading three modules at once. The
  persistence module held a flag and an attach signal; the loop held three sets
  of session ids beside the transcript, bookkeeping which hydrate had fired,
  which was on the wire and which had been parked; and the chat view listed the
  Supabase client as an effect dependency on purpose, with a comment explaining
  that child effects run before parent effects and that the retry happened
  there. Three places had to be right, and each of them stated one third of the
  same race.

  `persistenceReadiness.ts` states it once. Work is handed over against a handle
  — a kind and the thing of that kind it is for — and runs immediately if a
  client is attached, or on the attach signal if not: once per handle, in the
  order it was parked, never twice. It also answers whether a handle's work is
  still outstanding, which is the skeleton-versus-empty-state question both the
  chat view and the sessions list ask, and it carries the seam that forgets a
  handle so a reopen proves a read rather than a memory. The loop keeps the
  transcript and nothing else; the chat view's effect depends on the session and
  nothing else.

  **The sessions list asks the same module.** It used to keep its own pair of
  flags — one for the merge on the wire, one for the window before the merge
  even starts — which was a second spelling of one fact and a second chance to
  get the loading-versus-empty distinction wrong. Its merge is now parked and
  scheduled like any other read, and the list subscribes to the same outstanding
  answer the transcript does. The record for cross-surface module stores is
  amended with the new store and with that fold.

  **A deployment with no database is unchanged, and is now stated in one place
  rather than five.** The persistence calls had a detached-client guard at the
  head of each; the guards were pass-throughs, and the thing they guarded — the
  client — now comes from a single helper that answers `null` for the whole
  call. Reads return `null`, writes return, nothing throws, and the panel keeps
  working from localStorage. The legacy single-`skill` read migration stays
  exactly where it was, at the read.

  **The client does not leave the module.** A caller that can already reach the
  client has no reason to ask whether persistence is readable, so handing one out
  was a second, contradictory answer waiting to be written — park-and-wait here,
  give-up-with-null over there. Queries go through one helper instead, which
  carries the detached case, folds a failed query into the same `null` a
  never-persisted session gives, and builds the query inside its own promise
  chain so a builder that throws on the spot degrades quietly rather than
  reaching the window.

  Hydration order is pinned without a React harness: work parked before the
  client lands runs once it does, in order, and not twice. Two kinds of work
  about one session stay apart, so neither is silently dropped; a flight
  abandoned by a forget cannot settle the ask that replaced it; and the
  transcript's skeleton is now asserted through the real panel, mid-read, rather
  than left to inspection.

- e0a6906: One module decides what a draft sends, so the near-miss re-check cannot be
  skipped and a stale answer cannot corrupt the draft.

  `sendDecision.ts` takes the composer's draft and one word of consent from the
  reader, and returns one of two things: the question still to ask, or the Send
  to commit — this text and these skills, with the misses going as prose
  declared alongside it. It replaces three closures in the chat panel and an
  ordering contract that was written nowhere: ask about the first near miss,
  rewrite the draft on accept, re-check the rewritten draft, dispatch with the
  misses that remain, and pass the draft text as an argument rather than reading
  it back from a state setter that has not committed yet. Seven exports of the
  skills grammar had to be assembled in the right order to commit one Send
  correctly, and the step a caller could drop was the re-check.

  **It was dropped, and that was the batch's one real defect.** Accepting a near
  miss rewrote the token and went straight to the send, so a second near miss in
  the same message rode along in silence — the exact silence the offer exists to
  close, one token to the right. Accepting is now an answer handed to the
  module, and the module asks again when the rewrite leaves a miss standing.
  There is no re-check step to forget, because the answer either comes back as
  the next question or as the Send.

  **The answer is consent, not data.** It used to carry the near misses the
  reader had been shown, which handed the caller the one invariant the module
  actually depends on — that those spans were measured against THIS draft — with
  nothing to enforce it. Two things went wrong through that hole, and both are
  now unreachable rather than merely discouraged. A second accept off one
  question re-applied a span measured against `/audit` to the `/ub:audit ` that
  had replaced it, and the offsets landed inside the word: the draft became
  `/ub:audit dit `. And a declaration built from the older list told the model
  both halves of a contradiction in one message — `/ub:audit` among the skills
  that ran, `/audit` among the near misses that did not. Every arm now walks the
  draft it is handed, including the declaration, which used to copy the caller's
  list verbatim and skip the walk entirely.

  **What the answer says is which of three things happened**: nothing has been
  asked yet, the reader said send it as typed, or the reader took the offer on
  the first miss. Three arms rather than an empty list, because "not asked" and
  "asked, and nothing is pending" are different states that a list conflates —
  and the emptiness used to decide the behaviour. The committing arm carries one
  string, not two: a `draft` and a `text` that are equal for every ordinary
  message and differ only for a token-only one is the perfect shape for a
  wrong-string bug that passes every hand test, and the panel clears the field
  rather than reading a draft back out of the decision. The draft stays on the
  ASK arm, where it is load-bearing — the field must show the accepted rewrite
  before the next question.

  **A near miss cannot be accepted while a send cannot happen.** The panel's
  gate on a run in flight sat after the rewrite, so accepting an offer mid-run
  rewrote the field, dropped the send, and left the notice on screen still
  holding the spans of the draft that had just moved — which is how a reader
  reached `/ub:audit dit ` by clicking twice. The gate now comes first, so a
  blocked send decides nothing and moves nothing, and both of the notice's
  buttons are disabled while it holds.

  **The accept-then-second-miss sequence is a pure assertion.** It used to be
  reachable only by clicking through the panel, which is why nothing caught it:
  the logic lived in a closure no test could call. The sequence is now read off
  returned values — ask, answer, ask again, answer, send — beside pins for a
  draft naming four skills sending four in token order, for a send-as-text that
  declares every miss rather than the first, for a completion that leaves the
  sentence around the token alone, for a declaration derived from the FINAL text
  so a draft whose only token resolves declares nothing, and for two accepts
  running that leave the draft intact. The panel keeps cases of its own, each
  about state the module does not hold: an edit drops the question and so does a
  pick from the slash menu, because both move the text the question's spans were
  measured against, and Enter during a run asks nothing and moves nothing.

  **What is left in the panel is what the module has no business knowing** — an
  annotation on the shelf, a run already in flight, and a trial with no client.
  The sentence an empty draft with an attachment sends is the panel's too, for
  the same reason. The ordering rule for a draft that is nothing but tokens
  moved out with the rest.

  **One word per concept.** A span in a draft that nearly names a skill is a
  near miss (`SkillNearMiss`, `findSkillNearMisses`); what the model is told
  about one going as prose is a declared miss (`DeclaredMiss`,
  `declaredMisses`), the name it now carries through the prompt builder too. And
  what the module returns is a `SendDecision`, because a question is not a Send:
  the Send is the glossary's two fields, its text and the skills it names,
  nested inside the committing arm.

  The skills grammar itself is unchanged. Its regexes, span arithmetic and the
  lookahead that stops a path segment resolving as a skill are already one
  module, and deleting it would put all three back into its callers. The
  composer's decision record stands as written: the text remains the only record
  of which skills a message runs, no durable pick sits beside the draft, and the
  field stays a real textarea.

  Every pin added here was watched fail against a deliberate break — the
  re-check removed, the ask and the declaration cut to the first miss, the skill
  order reversed, the token-only instruction suppressed, the tokens stripped out
  of what sends, the accepted rewrite skipped, the accepted span re-applied to
  the draft it produced, and the declaration built from the draft as it stood
  before the rewrite.

- 3d79788: The line a shell reports its selected phase or scenario with, and the check
  the navigation tools run against that line, are one module.

  The sentence was spelled four times: once in the phone's shell, once in the
  desktop's, once as a prefix constant plus a regex rebuilt from it in the
  navigation tools, and a fourth time in a source-text guard that read the
  phone's file looking for the interpolation. Four spellings of a wire between
  two ends is a wire that can come apart, and it did — a release shipped the
  phone without the phase line at all, and every agent-driven phase jump
  answered that the selected phase was not verified while the canvas sat on
  exactly the phase asked for.

  `describeSelection` renders the phase and scenario lines; `namesSelection`
  answers whether a context names a given id as the selected phase or scenario.
  Both shells build their selection lines through the first and the navigation
  tools verify through the second, so neither end can change how a selection is
  reported without the other following. `selectionOf` resolves the nav item a
  shell has into the id and reader-facing label the line wants, so the four
  copies of that lookup across the two shells are one. A shell reporting no
  selection still says so in the words the tools expect, and may qualify it
  with one of a closed set of reasons — the phone's overview has no scenario
  open by design, bare "none" reads as a fault, and the phone publishes no
  view-level line for a model to read the difference from.

  Deliberately narrow. The module owns those two sentences and the recognition,
  nothing else; each shell keeps assembling the rest of its own context,
  because the phone legitimately has no sidebar and no docked panel to report
  and one imposed shape would make a surface answer for furniture it does not
  have.

  The source-text guard on the phase line moves rather than going away. Its
  regex over the phone's rendered format is gone — the renderer holds the
  wording now, asserted as a table over real rendered lines — but the claim
  that each shell still calls the renderer for both kinds has no other test
  that can fail, so the weakest honest form of it stands beside the renderer
  until the phone's end-to-end slice drives a mounted shell's registered
  context. The guard on the sheet's scrim stays where it is, because a class
  string on a portal still has no unit that can reach it.

- f40b682: The anchored phone framing is what puts a destination above the sheet, not the
  sheet's measured height. **1.44.26** said an agent-driven jump "tells the
  camera what the sheet covers so the destination lands in the visible strip".
  The camera is told, and on the ordinary phone destination that number frames
  nothing: the canvas floors its fit zoom, so a scenario board wider and
  taller than the screen is framed from its top-left, and an axis the floor
  pushed off screen solves for the TOP inset alone. The board is above the sheet
  because it is anchored there, and it still runs on behind the panel.

  The framing is right and is kept — a board taller than the strip the sheet
  leaves has no framing that keeps both of its edges, and the edge worth keeping
  is the one the board begins at; buying bottom clearance would pan that
  beginning up out of the frame the fit reserves, to gain room at an edge
  already hundreds of pixels off screen. So this corrects the story rather than
  the geometry, at each of the places a reader meets it: the agent sheet's note
  on the height it reports, the shell's note on what reaches the camera, the
  fit-inset helper's doc, the anchoring comment in the camera hook — which now
  owns the reasoning the rest point to — the agent-jump slice's header, test
  name and assertion comments, the render walk's prose, and the
  end-to-end-round record, whose own amendment reverses what the previous one
  claimed.

  What the occluded height does frame is now pinned at the phone's own floor,
  either side of the line it draws: a board that fits the strip vertically is
  centred INSIDE the strip — without the inset that board lands behind the sheet
  entirely — and a board that does not is anchored, with the same framing
  whether the sheet's height or 0 is supplied. The gap those cases close is that
  the slice could only ever assert the height REACHED the fit, which is true and
  is not a framing; read as one claim, it let a value with no effect on this
  surface pass two review axes, a browser verification and a render walk.

  **Upgrading a deployment:** nothing to change. No behaviour moved, and 1.44.26
  needs no revisit beyond its wording — what shipped is what the app does, now
  described correctly.

- dd4d6ce: The caret case that could not fail is gone, and the gap it hid is written
  where a reader meets it.

  `agentComposerSkills.test.tsx` carried a case asserting that accepting a skill
  completion leaves the caret at the end of the draft. It passed whatever the
  composer did. Two facts, both established by running the probe rather than
  reading it: in jsdom, assigning a textarea's `value` moves `selectionStart` to
  the end of the new text on its own, with no React in the loop; and the comment
  above the case — that focusing the field and setting its caret first is "the
  path React's own selection restoration runs on" — was false, because
  react-dom's `restoreSelection` acts only when the focused element changed
  between commits, which it does not there.

  **No better version of that case exists.** `findSkillLookup` is tail-anchored
  by design — its span ends at `draft.length` on both branches — so the offset a
  completion should produce and the offset the value setter produces by itself
  are the same offset for every input. There is no distinguishing case to write.
  This is not a test that is hard to write; it is one that cannot exist while
  the lookup is tail-anchored.

  The case is deleted rather than reworded, the false comment with it, and the
  file's header now states the gap in its place: why no jsdom assertion can
  separate the two offsets, and what covers the behaviour instead — a browser
  check made by hand, typing `/ub:map notes then /ub:au` and pressing Tab to get
  `/ub:map notes then /ub:audit ` with the caret at offset 29, focus kept and
  the menu closed. That is the evidence; a green assertion was not.

  Nothing else in the tree asserts a caret offset after a raw `value`
  assignment. The field module's own test states the same gap already and keeps
  no assertion for it, and the composer's decision record was corrected when the
  field and its mirror became one module, so neither needed touching here.

- c8e173d: The composer's field and the coloured mirror behind it are one module, so the
  five facts the colour depends on are owned in one place instead of agreed
  across two.

  A textarea cannot colour a word inside itself, so a recognised skill token is
  drawn by a mirrored copy of the draft sitting behind a field whose own text
  has gone transparent. That picture holds only while the two copies agree on
  the metrics that decide a line break, the trailing newline a block would
  otherwise collapse, the single positioned box they both size against, the
  scroll offset, and standing down while an IME composes. One of those lived
  with the mirror; the other four were spelled in the chat panel's render body,
  next to everything else a conversation surface does, and held together by a
  comment asking the next reader not to break them.

  `ComposerInkedField` now renders the field, the mirror and the input group
  around them, resolves both class lists from one call, and reads the skill
  tokens out of the draft itself. Callers hand it the draft, the write-back and
  whatever a textarea takes; they cannot reach the box the two copies measure,
  they cannot hand in token offsets read off some other string, and they cannot
  put an add-on into the group, because the group is inside the module and takes
  no children from outside. That last one was the live hazard: an add-on in the
  group narrows the FIELD through the group's own `has-[>[data-align=...]]`
  rules and leaves the mirror full width, so every line from the first wrap down
  breaks somewhere else and the colour drifts off the caret — a failure no
  shared metrics string can see or undo. It was prevented by a comment and is
  now unexpressible from outside.

  Nothing about the record changed: the field is still a real `<textarea>`, the
  draft's text is still the only thing that says which skills a message runs,
  and a coloured token still runs. Nothing visible moved either, and that was
  measured rather than assumed — all four class lists the two copies wear are
  byte-identical to before, and the composer's growth was measured in a browser
  on both sides of the change: 38px empty, 98px over four wrapped lines, capped
  at 122px, the mirror's rect within half a pixel of the field's at every step.

- f1378bd: The path memory owns which path a scenario opens on, and there are now tests
  that can fail when it does not.

  The phone shows one path at a time and remembers, per scenario, which one the
  reader was on. The rule — an explicit selection, else the remembered path,
  else the scenario's happy path — was composed twice: once inline in the
  phone's shell, which read storage, resolved the default and wrote the memory
  back for itself, and once through the selection seam that lands `openScenario`
  on the same answer for the desktop. Two copies of a two-step rule is how one
  surface comes to open a scenario on a different path from the other while each
  looks correct on its own.

  The rule now lives in the module that owns the storage it reads, and the
  module is named for what it does rather than for the first surface to need it:
  `pathMemory.ts`, since both the phone and the desktop resolve through it. Its
  interface is two resolutions and one write — `resolvePathIdToOpen`,
  `resolvePathIdToShow`, `writeLastViewedPath` — named as the precedence pair
  they are, so a caller cannot read one as "the remembered path" and add a
  fallback of its own, which is exactly the composed rule this removes. The read
  and the pure default rule stop being exported. The selection seam's
  same-shaped wrapper around the module is gone too; its caller imports the
  module. Behaviour is unchanged for a reader: the phone opens on the same path
  it opened on before, and the stored key is untouched, so nobody's remembered
  path is forgotten by the upgrade.

  The coverage landed before the move and is the reason the move is safe. Three
  cases drive the real shell at phone width by taps — a remembered path opens on
  itself, a remembered path that has since been deleted falls back rather than
  leaving the reader on a board with no path, and a choice survives as memory —
  and each asserts both the reported reading line and the label the selector
  shows, because the selector alone falls back to the first path and could not
  fail for the deleted case. The module's own cases reach through storage rather
  than around it, on a fixture that lists the variant path first: with the happy
  path first, "opens on its happy path" also passes for a resolve that returns
  whichever path is first, which is a guard that cannot fail for the reason it
  claims. Every case was watched red against a deliberate break — including the
  happy-path default swapped for the first path in the list, which the
  variant-first fixture is there to catch.

  The agent wiring in the shell is deliberately left where it is: it is already
  three small modules with unit tests of their own, so pulling it out would move
  code without concentrating anything.

- 716c146: The phone's agent flow gets an end-to-end slice: the real phone shell is
  driven at phone width from the cover through an agent-driven camera move, and
  the sheet staying up, the fit inset reaching the camera, the selection
  reported in the words the navigation tool verifies against, and the caret
  coming back to the composer are all asserted. The browser half runs the same
  flow at the same width over the built app. Three source-text guards the slice
  now drives are gone; the two it cannot reach — the sheet's scrim, and the
  landing view not being derived from an empty selection — stay, each saying why.
- 7ee3941: The system prompt crosses to a provider as its stable part and its volatile
  part, so the prompt is built once per call instead of twice.

  The provider input used to carry the prompt as one string plus a character
  index saying where its stable prefix ended — one provider's caching concept,
  spelled as arithmetic, in the interface every provider shares. Only the
  Anthropic adapter read the index, and it read it to cut the string back into
  the two pieces the loop had just joined. The loop learned the number by
  assembling the entire prompt a second time with an empty live context: once
  per send, and again on the round-budget closing call. Every skill body a
  message carried was rendered twice to measure something the assembly already
  knew.

  The input now carries `systemStable` and `systemVolatile`. The adapter that
  caches puts its breakpoint between them and slices nothing; the two that do
  not concatenate, through one shared function, so a prompt that reaches one of
  them can never differ from the prompt that reaches the one that splits. The
  prompt on the wire is byte-for-byte what it was.

  What the arithmetic was protecting is now structural: a message carrying
  several skill bodies has all of them inside the stable part, so the breakpoint
  lands past every one rather than inside the second. An index could have landed
  mid-skill, and a cache entry cut mid-skill matches nothing on the next round —
  a failure that costs tokens on every round and never turns a test red. The
  adapter can no longer cut, so that invariant belongs to the ASSEMBLY, and one
  test at the loop pins it there: every skill body inside the stable part, the
  live context once, last, exactly one blank line past the final body, and the
  cut on that boundary.

  `buildSystem` is now `buildStableSystem` — it builds the prompt's stable part,
  not the prompt — and the volatile part has a name of its own, `buildVolatile`,
  rather than being spelled out at each of the two call sites.

## 1.44.26

**A skill is named in prose, anywhere in a message, and as many as the message
names.** The composer used to start a skill lookup only for a draft that was
nothing but `/` and a word, so `check the onboarding journey /ub:audit` sent
the sentence as plain text and ran nothing — the token was punctuation to the
model. A slash now opens a lookup wherever it opens a word, the menu offers on
prefix, Tab or Enter completes the token **in place** rather than moving it,
the recognised token is coloured where it sits, and every skill a message
names runs, in the order it was named, uncapped. A token that nearly names a
skill is no longer silent: the composer asks once, and the model is told what
was skipped so a near miss cannot pass for a plain sentence.

**A dropped connection no longer discards a turn's work**, and the phone keeps
the conversation while the canvas moves. A provider call that died at the
network layer — WebKit says `Load failed` — used to end the turn and throw
away every result it had gathered; it is retried first, and the status says
whether the connection dropped or the provider refused, and on which round. On
the phone, an agent-driven jump keeps the agent sheet open, tells the camera
what the sheet covers so the destination lands in the visible strip, and
reports its selected phase so a jump that landed is no longer reported as
failed.

**Upgrading a deployment:**

- **A skill runs only under its official name.** `/ub:audit` runs; a bare
  `/audit` left in the prose does not, and the composer asks about it instead.
  The short aliases still _match in the menu_ — typing `/audit` offers
  `/ub:audit`, and accepting rewrites the token — so muscle memory still
  works, but any deployment doc, onboarding copy or canned prompt that tells a
  reader to type `/audit` should say `/ub:audit`.
- **A stored user turn carries `skills: string[]`, not `skill: string`.** The
  one-skill spelling is migrated at the read, so existing transcripts open
  unchanged and need no backfill. Anything querying the payload directly —
  `payload->>'skill'` over `agent_messages` in a dashboard or an export — must
  read the array instead.
- **A message can now cost several skill documents.** Skills per message are
  uncapped by decision: four named skills load four SKILL.md files into the
  first call of that turn. A deployment on a tight context or token budget
  should know that ceiling moved.
- **An identical read is answered once a turn.** A repeated board read comes
  back as a pointer to the answer already in the conversation rather than a
  second copy. A write clears the record; moving the camera clears only what
  the canvas reports, so pointing at a cell never costs the agent its place.
  Any custom tool that depends on re-reading the same payload twice in one
  turn sees the pointer.
- **On the phone, a tap on the visible canvas strip closes the agent sheet.**
  The thin scrim above the sheet is constant — it never animates and never
  clears — and it keeps the sheet's dismiss target, so panning the canvas
  means closing the sheet first. Deliberate: the sheet does not arbitrate
  canvas gestures.
- Desktop chrome is untouched, `AgentDock` still has no backdrop, and no
  environment, header or policy change is needed for any of this.

### Patch Changes

- 881d601: A provider call that dies at the network layer is retried before the reader
  hears about it, and the status that does surface says whether the connection
  dropped or the provider refused, and on which round.

  A fetch that never completed — WebKit words it `Load failed`, which reached
  the transcript as `Provider error: Load failed` — ended the whole turn and
  took every tool result the round had already gathered with it. On a phone
  that is routine rather than exotic: one radio blip mid-request and an audit
  that had read four scenarios is gone with nothing to resume from.

  The retry sits in `src/lib/agent/loop.ts`, at the one seam every provider
  call goes through, so `src/lib/agent/providers/anthropic.ts`,
  `google.ts` and `openai.ts` all get it without any of them knowing about it,
  and a retried round re-sends the transcript as it stands — the earlier
  rounds' tool results included. Two extra tries, a short backoff, and the
  backoff is cut short by Stop so pressing it never looks ignored.

  Only the failure a retry can fix is retried: a bare `TypeError` out of
  `fetch`. A provider's own verdict still fails on the first attempt with its
  status and detail intact, a body that will not parse fails under its own
  name rather than as a network story, and an abort keeps the stopped status
  it always had.

  The request shape is unchanged — this is still a non-streaming loop.

- d0d5174: An agent-driven jump on the phone reveals the canvas for as long as the camera
  is actually moving, and a jump that lands is reported as landed.

  The reveal was a flicker — a sixth of a second — and every scenario jump
  answered "navigation was cancelled" while the URL and the canvas both showed
  the move landing. Both came from the same place. A viewport can leave the tree
  mid-flight without the destination changing: the path filter for a freshly
  opened scenario arrives a beat after the selection, the board falls to its
  no-paths state, and the canvas remounts and refits the SAME target. The dying
  mount's cleanup published `cancelled` against the key it had just armed, so
  every waiter — the tool's and the sheet's — was answered early, and the real
  landing a few frames later reached nobody.

  An unmount is no longer a verdict. `useZoomPanViewport` lets the flight go
  instead of cancelling it, which leaves the waiters listening for the mount
  that takes the camera over; a canvas that is gone for good publishes nothing
  and each caller's own deadline says so honestly, rather than claiming a
  cancellation the departing viewport is in no position to claim. Supersession,
  a genuine cancel and the deadline all report exactly as before.

  The sheet's scrim is now one state, and it never changes. It used to be
  choreographed — cleared for the flight, restored on the verdict — which gave
  the reader a backdrop that flashed on every jump and, worse, put opacity and
  pass-through on different clocks: the wash eased over 150 ms while
  `pointer-events` flipped in the frame the class landed, leaving a moment when
  the backdrop was opaque yet passed taps through and a moment when it was
  invisible yet swallowed them. A single thin wash held constant reveals the
  canvas for the whole flight and has no states to fall out of step.

  The phone also reports its selected phase to the agent's UI context, in the
  same words the desktop shell uses. Without that line an agent-driven phase
  jump could never be verified on a phone and answered "the selected phase was
  not verified" while sitting on exactly the phase asked for.

  Desktop chrome is untouched, and `AgentDock` still has no backdrop.

- 325348e: A slash starts a skill lookup wherever it opens a word, so a skill can be
  named inside a sentence rather than only at the head of one — and picking from
  the menu keeps the sentence it was named in.

  The composer opened its menu only when a slash was the draft's first
  character, so "Hey can u /ub:aud" was dead text: no menu, no skill, and a
  message that reads like an invocation sent as prose. A slash now opens a
  lookup at the head of the draft or directly after whitespace — the CJK
  sentence marks included, since a reader typing Japanese gets no space before
  it — and the token runs to the end of the draft, so a space closes the menu
  again. A slash that opens no word never opens it: a reference path, a URL,
  `and/or`, a date, and a token with a path segment behind it are each pinned as
  text. The lookup is deliberately tail-of-draft rather than caret-aware, which
  keeps it derived from the text alone; the cost is that editing back into an
  earlier token does not reopen the menu.

  **Accepting a match completes the token where it sits, and colours it.** A
  word-start token that names a skill is drawn in role ink exactly where the
  reader typed it, and `/ub:aud` becomes `/ub:audit ` in place, the way a shell
  completion behaves — the prose either side is not read, moved or trimmed. The
  token is the invocation: the draft carries no skill field any more, and the
  skills a message runs are parsed out of its text at send, in the order the
  tokens appear. A coloured token will run; an uncoloured one is a word with a
  slash on it.

  This replaces the badge the first version shipped. Accepting used to lift the
  token out of the prose and stand the skill in a row above the field, which
  moved the reader's word to the front of their own message: `asdasd /ub:audit`
  became `[/ub:audit] asdasd`, and the position they had typed it in was gone.
  The badge row is deleted. The field stays a real `<textarea>` — selection,
  IME, the mobile keyboard and native undo all come from the browser — so the
  colour is drawn by a layer behind it that renders the same string with the
  token in a span, sharing one class string with the field so the two cannot
  wrap differently and one box sized by the field, so that an add-on placed in
  the group later narrows both copies or neither. While an IME is composing, the field draws its own text.

  Escape closes the menu and leaves every character typed.

  **One canonical spelling invokes.** A bare alias — `/audit` for `/ub:audit` —
  no longer resolves anything, in the composer or in a typed-through draft. It
  stays as a search term, so a reader still types `aud` and finds `/ub:audit`
  without the namespace, and as the source of the closest-match suggestion. A
  reader who typed `/audit` to run the audit is offered it instead of running
  it, which is the reversal, and it is what makes a lookup that fires
  mid-sentence safe to have at all: every token that resolves is a message the
  composer could silently turn into a skill run, and a sentence mentioning
  `/audit` is far more often a sentence.

- f930669: The canvas agent answers an identical read once a turn. A model that loops used to re-run the same board read round after round, and each repeat pushed another copy of the same payload into the conversation, crowding out the rounds that were left. The repeat now comes back as a pointer to the answer already in the conversation, naming the call and its arguments, and every suppressed call stays in the transcript so the loop is visible. A write clears the record, because a write can change anything a read described; moving the canvas clears only what the canvas reports, so pointing at a cell never costs the agent its place.
- 5096095: A token that nearly names a skill asks the reader once — run the skill it
  came close to, or send the sentence — and a sentence sent as prose tells the
  agent that nothing ran.

  `/audit` is not a skill name here; `/ub:audit` is. A draft carrying the near
  miss sent as plain text: no skill loaded, and nothing on screen or in the
  transcript said so. The agent then improvised. One session spent four rounds
  re-reading the same scenario before the turn died, and the reader had no way
  to know the flow they asked for was never loaded. The token was never the
  defect; the silence was.

  On send, a draft carrying a word-start slash token that matches a skill's
  bare alias and no skill's official name now offers two choices and takes
  neither by default. Accepting rewrites the token where it sits — "then /audit
  the intake" becomes "then /ub:audit the intake", the same in-place completion
  the menu performs, so the reader can see in their own sentence what they
  agreed to — and the skill runs. Sending as text passes the sentence through
  untouched and adds a paragraph to the system prompt: the token names no skill
  here, the closest one is `/ub:audit`, nothing ran, and the model must not
  describe it as having run or summarise what it would have produced. Editing
  the draft withdraws the question.

  **A token that resolves is never asked about.** It is coloured where it was
  typed, and a coloured token runs — the colour is the whole of the promise, and
  a prompt asking a reader to confirm what they can already see asks them to
  read it twice. The confirm-once step for a resolved token is deleted.

  **A spent round budget no longer loses the paragraphs.** The closing call the
  loop makes after exhausting its rounds was built from the context alone, so
  everything true of that send — the session tier, the no-database trial, the
  mobile shell, and now this notice — was dropped at exactly the moment the
  model is asked to answer from what it has. It is the same path the session
  that motivated the notice took. All four paragraphs are threaded into the
  closing call, and a spent budget is pinned in the loop's tests.

- a982774: One message can carry as many skills as its text names, every one of their
  instructions joined to the system prompt for that message and every one of
  them recorded in the transcript.

  A draft held one skill, so naming a second silently replaced the first:
  "build this from my notes /ub:map then /ub:audit it" could not be asked in one
  message even though the two flows compose. The skills a message runs are now
  read out of its text at send — every word-start token that resolves, in the
  order the tokens appear, each skill once however many times it is named, with
  no ceiling. The reader is the one who knows how many flows their message is,
  and the sentence they wrote is where they say so. A message that names none
  behaves exactly as before, and a message that is nothing but tokens still
  sends a usable instruction, naming the order it will work through them in.

  The prompt names that order when there is more than one and asks for each flow
  in full rather than a blend, and the sentence that translates a skill for this
  surface is said once rather than per skill. A message carrying one skill
  produces a byte-identical prompt to the previous release. The prompt-cache
  breakpoint is measured through the same builder the prompt is assembled with,
  so several skill bodies move it past all of them instead of cutting the prompt
  mid-skill.

  **The menu keeps offering after the first skill, and the notice names every
  near miss.** A lookup used to refuse to open once the draft began with a
  resolved skill — a head command owning its arguments, as it does in the tool
  this composer mirrors — so `/ub:map notes then /ub:au` offered nothing and the
  second skill had to be typed out in full. That guard is gone: what it was
  protecting costs nothing without it, since a path typed for a skill to read
  opens a lookup matching no skill and a lookup with no matches opens no menu.
  For the same reason the near-miss notice now reads out every token in the
  draft that nearly names a skill rather than the first: "check /audit then /map
  this" names both, accepting one rewrites that token and asks again about the
  next, and a sentence sent as prose tells the model about all of them. One
  reported and the rest left out was the same silence with a smaller mouth.

  **A turn read back from the database keeps its skills.** The transcript
  records every skill a message invoked. Rows persisted by earlier releases name
  one skill in a field of its own, and that is settled into the list this build
  carries at the READ boundary — once, where the row arrives — rather than at
  each place a row is drawn, so a reopened session shows what it was sent with
  and nothing downstream has to remember the older shape.

  Each body is several kilobytes, so a message carrying all four is a
  substantially fuller prompt before board context loads. There is deliberately
  no cap: if that degrades answers the evidence arrives as behaviour, and a
  limit can be decided then.

- 73dce7b: On the phone, an agent-driven jump leaves the agent sheet open. The sheet's
  dimming clears while the camera flies, the destination is framed above the
  sheet rather than behind it, and the caret returns to the composer once the
  move settles.

  Closing the sheet was the old way to make a jump visible, and it threw the
  conversation away mid-run. The run does not stop when the surface does — it
  continues in the session module — so a turn that failed after the jump had
  nowhere at all to report the failure. That is the state a failed turn landed
  in, with an agent working and no surface saying so.

  The sheet's scrim is the reason closing looked necessary: it is the page
  colour at 90% over the whole viewport plus a blur, so the canvas behind it is
  washed out rather than merely covered. It now fades out for the duration of
  the flight — blur and hit-testing with it, so a tap during the move reaches
  the canvas instead of dismissing the sheet — and comes back when the move
  settles. The camera is told what the sheet occupies, measured from the panel
  itself, and frames the target inside the strip that leaves visible; cell
  focus reads the same pair, having previously centred on the full viewport and
  flown the cell behind the panel.

  The flight signal is the canvas's existing published camera outcome, read one
  way, with a deadline — a camera that never publishes is ordinary, since a
  backgrounded tab suspends the frames a flight runs on, and a scrim with no
  deadline would stay down for the rest of the session.

  Phone only. The desktop dock sits beside the canvas rather than over it, dims
  nothing and never closed itself. A jump with the sheet already closed behaves
  exactly as before.

- d0d5174: The phone's agent scrim stays still while the canvas moves. It was a heavy
  wash that cleared for the length of a camera flight and came back after — a
  state with two properties to keep in step, a deadline to restore it, and a
  window at each end where the wash and its pass-through disagreed. A thin wash
  that never moves says the same thing with none of it: the strip of canvas
  above the sheet stays readable the whole time, so a jump the agent makes is
  visible as it happens.

  `agentFlightBackdropClass` and the flight flag behind it are gone, and the
  flight watcher keeps one job — handing the caret back to the composer once the
  canvas settles.

## 1.44.25

**The theme is stamped by the app's own code, so a strict script policy no
longer refuses it.** Setting the theme before the first paint used to be the
job of an inline `<script>` the theme library injected, and the Content
Security Policy this template ships — `default-src 'self'` with no
`script-src` — refuses an inline script. The guard therefore did nothing: the
class arrived from React after the first paint, so a reader whose saved theme
is dark saw a light frame on every load, and every load logged a refusal. The
work now happens while the app's own module graph evaluates, which is a hashed
asset and allowed by the policy. The library is gone from the dependencies,
and the saved theme moves onto the storage namespace.

**Upgrading a deployment:**

- **A saved theme resets once.** The key moves from the bare `theme` onto the
  namespace seam, so it is `<prefix>theme` — `ub-theme` in the template.
  Nothing migrates it: the first load after upgrading finds no saved theme and
  opens light. Choosing a theme writes the new key. Two installations on one
  origin stop sharing a theme as a result.
- `next-themes` is no longer a dependency. A deployment importing `useTheme`
  from it imports from the template instead; the hook's shape is unchanged,
  except that `resolvedTheme` is always a theme rather than `undefined` until
  an effect has run.
- **No policy change is needed, and none should be made.** A deployment that
  loosened `script-src`, added a nonce or pinned a script hash to get the
  theme script running can drop that now.
- One refusal still appears in the console on load, and it is not the theme: a
  validation library probes for `Function` at startup and the policy refuses
  it. That probe is wrapped and falls back safely. It predates this release
  and is untouched by it.

### Patch Changes

- 8da8a7f: The theme is decided and stamped on the document by the app's own module graph
  instead of by an inline script, so a strict Content Security Policy no longer
  refuses it, and the stored theme takes the namespace prefix.

  `next-themes` injected an inline `<script>` to set the class before the first
  paint. The `public/_headers` this template ships serves `default-src 'self'`
  with no `script-src`, which refused it — an inline script is not `'self'` — so
  the guard did nothing, the class arrived from React after the first paint, and
  every load carried a refusal in the console. `src/lib/theme.ts` replaces the library: it reads the stored
  theme, resolves it and applies the class and `color-scheme` to the root while
  the import graph evaluates, which is a hashed asset doing the work and
  therefore allowed by `'self'`. No policy changes, no nonce, and no script in
  any `index.html`. Behaviour is otherwise as it was, deliberately: the default is
  light, `'system'` still resolves through `prefers-color-scheme` and still
  tracks it live, and the theme still follows a second tab of the same
  installation.

  **One saved theme resets, once.** The key moved from the bare `theme` that
  `next-themes` chose onto the namespace seam, so it is `<prefix>theme` from this
  release — `ub-theme` in the template. Nothing migrates it: the first load after
  upgrading reads no stored theme and opens light, and choosing a theme writes
  the new key. That is also what takes the last stored value off the shared
  origin — two installations on one host no longer read each other's theme, and
  `npm run check:storage-keys` can now see the key at all, because it is built
  under `src/` rather than inside a dependency.

  Anything importing `useTheme` from `next-themes` imports it from
  `@/lib/theme` instead; the hook's shape is the same, except that
  `resolvedTheme` is a theme rather than `undefined` until an effect has run.

## 1.44.24

**A tab that outlived a deploy recovers itself, a missing chunk says so, and the
identity fill is the accent rather than a grey of its own.** The failure that
started this release was one error message — "Failed to fetch dynamically
imported module" — which named an import and not the missing file. Three things
were behind it: the app had nothing that acted on a chunk that never arrived,
the template's host configuration answered a missing hashed asset with the app
shell at a 200, and the only error boundary sat below eleven providers, so the
throw that a rejected blueprint registry raises by design went to a blank
document. All three are closed. Alongside them, every key the browser stores is
built by the namespace seam and every stored value is read as what an older
release might have written, the workspace's state sits beside the workspace's
name as a badge rather than as loose words at the far end of the strip, and
`--brand` derives from `--primary` with one optional dial per channel.

**Upgrading a deployment:**

- **Four identity surfaces change colour.** The cover CTA, the one prose link, a
  switch that is on and the path selector's mark were a mid grey at 3.89:1 and
  now wear whatever `--primary` resolves to. A deployment that had authored the
  two `--brand-*` dials keeps its fill by declaring the same numbers per channel;
  `references/customization.md` § Theming & branding is the recipe and
  `docs/adr/0025-…` is the decision. A leftover `--brand-lightness` or
  `--brand-chroma` declaration silently reinstates the old grey, so the absence
  guard holds all three dial names on both sides of the seam — every stylesheet
  under `src/styles`, and every custom property the app writes from TypeScript.
- **The host configuration now ships the rules.** `netlify.toml` answers a
  missing `/assets/*` name with a 404 above the single-page catch-all, and
  `public/_headers` caches the hashed output for a year and nothing else. A
  deployment that already added both to its own copy needs no change. `force`
  must never be added to either rule: a forced rule answers 404 for every asset
  the site has.
- **Nothing in a host's entry file has to move.** The stale-tab listener and the
  app-scoped boundary both hang off `App`, so they arrive with the pin. A host
  that had been told to install its own boundary above `App` no longer needs one.
- **Two stored values reset once, both harmless.** A slide-sheet height saved
  before this release reads as absent, so the sheet opens at its default until
  the next drag. The sidebar's `sidebar_state` cookie is deleted rather than
  namespaced — nothing read it, so nothing resets.
- **Three guards a fork will meet.** `npm run check:storage-keys` (keys and
  cookie names), `npm run check:hosting` (rule order, no forced rule, the long
  cache over hashed output alone), and the brand dials' absence. Setting a brand
  dial deliberately turns four assertions red; the recipe lists them.

### Patch Changes

- a7ee0d9: A throw above the editor is a message a reader can act on, not a white page.
  The app's only error boundary sat below eleven providers, so anything that
  failed outside it — the deployment seam, the database client, the active
  service, the components that reach the address bar, the notice strip — took the
  document to blank with the error somewhere only a developer with the console
  open would find it. `App` now opens with the same boundary in an `app` scope,
  above everything it renders.

  One of those throws is deliberate and is the one this closes. A blueprint
  registry supplied as a lazy loader is a second chunk boundary that resolves at
  boot, and a loader that rejects is rethrown rather than falling back to the
  package's own board — a deployment's chrome around a canvas its identifiers
  cannot fill is the silent version of the failure. That throw now lands on a
  card naming the failure and offering a reload, with the error still logged.

  It is one class and one design, not a second surface: `EditorErrorBoundary`
  takes a `scope`, and the two placements differ only in the sentence they show a
  reader, because a view inside a working app can be navigated away from and a
  start-up failure cannot. A deployment gets this by upgrading its pin; nothing
  in a host's entry file has to change, and a host that had been told to install
  a boundary of its own above `App` no longer needs one.

- 2a960d0: A hashed chunk the deploy no longer ships answers 404, and the ones it does
  ship are cached for a year.

  `netlify.toml` held one redirect, the single-page catch-all, and a host takes
  the first rule that matches — so a name under `/assets/` this deploy does not
  have was answered with `index.html`: a 200, and `text/html`, where a script was
  asked for. What the browser reports for that is a module it could not import,
  naming the import site and not the missing file, which is why it reads as a
  bundling problem for as long as anyone believes it. A `/assets/*` rule with a
  404 sits above the catch-all now. An asset that IS there is still served
  because a host does not shadow existing content with a non-forced rule — the
  file wins, and the rule is consulted only where there is no file. `:splat` is
  not what does that; it keeps the target honest, and `force` must never be added,
  because a forced rule answers 404 for every asset the site has.

  `public/_headers` gains `Cache-Control: public, max-age=31536000, immutable`
  for `/assets/*`, and for nothing else. The content hash in the name is what
  makes a year safe, and the shell is what delivers the new hashes — a shell
  served from an old cache asks for chunks the site no longer has, which is the
  same failure from the other side. The CSP block is untouched.

  `npm run check:hosting` holds all of it: that the 404 precedes the catch-all, an
  order a diff reads as correct either way; that neither rule is forced; that the
  long cache covers the hashed output alone, in whichever of the two header
  sources it was written and under whichever `*-Cache-Control` name; and that a
  `public/_redirects` a repository started from this template adds — a file a host
  reads BEFORE the configuration file — carries the same order.

  A deployment that already added these two rules to its own copy of the host's
  configuration needs no change — this is the template catching up with it.

- 4836fac: A tab left open across a deploy recovers itself. The app is served as
  content-hashed chunks, so a deploy renames them, and the first lazy import an
  old tab asks for afterwards requests a file the new build never shipped. Until
  now that surfaced as "Failed to fetch dynamically imported module" — an
  uncaught error naming nothing a reader could do. The app root now listens for
  Vite's `vite:preloadError` and reloads, which is the refresh the reader would
  have done by hand.

  The reload is spent once per browsing session, recorded in `sessionStorage`
  before it navigates. A chunk can also be missing because the deployed build is
  broken, and reloading into a broken build would fetch the same missing file and
  reload again; one credit per tab is what keeps a recovery from becoming a loop.
  The credit is never refunded on a later boot, because the error fires when a
  reader opens a transcript — possibly an hour after the boot that would have
  refunded it.

  The template's one lazily loaded surface, the agent's markdown renderer, now
  keeps its raw-text rendering when the chunk fails as well as while it loads:
  Suspense only covers a pending import, so the rejection used to reach the
  editor-wide boundary and replace the whole editor. A reader whose tab has already spent its reload still reads the
  transcript, in plain text, until they refresh.

  A deployment needs no change to get the listener: it hangs off `App`, which is
  what a deployment mounts, so it arrives with the pin. Nothing in a host's
  `main.tsx`, its headers or its redirects has to move. A host that supplies its
  blueprint registry as a lazy loader still owns that second import's failure,
  which is a throw rather than a fallback.

- 369c344: Every key the browser stores now goes through the namespace seam, and every
  stored value is read as what it might actually be rather than as what this
  release would have written.

  **Saved slide-sheet heights reset once.** The sheet's remembered height was the
  one key written as a bare literal instead of being built by `storageKey()`, so
  an installation that named its own storage prefix did not cover it and two
  installations served from one origin resized each other's sheet. It takes the
  prefix now, which MOVES the key: a height saved before this release is read
  once as no height at all, and the sheet opens at its default until the next
  drag. Nothing else is affected, and nothing has to be migrated.

  **A malformed session no longer breaks the session filter.** The stored session
  list was cast to its type with no check on the entries, so an entry written by
  an older version with a renamed or dropped `title` survived the read — and the
  filter lowercases that title on the first keystroke, which threw into the
  editor boundary on every attempt until site data was cleared. The reader now
  keeps the entries that carry an `id`, a `title` and a `createdAt` — the three
  fields nothing can substitute for — so a list holding one without them reads as
  if that entry were absent. A field that HAS an honest stand-in gets it instead
  of costing the session: an entry that lost its `updatedAt` takes its
  `createdAt`, the oldest date it can truthfully claim, which keeps the agent's
  `list_sessions` from throwing on it while leaving the conversation openable.

  The stored model overrides and API keys beside it are now taken only when they
  are what they claim to be — a map of strings — and an entry saved under a
  provider this build does not declare is kept, because a provider can come back
  and the key under it should not go with the choice.

  **A retired provider id reads as the default.** The stored agent provider was
  read with a default but never checked against the ids this build declares. A
  release that drops a provider leaves browsers holding its id — with a key saved
  beside it, so the no-key gate passes — and the loop then indexes its adapter
  map with a name it has no entry for and sends on `undefined`. The id is
  validated where it is read, and the adapter map is keyed by the provider type
  rather than by `string`, so the other end of the same defect — a provider
  offered with no adapter behind it — is now a compile error.

  A new guard, `npm run check:storage-keys`, holds the first of those for good:
  no key reaching `localStorage` or `sessionStorage` from the application is a
  bare literal. A deployment needs no change for any of this — the readers are
  the app's own, and they arrive with the pin.

- 92fd2e5: The identity fill derives from the action fill, with one optional dial per
  channel.

  `--brand` was its own pair of dials, and the only values that pair ever shipped
  were `--brand-lightness: 0.594` at `--brand-chroma: 0` in both theme files — a
  mid grey, worn by the cover CTA under a `text-sm` label at 3.89:1, on the
  lightness `semantic.css` itself names as the worst ground either polarity of ink
  has. It is now `oklch(from var(--primary) var(--brand-lightness, l)
var(--brand-chroma, c) var(--brand-hue, h))`, and neither deleted dial is
  declared anywhere.

  **The four identity surfaces change appearance.** The cover CTA, the one prose
  link, a switch that is on and the path selector's mark were a mid grey and are
  now whatever `--primary` resolves to — near-black in light, near-white in dark,
  the same colour the filled control wears. An unbranded template has one accent
  rather than two set to different greys, and the identity fill now inverts with
  the theme because it inherits an accent that has to.

  **Customising brand is one dial per channel.** `--brand-hue` for a different
  hue, `--brand-chroma` to tint, `--brand-lightness` to move the fill, declared in
  both theme blocks; each takes exactly its channel off the accent and the other
  two keep following it. Brand also gains a hue dial it never had — the pair it
  replaces interpolated `var(--primary-hue)`, so the axis an identity most often
  wants to move was the one axis it could not. The recipe is
  `references/customization.md` § Theming & branding, and the decision is
  `docs/adr/0025-brand-derives-from-primary-with-one-dial-per-channel.md`.

  A deployment that had already set the two dials to something of its own keeps
  the fill it authored by renaming them: the same numbers, read per channel over
  the accent rather than as a triple beside it. Setting a dial then turns four
  guards red on purpose, and `references/customization.md` lists them — the
  absence guard, the byte-identity assertion, the three "declared in both theme
  files" rosters, and the gamut ceiling if the chroma overshoots it. The absence
  guard is the point rather than a formality: `var(--brand-lightness, l)` reaches
  its fallback only while nothing declares the dial, so a leftover declaration
  reinstates the old grey with no error and nothing on screen naming the line that
  did it. It holds the three exact dial names on both sides of the seam — every
  stylesheet under `src/styles`, and every custom property this app writes from
  TypeScript, because an inline property on the root element outranks every
  stylesheet selector there is.

- 3653d27: The vendored sidebar no longer writes an un-namespaced cookie that nothing
  reads, and `npm run check:storage-keys` now covers cookie names as a third
  store beside `localStorage` and `sessionStorage`.

  The sidebar primitive set `sidebar_state` on every toggle, which is how
  upstream tells a SERVER rendering the next request what to pass `defaultOpen`.
  Nothing in this package is that server: it renders in the browser, no module
  reads the cookie, and the sidebar's collapse is the editor shell's own state.
  So the write left a bare name in a cookie jar every installation on an origin
  shares, for no reader — and it was the one name in the app that the namespace
  seam did not build. It is deleted rather than namespaced, and the guard now
  sweeps the generated primitives directory for cookie names, so a re-vendor that
  restores the write goes red.

  Nothing an installation can see changes: no state was remembered before this
  release, so none resets, and a deployment needs no change.

- 75a25a3: The workspace indicator is a badge, and it sits beside the name it qualifies.

  "sample data" was a hand-rolled span carrying badge geometry — `rounded-md
px-2 py-1 text-xs text-muted-foreground` — and no badge. Tailwind's `border`
  utility was not among those classes, so the element computed to
  `border-width: 0` over a transparent fill and the words read as loose text in
  the chrome rather than as a piece of state. It is now `Badge` on the `default`
  variant, which is written for exactly this job: page-adjacent fill, caption
  ink, the control edge. Not `outline` — that variant draws `--border`, the token
  every quiet edge in the app shares, and it measures weaker than `--input`
  against a card in both themes by construction, so the only way to make it
  carry a badge would be to strengthen every quiet edge in the app.

  The row also moved. Every badge in it qualifies the workspace — which of the
  two worlds this board is, whether writes land, whether they will be refused —
  and all of them sat under `ml-auto` at the far end of the tab strip, with every
  open tab between a state and its subject. They now sit immediately after the
  workspace tab. The workspace is a permanent tab rather than a heading, so a
  position inside the tablist is the only place "beside the workspace" exists;
  the badges are spans, so the strip's roving-tabindex handler, which walks
  `[role="tab"]`, does not see them.

  `authoring` keeps its amber and `edit preview` keeps its slate. Amber already
  means "careful, this is live" on that row and the bundled sample carries no
  risk at all — it is read-only by construction — so the descriptive state gets
  the descriptive variant rather than a third alarm.

## 1.44.23

**Every overview surface answers to a name, and a definition says its term
once.** The overview container's colours, at rest and on hover in both
themes, are declared once as job names in the blueprint namespace and read
by name everywhere; nothing renders differently. The definition popover
that opens from a lane, status, entity or divider badge shows its term in
sentence case, matching the badges, and no definition body in the app
begins by repeating its own term. One guard holds that rule across every
definition module.

**Upgrading a deployment:**

- Thirty-three `--background-blueprint-*`, `--border-blueprint-*`,
  `--text-blueprint-*` and `--stroke-blueprint-*` names are the retune
  surface for the overview. The four `--background-blueprint-panel-*`
  names are seams a deployment sets; the rest are defaults it may
  override. The changelog entry below lists them.
- Lane roles are a label plus a body. A deployment reading
  `describeLaneRole` gets the body without the role name in front of it.
- The definition card's term attribute is `data-definition-term`.

### Patch Changes

- e364a50: A definition popover prints its term in sentence case, and no definition
  repeats the word above it.

  The definition card's term stops borrowing the shared `Eyebrow` — a lane,
  status, entity or divider badge reading `Frontstage` is now answered by a card
  that spells the word the same way, instead of in the uppercase register
  section labels use. The section eyebrows elsewhere are untouched, and the seam
  is renamed to match what it now is: `DefinitionSection.term` and
  `data-definition-term`.

  A lane role is a label and a body rather than one `Name — meaning` sentence the
  badge parsed on its em dash, so all eight bodies start with what the role means
  instead of naming it again. `references/lane-roles.md` carries the same table.

  One guard, `src/lib/definitionsSayItOnce.test.ts`, holds the rule across every
  module that feeds a definition — lane roles, entity status, panel terms, entity
  kinds, touchpoint roles, stakeholder kinds, the divider meanings and the cover's
  definition tables. The rule itself moved into the entity-panels composition
  guideline.

- 32cd4f9: Every overview colour has a name. Nothing renders differently — every resolved
  colour, per theme, at rest and armed, is what it was — but the phase frame, the
  title badges, the panel edges, the label rail, the divider band and the board's
  own ink were still written as raw ramp steps inside rules and inside
  `blueprintTheme.ts`. They are component names in the blueprint namespace now,
  declared once at the root of `blueprint.css` with rest and hover for the same
  piece side by side, and the rules and the theme module read the names. The
  block says what it is: a look the owner chose, pinned, deliberately off the
  elevation ladder.

  Two kinds of name, and they are used differently. The list below is DEFAULTS —
  each is declared once at the root, and a deployment retunes a piece by setting
  that name on a wrapper around the board. The four
  `--background-blueprint-panel-*` names are SEAMS, which the app declares only
  on an armed panel: a deployment sets one to paint that part of a panel's
  interior, and its absence is what leaves the resting state in place.

  - ground — `--background-blueprint-canvas-ground`
  - phase frame — `--background-blueprint-phase-frame`, `-hover`,
    `--border-blueprint-phase-frame`, `-hover`
  - phase badge — `--background-blueprint-phase-badge`, `-hover`,
    `--border-blueprint-phase-badge`, `-hover`, `--text-blueprint-phase-badge`
  - scenario panel — `--background-blueprint-scenario-panel`, `-hover`,
    `--border-blueprint-scenario-panel`, `-hover`
  - scenario badge — `--background-blueprint-scenario-badge`, `-hover`,
    `--border-blueprint-scenario-badge`, `-hover`,
    `--text-blueprint-scenario-badge`
  - panel interior — `--background-blueprint-panel-interior`, `-hover`,
    `--border-blueprint-panel-interior`
  - label rail — `--background-blueprint-label-rail`, `-hover`
  - divider band — `--background-blueprint-divider-band`, `-hover`,
    `--background-blueprint-divider-badge`,
    `--text-blueprint-divider-caption`
  - rules — `--border-blueprint-lane-divider`, `--border-blueprint-phase-divider`
  - board ink — `--text-blueprint-cell`, `--text-blueprint-header`,
    `--stroke-blueprint-arrow`

  The seams — `--background-blueprint-panel-label-rail`, `-panel-canvas`,
  `-panel-section` and `-panel-divider` — are unchanged, and stay undeclared at
  the root because their fallback arm is the resting state.

## 1.44.22

**The overview container wears the states its owner chose.** The viewport
ground, the phase frame and its edge, the scenario panel and its edge, the
panel interior, the label rail and both title badges are back to their
v1.44.17 colours in every state and both themes. The four
`--background-blueprint-*` names and the rail override seam stay, so a
deployment retunes one name; they now resolve to the pinned look and a
guard holds every piece to it.

**Upgrading a deployment:** nothing to do. A deployment that retuned
`--background-blueprint-canvas-ground`, `-phase-frame`, `-scenario-panel`
or `-panel-interior` after v1.44.21 keeps its override; the defaults
beneath it are the v1.44.17 colours again.

### Patch Changes

- 26b406a: The overview's phase container looks as it did at v1.44.17 again: the viewport
  ground, the phase frame and its edge, the scenario panel and its edge, the
  panel interior, the label rail and both title badges are back to the colours
  the owner chose, in every state — at rest, on hover, on focus-within and under
  the focus dim, in light and in dark. The two rounds since moved those states
  onto the elevation ladder; the ladder is coherent and the board was worse, so
  the look is pinned rather than derived.

  A deployment retunes a layer through `--background-blueprint-canvas-ground`,
  `--background-blueprint-phase-frame`, `--background-blueprint-scenario-panel`
  and `--background-blueprint-panel-interior`, declared once in
  `blueprint.css`, plus `--background-blueprint-panel-label-rail` for the rail.

## 1.44.21

**Four surfaces that read wrong after the visual-system batch read right.**
The Jump to… palette follows the benchmark's own command menu: a borderless
input on a bottom hairline, mono uppercase group headings, one-line rows
with an icon, a truncating name and a badge that keeps its place, a dialog
that has a name and plays its exit, cells that wait for the first keystroke,
and Escape that empties the field before it closes. The scenario header is
one breadcrumb trail on one baseline, and the current crumb is the title.
The path selector is a plain control with one dot. The overview's phase
container names the elevation ladder: a hairline on a grey ground in light,
four climbing rungs in dark. Opening a scenario through the seam collapses
the phases the sidebar opened on the reader's behalf. The `2xl` radius rung
is retired.

**Upgrading a deployment:**

- The phase frame, scenario panel, panel interior and phase badge now read
  `--background-blueprint-canvas-ground`, `--background-blueprint-phase-frame`,
  `--background-blueprint-scenario-panel` and
  `--background-blueprint-panel-interior`. A deployment stylesheet that pinned
  any of those to a colour step retunes to the dial or reads as a grey box.
- The brand hue reaches four jobs, guarded: the cover's action, the cover's
  guide link, a switch in its on state, and the selected-row mark inside the
  path selector popover. The path-selector status dot is gone; a deployment
  that styled `[data-path-selector-status]` drops that rule.
- `rounded-2xl` no longer resolves; a deployment component that says it
  should say `rounded-xl`.
- `CommandItem` takes `size="sm"` for dense menus; the default row is the
  benchmark's 44px. A deployment composing the command primitive checks its
  row height.
- `EntityHeader` takes an optional `trail` slot; `ScenarioMenubarBreadcrumb`
  no longer accepts `excludeCurrent`.

### Patch Changes

- f5c6fe9: The Jump to… palette reads as one search surface. The command primitive now
  follows the benchmark it names in its divergence header: the popover surface
  with no inner plate, a borderless input on a bottom hairline, mono uppercase
  group headings, and rows that are one line — an icon for the kind, a name that
  truncates, and a badge that keeps its place. The input-group wrapper, the check
  icon's phantom gutter and seven `!important` overrides that beat nothing are
  gone. The dialog stays mounted through close so its exit plays, and carries its
  name and description inside the popup where a screen reader looks for them.
  Cells wait for the reader's first keystroke rather than issuing a query per
  scenario on mount, Escape empties the field before it closes the dialog, ⌘K is
  ignored while a text field has focus, and selecting a result calls the
  scenario-open seam with `closeNav`, so the phone's drawer shuts behind the move.
- 61c6f3c: The path selector is a plain control with one dot

  The trigger sits on the md rung with one 8px path-colour dot per selected
  path, a label that truncates at 10rem, and a chevron. The brand-coloured
  status dot is gone: it repeated what the label said, in a colour the path
  dots beside it do not use. The brand hue's fourth job moves to the mark on a
  selected row inside the popover, and a guard now holds the hue to those four
  jobs instead of three component comments. The cover's guide link — the one
  prose link the app renders — now draws the brand's own ink, which is the job
  that colour was reserved for. The phone's path control joins the desktop one
  on the md rung.

- 399f81c: The overview's phase container obeys the elevation dial. The four nested surfaces — the viewport ground, the phase frame, a scenario panel on it and the blueprint inside that panel — were each pinned to a step of the slate ramp picked by eye, and the order those steps produced ran backwards in both themes: the frame was the brightest layer and the panel nested inside it the darkest. The four name the semantic surface ladder now — `--canvas`, `--sidebar`, `--card`, `--popover` — so dark climbs with the rest of the app and a retune of an `--elevation-*` ratio moves the board with it. Light does not climb, because light's page leaves nothing above it: its panels are the card white they already are and its GROUND steps a step and a half below the page, so the board still has a floor and the frame's hairline is a hairline on something. The phase badge loses its slate plate in every state and sits in that ground colour, cutting the hairline. Panel and frame hover sit one rung further out instead of jumping to a ramp step.

  A deployment that overrides the phase frame's fill, the scenario panel's surface or the phase badge re-tunes to the dial: read `--background-blueprint-canvas-ground`, `--background-blueprint-phase-frame`, `--background-blueprint-scenario-panel` and `--background-blueprint-panel-interior` rather than naming a colour step, or the override will read as a grey box again.

- ae9216c: The `2xl` radius rung is retired with the others. Nothing in the tree picked it once the corner chrome folded onto `lg`, and the source lint already refused it; the token itself is now gone too, so the ladder is four rungs: sm, md, lg, xl. A deployment component that still says `rounded-2xl` loses its corner radius and should say `rounded-xl`.
- d61f7e4: The scenario header reads as one breadcrumb trail. The phase used to sit beside the title as a lone 12px grey word while the title was printed separately at 14px semibold, so the same hierarchy was said twice on two rungs and the phase read as a floating label. The header now renders `Phase › Scenario` on one baseline: both crumbs at 13px, a 14px chevron between them, the phase muted and capped at 10rem with its full name on the `title` attribute, and the current crumb in foreground semibold — it IS the title, and it keeps the "View details" affordance that opens the entity panel. The kind badge follows it and the summary line sits beneath, unchanged. `ScenarioMenubarBreadcrumb` is now the only owner of the trail: its `excludeCurrent` flag is gone, and `EntityHeader` stays the only builder of the title affordance and takes an optional `trail` slot that wraps it, in place of rendering it alone. The phase crumb's cap is a layout rule and lives with the bar's other geometry in `menubarHeaderLayout`. The workspace crumb stays out of the trail, so a deployment's header never prints this template's own name. The phase header keeps its current shape.
- 05b1f07: Opening a scenario through the shared seam expands that scenario's phase and collapses the phases the sidebar had expanded on the reader's behalf. Navigating by palette, breadcrumb or cover action into phase B after phase A now leaves B open and A closed, instead of accumulating every phase visited in a session. A phase the reader expanded by hand keeps their claim and survives navigation elsewhere; a phase they collapsed by hand is expanded again, as navigation's, when they next open a scenario inside it.

## 1.44.20

**Five leftovers from the visual-system review, each guarded.** Sidebar
rows sit on the 4px grid, and every pixel constant the layout module
exports is checked against it. The scenario-open seam has one registry.
The canvas's bottom-right corner shares one shape, one shadow and a stated
stacking rule, and `rounded-2xl` is gone from source. The annotation style
bar's mode-invariance is named in the canvas guideline and measured by the
tokens test. Touchpoint tones and the focus-mode dimmed state clear the
same contrast floors the lane fills already did, with the dim values owned
in one TypeScript module.

**Upgrading a deployment:**

- Sidebar nav rows are 32px tall, up from 30. A deployment stylesheet that
  positioned anything against the old row height retunes.
- `rounded-2xl` is refused by the source lint under the template's tree
  only; the `--radius-2xl` token stays declared, so a deployment's own
  components keep rendering. Fold to `xl` when convenient.
- The inspector drawer over the canvas now wears `rounded-lg`, matching the
  zoom cluster and the panel error card.

## 1.44.19

**The render walk waits for the shell before asking about the cover.** It
used to ask at once, and on a deployment's slower first paint it saw no
cover, skipped the dismissal, and then every sidebar click landed on the
cover that had appeared behind the question. Both specs that dismiss the
cover now wait for the cover or a sidebar row first.

**Upgrading a deployment:** nothing to do. A deployment whose walk went red
on v1.44.18 at the first phase chevron goes green on this pin.

## 1.44.18

**The visual system tightens, and the chrome does the jobs the audit
named.** Corners sit on a 0.5rem ladder with five rungs, spacing on a 4px
grid, and only floating surfaces carry a shadow, drawn in two layers from
the surface's own lightness. The overview phase frame sits on the page with
a hairline instead of a darker fill. Cover headings outrank bold body copy.
A deployment's brand hue reaches four places — the cover's action, prose
links, a switch in its on state, and the path-selector's status dot — and
nothing else; selection, focus and cell outlines stay neutral. The scenario
header carries its phase crumb; the top nav carries a Jump to… palette over
scenarios, cells and actions; the cover carries the disconnected line; a
phone opens on the cover and its action lands on the first scenario. The
render walk gains a 375×812 project so a blank phone canvas fails a check.

**Upgrading a deployment:**

- The radius base is `0.5rem` and the rungs are multiples of it; `3xl`,
  `4xl` and the panel radius are gone. A deployment stylesheet that names
  one of those rungs, or that restates `--radius`, retunes to the ladder.
- `--shadow-md` and `--shadow-lg` are declared in the plain `@theme` block
  and restated under the dark scope with a lit top edge. A deployment that
  overrode either token in a `.dark` block keeps working; one that declared
  them under `@theme inline` moves them.
- Half-step spacing utilities (`gap-1.5`, `px-2.5`, `py-3.5` and kin) are
  refused by the source lint across the tree. A deployment's own components
  under its source root move to whole steps; `px-gutter` and `gap-content`
  name the two recurring measures.
- The brand fill is a button variant, `brand`, used by the cover's action;
  the default button stays on `--primary`. A deployment with a brand hue
  sets `--hue` and `--brand-chroma` (ceiling about `.135` at the shipped
  lightness; a gamut test holds it) and nothing else.
- Opening a scenario goes through one seam, `openScenario`, exported from
  the editor context; a deployment that reached the tab and path selection
  directly calls it instead.
- The sidebar's default width is 288 and its row pitch 30, owned by
  `lib/layoutTokens`; the vendored sidebar primitive no longer declares a
  width. A deployment that pinned the old 320 by reading the primitive
  reads the token.
- A phone now opens on the cover, and the cover's action lands on the first
  scenario with the drawer closed. A deployment that deep-links to the
  drawer-first landing links to the cover.
- The disconnected line reads "No database connected · read-only. Sample
  data shown." and sits on the cover, not the scenario header. A
  deployment's copy override for the old vendor-named string moves to
  `COVER_DISCONNECTED_STATUS`.
- The render walk's mobile project runs beside the desktop one; a
  deployment enrolled in the walk gets both.

### Patch Changes

- 27c124d: The visual system tightens, and the chrome does the jobs the audit named

  Corners sit on a 0.5rem ladder, spacing on a 4px grid, and only floating
  surfaces carry a shadow. The overview phase frame sits on the page with a
  hairline. Cover headings outrank bold body copy. A deployment's brand hue
  reaches the CTA, prose links, the switch, and the path-selector status
  dot — and nothing else. The cover carries the disconnected status line;
  the scenario header carries its phase crumb; Jump to… opens a palette;
  a phone opens on the cover. The render walk gains a 375×812 project so a
  blank phone canvas fails a check.

## 1.44.17

**The storyboard shows moments, not logos.** Since a cell's featured image
became its frame, a placed touchpoint cell carries its logo as a frame, and
the storyboard walkthrough — which read every non-storyboard lane's frame —
drew those logos in the side panel's stack, the canvas strip and the deck as
though they were moments. Touchpoint lanes leave the walkthrough roster in
the one place it is decided; the cell panel still draws a touchpoint's frame
at logo size, and no cell data is written or cleared. The bundled sample's
three reference diagrams, which sat on a touchpoint row, move to the owner
row at the same steps so the sample's walkthrough keeps them.

**Upgrading a deployment:**

- Nothing to take: no shared script changed. On the next deploy, logos stop
  appearing in the storyboard stack and strip wherever a touchpoint cell's
  frame is a logo; a diagram a person put on a touchpoint row as a moment
  should move to the actor row for that step.
- A deployment that pins `STORYBOARD_WALKTHROUGH_LANE_NAMES` is unaffected.

### Patch Changes

- f1908b5: The storyboard walkthrough shows moments, not logos: touchpoint lanes leave its roster

  Open a storyboard cell and the side panel stacks one frame per walkthrough lane
  for that step; the canvas draws the same frames as the step's strip. The roster
  was every lane that is not a storyboard row, and it took any cell in the step
  carrying a non-empty frame. Since a cell's featured image became its frame, and
  placing a touchpoint fills an empty frame with that touchpoint's icon, every
  placed touchpoint cell carries its logo as a frame — so a product's own mark
  appeared in the stack and in the strip as though somebody had drawn it for that
  moment. The slice slide never did this: it collects frames from the slice's own
  cells and the storyboard cell, and nothing else.

  What a person sees change: the logos leave the storyboard stack and the canvas
  strip, and the walkthrough deck steps through the actors' frames alone. A step
  whose only framed cells are touchpoints now reports no walkthrough cells, so it
  offers no walkthrough rather than a deck of icons.

  Measured. On a step whose framed cells are one action cell and two touchpoint
  cells: three strip entries before, one after — the action cell's. **And the
  bundled sample does change**: across its two "Build a blueprint" paths the
  strip falls from 8 entries to 2. The six that go are the three documentation
  diagrams — `/cover/data-model-hierarchy.svg`, `/cover/blueprint-anatomy.svg`,
  `/cover/four-ways-in.svg` — authored onto **References & guardrails**, a
  `backstage_touchpoints` lane, in each path. They are drawn artwork sitting on a
  touchpoint row, so three steps per path lose their strip, their stack and their
  deck frames. Nothing else in the sample moves, and the walk over every phase,
  scenario, path and layout stays free of console errors. Whether that artwork
  belongs on an actor or storyboard row is an authoring question about the
  sample's content, and this release does not answer it: no cell data is written
  or cleared here.

  The touchpoint roles are left out where the roster is decided — one function,
  which the stack, the strip, the deck and the "has this step walkthrough cells"
  test all read — so the four agree by construction rather than by four matching
  edits. Which roles those are is now one `TOUCHPOINT_LANE_ROLES` in `laneRoles`
  behind an `isTouchpointLaneRole` predicate, because it is a fact about what a
  row means; the layout module's own touchpoint question reads the same
  predicate.

  A deployment that pins its own roster by lane name is untouched: naming a lane
  is the decision, and a pinned list still gets exactly what it names. The cell
  panel still draws a touchpoint cell's frame at logo size, which is where a logo
  belongs.

- 476239b: The bundled sample's three diagrams are back in its walkthrough

  Open "Map your service" on the sample board and step through the storyboard:
  the data-model hierarchy, the blueprint anatomy and the four ways in are drawn
  again, at the steps where they always sat. They had gone quiet. The last
  release took the touchpoint rows out of the walkthrough's roster — a touchpoint
  cell's frame is its logo, not a moment — and those three drawings were hanging
  off **References & guardrails**, which is a `backstage_touchpoints` row. Real
  artwork parked on a row nobody reads is drawn nowhere.

  So the artwork moved, and nothing else did. Each diagram now hangs off the
  **Blueprint owner** cell at the same step — the actor row, which the
  walkthrough does read — beside "Answers the scoping question", "Nods on the
  proposed step and lane outline" and "Shares the deployed URL". Not the
  storyboard row, which reads as the natural home and is not one: the storyboard
  row is where the strip is _drawn_, from frames hanging off the other rows at
  that column, so a figure placed on it would be just as invisible as a figure
  placed on a touchpoint. The three reference cells keep their content, their
  summaries and their resources; only their frame is now null.

  One thing does read differently, and it is worth saying: the caption beside a
  figure is its host cell's summary or content, so each diagram now carries the
  owner's words rather than the reference cell's. "Answers the scoping question
  and names whose journey runs along the spine" sits under the data-model
  hierarchy where "Rendering follows the semantic lane_role" used to. That is the
  walkthrough describing the moment rather than the document, which is what a
  walkthrough is for.

  Measured at the resolver, over both "Map your service" paths and every step:
  **2 strip entries before, 8 after** — four figures a path, three of them these
  diagrams and the fourth the `ub:map` figure that never moved. The walk over
  every phase, scenario, path and layout of the offline board stays free of
  console errors.

  Only the sample's own data moved. The generator that emits the sample is the
  one edit; the offline module and the database seed are regenerated from it, so
  the two still cannot disagree. No rendering rule changed, so a deployment's own
  board is untouched.

## 1.44.16

**Three things the reviews of the last round named are done.** A check that
needs a database and was never pointed at one says so through the unverified
register and exits clean; one that was pointed at a database it could not
reach stays red with the error quoted, and CI, which names its databases,
keeps every red it had. Four lookups in the fallbacks module that nothing
called are deleted, and the board's one mutable field with them. And the last
guards under the application that resolved a repository root from their own
file take it from the sweep. Nothing a person sees changes; the built chunk
shrinks by a few bytes.

**Upgrading a deployment:**

- Take `scripts/check-target-schema.mjs` byte-identical; your shared-scripts
  guard names it. Run without the public URL and key it now exits clean with
  an unverified line where it exited 2; a workflow of yours that relied on
  that exit code should set the variables instead.
- If a file of yours called `hasRegisteredPathFallback`,
  `getFallbackBlueprintsForScenarios`, `getFallbackCell` or
  `showsBlueprintFilters`, none is known and none has a replacement: they
  answered nothing the application asked.

### Patch Changes

- b788f9b: A database that was never named is unverified; one that was named and not reached is a finding

  Two checks need a live database and each answered "there is no database" in its
  own words and with its own exit code. `scripts/check-target-schema.mjs` printed
  `no target configured` and set **exit 2** by hand, with a comment saying the
  verdict module renders four outcomes and none of them is this one.
  `scripts/check-retired-identifiers.mjs` went red with `could not sweep a
database` whether or not anybody had named one — correctly in CI, where the
  sweep follows the migration replay and an absent catalogue is a real failure,
  and wrongly on a laptop with no Postgres, where nothing was ever asked.

  **One rule, stated once per file and applied to both.** A database that was
  never named is **unverified**: the check says what it could not look at through
  the `unverified` register `scripts/sweep.mjs` owns, and the run stays clean. A
  database that **was** named and could not be reached is a **finding**: red,
  with the connection error quoted. A reachable database is untouched — output
  byte-identical, both checks, both modes.

  **Naming one is not only `--database`.** libpq reads a connection out of the
  environment a piece at a time, and the command at the top of the identifiers
  check's own usage block takes no arguments at all. So `PGHOST`, `PGUSER`,
  `PGPORT` and `PGSERVICE` each count as naming a server, alongside `--database`
  and `PGDATABASE`: the sweep is attempted and a failure is the finding it always
  was. Only a run with none of them is the one nobody asked anything.

  **The exit codes that changed**, and nothing else did:

  | case                                                                                                                         | before                          | after                                                                                  |
  | ---------------------------------------------------------------------------------------------------------------------------- | ------------------------------- | -------------------------------------------------------------------------------------- |
  | `check-target-schema.mjs`, no URL and key                                                                                    | 2, printed by hand on stderr    | **0**, `::warning::unverified — the target database. …`                                |
  | `check-target-schema.mjs`, named and unreachable                                                                             | 1                               | 1 (unchanged)                                                                          |
  | `check-target-schema.mjs`, reachable                                                                                         | 0 / 1 by answer                 | unchanged, byte for byte                                                               |
  | `check-retired-identifiers.mjs`, nothing named — no `--database`, no `PGDATABASE`, no `PGHOST`/`PGUSER`/`PGPORT`/`PGSERVICE` | 1, `could not sweep a database` | **0**, `::warning::unverified — a retired word swept across the database catalogue. …` |
  | `check-retired-identifiers.mjs`, `PGHOST`/`PGUSER` only, server unreachable                                                  | 1                               | 1 (unchanged)                                                                          |
  | `check-retired-identifiers.mjs`, named and unreachable                                                                       | 1                               | 1                                                                                      |
  | `check-retired-identifiers.mjs`, `--database` with no value                                                                  | 1, as a connection failure      | 1, as `--database was given no value`                                                  |
  | `check-retired-identifiers.mjs`, reachable (sweep and `--self-test`)                                                         | 0 / 1 by answer                 | unchanged, byte for byte                                                               |

  **CI keeps its red.** `ci.yml` runs both identifier lines with `--database
migration_replay`, so the only case CI can reach is the named one. The rule is
  applied once, at the top of `judge()`, which is why `--self-test` obeys it too —
  and names what _it_ measures, the planted object, rather than the sweep it did
  not run.

  **`scripts/check-target-schema.mjs` is a shared script.** A deployment holds it
  byte-identical (it is on `SHARED_SCRIPTS` in
  `scripts/tests/a-shared-script-cites-no-local-path.test.mjs`), so the new branch
  imports nothing deployment-specific and cites no local path: it returns a
  judgement and lets `scripts/verdict.mjs` — also shared — render and set the
  code. A deployment that pins the new version gets the warning line every other
  check already gives instead of an exit 2 its own runner had to know about.

  The messages keep their text where the case is unchanged. One sentence moved
  rather than being copied: `this check compares the CATALOGUE, not the migration
files, and has nothing to say without one` is now a constant both the finding
  and the register read, because it is the same fact either way. The finding's
  remedy line is the one deliberate rewording — it used to end `Set
PGHOST/PGUSER/PGDATABASE, or pass --database <name>` for a reader who might have
  named nothing, and now says a database **was** named and did not answer, which
  is the only way that branch is reachable.

  `docs/engineering/checks.md` already said all three live guards write to the
  unverified register when they look at nothing. That was true of two of them.
  Its `check:target` row now says what the third does.

  `scripts/tests/a-database-nobody-named-is-unverified.test.mjs` proves the cases
  for each check with no live database: a `psql` on PATH that is a shell script, a
  port nothing serves, and — for the reachable target — a listener the test stands
  up itself. It runs each check as a **command**, because what changed is the exit
  code and a judgement object does not carry one.

- 773b870: Four lookups nothing asked are gone, and the cell cache goes with them

  The offline-board change threaded a board argument through every lookup in
  `src/data/blueprintFallbacks.ts`. Four of them had no one to thread it to.
  `hasRegisteredPathFallback` asked whether a path id is in the registry,
  `getFallbackBlueprintsForScenarios` collected a map of scenario to blueprint,
  `getFallbackCell` answered one cell by id, and `showsBlueprintFilters` in
  `src/types/nav.ts` said whether a slide shows the blueprint filters. Nothing
  called any of them: not a surface, not a hook, not a script, not the agent's
  tool definitions, not the generator, not a deployment-facing document, not a
  test. **None was kept**, because none had a reader to justify keeping.

  `getFallbackCell` took a field with it. `OfflineBoard.cellsById` was the one
  mutable field on a type whose every other field is settled when the board is
  built — a lazily filled cache of cells by id, built on the first call to the
  only function that read it. With that function gone the cache was a mutable
  field nothing wrote and nothing read, so the board is now settled in all of its
  fields, and `indexRegistry` has one fewer thing to say.

  The module's vocabulary is untouched and `getBlueprintFallback` still forwards
  to `getRawBlueprintFallback`: this is the deletion and nothing else. The lookups
  that do have callers — `hasBlueprintFallback`, `filterPathsForScenarioUi`,
  `getFallbackPathsForScenario`, `getRawBlueprintFallback`, `getBlueprintFallback`
  — are as they were, and the nav helper the deleted one leaned on,
  `getBlueprintScenarioId`, keeps its own caller in `src/lib/sliceCells.ts`.

  Four exports of the nav module are still without a caller, and stay: the
  post-to-pre loop arrow predicate, the integrated-slide predicate, the
  side-by-side predicate and the nav-order listing. They are not this deletion's
  subject — the integrated-slide predicate says in its own comment why it is kept
  as a named predicate while the layout is disabled, and the other three are a
  question about the overview and the filmstrip rather than about the offline
  board. `getSlideById` is exported with no importer but has five callers inside
  its own module. They are a follow-up, not silence.

  Nothing a person sees is different, and nothing shipped grows: the built main
  chunk is **2,073,831 bytes against 2,073,846 at the base commit**.

- 99a8906: The application's last guard that resolved a root from its own file asks the sweep

  The tokens guard sweeps the `commit` subject for prose that spells a registered
  custom property, and it used to hand that sweep a root it had computed itself —
  `resolve(dirname(fileURLToPath(import.meta.url)), '../..')`, two hops of path
  arithmetic that a file carries with it when it moves. It names no root now. The
  sweep's default is the tree the run is in, which is where `lib/sourceTree`
  takes the application's reading from too.

  `deploymentRoot.test.ts` was doing the same thing one hop up, to reach the
  build files it copies into a scratch tree and the `node_modules` it links
  beside them. It reads `process.cwd()` now.

  **No test module under `src/` computes a repository root from
  `import.meta.url`.** What remains there are reads of files outside the
  application — the authored figures, the generated schema, the migrations, the
  published references — each addressed relative to its own module rather than
  used as a root, which is a different thing and not this one.

  This SWAPS which opinion is trusted rather than simply deleting one, and the
  trade is worth naming: the old spelling was right whatever directory the runner
  started in, and the new one is right because the runner starts at the root. For
  a guard of the APPLICATION that is the only available answer — the application
  is a deployment's `src` laid over the package's, so a guard resolved from its
  own location inside `node_modules` would measure the package instead of the
  tree that installed it. The opposite spelling stays deliberately in
  `scripts/tests/every-sweep-knows-what-it-measures.test.mjs`, which measures the
  scripts of THIS tree and says why in its own header; nothing here disturbs it.

  The assertions are untouched. `scripts/sweep.mjs` is untouched too: it already
  answered this question, and a deployment holding it byte-identical has nothing
  to take.

## 1.44.15

**Three seams the third round left for later are closed.** The agent
session is one module the views ask — open session, draft and attachment
behind one interface, with deleting the open session a rule inside it rather
than a fallback in a component, and rename and delete covered before the
stores merged. The offline board is a value the deployment config provider
settles once and hands down a tree, so two providers each draw their own
board and no test resets a module. And the source tree is read once,
addressed by surface: the token model and the class reader take their files
from that reading, every guard that read the application as text asks it,
and the one guard that was really about what draws now renders its view.
Nobody opening a session, loading a board or running the suite sees a change;
the slices were green throughout with no assertion edited, and the built
chunk is byte-identical.

**Upgrading a deployment:**

- Nothing to take: no shared script changed.
- If a file of yours imported `src/lib/agent/panelState` or
  `src/lib/agent/attachments`, import the same names from
  `src/lib/agent/sessions`; `setOpenAgentSession(null)` is `closeAgentSession()`.
- If a file of yours called a fallback lookup (`getBlueprintFallback` and its
  siblings) or `configureSampleBlueprints`, the lookups take the board as
  their first argument — `useOfflineBoard()` in a component, or the value the
  provider settled — and the configure call is gone; `sample.blueprints` was
  always the way to hand a registry in and still is.
- A guard of your own that reads the application's source with a relative
  path may ask `src/lib/sourceTree.ts` instead; nothing requires it.

### Patch Changes

- 30262fe: One module reads the source tree, and the guards ask it questions

  Fifty-two test modules opened this tree with `readFileSync` and a path they
  built themselves — `resolve(__dirname, '..', 'components/editor/Foo.tsx')`,
  `join(process.cwd(), 'src/App.tsx')`, `new URL('../styles/blueprint.css',
import.meta.url)`. Each spelling is a second opinion about where the
  application is, written down where the tree cannot see it, so a file that moved
  edited the guards instead of being caught by them: the agent panel split had to
  change three of them, and the move was right every time — the guards were
  naming an address that no longer existed.

  `src/lib/sourceTree.ts` is the one answer to where the application is and what
  is in it. It asks `scripts/sweep.mjs` for the `app` subject once — the
  deployment's `src` laid over the package's, per path, the overlay the build
  applies — and answers by SURFACE: the paths and files of a named region
  (`editor`, `ui`, `styles`, `lib`, `app` for all of it), the text or bytes of
  one file addressed relative to `src`, and which surface a path is on. A guard
  names a file or a surface; it never names a root again.

  The refusal is the point. A guard that opens a path itself gets `ENOENT` and a
  path, which says the guard is broken and nothing about the tree. The reading
  has the whole listing in hand, so it says the useful thing instead: this path is
  not there, a file of that name is at THIS path now, and the surface it swept
  held this many files. `src/lib/sourceTree.test.ts` proves it over a scratch
  tree — a file is moved between two surfaces, and the reading reports it at its
  new path while the old one raises a refusal naming where it went.

  `tokenModel`'s two walks and `classList`'s sampling fold into it. The decision
  that one token model is the single style seam stands unchanged: the model keeps
  the parsing — what a declaration is, what the cascade says, who consumes a name
  — and takes its files from the reading, which also owns the comment blanking
  and holds the stripped sample, so a rule and its counterpart cannot be handed
  two samples of one file. `classLists()` takes a surface, resolving named
  class-list constants across the whole application whichever surface the sites
  come from. Both enumerations in `tokenDiscipline` still agree in both
  directions, and the second one is still independent: it decides for itself what
  a source file is, so the model cannot mark its own homework.

  Twenty-seven guards under `src/lib` now ask the reading instead of the
  filesystem. Two of them changed what they report, and both widened:
  `entityStatusContract` swept `src/data` flat and now sweeps the surface, naming
  an offender `data/foo.ts` rather than `foo.ts`; `writeFailures` states its three
  paths relative to `src`, as every other guard now does. No assertion was
  weakened, no sample narrowed. Nothing runs at runtime that did not run before:
  the reading, the model and the class reader are test-time modules with no
  importer the bundle can reach.

  Two things are deliberately left where they are. `overviewFlowArrowAnchor` reads
  `ServiceOverviewView.tsx` to assert about behaviour rather than about text, and
  belongs with the contract half of this pair rather than with a file-reading
  seam. And eight guards under `src/lib` read something that is not the
  application — the migrations, the published references, the generated schema,
  an installed package — so they go on opening it directly; the reading answers
  for the application and says so.

  **Eighteen direct readers remain outside `src/lib`**, in `src/`,
  `src/components/` and `src/styles/`. That is the contract half's starting line.

- afc417f: The agent session is one module the views ask, not three stores they reach around the panel for

  The agent panel's interface said five props, and behind those five props three
  module stores were written from below: `panelState.ts` held which session is
  open and the per-session composer draft, `sessions.ts` held the list, and
  `attachments.ts` held the one pending attachment. The chat view set and took
  the attachment itself. The two session dialogs renamed and deleted against the
  sessions store. And deleting the open session reached the panel not at all —
  it fell through a `?? null` in a component that had no way to know a session
  had gone.

  They are one module now. `src/lib/agent/sessions.ts` holds the four facts
  about one thing — the list, which one is open, what you were typing in it, and
  what is waiting to go with the next message — behind one interface, and the
  panel, the two views and the two dialogs read it and no other store about a
  session. Deleting the open session closes it, inside the module, and takes
  that session's draft with it: an id `crypto.randomUUID` minted never comes
  back, so a draft kept under one is unreachable by construction. The panel
  reads the open **session** rather than an id it would have to resolve against
  a list. The dialogs read no store at all — each reports its verb and its
  caller performs it, so the store has two writers where it had four.

  The four facts stay four variables rather than one state object, which is not
  tidiness: every hook here returns one of them and `useSyncExternalStore`
  re-renders on a changed _reference_. One object rebuilt per write would hand
  the session list a new snapshot on every character typed into the composer,
  and it would repaint; four variables mean the list's snapshot is the same
  array it was, and the notification costs a comparison.

  Nothing a person sees is different. Opening, sending, renaming, deleting and
  reopening a session behave as they did; persistence is untouched, and no
  persisted row shape moved. The rendered class, `aria-` and `data-` attribute
  sets of all four touched views were hashed across seven states before and
  after, and match string for string.

  What was missing is now there: rename and delete had no test, and the
  end-to-end slice that covers this flow never performs either. They have one
  at the module's own interface, landed before the stores merged and watched go
  red on a delete that writes the list back unchanged — and the rule about the
  open session has its own case, which asserts the open **id** rather than the
  hook, because a hook that resolves an id against a list reads empty whether
  the rule is there or not.

- 50f17ba: Every guard of the application asks the reading, and the anchor guard renders

  The expand half put `src/lib/sourceTree.ts` in place and moved the guards under
  `src/lib` onto it. This is the contract: the eighteen test modules that still
  opened the application with `readFileSync` and a path they built themselves —
  `resolve(dirname(fileURLToPath(import.meta.url)), '../..')`,
  `join(process.cwd(), 'src/components/editor/SliceSlideComposer.tsx')`,
  `new URL('./bootstrap.ts', import.meta.url)` — now name a file or a surface and
  let the reading say where it is. **Direct readers under `src/`: 27 before, 9
  after.**

  No guard of the application pins its own root any more. The per-guard path
  helpers are deleted with the paths: `rawSource` in the slice/presentation and
  canvas panel ladders, the local `sourceOf` in the editor shell ladder, `src` in
  the panel loading contract, and the four hand-written tree walks — `citations`,
  `deploymentOwnedContent` (three of them), `definitionCard`, `labelVocabulary` —
  which are now the reading's own listing. The stakeholder reader keeps a `read`,
  but it is a surface prefix over `sourceOf` rather than a root of its own.
  `definitionCard`'s walk had its own comment stripper; it takes the reading's
  stripped sample, so it and every other text rule are handed one text of a file
  rather than two.

  Deleting the two `rawSource`es left `uncommentedLeading` written twice, byte
  for byte — the copies had been kept apart only by each closing over its own
  reader. It moves to `lib/classList.ts`, beside the other reading of a class
  list, and both ladders ask it. `aliasVocabulary` came in with them: it asked
  `readdirSync` of a `../styles` it resolved itself whether `compat.css` was
  gone, and asks `hasSource('styles/compat.css')` instead — a question that
  survives the stylesheet surface moving, and one the `readFileSync` count could
  never have caught.

  The nine that remain read something that is **not** the application, which is
  the line the reading draws: `lib/agent/tools/references` and
  `lib/agent/tools/serviceScope` (the generated rulebook and adapter),
  `lib/authoringErrors` (the generated schema SQL), `lib/backend/schemaVersion`
  (the published IR schema and a migration), `lib/cellResources` and
  `lib/storageKeyPolicies` (migrations), `lib/panelSheetSnapContract` and
  `lib/tailwindColorReset` (installed packages), and `deploymentRoot`, whose
  subjects are the scratch trees it stages, the `dist` it builds and the authored
  figures under `docs/`. `deploymentRoot`'s two reads that WERE of this
  application — the class names the markup writes, and the residents the package
  must hold at the same paths — moved onto the reading; the rest stay.

  `overviewFlowArrowAnchor` no longer reads `ServiceOverviewView.tsx` and counts
  its call arguments. It renders the board inside the application's own provider
  tree with a loaded nav whose first phase is not the sample's, and asserts the
  anchor attribute lands on the phase the reader is looking at. That is the
  defect it was written for, observed instead of inferred: point the call at the
  sample and the assertion fails on the phase id, where the text version could
  only fail on a spelling.

  Three guards changed what they REPORT, and all three toward the one spelling:
  an offender is stated relative to `src`. `vendoredDivergence` names
  `components/ui/foo.tsx` where it named `ui/foo.tsx`, `labelVocabulary` names
  `components/blueprint/Foo.tsx` where it named `blueprint/Foo.tsx`, and
  `definitionCard` names `components/…` where it named `src/components/…`.
  `citations` already spelled its findings that way and is unchanged.

  Two guards changed what they SWEEP, and neither narrows.
  `deploymentOwnedContent`'s content roster reads the `content` and `data`
  surfaces rather than each directory's top level, so a module added in a
  subfolder is in scope on the day it appears; neither directory has one today.
  `labelVocabulary` already recursed — what changed is the reach of its
  exemption: it skipped ANY directory named `ui` at any depth and now skips the
  `ui` surface, which is `components/ui`. No difference today, because there is
  no nested `ui`, and the surface is the thing the component CLI actually owns.

  And `definitionCard`'s walk used to skip a file that vanished between the
  listing and the read; the reading refuses instead, which is the rule the expand
  half stated — a sample that quietly lost a file passes every rule over it.

  No sample was narrowed: every converted guard measures the same tree as the
  walk it replaced. One assertion is replaced rather than kept — the anchor
  guard's count of `ServiceOverviewView.tsx`'s call arguments, which stood in for
  the behaviour the render now observes directly. There is one call site, and the
  render fails on it. Nothing runs at runtime that did
  not run before: the reading is a test-time module with no importer the bundle
  can reach, and the built chunk is byte-identical to the build at the base
  commit.

- 2643987: The offline board is a value the provider hands down, not a slot it writes while rendering

  `data/blueprintFallbacks.ts` kept the settled registry in a module-level
  variable. One writer — `DeploymentConfigProvider`, inside a memo, during its
  own render — and every lookup reached for that variable while it drew. The
  comment defended the render-time write as idempotent, and for one provider in
  one tree it was. What it never covered is the second occupant: two providers
  share one slot and the last render wins, a render React abandons still writes,
  and ten of the twelve test modules that mount the provider never put the slot
  back, so a board could outlive the file that built it.

  The registry now becomes an `OfflineBoard` — the same lookup tables, built once
  over a registry and handed back as a value. The provider builds one and puts it
  on a context beside the config; `useOfflineBoard()` is what a surface reads, and
  every lookup takes the board as its first argument. Readers with no hooks above
  them — the nav model, the slice scan, the blueprint resolver, the agent's
  no-database reads — take it from whoever called them, which for a tool call is
  `ctx.offlineBoard`, handed down from the panel the way the scope and the roster
  already are. Outside a provider the context answers the package's own board,
  which is exactly what the module variable held before anyone wrote to it.

  Nothing a person sees changes: the bundled sample and a deployment's board draw
  the same cells they drew, `sample.blueprints` takes the same registry or loader
  and still resolves once before the board draws, and the generator's
  `--registry-out` / `--nav-out` output is untouched. What changes is that a board
  belongs to a tree — proven by two providers with two registries drawing their
  own boards side by side — and the `afterEach` resets are gone.

  No deployment-facing export changed: `SampleBlueprintRegistry` and
  `SampleBlueprintRegistryLoader` are still the package's only exports here, and
  they are unchanged. `configureSampleBlueprints` is gone, but it was never
  exported from the package entry.

## 1.44.14

**Five things the template said six times are said once.** The third
architecture round lands whole: the selected cell's facts are resolved by one
lookup and read by three narrow readings; the cell's four surfaces wear the
panel header the other five panels already wore, with a trail that collapses
its middle; the three annotation bars and three marks are one bar and one mark
over a table of what each kind declares; the six spec-level writes declare
their half of one shared write; and every check script hands its verdict to
one module that renders the four outcomes and sets the exit code one way.
Nobody editing a cell, drawing a mark or saving a spec sees a change — each
slice was green before the first move and after every one, with no assertion
edited — and every check's green line is byte-identical.

**Upgrading a deployment:**

- Take `scripts/verdict.mjs` and the six shared checks that now import it
  byte-identical: `check-glossary-only`, `check-harness-claims`,
  `check-negation-ratchet`, `check-pointers`, `check-router-budget` and
  `check-target-schema`. Your shared-scripts guard names them; a check of your
  own may keep its exit as it is, or return a judgement and let the module
  render it.
- If a file of yours imported a deleted module — `CellDetailBreadcrumb`, any
  of the three `Annotation*StyleBar`s or the three `*AnnotationNode`s — import
  `cellDetailCrumbs`, `AnnotationStyleBar` or `AnnotationMarkNode` instead;
  the per-level spec mutation modules keep their names and exports.
- An empty crumb trail now draws no breadcrumb landmark; a browser case of
  yours that waited for one on a loading panel should wait for the panel.

### Patch Changes

- 78c416d: The three annotation style bars and the three annotation marks are one bar and
  one mark over a table of what each kind declares. A person styling, drawing and
  dragging marks sees no change, here or anywhere: the text mark's width floor,
  which was 80 in the layer and 120 in the mark, is one constant read in one
  place now — the 120 the screen already drew — and the 80 turns out to have been
  a number nothing read, since a drag takes only a position and a text resize
  scales off the height.
- 2ab53fa: One module answers what a check concludes.

  `scripts/sweep.mjs` was already the first half of every check — name a Subject,
  receive its files. Nothing was the second half, so each check carried its own
  is-main guard, its own empty-subject rule, its own summary and its own exit, and
  the exits had drifted into two incompatible styles. `scripts/verdict.mjs` is
  that half, once: a check returns its findings and the count of what it examined,
  and the module renders the four outcomes and sets the exit code one way. Every
  check's green line and every finding is unchanged to the byte — the module
  renders and never composes the wording. What does change is the two bespoke
  empty-subject messages, which are now the one shared message and the one shared
  register.

  `scripts/verdict.mjs` is published as a shared script. A deployment that holds
  these checks byte-identical will take the module with them on its next pin; the
  shared-script list names it, and the closure rule carries it there.

- 9c5a790: The cell panel's facts are resolved once and read three narrow ways

  One hook derived sixteen values about the selected cell and handed the whole
  object to three readers whose slices barely overlapped: twelve of the sixteen
  keys were read by exactly one reader, a reader's prop type said nothing about
  which of them it used, and the path's board was looked up again in seven of the
  derivations — one fact with seven origins and no single place to be wrong in.
  No test imported the module at all, which is how a sixteen-key interface grows
  without anybody noticing the shape.

  `useSelectedCell` is now that single place: it finds the board once, picks the
  cell out of it, identifies the lane, walks the dependencies, and resolves the
  three things the readings wanted from the selection — the clicked touchpoint,
  the column, and where the cell sits. `useCellPanelFacts`, `useCellOverviewFacts`
  and `useCellTabsFacts` each take that resolution and nothing else, one per
  reader, and each names only what its reader reads — the drawer takes the cell's
  position, the board it routes a click through and its dependency endpoints, the
  overview takes the placement and the featured links, the tab row takes the
  dependencies and the two lists its Resources tab renders. A reading handed the
  whole selection could still have reached the clicked placement through
  `paths[0].touchpoints`, which is the interface widening back by a second door;
  taking one argument closes it.

  The breadcrumb takes the path entry's own type rather than reaching into the
  facts type for it, and `BlueprintLaneLike` — exported, imported nowhere — is
  gone. The types the split introduced are exported only where something imports
  them, so the same smell does not come back under new names.

  Nobody opening, editing, saving or reverting a cell sees a change. This is a
  pure refactor, and the instrument says so: `npm run slice:cell-edit` was green
  before the first move and after every one of them, with no assertion edited,
  and the tests over `src/components/blueprint` are unchanged. What is new is the
  unit tests, which read each reading through its own interface and assert its
  key set as well as its values — a tab row that could reach the clicked
  placement is the wide interface growing back, and the key-set case says so
  before the values ever disagree.

- e690021: The cell surfaces wear the header the other five panels already wore

  `panelShell.tsx` has drawn the entity panels' header since the shell was
  lifted out of the cell panel, and the cell panel never started wearing it. Its
  details, draft, empty and differences surfaces each wrote the drawer header's
  class list themselves, each wrote the ✕ — the tooltip, the ghost button, the
  icon, the label — and the cell's trail was a second crumb loop beside the
  shared one. Five copies of a close button is how one of them ends up a size
  larger or stops saying what it closes, and the two crumb loops had already
  drifted: the cell's ancestors truncated with no way to read the whole name
  back, which the shared trail has always offered on hover.

  `PanelHeader` draws all of it now, for all six subjects. It learned a crumb
  that collapses to an ellipsis — the cell's four names do not fit the panel's
  width, and the step is the one the reader came for — so the cell's trail is
  the trail every other panel draws, built by `cellDetailCrumbs.ts` where a
  component used to draw one. It learned three more things, each naming a
  difference a surface actually has: a title and a description that are shown
  rather than read out (the draft's "New cell" and the placement line under it),
  the differences surface's bordered band, and the row the widen toggle shares
  with ✕.

  Nobody opening, drafting, comparing or closing a cell sees a change. The
  instrument says so: `npm run slice:cell-edit` was green before the first move
  and after every one of them, with no assertion edited, and the 301 tests over
  `src/components/blueprint` are unchanged — five cases read the new header
  beside them. Each surface's rendered class, `aria-` and `data-` attribute set
  was hashed before and after and matches, with two differences recorded rather
  than hidden. The cell's trail now writes `font-normal` on its list and
  `shrink-0` on its first separator — two utilities the entity panels' trail
  already wrote, each a no-op where it lands, and the drift that made two
  nearly-identical headers worth reading twice. And a trail with no crumbs left
  in it draws nothing rather than an empty breadcrumb landmark, which the
  service panel always reserved and the other four reserved while loading: a
  landmark that tells a reader nothing is worse than no landmark.

- 71aded4: One spec write, six declarations. Cell, lane, phase, scenario, service and step each re-derived the same six-step write rule — normalise, update, translate the failure, require rows, invalidate, record the inverse — comments included, and two of the six had a test. The rule now lives in `src/lib/specMutations.ts` and a level declares what is genuinely its own: its table, the column the write is addressed by, the columns a spec may touch and how each is normalised, what the change makes stale, and the shape of the inverse the ledger carries. Nothing a person editing a spec can see changes, and every level's write is now recorded row by row and ledger entry by ledger entry.

## 1.44.13

**A seam nobody crossed is gone, and the browser walk chooses its own port.**
The repository interface and its two hypothetical adapters, which no runtime
call dispatched through, are deleted; the identity and tier readers keep their
callers from a home that says what they are, and the adapter contract states
the operations in prose. The render walk's runner now picks a free port per
run and refuses a held one by name, so two walks on one machine never assert
against each other's build. Also corrected: the mobile-shell document named
the sidebar primitive's constant as the shell gate; the shell forks on its own
hook's query.

**Upgrading a deployment:**

- Nothing to take. If a file of yours imported `src/lib/backend/ports` for the
  `Tier` type, import it from `src/lib/identity.ts`; the adapters and the
  conformance suite have no replacement.
- `npx render-walk` needs no port from you; set `RENDER_WALK_PORT` only to
  pin one, and expect a refusal if that port is held.

### Patch Changes

- 61896c1: The backend ports are deleted; the identity and tier readers stay

  The application declared a repository interface — one port per aggregate,
  guarantees and round trips annotated per operation — and nothing ever
  dispatched through it. The two implementations behind it were a read-only
  fixture over the bundled sample and an in-memory store, and the conformance
  suite that held them equivalent proved two hypothetical stores equal to each
  other and to nothing that ships: the live call sites talk to PostgREST
  directly. A seam no caller crosses is a description of an architecture rather
  than an architecture, and this one had begun to be cited as though it were the
  contract.

  So the port types, both adapters, the two conformance levels as code and the
  suite are gone. What actually varies between this template and a deployment is
  the database type (`src/types/database.ts`, generated from the migrations and
  re-checked by CI); the portable core is the contract and
  `references/adapter-contract.md` is where the operations a backend must answer
  are now stated, in prose, with their guarantees intact.

  The identity and tier readers stay, in a home that says what they are:
  `src/lib/identity.ts` carries the `Tier` vocabulary and `readTier`, which asks
  the database `is_service_account()` rather than inferring the tier from a JWT
  claim. `src/contexts/SupabaseProvider.tsx` calls it exactly as before.
  `src/lib/backend/schemaVersion.ts` stays where it is — it is the TypeScript
  half of the version list `references/ir-schema.json` owns, held equal by its
  own test.

  **A deployment that imported the ports**: none is known. This is a patch
  because semver here is scoped to the plugin contract — the identifier lane —
  and refactoring the template app is outside it however much of it moves; a
  consumer forks that surface and takes the change as a visible merge conflict.
  The package's `exports` do carry `"./*"`, so these files WERE reachable by
  subpath; a deployment that imported `src/lib/backend/ports` for the `Tier` type
  imports it from `src/lib/identity.ts` instead, and one that imported the
  adapters or the conformance suite has no replacement in the template and should
  vendor the deleted files from the previous tag — the honest answer for code
  that was a hypothetical seam here too.

  `Tier` loses its `authoring` member on the way. Nothing produced it and nothing
  branched on it: a backend that had answered it would have been read as writing
  nothing, so a backend that draws that line answers with the writing tier and
  enforces the narrower one itself.

- 73175bf: The render walk chooses a port nothing holds, and refuses one you named that is held

  The walk previewed on a fixed 4173, so the port was a thing only one tree on a
  machine could use. A second checkout walking at the same moment, or a preview
  somebody left running, held it — and the run that found it held aborted, a red
  that reads like a regression in the application and is a fact about somebody
  else's shell.

  `render-walk/run.mjs` now decides the port before Playwright starts: 4173 if
  nothing is listening there and no other walk has claimed it, otherwise the next
  free port above it, up to 4204. Two walks started together take 4173 and 4174
  and each walks its own `dist`. The choice is passed on as `RENDER_WALK_PORT`,
  which is the config's own override, so nothing new crosses that seam; the
  constant in `playwright.config.ts` is now the fallback for the one path the
  runner is not on, Playwright pointed at the config by hand.

  A port is claimed as well as tested, because free is not yet taken: between the
  test and the moment Vite binds there are a couple of seconds of Playwright
  starting up, and two runs launched together would otherwise both believe the
  same port is theirs. The claim is one atomic file create under the temporary
  directory, removed on the way out, and one left by a killed run is taken over
  rather than believed.

  `RENDER_WALK_PORT` still names a port outright and is the one fixed port left
  in the arrangement: if something is already listening there the runner refuses
  by name, says how to find out whose it is, and starts nothing. Nothing is ever
  reused — what is already on a port is another build, and a green walk over it
  would be a statement about code that is not in the working tree.

  A deployment needs no free port of its own and no change to enrol.

## 1.44.12

**The package owns the claims for the files it ships, and a deployment's
offline board can stay out of its production bundle.** Two follow-ups the
first deployment's enrolments surfaced: every pin that added a module turned
the deployment's composition-claims check red for files it never touched, and
a supplied offline board rode in every build. Now the ten composition
documents live here with claims for every assembled file, one shared check
runs in both trees and overlays documents per name, and `sample.blueprints`
takes a loader so the registry lands in its own chunk.

**Upgrading a deployment:**

- Delete your `docs/guidelines/composition/` documents and your own claims
  check; take `scripts/check-harness-claims.mjs` byte-identical, add
  `composition: { documents, claimed }` to `scripts/repo-config.mjs` naming
  the trees you still assemble yourself (or `claimed: []`), and keep only a
  document for those. Repair inbound links that pointed at the deleted
  documents; the customization reference says how prose is overridden.
- Hand `sample.blueprints` a loader — `() => import('./data/sampleBlueprints')
.then((m) => m.SAMPLE_BLUEPRINTS)` — and the registry leaves your main
  chunk; the eager value keeps working.

### Patch Changes

- 8a00e4e: The package claims the files it ships: the composition documents, and the
  claims check that reads them, are here now.

  `docs/guidelines/composition/` — ten documents, one per assembled surface, each
  carrying a `claims:` list — and `scripts/check-harness-claims.mjs`, which holds
  those lists against `src/components/{blueprint,editor,cover,mobile}` in both
  directions. It runs in this package's own CI as `npm run check:harness`, so a
  module added without a document is red here, in the repository that added it.

  **For a deployment that already runs a composition-claims check.** The claim for
  a file is now written where the file lives, which is the whole of what changes:

  - **Delete** every composition document of yours that claims files under
    `src/components/…`, and delete your own copy of the check. Those files are
    this package's, and this package's documents claim all of them; a document you
    keep under a name this package also ships REPLACES ours for that surface,
    claims included, which is the supported way to disagree with our prose.

    **Check what links to them before you delete.** These documents are usually
    linked from an index, a codebase guide, a standards document and the root
    README, and those links are relative paths into your own tree — the prose they
    point at now lives inside `node_modules/`, where a relative link cannot reach
    it. Your pointer check and your generated index will go red on the same day.
    Two answers, both fine: keep the documents and accept that yours override ours
    by name, or re-point the links (an index row naming
    `docs/guidelines/composition/overview.md` in this package is the shortest
    landing place) and delete.

  - **Keep** a composition document for each tree of assembled files you hold
    outside this application, claiming those files. Name those trees in
    `composition.claimed` in your `scripts/repo-config.mjs`, beside
    `composition.documents`, which is where your composition folder is.
  - **Hold** `scripts/check-harness-claims.mjs` byte-identical from this package,
    the way you already hold `sweep.mjs`, and point `check:harness` at it. It
    reads your composition folder and this package's underneath it.

  `composition.documents` has to name the folder this package publishes, not a
  folder of your choosing: it addresses both your documents and ours, and an
  installed package that holds nothing at that name is reported as exactly that
  rather than as two hundred unclaimed files.

  An upstream module that no document of ours claims is an upstream bug — report
  it, do not write the claim. Our own build fails on it before the tag is cut,
  which is the whole of why your build no longer has to.

  A deployment with no assembled files of its own sets `claimed: []`, keeps no
  composition folder, and pins a release that adds thirty-one modules without
  writing a line. `references/customization.md` § Composition claims is the whole
  recipe.

- ce7c0dc: `sample.blueprints` takes a loader, so an offline board rides only in the builds that draw it

  A deployment's offline board is the largest value it hands the config — around
  1.2 MB of cells for an export of a real board, roughly 140 kB gzipped — and it is read on one
  condition, `isBundledSampleActive()`. Handed over as a value it was reachable
  from the config module, so every build carried it, including the production
  build with a database where nothing ever asks for it.

  The field now takes either the registry or a
  `SampleBlueprintRegistryLoader` — `() => import('./data/sampleBlueprints').then((m) => m.SAMPLE_BLUEPRINTS)` —
  and a loader's only reference to those bytes is inside a dynamic import, which
  is a chunk boundary to every bundler. `DeploymentConfigProvider` calls it only
  when the bundled sample is reachable, and awaits it before rendering the tree
  below, because the board reads the registry while it draws. A loader that
  rejects throws rather than falling back to the template's own board, which
  answers a deployment's identifiers nothing — the provider is outermost, so that
  surfaces as a blank page and a console error unless the host supplies a
  boundary above `App`.

  The eager form is unchanged and needs no migration.

## 1.44.11

**The three large components are split, and their slices said nothing moved.**
ADR 0017 held the annotation layer, the cell detail panel and the agent panel
unsplit until each flow had an end-to-end instrument; 1.44.10 lifted the hold,
and this release does the three splits as pure refactors — the layer from
2229 lines to 943, the panel from 1481 to 537, the agent panel from 1462 to
60 — with every slice run before the first move and after every one, no
assertion edited, and no class, attribute, aria label or test id changed. The
fourth change lets a deployment name the offline board it supplies by package
name, with the generator writing both halves for a tree that has no `src`.

**Upgrading a deployment:**

- Nothing to take: the splits are internal to the package and the overlay
  resolves the new modules like any other. A deployment that held a resident
  copy of any of the three files would keep the old one; none does.
- A generated registry or nav module can now import
  `SampleBlueprintRegistry`, `NavItem` and the board's shapes from
  `uno-blueprint`; `scripts/generate_fallbacks.py --registry-out
… --nav-out …` writes both halves as standalone modules outside `src`.

### Patch Changes

- e099551: **The agent panel is a state machine and nine modules, and the slice says
  nothing moved.** `src/components/editor/AgentPanel.tsx` held the sessions list,
  the chat view with its transcript rows, tool rows and folded step blocks, two
  dialogs and the ⚙ rail button around one session state machine — 1462 lines and
  twelve `useState` calls. It is 60 lines now, with none: what is left is which
  session is open, the persistence the panel attaches, and the choice between the
  two views. Everything else is a module under `src/components/editor/agent/` —
  `AgentSessionsView`, `SessionRow`, `ChangeCount` with the hook behind it,
  `AgentChatView`, `TranscriptRow`, `TranscriptStepsBlock`, the React-free
  `transcriptBlocks` that decides which rows fold, `SessionDialogs`, and
  `AgentSettingsRailButton`.

  A person sees nothing: opening the panel, starting a session, sending a
  message, reading a tool row, renaming and deleting sessions are the same
  components in the same order, with the same classes, labels and test ids. What
  crosses each new seam is the session, the events and the callbacks — no prop
  was invented, and no persisted row shape changed.

  **The instrument is the reason this was a safe change to make.** `npm run
slice:agent-session` was run before the first move and after every one of them,
  and it passes with no assertion edited, including the transcript read back out
  of `agent_messages` after the panel is closed and reopened. The agent harness
  smoke is unchanged. Three guards that read the panel BY PATH were re-pointed at
  the modules the code moved into — the monospace register roster and the
  editor-shell type ladder, whose batch also learned to read the panel's own
  folder one level down, so the surface it used to assert about is still
  asserted about.

  ADR 0017 records the outcome under its hold-lift amendment: this is the first
  of the three held components to be split, and it is the one whose slice landed
  first.

- e039639: **The canvas annotation layer is split, and a person drawing, dragging,
  resizing, styling and capturing marks sees no difference.**
  `src/components/editor/CanvasAnnotationLayer.tsx` was 2229 lines holding four
  unrelated jobs at once: the pointer, drag, resize and selection machine; three
  floating style bars; three annotation node components; and the geometry every
  one of them divides by. It is 943 lines now, and it holds the machine and the
  composition alone.

  The pieces sit beside it, which is how this tree names a split module — the
  geometry in `canvasAnnotationGeometry.ts`, the pickers in
  `CanvasAnnotationSwatches.tsx`, the corner grips in
  `CanvasAnnotationResizeHandles.tsx`, the bars in
  `AnnotationShapeStyleBar.tsx`, `AnnotationStickyStyleBar.tsx` and
  `AnnotationTextStyleBar.tsx` over a shared `CanvasAnnotationBarChrome.tsx`, and the nodes in `ShapeAnnotationNode.tsx`,
  `StickyAnnotationNode.tsx` and `TextAnnotationNode.tsx`. The textarea focus
  hook every editable node wanted is in `src/hooks/` with the rest of them.

  The one thing that is not a move: the plate the three bars float on was
  written out three times, and all three copies had to agree on the anchor
  arithmetic and on the two attributes the layer's own click-outside rule looks
  for. It is `AnnotationStyleBarFrame` now, one element with the same
  attributes, classes and handlers it had in each of the three.

  **This is the first split ADR 0017 held back, and the record was the point.**
  The hold was lifted when the annotation-drag slice and the browser drag case
  landed; both were run before the first move and after every move since, on the
  same assertions, and no assertion was edited anywhere in the suite. One test
  file changed and it is not one of theirs: `tokenDiscipline.test.ts` pins its
  colour exemptions to a path, and the line-style preview swatch the layer's
  exemption was written for is in `AnnotationShapeStyleBar.tsx` now, so the entry
  follows
  it. That list refuses an exemption matching no offender, which is how the move
  announced itself. What the interface between the
  layer and a node is — `MovableProps` — was already the interface; the split
  wrote it down. No new prop reaches the layer from outside it. The ADR carries
  the outcome.

- 98a6ebf: **The cell detail panel's body is nine modules, and the cell-edit slice says
  nothing moved.** The panel was 1481 lines, of which 1258 were one function:
  the read-only rows, the form over the cell fields, the specs, the
  dependencies, the resources, the three other surfaces the same drawer can
  show, and the save, all in the order they happened to be written. A person
  looking for what a cell IS had to read past what the drawer DOES.

  It is 553 lines now. `cellDetailFacts.ts` answers one question — given a
  selection (or a draft) and the boards in memory, what is there to show — and
  answers it once, for everybody: the connections, the lane, the placement and
  its reading, the arrows a cell owns and the ones it may point at, the
  storyboard strip. `CellDetailOverview.tsx` takes those facts and renders the
  top of the details surface, with the dozen readings it depends on beside it
  rather than a hundred lines above. `CellDetailTabs.tsx` owns the three tabs.
  `CellDetailBreadcrumb.tsx` says where the cell sits. Differences, a draft cell
  and nothing-selected are each their own module, because they are siblings of
  the details view and not stages of it. `PanelSurfaceSwitcher.tsx` and the
  panel's agent commands come out with them.

  What stayed in the panel is the drawer, which is the thing the panel is: which
  surface is showing, how wide it is, what closes it, and the one footer that
  every Save in it portals into.

  **No behaviour changed, and the instrument is the reason that is a claim
  rather than a hope.** `npm run slice:cell-edit` ran before the first move and
  after every one of them, green each time with no assertion edited, as did the
  285 tests over `src/components/blueprint`. No class, no `data-` attribute, no
  aria label, no test id. The one save still writes the same columns in the same
  shape, and every section that derived its fields from `src/lib/cellFields.ts`
  still derives them from there.

  This is the first of the three splits ADR 0017 held, and that record gains its
  outcome line. The annotation layer and the agent panel are still to do.

- a3a7ae4: **A deployment can name the offline board it supplies.** `sample.blueprints`
  has always taken a `SampleBlueprintRegistry` and `sample.nav` a `NavItem[]`,
  and the package index exported neither. The only spellings left were a path
  into `src/data/…`, which exists in a tree that has its own `src` and in no
  other, or rebuilding the shape out of `DeploymentConfig` by hand —
  `NonNullable<NonNullable<DeploymentConfig['sample']>['blueprints']>`, which is
  what the first deployment to supply a board actually wrote (#771). Both are
  exported now, with `SlideViewType` beside the nav and the board's own shapes
  under the registry — `BlueprintData` and the `BlueprintPath`, `BlueprintLane`,
  `BlueprintStep`, `BlueprintCell`, `BlueprintCellDependency`, `CellTouchpoint`,
  `CellResource` and `ResourceKind` it is made of, because annotating a whole
  generated board needs only the first and writing the function that builds one
  needs the rest. Types only — the registry is handed to the config, never
  registered by a call, so the lookups it feeds stay internal.

  **`references/customization.md` § The offline board is two fields showed an
  import nobody outside this repository could write.** Its example read
  `PACKAGE_SAMPLE_BLUEPRINTS` out of `./data/blueprintFallbacks`, a relative path
  into a `src` a deployment does not have; the deployment reading that page is
  the one reader who cannot follow it. The example is a consumer's now — types by
  package name, content from the deployment's own generated modules — and the
  page says where those modules go and what their first lines import.

  **`scripts/generate_fallbacks.py` can generate for a deployment's tree, not
  only for this one.** `--register` rewrites marker blocks inside
  `src/data/blueprintFallbacks.ts` and `src/data/sampleNav.ts`, which a
  deployment has no copy of; it refused an `--out` outside `src/` and had nothing
  else to offer. `--registry-out` and `--nav-out` write the two halves as
  standalone modules that name their types by package name, and the generated
  data module beside them names `BlueprintData` the same way, so a deployment's
  own files carry no `@/…` path at all. The two flags are required together,
  because the nav lists the scenarios and the registry draws them and one without
  the other is rows over an empty canvas; they are refused alongside `--register`,
  which generates for a different tree; and an `--out` under a `src` is refused,
  because a deployment that grows one captures every `@/…` import the application
  makes of itself.

## 1.44.10

**The first deployment enrolled in 1.44.9, and this release is what it found.**
The deployment this template was generalised from took the 1.44.9 pin and ran
every published instruction;
seven of them were wrong or short, and each is fixed here at the source rather
than worked around there. The rest of the release is the two flows ADR 0017 was
still holding — an agent session and the annotation drag — each now a CI slice,
so the hold on all three large-component splits is lifted; one real bug the
browser walk shook out (Escape on a mark also zoomed the board out); and a
tool description that taught the dependency direction backwards.

**Upgrading a deployment:**

- Run the browser walk as `npx render-walk` (a published bin that stages the
  walk out of `node_modules`, since neither Playwright nor Node compiles
  TypeScript there); delete any staging script of your own. Supply the offline
  board's content beside its nav — `sample: { nav, blueprints }`, both from one
  `scripts/generate_fallbacks.py --register` run — or the walk has no board to
  find.
- A harness that bundles the tool definitions imports `viteImportsPlugin` from
  `uno-blueprint/vite-imports` instead of carrying a `?raw`
  loader of its own.
- `check:database-types-superset` now reads your `types/database.ts` as the
  declaration of your database: tables you never migrated are information,
  `string` for a vocabulary the package narrows passes, a missing column on a
  shared table still fails. Wire it into your CI.
- Take `vite.config.ts` byte-identical again (it asks for `import.meta.dirname`
  now, and the Vite warning is gone). `scripts/tests/authoring-log.test.mjs` and
  `scripts/authoring-archivers.mjs` join the shared list; enrol both. If you
  hold a copy of `both-kinds-read-source-first`, take the widened pattern.

### Patch Changes

- 885778b: **`scripts/tests/authoring-log.test.mjs` spells its fixture series where no
  tree claims it, so a deployment can enrol the file.** The suite built the
  sweep's shape out of `21000101000000_one.sql` and `21000102000000_two.sql`,
  which read as members of a migration series — and the two repositories do not
  share one, so a member of either resolves in at most one tree. The gate that
  decides whether a deployment may hold a shared file is line-based over bytes
  and cannot tell a fixture from an address, so the file sat byte-identical and
  unenrolled. The members are now spelled under `notes/`, the way the router
  suite's fixture paths are, and the header says why.

  The test and `scripts/authoring-archivers.mjs`, every line of logic it reaches
  through a relative import, join the published shared list, so the same fence
  that keeps a `docs/` path out of the other eleven now holds over these two.

- 644568d: **An agent session now runs end to end on every pull request, from the panel a
  person types into down to the row in the database.** #694 drove the loop from a
  fake provider through a tool to its result in a node test. What no test had
  seen is the PANEL: whether a person who opens the agent surface, starts a
  session and sends a sentence gets the turn, the tool row and the result on
  screen; whether the write the agent makes is attributed where a reviewer reads
  attribution; whether the conversation survives closing the session.

  `npm run slice:agent-session` (`src/slices/agentSession.slice.test.tsx`) asks
  all three. It renders the real `AgentPanel`, clicks ＋ for a new session, types
  into the composer and presses Send. The loop is the real `sendToAgent`; the
  model is the scripted provider adapter #694 introduced, so there is no network
  and no key beyond the string that unlocks the send. The script calls one read
  tool and then one write tool — `get_cell`, then `update_cell` — over the real
  definitions, the real one save, and the real content and spec mutations.

  Then it reads everything back. The transcript renders the person's message,
  the narration between the calls and the answer; each tool row discloses the
  arguments the agent sent and the tool's own sentence back. The row holds both
  halves of the edit and nothing else moved. The ledger holds one entry per write
  path, each wearing that session's agent attribution, and the real
  `SessionChangesSheet` shows a ✦ per row. Both reverts from that sheet put the
  row back column for column. And the transcript READS BACK from the persisted
  rows after the panel is closed and reopened: the slice checks the close really
  emptied the screen, forgets the in-process run, and lets the reopen hydrate
  `agent_messages` the way a session reopened in another browser does — then
  asserts what those rows carry (the message, the narrations, the answer, the
  tool names) and what they do not (the tool row's arguments and result, which
  are stripped before persisting).

  **It has been watched go red, twice, and both reds are cases in the file.** One
  drops a written column the way a forgotten grant does: the tool still reports
  success, the panel still shows the row green, and the read-back no longer
  holds. The other mocks the one module that hands a tool its session into
  running the write unattributed: the write still lands and the panel still says
  so, and the ledger's author, its session id and the sheet's ✦ all go. What the
  in-memory table cannot see — a grant, a policy — `check:seed-load` asks the
  real database for every column this flow writes, and the cell-edit slice's
  PostgREST form asks of the same two writes.

  `src/test/inMemoryDatabase.ts` grew `upsert`, `delete` and a numeric-aware
  `order` to answer it, generically: the agent panel's transcript write-through
  is real here, so one `agent_messages` row per event — ordered by its numeric
  `seq` — is what the reopen reads back.

  This is the per-flow exit condition ADR 0017 names for
  `src/components/editor/AgentPanel.tsx`, and it unblocks that file's split.

- a9b72b2: **Escape on a selected or editing annotation no longer also returns the canvas
  to the overview.** The annotation layer cleared the mark's selection or editor
  on Escape without claiming the key, so the canvas's own Escape — the animated
  return to the overview — fired on the same keystroke whenever the editor's
  textarea had not yet taken focus, and the board zoomed out from under a mark
  the person was still working on. The layer now calls `preventDefault` when the
  Escape is its to handle, which is the signal the canvas handler already waits
  for.

  The browser walk's annotation-drag case met the same race one run in six —
  its Escape landed before the new mark's editor had focus, the board zoomed
  out, and the drag that followed pressed on empty canvas. It now waits for the
  editor to be focused before dismissing it, and for the capture menu to close
  before handing the page back; watched pass twenty runs in a row.

- 0ea8a6e: **The annotation-drag flow has a CI slice and a browser case, and the annotation
  layer's split is unblocked.** `src/slices/annotationDrag.slice.test.tsx` opens
  annotation mode from the real toolbar, draws a box across two cells of a board
  through the real `CanvasAnnotationLayer` — the real pointer sequence, the real
  camera un-projection, the real frame-batched drag queue — drags it onto a third
  cell, and reads it back through the real capture menu: the captured payload names
  the cells the box covers, the two it was drawn over before the drag and the one
  it was dragged onto after it, and taking the layer off the page and mounting it
  again under the same provider leaves the mark where the drag left it (the marks
  are the provider's state, so a layer remount keeps them and a provider remount
  would not). CI runs it as `npm run slice:annotation-drag`.

  **There is no persistence; the read-back is the capture, and the issue's word was
  wrong.** The cell-edit slice reads a cell back because a cell is a row; an
  annotation never becomes one. Annotations are deliberately not persisted —
  saving every stroke would turn markup into a record, and costing nothing is the
  point of the scratch layer — and nothing in this flow is stored anywhere. The
  capture is an in-memory hand-off to the composer (`setPendingAgentAttachment`),
  and it is the read-back because it is the one thing the flow produces: each mark
  resolved to the cells it overlaps, in board space, which is exactly the answer a
  bad split of a two-thousand-line drag-and-geometry file would get wrong.

  What is stubbed is geometry, at the smallest seam, because jsdom lays nothing
  out: `getBoundingClientRect` on the layer and on each cell, `offsetWidth`/
  `offsetHeight` on the layer, and `setPointerCapture`/`releasePointerCapture`,
  which jsdom does not implement. The stubbed camera is deliberately not zoom 1 —
  the layer is twice as wide in its own units as on screen, and offset — so a
  split that dropped the scale term goes red instead of dividing by one, and
  frames are faked and turned by hand so the drag queue is watched publishing
  mid-gesture rather than only at the `pointerup` flush. Two cases watch the guard
  fail: one drops the drag's position write, one moves under `DRAG_THRESHOLD` and
  requires the mark not to move.

  **The three stubs are the three things jsdom cannot do at all, so they are
  covered in a browser.** `render-walk/annotation-drag.spec.ts` runs beside the
  sample-board walk under the same config: it opens the bundled sample board,
  draws a box across two cells of one lane with real mouse moves under the
  canvas's live CSS-transform camera, drags it onto a third under a real pointer
  capture, and asserts the captured cell ids out of the capture menu's own
  `Save N marks` download — nothing was added to the app to make that observable.
  `npm run check:render-walk` now runs two cases, both under the walk's
  console-error rule.

  ADR 0017 now marks annotation drag covered and names
  `src/components/editor/CanvasAnnotationLayer.tsx`'s split as unblocked. An agent
  session is the one flow still uncovered, and `AgentPanel.tsx` stays held.

- 8c99b76: **Every Vite command is quiet again.** `vite.config.ts` reached for
  `__dirname` to name the three roots it resolves — this repository's `src`, the
  package's `src` inside `node_modules`, and the deployment root — and Vite
  answered each `npm run dev`, `npm run build` and `npm test` with a warning
  that `configLoader: 'native'`, the loader planned to become the default, does
  not support it. The file now asks for `import.meta.dirname`, which is the same
  directory by another name and the one the native loader can give. Node has
  carried it since 20.11 and this repository runs 22.

  The file is one a deployment holds byte-identical, so the warning was not this
  repository's alone: every deployment printed it too, and none of them could
  have fixed it — editing the file there is the thing the reconciled set
  forbids. It leaves here, in a release, and a deployment takes the quiet on its
  next pin.

  Nothing else in the tree had the same problem. The build configuration is the
  only code Vite's config loader reads; the `fileURLToPath(import.meta.url)`
  elsewhere is in plain Node scripts and in tests, which Node runs directly and
  which the loader never sees.

- 7697d3e: **The deployment types check asks what a deployment's own `database.ts`
  actually is: the declaration of its database, not what its application
  compiles.** Since a deployment reads the application out of this package,
  `@/types/database` resolves into the package and the application is
  typechecked against the copy that ships beside it. The check had been written
  before that flip and still said the deployment's file was the compile subject,
  so it failed on facts rather than defects — at the deployment that reported
  this, two tables its database legitimately lacks because it never ran those
  migrations, and three unions (`LaneRole`, `EntityStatus`, `StakeholderKind`)
  that only this template's generator narrows, where the Supabase CLI its own
  docs send it to emits `string`. It was never wired into that CI.

  It now asks, for every table BOTH files describe, whether every column this
  package's application reads is described there too. A table this package has
  and the deployment does not is printed as information and does not fail: a
  deployment is entitled to carry the part of this core its service uses. A
  column absent from a table it DID build still fails, because the application
  will read that column out of that database. Column types are compared for
  contradiction rather than width — `string` and a narrowed vocabulary are one
  text column at two precisions, `Json` and `NonNullable<Json>` one jsonb column
  disagreeing about null, `string` against `number` two files that cannot both
  be right. The unions in the tail are not compared at all: they are this
  package's aliases, read by this package's code out of this package's copy, no
  `Row` column is typed as one on either side, and the vocabulary they close is
  a CHECK constraint, which a file is not the place to read from.

  It passes on the reporting deployment's file now, naming the two tables it has
  not migrated and exiting 0. `docs/connectors/supabase/database.md`,
  `docs/engineering/checks.md` and `references/customization.md` say all of this;
  the parser that reads a column's declared type beside its name is
  `check-schema-inventory.mjs`'s, so there is still one answer to what that
  generated file means.

- 9a0802a: **A deployment's offline board now has a config home for its CONTENT, beside
  the one its navigation already had.** `sample.nav` is the phases and scenarios
  a build shows before a database answers, and it replaces rather than merges —
  so a deployment that supplied its own nav drew those rows over the template's
  fallback registry, which is keyed by the template's own scenario and path ids
  and answers none of a deployment's. The result was a sidebar of real rows above
  an empty canvas in every no-database build, and a render walk that failed on
  the first board it asserted (#754).

  The board's content is `sample.blueprints`, taking a `SampleBlueprintRegistry`
  — scenario id to that scenario's paths — in exactly the shape
  `scripts/generate_fallbacks.py --register` already writes into
  `src/data/blueprintFallbacks.ts`. So a deployment hands the config what its own
  import pipeline produced, both halves from the one run:

  ```ts
  sample: { nav: SAMPLE_NAV, blueprints: PACKAGE_SAMPLE_BLUEPRINTS }
  ```

  Supplied, that registry is what every offline lookup reads; omitted, the
  package's own stands, and a clone of this repository runs exactly as it did.
  `DeploymentConfigProvider` writes it onto the fallback module while it renders
  rather than in an effect — the board asks for its lanes and cells during its
  own render, and a module write re-renders nobody, so an effect would leave the
  first paint with nothing to correct it.

  `src/contexts/deploymentSampleBoard.test.tsx` holds it at the level the failure
  appeared: a provider handed a deployment's config and nothing else, and the
  hook the canvas reads returning that deployment's paths, lanes and cells — and
  the template's own scenario answering nothing while it is in force.
  `references/customization.md` § The offline board is two fields names both, and
  the render walk's enrolment list says a deployment's walk needs them.

- 8f2e4db: **A consumer bundling the tool definitions is handed the `?raw` loader rather
  than writing one.** `src/lib/agent/tools/specs.ts` reaches the rulebook —
  a definition carries its `run` beside its schema, and `referenceDocs.ts`
  imports eighteen markdown documents as text the way Vite reads them — so a
  plain Node bundle of the tool surface stopped on the first document it met:
  `[UNLOADABLE_DEPENDENCY] Could not load …/check-fee-visibility.md?raw`. A
  deployment's eval harness met that as a hard stop and answered it with a copy
  of this repo's ten-line plugin.

  The loader is now `scripts/vite-imports.mjs`, published as the
  `./vite-imports` subpath, and `references/customization.md` § Bundling the
  agent's tool definitions is the documented route. This repo's own harness
  imports the same module by package name, so the loader a consumer is handed is
  the one every harness run here proves. The import form stays in the app,
  because the documents are the app's content and their paths are a published
  interface a second reader would drift from (#759).

- ec38824: **`list_cell_dependencies` no longer teaches the dependency direction
  backwards.** Its description said `enables` "means the other must already be
  true", which makes the target the precondition — `depends_on` semantics wearing
  the word `enables` — and contradicted `create_cell_dependency` in the same
  file, which says the precondition is the source. The read tool now says what
  the write tool says: both kinds read source-first, and `enables` means the
  source makes the target possible without causing it.

  `both-kinds-read-source-first` missed it because its matcher spelled the
  inversion as "the target must already be true" and this sentence said "the
  other". The pattern now covers that spelling, and the test holds the sentence
  that shipped as a case it goes red on. Found while enrolling a deployment in
  v1.44.9 (#755).

- a61d475: **The token model now reads the application the build assembles, not the
  package it happens to live in.** `src/lib/tokenModel.ts` found its stylesheets
  and its TypeScript by resolving `src/` from its own file location and walking
  it. That is right in this tree and wrong in every deployment: a consumer
  installs this package under `node_modules`, so the walk opened the PACKAGE's
  `src/styles` and never the deployment's own. Every rule riding the model —
  `styles/tokens.test.ts`, `lib/tokenModel.test.ts`, `lib/tokenDiscipline.test.ts`
  — then judged the package inside a consumer and passed, having measured nothing
  about the application that consumer builds, which is where a deployment's token
  dials actually live.

  Both walkers are now the `app` subject of `scripts/sweep.mjs`: the CSS set and
  the TypeScript set are filtered out of `sweep({ subject: 'app' }).files`, and
  every read goes through the sweep's `read`. That is the same overlay rule the
  build applies — a deployment's `src` over the package's, per path — so the
  model reads the deployment's stylesheet wherever the deployment has one and the
  package's everywhere else. The module drops `node:fs`, `node:path` and
  `node:url` and no longer knows where it is installed; the root is the tree the
  run is in, which is the rule `sweep.mjs` states for every check.

  The two tests follow. `tokenModel.test.ts` opens the raw file through the same
  sweep rather than through a path resolved from its own location, so it agrees
  with the model in a deployment instead of only here. `tokenDiscipline.test.ts`
  keeps its independent second walk — a file whose whole point is that there
  should be one model still needs a counterpart the model cannot talk it into
  agreeing — but takes its enumeration from the sweep too: which files the
  application HAS is the build's rule, and only the filter and the comparison
  were ever this test's to own.

  No file set moved in this repository: the sweep lists the same fifteen
  stylesheets and the same 476 non-test sources the old walk found.

- 113d08b: **The render walk ships its own runner, and a deployment enrols with one
  command that works.** From the root of a tree that installs this package:

  ```bash
  node node_modules/uno-blueprint/render-walk/run.mjs
  ```

  `npx render-walk` is the same thing through the bin the install links, and
  arguments pass through, so a deployment's own `check:render-walk` is that line
  and nothing else.

  **The command 1.44.9 published could not be run by anybody.** It pointed
  Playwright straight at `render-walk/playwright.config.ts` inside
  `node_modules`, and neither loader will compile a TypeScript file that lives
  there: Playwright's transform hook declines any path carrying a `node_modules`
  segment, so Node is handed raw TypeScript and throws
  `ERR_UNKNOWN_FILE_EXTENSION`, and Node's own type stripping refuses the same
  file with `ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING`. Neither rule is
  configurable, and both cover the specs as much as the config, so no arrangement
  of `testDir` or loader flags makes that instruction work. The first deployment
  to meet it wrote the staging by hand — a script the package should have shipped
  rather than one every adopter re-derives (#752).

  `render-walk/run.mjs` is that script, published. It copies the directory it
  ships in out of `node_modules` into `.render-walk-staged/` at the root of the
  tree being walked, byte for byte and from scratch on every run, and hands
  Playwright the copy; the copy is read by nothing else, so it cannot drift from
  the version you pinned. Add `.render-walk-staged/` to your `.gitignore`. It
  resolves Playwright out of your own `node_modules` rather than through `npx`,
  which would download a version this walk is not pinned to and then say nothing
  about it, and a tree without Playwright is told which version to install.

  The runner is the fourth published path under `render-walk/`, listed in
  `CONSUMER_IMPORTS` beside the config and the two specs, so moving it is a
  release rather than a refactor. This repository's own
  `npm run check:render-walk` goes through it too: the path a deployment runs is
  the path CI here exercises. A deployment holding a staging script of its own
  can delete it once its pin reaches this version.

## 1.44.9

**The hot paths are deep modules now: agent tools, service scope, cell fields,
the build overlay and the repository checks each answer from one place.** The
work of #681, twenty-five pull requests, all patch-level: the plugin contract's
identifier layer is unchanged, one alias the roster no longer lists aside.

- **Agent tools.** Every tool is one definition under
  `src/lib/agent/tools/definitions/` — name, surface, zod arguments, where it
  may run, and `run(args, ctx)` — and the dispatcher is a lookup. `ctx`
  carries the client, the service scope, the session and the canvas bridge;
  no tool imports a registry, a store or a bridge of its own. The roster is
  derived from the definition list and `agent.enabledTools`; the canvas-adapter
  document renders its surface lists from it, and references and doctrine
  come from the deployment config. `list_scenarios` is retired in favour of
  `list_blueprint` with a granularity. A node test drives the loop from a fake
  provider through a tool to its result, the harness smoke runs in CI, and a
  dry-run write in the harness answers in the tool's own words.
- **Service scope.** One store holds the resolved active service; the scoped
  read hooks take it explicitly, no component or tool resolves the URL's slug
  for itself, and the agent receives its scope in `ctx.scope`, with reads
  defaulting to the active service. A write invalidates what it changed
  through the one key builder the reads use.
- **Cell fields.** `cellFields.ts` is one descriptor per column; the board
  select, the normalizer, the panel's form and read-only rows, the one save,
  and the cell-writing tools' arguments derive from it. One Lane corridor rule
  serves both layouts.
- **The build overlay and the database types.** A deployment's `src` overlays
  the package's per path (`scripts/overlay.mjs`, exported as
  `uno-blueprint/overlay`); the all-or-nothing rule is
  withdrawn. `src/types/database.ts` is generated whole from the replayed
  portable core, and a superset check ships for a deployment's own types.
  Each input a deployment owned inside `src` has a config home, named in one
  place in `references/customization.md`.
- **The repository checks.** `scripts/sweep.mjs` answers "give me the files
  for this subject" for eight subjects — the application, the prose, the
  scripts, the migrations, the reference surface, the package's reference
  documents, a deployment's seed and the commit — and every check names one
  and judges only. No script resolves a root from its own location; the five
  helpers are gone; CONTEXT.md defines **Subject**. The shared scripts a
  deployment holds byte-identical reach nothing but each other.
- **Flows in CI.** The cell-edit-with-revert flow runs as a slice over an
  in-memory table and, as its primary form, over standalone PostgREST on the
  CI Postgres with a minted service claim — a grant or policy the recipe
  forgot fails it. The sample board is opened in a browser on every pull
  request: a Playwright walk over every phase, scenario, path and layout it
  offers, failing on a console error, with a screenshot per view. ADR 0017
  marks cell edit and browser render covered.

**Upgrading a deployment:**

- If your tree carries its own copy of `specs.ts`, `registry.ts` or `read.ts`,
  take the package's; the definitions folder is new and all three import from
  it. A roster narrowed by editing a name set becomes `agent.enabledTools` in
  the deployment config. Move `registerReferenceDocs({ blueprint })` to
  `agent: { references: { blueprint } }` and a role document of your own to
  `agent.doctrine`. The reads come first in the tool list now; `get_cell`'s
  `cell_id` states `minLength: 1`.
- Replace `list_scenarios` in doctrine or harness cases with `list_blueprint`
  and a granularity.
- A surface of your own that imported `resolveActiveServiceId` or
  `findActiveServiceId` reads `useActiveServiceId()` from
  `@/contexts/activeService`; a scoped hook called with no argument becomes
  `useX(useActiveServiceId())`; a tool that creates under the service takes
  `requireActiveService(ctx)`; a test context passes `scope: scopeOf(...)`.
  Stop calling `invalidateQueries` / `invalidateStructure` — the write
  refetches for you; build your own read keys with `queryKeys`.
- Add `scripts/repo-config.mjs` to your tree and take the shared scripts
  (`sweep.mjs`, `seed-list.mjs`, `always-loaded.mjs`, the four router checks,
  the agent-account pair, `check-target-schema.mjs`) byte-identical; they run
  over the working directory. Run `check:database-types-superset` against
  your own generated types. To run the render walk against your own sample
  board, install `@playwright/test@1.62.0` and Chromium and point Playwright
  at `node_modules/uno-blueprint/render-walk/playwright.config.ts`
  (see `render-walk/README.md`). Residents you still keep under `src` are
  yours to list; every path you delete is answered by the package.

## 1.44.8

**The service, phase and scenario bars above the canvas hold their name and
summary inside the bar.**

The bar was 36px tall and the two-line block inside it 42px, so the summary sat
on the bar's bottom border and over the canvas. It showed most on a deployment
with a long service summary; the bundled sample's short summaries hid it.

- **Height.** The bar is now 52px, with the same room above and below the two
  lines. The space is still held before the summary loads, so nothing jumps.
  The canvas, and the cell detail panel's top edge, start 16px lower.
- **Truncation.** A long summary stops at the edge of its column with an
  ellipsis instead of running under the controls on the right and off the
  screen; hovering it shows the full text. A long name keeps to one line the
  same way.
- **Alignment.** The name starts on the same left edge as the summary under
  it, and the loading placeholder lines up with both. The highlight behind the
  name on hover is unchanged.

**Upgrading a deployment:** nothing to do beyond taking the release. No
migration, no configuration. A deployment that styles its own chrome against a
36px bar should re-check it against 52px.

## 1.44.7

**A cell's featured image is its frame, and a person can choose it.**

A cell had two ways to have "its picture": its frame, and an attachment marked
featured, which the detail panel led with regardless of the frame. A
touchpoint's logo lived only on the touchpoint, so getting one onto a slide
meant uploading a copy as the cell's frame — and the panel then drew the logo
twice.

Now the frame is the one slot, and what is stored is what shows.

- **Choosing it.** In a cell's Resources tab, a picture attachment and the logo
  the cell inherits from its touchpoint each offer "Set as featured image", which
  writes the frame through a new logged, undoable function,
  `set_cell_featured_image`. The inherited logo is listed read-only and is never
  saved as a resource row. A new picture is added as an attachment first.
- **Placing a cell.** Placing a cell on a touchpoint that has a logo fills an
  empty frame with the logo's path. A frame that holds anything is left alone.
- **The panel** draws one image, the frame, with no separate logo row.
  Attachments no longer lead through `featured`; featured links are still the
  panel's buttons.
- **Slides** are unchanged — an untouched slide still shows its cited cells'
  frames — except that an image stored as a root-relative path, such as a stock
  logo, now renders.

**Upgrading a deployment:** apply migration `21000227000000` before deploying
this release: the app calls the new function, and the migration rewrites
`sync_cell_touchpoints` and `set_placement_touchpoint`. No column changes.

Then move your data into frames **back to back with the deploy** — until you do,
a cell whose picture was only a featured attachment shows no image in the panel.
In this order:

1. **Freeze first.** For every untouched slide (`shows_all_images = true`) whose
   resolved images the steps below would change, make its image set explicit
   with the images it resolves to today.
2. **Featured attachments.** Where a cell has an attachment marked `featured` and
   an empty frame, set the frame to that attachment's url. A cell that already
   has a different frame keeps it: the frame is the featured image.
3. **Uploaded logo copies.** Where a cell's frame is an uploaded copy of its
   touchpoint's logo, set the frame to the touchpoint's `icon_url`. Delete the
   copies from storage once nothing refers to them.
4. **Touchpoint cells without a frame.** Set the frame to the touchpoint's
   `icon_url`, so they match what placing a cell now does.

## 1.44.6

**Choosing a cell from a slide's cells list closes the list and opens that
cell's detail panel on the slice.**

The list stayed open over the slice canvas after a row was chosen — the
presentation stays mounted behind the slice tab, so nothing closed it — and the
slice tab flew to the cell without opening its panel. A row now closes the list
first, and its pending focus asks for the panel too: once the slice viewport has
found the cell, it opens the panel the same way "View cell detail" does. A cell
no longer on the board still opens nothing.

**Upgrading a deployment:** nothing to do. No data or schema change.

## 1.44.5

**The presentation page lays each slide out in one left-aligned column, and
every image frame on a slide is the same size.**

A slide with several images used to shrink each picture to a percentage of its
own button, so a 300px source rendered at about 80px and no two pictures
matched. Now the column reads, top to bottom: the slide counter, the title, the
caption, the images, and an `N cells` button.

- **Images** sit in even 4:3 frames with the picture fitted inside, so a
  picture's dimensions can no longer change its frame's size. One image takes
  two-thirds of the column; two, three and four share a row; more than four
  wrap in quarters. A picture is never drawn above twice its natural size.
  Clicking a frame still enlarges it. With up to four images a short window
  shrinks the frames before the title and caption are pushed off; five or more
  wrap to a second row that can run past a short stage, and no slide in the
  deployment this was measured against has more than three.
- **Cells**: the row of pills at the bottom of the stage is gone. The `N cells`
  button opens a list of the slide's cells, including cells with no image; each
  row opens that cell in the slice exactly as a pill did.
- **Type**: one job per style. The counter stays mono and drops its uppercase,
  reading `Slide 1 of 3` at the filmstrip squares' size. A slide with no images
  now uses the same title and caption sizes as one with images.
- **Filmstrip** starts on the column's left edge instead of centring itself.

The header band, the prev/next arrows and the mini-map are unchanged.

**Upgrading a deployment:** nothing to do. No data, schema or stored slide
changes; this is the presentation page's layout only.

## 1.44.4

**`check:deployment-seed-load` read one file of a many-file seed and blamed the
shortfall on grants.** Run against a real deployment it reported two tables
empty to `anon` and both render reads returning nothing, and prescribed a
migration granting a permission the recipe already grants. What had actually
happened is that it loaded **1 of that deployment's 23 seed files**. The tables
really were empty. The diagnosis named the wrong subsystem entirely.

One line resolved three situations as though they were two. A deployment states
its seed in `config.toml` under `[db.seed]`; when that section was absent,
disabled, **or** empty, the check fell back to the single file it had been
pointed at. Absent is a genuine fallback — one seed file, the CLI's own default.
Disabled-or-empty is not. It is a deployment that has deliberately taken its
seed list out of the CLI's reach, because four `supabase` subcommands read that
table and only one of them has the word "reset" in its name: `db push
--include-seed`, whose `--linked` is the default and which is otherwise the
ordinary way to ship migrations, would load a whole seed — deletes and upserts
included — into a live project. A deployment that has noticed empties the table,
disables it, and moves the list into a loader of its own, under a name this
package has no business knowing.

So the measure a deployment takes to protect its production database was the
thing that made this check read a twenty-third of its content.

It refuses now, and the refusal names what to pass instead. `--seed` takes
several paths — repeated, or comma-separated — and when files are named they
are the seed, in that order, with nothing else consulted, including the
refusal. The case that worked is untouched: no `[db.seed]` section still means
the named file is the whole seed, and that case is asserted beside the broken
one, because a distinction can be drawn too far. Every refusal here prints its
message and exits 1 rather than throwing a stack trace over the sentence that
says what to do — which also improves the older refusal, for an entry with no
file behind it.

The script already held the doctrine that names this failure. Its own
`RESOLVES_TO_NOTHING` explains why a single unresolved entry must stop the
check: a seed loads in dependency order, so the file that never ran is the one
line that would explain the pile of foreign-key failures it caused, and
dropping it quietly leaves that line out of the report altogether. The same
thing was happening twenty-two files at a time, in the one branch that had no
such guard.

Verified in both directions against the deployment that exposed it. Pointed at
its `supabase/seed.sql` it refuses. Given its loader's twenty-three files in
load order it passes — and that result is worth stating on its own, because it
is the question this check exists to ask: **the portable core accepts a real
deployment's seed and renders it to `anon`**, eleven tables populated, both
render reads returning rows.

**Upgrading a deployment:** if your `[db.seed]` is disabled or empty and you run
this check, it will now refuse where it used to answer — and the answer it used
to give was wrong. Pass your loader's list, in load order: `--seed a.sql,b.sql`,
or the flag repeated. If your `[db.seed]` is a real list, or you have no such
section, nothing changes.

## 1.44.3

**Two sweeps stopped where their fence stopped rather than where their argument
stopped.** Both were widened only after the widening was measured, and both
tails are named below rather than excluded.

**The content-coupling sweep read no root-level document.** Its subject was
seven directory prefixes — `src/`, `skills/`, `agents/`, `references/`,
`evals/`, `scripts/`, `docs/` — and no root-level file starts with any of them.
So `README.md`, `CONTEXT.md`, `SETUP.md`, `INDEX.md`, `CONTRIBUTING.md`,
`SECURITY.md` and **`AGENTS.md`** were outside the sweep entirely. `AGENTS.md`
is the always-loaded tier, the one file every session is handed without
choosing, and a foreign cell id, a cast role and a deployment's asset path
appended to it passed in green: `no deployment content in 620 shared files`.
The same three lines in `references/data-model.md` were caught at once. The
header named two deliberate exclusions and never mentioned the root documents,
which is what made it an escape rather than a decision.

The subject is now everything a commit would carry, tracked and untracked —
which is the subject `check:standalone` beside it already read. A new module
states it once for both, so the two cannot drift apart, and the exclusions that
survive carry their reason beside them instead of being an accident of a prefix
list. Widening added 36 files and produced one finding: a released CHANGELOG
entry quoting the check's own header, which is one allowed site with its
reason, not an excluded file. The changelog stays swept, and so do the
changesets it is generated from — where a pasted value now fails before a
release rather than after one. The swept count went from 620 to 657 in the
commit that widened it, and moves with the tree from there.

The shared module that assembles the prose corpus went with it: the root
documents are discovered rather than listed, because which documents sit at a
repository's root is that repository's own fact. Four of them are read by a
prose sweep here for the first time, and that tail was zero.

**The path check resolved nothing under `docs/`.** It held the paths named by 36
plugin-surface documents true, and `docs/` is the largest prose tree in this
package. Planted dangling paths in `CONTEXT.md` and in `docs/engineering/checks.md`
passed the whole suite.

Measured before deciding, as the issue asked: `docs/engineering/` 3,
`docs/guidelines/` 0, the rest of `docs/` 11, the root documents 35 — of which
34 were in `CHANGELOG.md`. The non-history tail was fifteen, short enough to do
in one change rather than in stages, and it resolved as: **one real defect** (a
connector document sending readers to a hook file that never existed); **three
an exemption should already have covered** — `blueprint/*.json` was listed as a
glob and looked up by exact key, so it excused nothing while the three
documents it was written for failed; **four decision records**, excluded on the
ground already recorded for them, that they keep the words of the day they were
written; and **seven sites in six sentences that are right about a file this
tree is right not to have.** Those seven are keyed by document AND token, so an
exemption cannot travel to the document where the same path is a defect. Both
lists fail closed, and an entry nothing matches any more is itself a failure.
Subject: 36 documents became 58.

**The line between the two guards is unmoved, and both now state it the same
way.** This check REQUIRES a named path to resolve here; the citation guard
FORBIDS a shared file naming a path its reader lacks. A document under both
rules could satisfy neither — so the line is which reader the document is
written for, and everything added here is packed with the package and read out
of its own installed tree. The two subjects do not overlap.

**Upgrading a deployment:** this is where to read carefully, because both
changes can turn a gate red in your repository that was green in ours. If you
enrol either sweep, its subject grows: the coupling sweep will read your root
documents — including your `AGENTS.md`, which is the point — and the prose
corpus will read the root documents you have rather than the ones this package
has. A finding in one of those is a real one; resolve it by moving the content,
or record an allowed site with its reason, and do not narrow the subject back.
Nothing else here changes an interface.

## 1.44.2

**A check that cannot see its subject now either refuses or says so.** The
failure has one shape and two endings: a guard looks at nothing and reports
success, and then goes on reporting it, because a run that has stopped measuring
prints the line it printed yesterday. Seven were found here by planting the
defect each one exists to catch and watching the suite stay green.

**Four refuse now, because an empty subject is never the right answer.**

The vendoring sync walks both ways. It named every source and where its copy
goes, and compared source to target only, so a file in `src/lib/agent/skill/`
that no entry named was compared against nothing. That is not a tidiness
problem: the standalone sweep and the coupling sweep both exclude that tree by
name, each on the stated ground that the sync holds it identical to a source
they already read. So the one tree both prose sweeps are told to skip was the one
tree nothing looked at — measured, a planted file carrying a deployment's name,
its cast and its cell ids passed all three checks and the whole suite. A copying
run that met a missing source also counted it as drift, printed `done`, and
exited 0.

The glossary check refuses a glossary with no terms in it. Its three rules are
refusals — no fence, no table of column names, no section without a term — and an
emptied file breaks none of them. `CONTEXT.md` reduced to nothing printed
`0 term rows` and exited 0, in the same sentence and the same green as the run
over fifty-one. The count was already computed and printed; it is now also
read.

The path sweep refuses a subject a filter emptied. The listing was already
refused when empty, but the listing is not what the check sweeps: one renamed
folder in its surface list takes it to `every path named by 0 plugin-surface
documents resolves`.

And the two `git ls-files` sweeps refuse a listing every predicate rejects —
the same two steps, the same gap, and four call sites relying on a breadth
assertion only one of them made.

**Three skips are correct, and were invisible — which is the other half of the
same defect.** A new register separates "looked and found nothing" from "did not
look": a warning in the run summary, said once per fact, never an error, because
a guard whose readers have learned to ignore it is worse than no guard. It
carries the swept prose corpus with a folder missing, the agent account with no
database configured, the deployment seed load with no deployment to load, and
the release tags a checkout cannot see.

The prose corpus is worth naming on its own, because nothing about it looked
wrong. The root documents are prepended unconditionally, so that walk is never
empty — and with the four swept folder names misspelt, the corpus went from
fifty-four documents to three, every prose guard passed, and the full suite was
green. Both suites that sweep it now assert their own breadth.

**Two reads that could shrink a subject quietly are narrowed to the case they
were for.** The sample-content report caught every read failure and continued,
so a permission the checkout should not have was skipped the way a file that
vanished mid-run is; it takes `ENOENT` alone now, and counts what it opened. The
release-tag guard caught every git failure and returned an empty tag list, so a
tree that is not a repository, a checkout handed no tags, and a box with no git
all printed `no release tags yet` and exited 0 — `git tag --list` exits 0 and
says nothing when there are genuinely none, so those are told apart now.

**Two smaller holes of the same kind.** The shared-script fence is closed under
relative import, and the walk that closes it read one spelling of an import; no
shared script uses the other one today, which is exactly when the hole is cheap
to close. And the tag fetch moves to the top of the CI job, beside `npm ci` — a
checkout does not fetch tags, and the fetch sat two dozen steps below the test
run, so the suite ran against an empty tag list, which is the vacuous state this
whole release is about, one layer up. It was the new breadth assertion that
found it.

**Upgrading a deployment:** take the release. This repository's own results are
unchanged throughout — the same subjects, the same counts, the same verdicts —
and nothing here changes an interface. Yours may differ, and that is the point:
if you enrol the shared scripts, a check of yours that has been passing over an
empty subject will now refuse, and one that is correctly skipping will say so in
the run summary rather than nothing at all. Read a new warning before silencing
it; it names what the check could not see.

## 1.44.1

A review of 1.44.0 found eight defects, and several of them were guards that
did not guard what they claimed.

**A figure's caption said something the drawing no longer said.** 1.44.0 changed
two diagrams to read "Inside one path" and "Inside one cell" and left the alt
text and the section headings saying "a single". Since the figures became the
package's to serve, that alt text is this package's words for the drawing — so a
person using a screen reader was read a caption the picture does not carry. The
words agree again, in the figures, the cover, the README and the guide.

**A shared script's failure message named a document only this package has.**
The account generator threw `docs/agents/blueprint.md has no …`, and the script
a deployment holds byte-identical imports all of its logic from there, so that
message would have reached a maintainer who has no such file. Four `npm run`
aliases had the same problem and are named by path now.

The guard for this fences a named list of shared scripts, and a named list is
right — each entry carries a reason no walk can judge. But it missed this
because a module the list imports is not on the list, and _that_ is not a
judgement call. The list is now held **closed under relative import**: a shared
script may only import modules that are themselves shared, with the repository's
own configuration module the single declared exception, because it is the seam
that exists to hold what differs. Closing it found five more modules travelling
that way.

**A check computed an empty-subject refusal and never read it.** The database-name
sweep counted what it had swept, in two variables, and refused nothing — it was
standing only because resolving the application root throws when there is no
application. That is the defect 1.44.0 set out to remove, left behind in the
file where it was noticed. Nothing caught the dead counters because linting
covered only TypeScript; it covers the scripts now, for unused variables alone,
and that found four more left over from the same migration.

**And the extractor that reads prose miscounted its own arguments.** It tracked
call frames but not braces, so a comma inside an object literal advanced the
enclosing call's argument index — enough to make a test fixture look like a
citation. It also narrated fewer assertion forms than it claimed. Both are fixed
with the failing case pinned as a test, and the assertion forms are named
separately: `assert` and `assert.ok` carry their message in the second argument,
the comparisons in the third, because the second argument of `assert.equal` is
an expected value and reading it would make a colour into a citation.

**Upgrading a deployment:** take the release. Nothing here changes an interface.
If your own suite reads a figure's alt text, two strings changed; if you enrol
the shared scripts, they now say what a reader of yours can act on.

## 1.44.0

The cover's diagrams now arrive with this package, a shared file may name a
document only where its reader will have one, and every check finds the
application wherever it is rather than where this repository keeps it.

**A deployment gets the diagrams, not a broken-image box.** The thirteen cover
figures were paths into `public/`, filled by a build step this repository runs
and a deployment never does — so a deployment requested each one and got the
single-page fallback: **200 with `text/html`**, a broken image on the page and a
success in the network tab. They are module imports now, taken from
`docs/assets/` and re-exported as `packageCoverFigures`, so they resolve inside
the package whether it is linked, hoisted or nested, and no build file has to
know about it. A figure is a value: supply your own, or borrow one and change a
field. And a missing figure is now an unresolved import, which stops the build —
the point of the change as much as the figures are, because a request that
fails by succeeding is what let this sit unnoticed.

This is the last of a family. The stylesheet that built no utility classes, the
dev server that would not start, and these: each broke only once the application
was a dependency, and none was visible to any check running here. A sweep for
the rest of the shape found none left.

**A `docs/` path is a defect only where it dangles.** The rule was being read as
a ban on the spelling, which is the wrong test — the question is whose tree the
reader is standing in. Three answers, and the guard is built from them. A shared
script that writes `docs/connectors/supabase/…` sends a deployment's maintainer
to a document only this package has: that is the defect, and six shared scripts
had it, two of them pointing at things that do not exist there at all. A file
that ships from here and is read from here is not dangling — `docs/` is packed
with the tree, so the vendored rulebook finds `docs/erd.mmd` exactly where its
sentence said. And `./docs/…` says out loud that it is relative to the reader.

The six scripts are fixed and a deployment can now hold them byte-identical.
Where a path is genuinely the _subject_ rather than prose, it moved to
`scripts/repo-config.mjs`, which exists for that and is never shared.

**The guard reads what a person reads when something fails.** A test's name and
a failure's message are quoted strings, and they are what a reader has at the
moment they can least afford a dead pointer. Two dangling record paths had been
sitting inside a check's own failure text. The extractor now reads those two
positions and nothing else quoted, so a colour and a product label stay where
the compiler reads them.

**A check that sweeps nothing now refuses.** Thirty of sixty enrolled test files
could not run in a deployment, and three checks were worse than that — they
passed while measuring almost nothing: one swept **no** application files and
printed `ok — every database name…`, one swept a single content file, and one
dropped two pointers as "not a place" before checking them. All of them resolve
the application properly now and refuse an empty subject out loud.

One more of the same kind, and the nastiest: `sync-canvas-skills.mjs` created
`src/lib/agent/skill/` before writing to it. Run in a deployment, that **makes a
`src/`** — after which the alias, both TypeScript configs and every walk in the
repository resolve into two empty folders. It refuses first now.

**Upgrading a deployment:**

- Take the release. If you copied this package's cover figures into your own
  `public/`, you can delete them: a cover that does not supply its own figures
  gets the package's. Keep only figures you authored.
- Supplying your own is a value, not a path — `{ ...packageCoverFigures.cellAnatomy,
alt: 'our words' }` — so overriding one no longer means forking the cover.
- Six scripts you may have wanted in your drift gate and could not enrol are
  enrollable now: `check-glossary-only.mjs`, `check-negation-ratchet.mjs`,
  `check-target-schema.mjs`, `generate-agent-account.mjs`, `swept-docs.mjs` and
  `tests/the-router-is-a-router.test.mjs`.
- If your own suite was red on enrolled test files that walk `src/`, it should
  go green. They resolve the application through `scripts/app-source.mjs` now.
- If any check of yours has been reporting success while sweeping nothing, this
  release will turn it red. That is the fix, not a regression.

## 1.43.1

One enrolled test could not pass in a deployment, which is the one place it was
written to apply.

**The test that proves an enrolled walk works in a deployment now runs in one.**
`scripts/tests/one-badge-one-size.test.mjs` stages a throwaway tree with no
`src` and the application mounted under the name a deployment depends on it by,
then walks it and compares the result file for file. It staged that tree by
mounting the root the suite was _run_ from — which is the application's own
directory in a repository that keeps a copy of the application, and a directory
with no application in it anywhere else. So in a deployment the staged tree had
a `src` in neither root, the resolver refused it exactly as it should, and the
test failed. It asserted its own premise in every repository where that premise
is false, and only there. A test that passes only where its subject does not
exist is worse than no test, because the green line reads as coverage.

It now mounts the parent of the application's own root — the directory that _is_
the package, whichever of the two roots holds the application — so the staged
tree has an application in it either way. The staged tree's lack of a `src` is
asserted rather than assumed, and the fix was mutation-tested from inside a real
deployment: making the resolver hand back the first root, or pinning the walk to
the repository's own `src`, both turn it red.

The link stays a link rather than becoming a copy, because this walk reads
directory entries and follows one. That is worth distinguishing from the staged
deployment in `deploymentRoot.test.ts`, which installs the package instead: a
symlinked package is resolved to its real path before anything decides what
lives in `node_modules`, so a linked package hides every defect that depends on
being a dependency. Which test needs which is now written down where each one
stages its tree.

**Upgrading a deployment:** take the release. A deployment whose suite was red
on this one file goes green; nothing else changes. If that suite is red on
_other_ enrolled test files, that is a separate and larger problem — forty-seven
of sixty enrolled test files still reach for `src` directly and cannot run where
there is none. It is tracked, not fixed here.

## 1.43.0

Everything a deployment needs to actually run the application out of this
package, rather than nearly run it. Three of the four things that only break
once the application arrives as a dependency, and the checks that would have
caught them.

**A deployment's dev server loads this package's documents.** It did not run at
all: Vite pre-bundles a dependency, the pre-bundle does not preserve `?raw`, and
the twenty-three reference documents the agent reads failed to load — a blank
page behind twenty-three unloadable-dependency errors. `vite build` was
unaffected, which is why nothing here noticed. The build files now exclude the
application from pre-bundling when it _is_ a dependency, and point the
dependency crawl at the deployment's own files so the crawl does not stop at the
package boundary and serve a transitive dependency as raw CommonJS. A
deployment's cold dev load now serves the application's modules individually
rather than in a few chunks; third-party dependencies are still pre-bundled.

Worth knowing if you ever stage a deployment to test something: a **symlinked**
package does not reproduce any of this. Vite resolves real paths before deciding
what lives in `node_modules`, so a linked package is never pre-bundled and the
whole class of defect stays hidden. Install it, do not link it.

**A deployment owns the account of its own schema.** `docs/agents/blueprint.md`
is what an agent reads to learn the schema it is about to write to, and the copy
that shipped described _this_ package's database. A deployment whose schema
legitimately differs — which is what extending a template means — got a check
that went red and, worse, a printed remedy that made things worse: running it
rewrote a true account of the real database into an account of a schema that did
not exist. The generator now asks two questions of two owners. The vocabulary
follows the application, because the entity kinds are the board's definition of
itself. The schema declaration follows the deployment, and the package's copy is
a last-resort default rather than the truth. A declaration is only a list of
relations to ask the database about, so what is absent is dropped and what the
database has that nobody declared is rendered anyway — which is what makes the
default harmless and the remedy incapable of reducing accuracy.

**An enrolled check finds the application wherever it is.** Two scripts a
deployment holds byte-identical walked `src/` to find their subject, so they
could not run where there is no `src/`. They now start where the build resolves
`@/…`, and report their findings relative to the application's own root so a
finding still reads the way it always did.

**A walk survives a file that is already gone, and a check that sweeps nothing
fails.** Eight walks took a listing from git and then read those paths; between
the two, `changeset version` deletes files that are still in the index, so a
release reddened a suite that had nothing wrong with it. Four of the eight had
been "fixed" with a blanket catch, which is the same defect with the crash
removed. One rule now, in one place: a file that vanished is skipped, and
anything else still fails loudly. The seed-load check's two sites went the other
way deliberately — a missing seed file there is a real failure, so it says so,
and the read that sat behind a multi-second subprocess moved in front of it. And
several checks were found passing on an empty sweep, so a walk that finds
nothing now refuses instead of reporting success.

**A shared file names its decision, not the number.** Fifty-one citations —
issue numbers, ADR numbers, and the four ADR paths wearing a slash, two of them
inside a check's own failure message where a reader meets them exactly when
their gate goes red. Each pointed at a record that resolves here and nowhere
else. A guard now holds the rule across everything a deployment can enrol.
Migration versions were measured and left alone: twenty-three of them, all
legitimate, because a migration version resolves in a deployment's own database.

**Upgrading a deployment:**

- Take the three build files with the release as usual. The dev-server fix lives
  in them and applies itself — it is gated on whether the application is a
  dependency, so a repository that keeps the application in `src` is untouched.
- Nothing is required for the schema account to be correct. Optionally keep a
  `deployment/types/database.ts`, which narrows what the generator asks the
  database about. If `check:agent-account` has been red, it should now pass, and
  its remedy can only move the document toward the database.
- A deployment that pinned an older release and worked around the empty
  stylesheet or the dev server with configuration of its own can drop those
  workarounds.
- Still outstanding for a deployment reading the application from this package:
  the cover figures. Thirteen of them are named as `/cover/*.svg` and arrive in
  `public/` by way of this repository's own build step, so a deployment gets
  fallback HTML where the figures should be. That is an asset arriving by a
  build step rather than an import, which is the one category no bundler check
  can see; it is tracked and not fixed here.

## 1.42.0

A deployment that reads the application out of this package gets somewhere to
keep its own files, and a stylesheet with classes in it.

**A deployment brings its own source root.** `@/…` already finds this package
once a deployment stops keeping a copy of the application, and that left the
deployment's own files with nowhere to go. They cannot go back into `src`: the
first root that exists wins, so a `src` holding only a deployment's files would
capture every `@/…` import in the package and resolve none of them. They go in
`deployment/` now, reached by `~/…`. Make that directory at the root of the
repository and put in it every module that is the deployment's rather than the
application's — its `DeploymentConfig`, its cover content, its pre-database
navigation, its entry point, its stylesheet layer — then point `index.html` at
the entry kept there. Inside it, `~/…` reaches the deployment's own modules and
`@/…` reaches this package's, so which side an import is on is visible at the
import site.

**Why a second prefix rather than a second root under `@/…`.** A bundler alias
maps a prefix to exactly one directory, so one prefix could only ever choose
between the two roots, never hold both. And where a per-module fallback is
available at all — TypeScript's `paths` does offer one — it is precisely the
arrangement this replaces: a deployment file quietly standing in for a package
file of the same name, with nothing reporting the substitution.

**What carries a deployment's content now that its copies are gone.** The seams
that were already there, and this release writes the whole inventory down as a
test rather than a paragraph. A deployment's name and accent, its cover, and the
board shown before a database answers all arrive on `DeploymentConfig` —
`brand`, `cover`, `sample.nav`. The bundled sample blueprint has no field and
needs none: a deployment with a database never reaches it, and where a surface
consults it without asking first, the lookup is by identifier and the
identifiers are this template's own. `types/database.ts` is the largest file
anyone forked and has no seam either, because every import of it is a type
import — it is this template's compile-time statement of the schema its code
needs, satisfied by having that schema, not by swapping a module underneath code
that was typechecked against it.

One value still reaches no config: the workspace breadcrumb's label, built while
the navigation model evaluates. The component that renders that trail has no
consumer in this tree, so nothing is wrong on screen, and a test holds it that
way — wiring the component up is what will force the label to be carried in from
the resolved config.

**A deployment's stylesheet keeps its utility classes.** A deployment reading
the application out of this package built a stylesheet with no utility classes
in it at all — measured on a staged deployment, 83 kB against 291 kB, and nine
class names with a rule rather than sixteen hundred, every one of those nine
hand-written in this package's own CSS. The build succeeded, the CSS file was
written, and every element on the page rendered unstyled.

Tailwind writes a rule for a class name only where it finds that name written
down, and the scan it does by itself starts at the project root and refuses
`node_modules`. A repository that keeps the application in `src` is covered by
that scan by coincidence: the root it starts at is the root the markup lives in.
Once the application arrives as a package, every class name the markup uses sits
in the one directory the scan will not read — and finding no class names is not
an error, so nothing reported it. The stylesheet entry now names the
application's source root itself, from inside itself, so the application is
scanned wherever it is read from. That path is relative to the entry, which
travels with the markup it describes, so it holds whether this package is linked
into a tree, hoisted to the top of `node_modules`, or nested under another
dependency — all three measured, all three building the identical stylesheet.

**Two shared files name their decision instead of citing an issue number.** A
deployment that enrols `src/lib/service.ts` or the board-address test in a drift
gate no longer inherits a pointer to an issue its own tracker does not have.

**Upgrading a deployment:**

- Nothing is required, and nothing changes until files move. A repository with
  no `deployment/` directory compiles exactly the files it compiled before and
  collects exactly the tests it collected before — measured against the file
  list `tsc -b` emits, not asserted.
- Take `vite.config.ts`, `tsconfig.json` and `tsconfig.app.json` with the
  release as usual. The alias, the TypeScript include and the test glob all ship
  in them, so there is nothing to edit and nothing to unenrol.
- Keep importing `uno-blueprint/styles.css` exactly as before. A
  deployment's own markup in `deployment/` is still found by the ordinary scan
  of its project root, and its stylesheet gains the application's utilities
  alongside it.
- A deployment that worked around the empty stylesheet with an `@source` of its
  own pointed into `node_modules` can drop it. That path is now this package's
  business rather than something to maintain against a path inside someone
  else's package.

## 1.41.0

A deployment lands on its own cover, the bundled sample stops reaching a
deployment that has a database, and four write paths start filing rows against
the service the author is looking at.

**A deployment brings its own landing page.** `DeploymentConfig` takes a whole
`cover`, and the editor shell reads it through `useCoverContent()` instead of
importing this template's content module — so an installation that mounts this
package rather than forking it lands on its own writing. The cover is replaced,
never merged: every string in this template's cover describes this template, and
there is no field-by-field merge to define for a tree of tabs holding sections
holding figures. Omitted, the template's own renders exactly as it did, which is
what standalone still does. The cover's `title` becomes the wordmark's second
fallback — `content.workspaceTitle ?? cover.title ?? brand.name ?? ORG_NAME` —
because an installation that has named its landing page has named its workspace
and should not have to write the name twice. `CoverContent` and the types under
it are exported from the package root; the renderers stay internal.

**The walkthrough gets one narrow field and not a second seam.** Which lanes it
steps through is derived from their roles, and a lane's label is its name, so
both are read off the board and a config field for either would be a pinned copy
free to go stale. What the board does not record is whether an image file draws
its own border — a cell carries the path, not the picture — so
`storyboard.embeddedBorderPaths` states it, matched as a substring of the frame
path so a deployment names a folder rather than every file. Empty is this
template's behaviour: the chrome borders every frame.

**A failed read is not entitled to say a workspace has no slices.**
`useSupabaseQuery` calls a hook's fallback on two paths — the no-database one,
where the bundled sample is the point, and the error one, where it is not — and
four surfaces render `fallback ?? []`: the slices sidebar, the tab strip, a
cell's "In slices" footer and the mobile shell. A deployment whose slices read
failed or timed out was shown this template's three demo slices as its own, with
nothing on screen saying otherwise. `useSlices` and `useSlice` now ask
`isBundledSampleActive()` — the same question the board and the editor's
navigation ask — and return `null` rather than an empty list. Gated, not made
configurable: a `sample.slices` field would make this an opt-out, and the state
a deployment wants here is "nothing that is not mine".

**Evidence, slices and phases belong to the service you are looking at — and a
deployment with two or more services may already hold rows on the wrong one.**
Four write paths resolved the first service by `created_at`, whatever the URL
said. The evidence panel drew the second service and filed the source against
the first. A new slice was written against a service whose canvas the sliced
cells had not come from, so it could never be seen from the board it was made
on. The sidebar's `+` added a phase to a board nobody was looking at, and a row
menu's "New phase" made a sibling on a different service from the row it was
opened over. All four resolve `resolveActiveServiceId` now, which throws on an
unresolvable slug instead of falling back to a sibling, and the two phase
resolvers key on the slug so switching service re-resolves rather than leaving
the previous service's id behind. **The symptom is silence.** Nothing in the UI
revealed any of it: the row simply does not appear under the service it was
authored for, and it does appear under the oldest one. A single-service
deployment is unaffected by construction — first and active are the same row
there, which is why this survived — but anyone running more than one service
should read `evidence.service_id`, `slices.service_id` and `phases.service_id`
against the boards those rows were authored on before adding more.
`resolveFirstServiceId` is retired and `findFirstServiceId` is module-private,
so a surface can now reach only `findActiveServiceId` (a read, nullable) or
`resolveActiveServiceId` (a write, throwing), and both honour the URL.

**A drag publishes once a frame.** Dragging or resizing a canvas annotation
called `updateAnnotation` off every raw `pointermove` — a hundred and twenty
times a second on a trackpad, each one replacing the annotation collection and
re-rendering every surface that reads it. It batches now, through a queue that
merges the samples of one mark and refuses to merge two. And releasing a
captured pointer throws for an id the element no longer holds, which mid-drag is
ordinary: a `pointercancel` from an OS edge swipe releases the capture on its
way out, so the `pointerup` that follows used to throw and skip its own
teardown, welding the mark to the cursor. `createFramePatchQueue` and
`releasePointerCapture` are the shared pieces, and both are tested.

**Guards a deployment inherits.** Every dial `themes/light.css` declares,
`themes/dark.css` declares too, and `print.css` restates every dial whose dark
value differs from its light one — the check that would have caught the
surface-hue leak, where light's bare `:root` meant a dial dark omitted silently
became dark's value and dark then ran on a number no file of its own ever named.
The brand-accent seam is swept around the hue wheel rather than measured at the
one accent this template ships, so a deployment layering its own accent gains
proof that `semantic.css`'s derivations hold for the accent it chose; the ink
flip's worst case was stated in prose beside the arithmetic and held by nothing,
and it is 3.44:1 at the threshold. The badge-and-tag vocabulary walk survives an
entry that disappears between being listed and being stated, and a new assertion
counts what the walk came back with and names the directories that must be in
it. And a ledger entry recorded under an older `removed_placements` shape still
reverts — captured with and without a `position` on each row, and with the key
written empty as well as omitted.

**The board says "step" everywhere a reader can see it.** The step definition in
the popover a reader opens on the board opened with "A column of the board"; the
hint under the step panel's Summary field promised "the sentence that makes the
column legible"; the meta line said "different columns on 3 paths"; and a slice
that failed validation was refused with "Unknown slice type". Nothing about the
schema moved — these were the words on screen drifting from the words
underneath, which is the defect the retired-copy guard exists to stop. It did
not stop them, because it read JSX text nodes and five props. Its reader-facing
prop list is fifteen now, re-derived from every prop in the tree whose value is
a prose string literal; a local whose name ends `Label`, `Text`, `Hint`,
`Message`, `Description` or `Caption` is read, so a sentence assembled a few
lines above the prop that renders it is no longer invisible; and `panelTerms.ts`
and `sliceValidation.ts` are enrolled by name, because a blanket sweep of
`src/**` was measured rather than assumed and would have needed an exemption
list, which is where a real finding hides. The guard's header now also states
what it still cannot see — the interpolated half of a template literal, copy
assembled anywhere but a named local, a prop nobody has added to the list, and
`src/content/coverContent.ts` by name — because a guard that implies
completeness it does not have is worse than one whose blind spots are written
down.

**The suite holds under parallel load.** Two component tests stopped racing the
clock, so a full `npm test` on a loaded machine is green rather than green on
the second try. The editor-shell test asked `screen` for two buttons by
accessible name after the whole editor had mounted, which computes a name — and
a `getComputedStyle` — for every one of the 272 buttons in the document; scoped
to the rail they are about, which is the stronger assertion as well as the cheap
one, it costs 0.82 s where it cost 1.65 s against vitest's five-second default.
`boardAddressSync.test.tsx` waited a flat 20 ms for the `popstate` that
`history.back()` queues and read the pre-back address when the machine did not
get there in time; it waits for the event. `docs/guidelines/contributing.md`
states both rules, because a suite that is sometimes red for no reason teaches
the person cutting a release to re-run rather than to read.

**Also:** four comments in `sliceMutations.ts` said `origin` for the field a
slice actually carries, which is `authorship`.

### Upgrading a deployment

- **Nothing to apply to the database, and no identifier changed.** No migration
  ships with this release and `identifiers.json` is untouched.
- **A multi-service deployment should audit three columns.** New evidence,
  slices and phases land on the service in the URL from this release forward;
  rows written before it may sit on the oldest service and will need moving by
  hand. Single-service deployments see no behaviour change at all.
- A deployment that supplies no `cover` sees no change — the template's own
  landing page still renders. To supply one, write a content module against the
  exported `CoverContent` type and name it on the config:

  ```ts
  import type { CoverContent, DeploymentConfig } from "uno-blueprint";

  export const coverContent: CoverContent = {
    title: "The workspace name shown on the cover and in app chrome",
    lede: "One paragraph under the heading.",
    primaryCtaLabel: "Open the blueprint",
    repoUrl: "https://github.com/<owner>/<repo>", // optional; guide links are dropped without it
    commandCopy: { copyLabel: "Copy", copiedLabel: "Copied" },
    states: { noSlices: "No slices in this workspace yet." },
    tabs: [
      /* sections may be `prose`, `figure`, `defs`, `portrait` or `skill` */
    ],
  };

  export const deploymentConfig: DeploymentConfig = { cover: coverContent };
  ```

  The cover is taken whole, never merged, and `lede`, `primaryCtaLabel`,
  `commandCopy`, `states` and `tabs` are all required. Figure and portrait `src`
  values are paths this deployment serves itself; nothing is copied out of the
  template's `public/cover/`.

- A supplied `cover.title` becomes the wordmark unless `content.workspaceTitle`
  says otherwise, which still wins. A deployment that wants its workspace called
  something other than its cover heading keeps saying so there.
- Set `storyboard.embeddedBorderPaths` only if this deployment's own storyboard
  artwork already draws its border. Each entry is matched as a substring of a
  cell's frame path, so name a folder rather than every file; omit the section
  when no artwork does.
- A deployment with `VITE_SUPABASE_*` set now shows no slices when a slices read
  fails, where it previously showed this template's demo slices. With no
  database configured the bundled sample still serves both the list and each
  slice exactly as before. A deployment that emptied `data/sliceFallbacks.ts` in
  its own fork to stop the leak can stop doing so.
- Visible copy changes a deployment's own tests may match: the step definition
  in the board popover, the hint under the step panel's Summary field, the step
  panel's meta line, and the slice-validation refusal now say "step",
  "position" and "slice kind".
- A deployment taking the retired-copy guard inherits a wider subject: fifteen
  reader-facing props, copy locals by name suffix, and the `.ts` modules named
  in `COPY_MODULES`. A deployment whose own copy lives in other `.ts` modules
  enrols them there.
- A deployment taking the component suite inherits two rules now stated in
  `docs/guidelines/contributing.md`: scope an accessible-name query to the
  region it is about, and wait for the event rather than a flat timeout.

## 1.40.5

### Patch Changes

- 903e112: Every source file ends with a newline, and a test keeps it that way.
  `overviewPathFilters.ts` did not, which is unfixable on the consuming side —
  a deployment holding that file byte-identical differs from it by one absent
  byte, and one absent byte was blocking an enrolment.
- a5be84d: The README's repo map names a stylesheet that exists. It pointed at
  `src/styles/tokens.css`, which this tree has never had; the token layers are
  `colors.css`, `semantic.css`, `theme.css` and `themes/`, and they are listed
  in the order they resolve. The type guards get a line of their own, because a
  reader adopting this template needs to know the doctrine is enforced rather
  than described.

## 1.40.4

### Patch Changes

- d2dabe6: The type guards name the decision rather than its record number. `ADR 0012`
  in `typeWeight.ts`, `typeInk.ts` and their tests — including the strings the
  failure messages print — is an address that resolves to a different decision
  in a deployment that consumes these files, so the guards could not be
  enrolled in a deployment's byte-identity gate. Same rules, same messages,
  minus eleven citations.

## 1.40.3

### Patch Changes

- 44c4bd1: A section label and an eyebrow each have one spelling.

  Two label primitives existed and both were being bypassed. A dependency group inlined its own capitalised label while every other panel section used `PanelSectionLabel`, so the cell panel showed two kinds of section heading at once. And the small capitalised label over a region of chrome — the eyebrow — had been written by hand in twenty-odd places at two different letterspacings, which is invisible in review because every utility in those strings is legal on its own.

  Panel sections are sentence case; eyebrows are `Eyebrow`, one spelling in one file. The open question of whether an eyebrow should be monospace, as this type register's third face suggests, is now a single line in that file rather than a decision the tree answers twenty times. A test refuses a hand-spelled eyebrow in any authored component.

- 44c4bd1: The type, colour, layout-number and vendoring records read as instruction.
  ADRs 0008, 0012, 0013 and 0014 argued their decisions by comparison with a
  named product — its numbers quoted, its file counts cited, its choices taken
  or declined in front of the reader. A record consumed as source is read by
  someone who never saw that deliberation, so each now states its rule, what
  it forbids, and the reason in terms of this tree. Provenance survives as one
  sentence where a system was genuinely ported. No decision changed.
- 44c4bd1: Ink is named, never dialled. Every authored surface outside the vendored
  `components/ui/**` wrote its text colour as one of three rungs —
  `text-foreground`, `text-muted-foreground`, `text-tertiary-foreground` —
  in place of 68 opacity dials at eight different lightnesses across 39
  files. A lightness could not be read back: nothing said whether `/70` and
  `/75` were two jobs or two afternoons, and an opacity composites against
  whatever sits behind it, so the same class was a different colour on a card
  than on a page. `typeInk.ts` holds the rule at the class-list seam and names
  the rung to write instead, and ADR 0012 gains ink as a fifth axis.
- 44c4bd1: Leaving the board closes the cell panel.

  Open a cell, switch to a slice or a presentation, and the drawer stayed on screen over the slides — describing a row that was no longer visible, with closing it by hand the only way out. The board is deliberately never unmounted, so the drawer inside it survived the tab change; the panel's reset key tracked navigation _within_ a board, which is why activating a tab changed nothing in it. The workspace tab is part of that key now, which settles what the panel's placement left open: an open cell is a fact about the board, not about the workspace. `?cell=` follows, so the address bar stops offering a share link to a drawer nobody has open.

- 44c4bd1: The no-key model list is current, and says what it is.

  The list a person sees before saving a key was a year out of date — it offered `gemini-3.6-flash` when the provider serves `gemini-3.8-flash`, and its first entry is also the default a person keeps running if they save a key without opening the dropdown. All three providers are refreshed, with the policy written beside them: three entries, newest first, no previews or dated snapshots or moving aliases, verified by calling each provider's list-models endpoint on the day of the change. Google was called; OpenAI's entries come from the published docs and say so, because no key was available to confirm them against an account.

- fce9431: The test suite runs with the dev-server authoring flag off, whatever a
  developer keeps in their own `.env.local`. `VITE_DEV_AUTHORING_UI` is read
  once at module load, so a suite that inherits it starts with write flags
  already up and fails only on the machine that has the flag.

## 1.40.2

A vendored file names the decision it diverges for, never the record number.

Seventeen citations of a record number went out with the colour-job pass:
sixteen headers reading `(ADR 0014)` and one reading `(ADR 0008)`. A record
number belongs to the repository that assigned it, and this tree is consumed as
source — so a deployment reading `ADR 0014` in a file it shares with this
template resolves it against its own records, where 0014 is a different
decision or none at all. The reader arrives at the wrong page, or at no page,
and believes they have the reason.

The headers now say it in words: a divergence from the vendored source is
allowed only with a stated reason, and the reason is the sentence that follows.

A test holds the rule where the files are written. It existed only downstream
before, in a deployment's reconciled gate, which runs against an installed copy
after a release — which is how sixteen of them shipped and were found by a
deployment bumping its pin.

### Upgrading a deployment

Nothing renders differently. If your deployment enrols any of the vendored
primitives as reconciled files, adopt this release's copies: the bytes changed
in comments only.

## 1.40.1

Shared controls apply the same colour jobs as the design system these
primitives were ported from, and a scoped ranked search stops claiming rows are
somewhere it cannot know they are. No mix dial moved: the numbers already
matched, and what was wrong was which job got applied.

**An empty field looks empty.** A placeholder sat on caption grey — the colour
of text somebody had typed — so an empty field read as one that already held a
note. Empty Input, Textarea, select and command search take hint grey. Text
entry sits on the sunk `bg-field` plate instead of borrowing the page colour;
the select trigger sits on the raised control plate with a hover edge, so a
chooser is raised where a field is sunk. A read-only field reads as a caption
on the ordinary border — on both Input and Textarea, and gated on `enabled:`,
because CSS `:read-only` also matches a disabled field.

**Floating chrome sits on the page.** A tooltip is a page-coloured surface with
ordinary ink and the overlay ring every other floating surface carries, rather
than an inverted slab; a dialog sits on the page surface, not the card plate; a
sheet overlay is the page colour at high opacity, with the panel's own hairline
named rather than defaulted, because the two are within ~0.005 lightness in the
light theme. The default badge is a quiet tag, an outline button keeps the page
colour in dark as well as light, a ghost button lifts on the accent, and a
destructive button is a solid fill rather than a tint that read as a badge
describing a risk.

**Quiet chrome recedes, and a chosen control does not.** Descriptions, inactive
tabs, chevrons, section labels, shortcuts, group headings, breadcrumb links and
separators drop one rung to hint grey; captions that must stay readable do not
move. A chosen select row and a pressed toggle restore full ink, so the
selection is not the quietest thing on screen — before this, hovering an
unpressed toggle made it look more chosen than the pressed one.

**Vocabulary.** `compat.css` and its three alias names are gone, with a ratchet
that refuses their return: a second spelling with no consumers reads as
available, so a borrowed snippet gets rewritten into the semantic name rather
than re-registering the alias. Each vendored file states in a header which job
changed and why, per ADR 0014, so a re-vendor is a merge rather than a surprise.

**The agent's ranked search tells the truth about scope.** Under a `service`
scope, an empty result said the rows were "all outside" that service whenever
any came back — including when every one of them was dropped as ambiguous (a
phase name two services share) or unplaceable (no phase breadcrumb). Those rows
were placed nowhere and may belong to the scope, so the sentence asserted the
one thing the tool cannot know. "Outside" is now said only of rows actually
placed elsewhere. Stop also reaches the search call and the phase-ownership
read, not only the question's embed, so pressing it cancels the slowest read the
agent makes.

**The brand seam may carry its own hex.** `config.ts` is where an installation
writes its accent, and that accent cannot be a token — it is the input the
tokens are derived from. The no-raw-hex rule forbade it anyway, so a deployment
had to fork the rule or unenrol the file. The rule now allows the seam exactly
one hex and checks that it IS the accent `BRAND` exports, which is stricter than
an exemption: a second hex, or one unrelated to the ramp, still fails. This
template exports no accent, so the allowance here is zero and nothing about its
own tree changes.

## 1.40.0

The canvas agent can search the blueprint by what it says — on the deployments
that have built ranked search, and with the person's own key doing the one step
a browser can honestly do.

**The tool, and why it is usually absent.** `search_blueprint` is ranked
retrieval for when the caller has words but not a name or an id. It is the one
read that needs a database function this template's schema does not ship, so it
is OFF by default: a deployment whose database carries the function says so with
`agent.search.enabled`, and until then the tool is not on the agent's roster at
all. Absent, rather than present and failing on its first call. Results are cut
at `limit` (default 15, at most 100) under a header with the corpus-wide total,
every row reports `matched_by`, and the `phase`, `scenario`, `kind`, `lane_role`
and `service` narrowing the journey reads take applies here too.

**A person's own key embeds the question.** `agent.search.indexes` lists the
vector indexes a deployment's database holds — `{ provider, model, dimensions }`
— and when the person's current chat provider matches an entry, their question
is embedded in their browser with their own key, at that entry's model and size.
Two keys, one model: the person's key embeds the question, the deployment's own
job embeds the cells with a server-held credential this template never holds.
Google embeds through `embedContent` with the key in `x-goog-api-key`, never a
query string, as `RETRIEVAL_QUERY`; OpenAI through its embeddings endpoint with
an `Authorization` header and the listed size, so serving OpenAI-key users later
is a deployment's index and config rather than another template change.
Anthropic has no embedding model and is never listed.

**Who is offered what.** An empty index list is a supported state: the tool is
offered to everyone and matches words and structure only. A listed index the
person's provider cannot reach is different — those people are not offered the
tool, quietly, because a keyword search presented as the same search everyone
else has is worse than no tool.

**Nothing claims an arm that did not run.** The result header names the arms
that ran, and a zero-row answer says what their silence does and does not prove.
A failed embed — a rate limit, an outage, an offline browser, a body that is not
JSON, a vector of the wrong width, an eight-second stall — falls back to exactly
one words-and-structure call; every other database error surfaces, so a broken
search is never reported as a search that found nothing. A scoped read keeps the
function's own corpus-wide total rather than retotalling to what the scope kept,
and rows that matched in another service are reported as that. Rows are placed
by phase name, so a phase name two services share places nothing and the count
is named in the text instead of the row going to the wrong service.

**A scope speaks for the ranking, not for the service.** The function ranks and
clips before any per-service filtering can run, so when the whole top-k lands
outside the scope the text says exactly that — the top N of T matching rows are
elsewhere — and names the remedies that can surface the in-scope rows: add a
phase or scenario, or raise the limit. Rows placed in another service, rows no
service could claim, and rows carrying no phase breadcrumb are counted apart,
because the last is a fault in the function rather than a fact about the data.
Every closed filter vocabulary is checked before anything is embedded.

**For adopters.** `docs/connectors/supabase/database.md` states the function's
argument and column contract, the `embedding model mismatch` requirement, the
`RETRIEVAL_DOCUMENT` / `RETRIEVAL_QUERY` pairing, and that every row must carry
its phase breadcrumb. `references/customization.md` shows the config.

### Plugin contract

- `search_blueprint` is a new agent tool name in `identifiers.json`. Additive:
  nothing was renamed, and a deployment that does not switch search on never
  sees it.

## 1.39.0

A connection is edited where it sits, a deployment names the lanes a new
blueprint starts with, the canvas agent lists the whole blueprint, and a phase
row draws each scenario's happy path.

**Dependencies.** In Edit mode, each connection a cell is the source of becomes
a row of fields in the group it already sits in. The kind and the target save
when they change, and the note saves when its field loses focus. A connection
that arrives from another cell opens that cell. One database function,
`update_cell_dependency`, makes the edit in one transaction, so changing a kind
or a target no longer leaves a second row drawn.

**The overview.** A phase row draws each scenario's happy path, and the focused
scenario draws what its own picker says. Every path picker shows each path's
status. Scenario panels sit further apart, focus dims a phase's parts rather
than the whole phase, zoomed out each cell is its own block, and the slide
sheet's header says "Slides".

**The agent.** `list_blueprint` lists phases, scenarios, paths, steps, lanes or
cells, with ids, in the order a person reads the board, under a header with the
true total. `list_scenarios` is its alias for one release.

**Also:** a path kind reads one word everywhere (Happy, Variant, Exception).
Visible copy says "step" where it meant a step. A new cell gets its lane role's
budget. The service header describes the service on the canvas. The token guard
catches absolute white and black and `var(--color-…)` reaches. The prose and
docs checks read this repository's own numbers from `scripts/repo-config.mjs`.

### Upgrading a deployment

- Apply `21000226000000_a_dependency_can_be_edited_where_it_sits.sql`. It adds
  `update_cell_dependency`. Until it is applied, an edit made in the
  Dependencies panel fails under its row with a "function does not exist"
  message, while adding and removing connections keep working. A deployment
  that renders `CellDependencySections` itself passes the new optional
  `editing` prop to turn edit mode on.
- To start new blueprints with a deployment's own lanes, supply
  `DeploymentConfig.defaultLanes`. A supplied list replaces the template's
  standard set whole. Left out or empty, the standard set is unchanged.
- `CreateBlueprintDialog` now reads the deployment config, so a test that
  renders it wraps it in `DeploymentConfigProvider`.
- `PATH_KIND_SHORT_LABELS` is removed. `PATH_KIND_LABELS` in
  `@/lib/pathKindTheme` now holds the one-word labels, and `versionValidation`
  no longer exports it.
- The agent tool `list_blueprint` is added. `list_scenarios` stays for this
  release as its alias and is then removed. `listScenarios`,
  `sampleListScenarios` and `formatScenarioList` are removed; use
  `listBlueprint`, `sampleListBlueprint` and `formatBlueprintList`.
- `usePhaseBlueprintFilters` no longer returns `filterPaths`,
  `filterSelectedPathIds` or `toggleFilterPath`, and takes a
  `focusedScenarioId`. `PathsSidebarSection` and `ScenarioBlueprintPanel` are
  removed.
- The service-scope and reference-registry tests read
  `readReference('canvas-adapter')`, the adapter the agent is served after any
  `registerReferenceDocs` replacement, rather than a file at a fixed path. A
  deployment can hold them byte for byte.
- The router, glossary, sweep and docs-index scripts read their numbers from
  `scripts/repo-config.mjs`. A deployment that takes those scripts writes its
  own copy of that file.
- Visible copy changes that a deployment's own tests may match: the create
  dialog's count field says "Steps" where it said "Columns", along with the
  step handle and two authoring errors; the last dependency group says "Also on
  this step"; the slide sheet's header says "Slides". The copy guard now fails
  if "column" or "columns" comes back on screen.
- Nothing else to apply to the database.

### Plugin contract

- `list_blueprint` joins the agent tool names in `identifiers.json`. It is an
  addition; `list_scenarios` keeps its place as an alias.

### Minor Changes

- 2ff069c: A connection in a cell's Dependencies tab can be edited where it sits. In Edit mode, each connection the cell is the source of becomes a row of fields in the group it already sits in. The kind and the target save as soon as they change, and the note saves when its field loses focus. A connection that arrives from another cell carries a pencil that opens that cell, because a cell edits only the connections it is the source of. A row that cannot save says why underneath itself. The groups keep their split by direction (Follows, Leads to, Enabled by, Enables), and the last group is renamed from "Tech in this step" to "Also on this step". The add form no longer repeats the cell's connections, because each row now carries its own remove control.

  The edit is one database function, `update_cell_dependency`, which changes a row's kind, target and note in one transaction. Changing a kind or a target through `set_cell_dependency` used to insert a second row and leave the first one drawn. The new function returns the row as it stood, and the session's undo feeds those values straight back, keyed on the row's own id.

  **Upgrading a deployment:** apply `21000226000000_a_dependency_can_be_edited_where_it_sits.sql`. Until it is applied, an edit made in the panel fails with a "function does not exist" message under the row, while adding and removing connections keep working. A deployment that renders `CellDependencySections` itself passes the new optional `editing` prop to turn edit mode on; without it, the list reads as before.

- dfef5a2: A deployment names the lanes a new blueprint starts with. `DeploymentConfig` has a new optional field, `defaultLanes`, which is a list of `LaneSetEntry` (`{ name, lane_role, position }`). When someone creates a blueprint without copying lanes from an existing one, the new blueprint starts with those lanes, and the lane picker's "Standard set" option counts them. If the field is left out or empty, the new blueprint starts with the template's standard set, which is unchanged: Storyboard, Customer Actions, Front Stage Touchpoints, Front Stage Actions, Back Stage Touchpoints, Back Stage Actions and Support Actions. A supplied list replaces that set whole and is never merged with it.

  `blueprintValidation.ts` no longer has to be forked for a deployment's own lanes. `laneSetFor(draft, defaultLanes)` takes the resolved lanes as an argument, and `CreateBlueprintDialog` passes what `useDeploymentConfig()` resolved. To supply its lanes, a deployment adds the field to the config it passes to `App`:

  ```ts
  export const deploymentConfig: DeploymentConfig = {
    defaultLanes: [
      { name: "Storyboard", lane_role: "storyboard", position: 0 },
      { name: "Caller", lane_role: "customer_actions", position: 1 },
      // …one entry per lane, top to bottom
    ],
  };
  ```

  `CreateBlueprintDialog` now reads the deployment config, so a test that renders it has to wrap it in `DeploymentConfigProvider`, the same way the app already does.

- 5059d40: A phase canvas now draws each scenario's happy path and nothing else. The phase header no longer offers a path filter: it folded paths across scenarios by kind and name, and once every path has its own name that fold folds nothing, so it listed unrelated routes as though they were one choice. The focused scenario still draws what the reader picks in its path picker, and its variants and exceptions stay reachable there. Choosing a path inside one scenario no longer changes what the scenarios beside it draw, even when they have a path of the same name. Clearing every path in a focused scenario shows the "No paths selected" state with its restore action, rather than dropping that scenario out of its row.

  Every path picker now shows each path's status (the top-bar path menu, the scenario path checklist and toggles, and the walkthrough's path menu). The board's query already selected `paths.status`; it now reaches the path list instead of being dropped. Inside a picker the status is part of the row's text rather than a second focusable control nested in it, so a click on it still toggles the path.

  The editor's `getScenarioDisplayViewType` now answers `undefined` for a scenario that has made no layout choice, so a phase row's shared view reaches those scenarios and an explicit "stacked" is no longer indistinguishable from no choice. Choosing Stacked for a scenario with no choice still writes nothing.

  The overview canvas renders less on navigation: phase bodies are memoised with stable per-scenario handlers and a stable scope, and a canvas click opens its scenario as a React transition. The unused `PathsSidebarSection` component, the `ScenarioBlueprintPanel` wrapper that nothing mounted any more, and the dead `isOverviewPathFilterChecked` and `toggleOverviewPathFilter` helpers are removed. `usePhaseBlueprintFilters` no longer returns `filterPaths`, `filterSelectedPathIds` or `toggleFilterPath`; it returns `resolveHappyPathIds` and `resolveDrawnPathIds` beside `resolveSelectedPathIds`, and takes a `focusedScenarioId`.

- e1e80ef: The slide sheet's header says "Slides", and the overview gives every target room of its own.

  **The slide sheet.** Its collapsible header said "Storyboard", which is the name of a lane. What the sheet holds is slides, and its own buttons already said so ("Add slide", "Remove slide 2", "Keep slide"). The header now says "Slides" too. The Storyboard lane keeps its name.

  **Room on the overview.** Scenario panels in a phase row sit 360px apart, up from 192px. The phase frame pads its row by 120px at the sides, up from 24px, and by 48px at the bottom, up from 24px. The top inset stays at 28px. Zoomed out, neighbouring scenarios and the phase band around them no longer blur into one target. The phase badge now sits on the frame's own left edge instead of a band's width in from it.

  **Focus dims the parts, not the phase.** When a phase or scenario has focus, the phases around it used to dim as one translucent layer, with a desaturating filter and cells made pass-through. Nothing inside that layer could become clearer than it, and it stacked under the fade the camera plays during a flight. Now each dimmed phase dims its frame, its badge and each scenario separately, with opacity only. A dimmed phase stays clickable. Hovering its band lifts the whole phase part-way, and hovering one of its scenarios brings that scenario up to full ink without lifting its siblings.

  **The blocks tier.** Zoomed out past the text threshold, each drawn cell becomes its own block. A row of touchpoints is no longer one slab, and a cell without an id is no longer left as text. The row and column labels become neutral skeleton bars in the same boxes, and in forced-colors mode those bars take the system ink.

  **Touch.** A scroll region inside the board that carries `.blueprint-scroll` now takes `touch-action: pan-x pan-y`, so one finger can scroll it while pinch-zoom stays with the canvas.

- 8552572: The canvas agent gains `list_blueprint`: the complete set of phases, scenarios, paths, steps, lanes or cells — any mix of them — with ids, in the order a person reads the board. It takes `phase` and `scenario` by name, `kind` for paths, `lane_role` for lanes and cells, and the shared `service` scope, and returns every matching row up to `limit` (default 200, at most 500) under a header with the true total, so a clipped list says it was clipped. It is a plain list: no query and no ranking. A word outside a vocabulary (a rung, a path kind, a lane role) is refused with the list rather than read as a filter that matches nothing. It reads the tables the board already reads, over plain PostgREST, a page at a time so the total survives the server's row cap, and needs no new database function. The no-database trial answers it from the bundled sample through the same walk and the same text.

  `list_scenarios` is now an alias of `list_blueprint` with granularity `["phase","scenario"]`, and its description says so. It stays for one release and is then removed. Its output takes the list's row shape. An earlier release recorded that the journey read would stay `list_scenarios`; this reverses that.

  `LANE_ROLE_FILTER_PARAM` is exported from `src/lib/agent/tools/specs.ts`, built from `CANONICAL_LANE_ROLES`, and held to the lane-role constraint by the lane-role roster test. `listScenarios`, `sampleListScenarios` and `formatScenarioList` are removed; use `listBlueprint`, `sampleListBlueprint` and `formatBlueprintList`. The canvas adapter names `list_blueprint` in its read and service rows, and the eval harness answers both names.

### Patch Changes

- d15e25b: A path kind is called one word, the same everywhere: Happy, Variant, Exception. The badge said "Happy" while the new-path picker, the colour key's hover title and the badge's own tooltip said "Happy path", because the labels lived in two maps in `pathKindTheme.ts` and a third copy in `versionValidation.ts`. There is now one map, `PATH_KIND_LABELS` in `pathKindTheme.ts`, and a test mounts the badge, its tooltip, the colour key and the picker and holds that each kind reads the same single word on all four. A name an author gives a path is untouched: a path called "Happy path" keeps that name.

  **Upgrading a deployment.** `PATH_KIND_SHORT_LABELS` is gone, and `PATH_KIND_LABELS` replaces it: it now holds the one-word labels. `versionValidation` no longer exports `PATH_KIND_LABELS`; import it from `@/lib/pathKindTheme`. Nothing to apply to the database.

- cbc90d5: The router, glossary, sweep and docs-index checks now read the numbers and paths that belong to one repository from a single file, `scripts/repo-config.mjs`: the router's character budget and slack, the recorded prohibition count, the folders the prose sweeps read, the interface map's path, and the docs index's routing table and reading paths. The scripts themselves carry no repository's values any more, so a deployment can keep the same scripts and write its own config file. Every check prints exactly what it printed before; the one generated change is the banner on `INDEX.md`, which now says to edit the routing table in the config file. Failure messages that told you which constant to change now name the config file.

  The sweep no longer throws when a folder it is told to read does not exist. A repository without `references/`, `skills/` or `agents/` gets its docs swept and nothing else, and a test holds that. The sweep's list of skipped trees is now called `DATED_RECORDS`, because it holds decision records, not history in general.

- 0509e66: A new cell is measured by its lane's role. The draft a new cell opens on now carries the role of the lane it was opened in, so a cell created in a touchpoint lane with a custom name gets the touchpoint budget, the same as an existing cell in that lane. Before, only the legacy lane names reached it.

  The template now tests modules it shipped untested: annotation capture, the dependency and version authoring rules, deletion safety, slice kinds, cell content writes, the cell pick grammar, finding fingerprints and the session change log. New source checks pin that an ambiguous embed names its foreign key, that an alias does not bring back a retired name, that a form key is a column, that a definition hangs off a badge, that every entity kind defines itself, that no fill name carries a retired word, that both dependency kinds read source-first, and that the agent tool schemas and handlers agree on argument names. Two component tests pin that a dimmed scenario or phase stays navigable and that the badge row mounts the simulated-tier badge.

- 40dbe61: The service-scope and reference-registry tests now pass in a deployment that holds them byte for byte. They check the canvas adapter the agent is actually served, meaning the reference registry's `canvas-adapter` record after any `registerReferenceDocs` replacement, against the live tool specs. They no longer read a file at a fixed repository path. The test comparing the source `references/canvas-adapter.md` with its generated copy still runs here, and skips where there is no `references/` folder. A new case shows that a registered replacement adapter is the one checked against the tools that take `service`.

  Visible copy now says "step" wherever it meant a step: the create dialog's count field ("Steps", previously "Columns"), its whole-number message, the step handle's tooltip and accessible name ("Select the … step"), and the two authoring errors about a step missing from a version or two steps sharing a position. "column" and "columns" join the retired copy words, so the reader-facing copy guard fails if either comes back on screen.

  `authoringErrors.ts` and its test name the decision that a lane's position is unique within its path, in place of a migration version.

- 02d5ee7: The service header and the definition examples now describe the service the board is drawing. Both used to read the first service by creation date, so with more than one service the header could name a different service from the one on the canvas. They now resolve the active service the same way the board does, wait for the session before asking, and send the counts and the business model together.

  The new-cell form names its row with the real lane badge, tinted in that lane's colour; it used to paint a role name as a colour and render untinted. The evidence form uses the panel's own select for Kind and sets Kind and Title on one row. The Value editor suggests audiences from the stakeholder registry first, then anything already written that the registry does not know. Storyboard frames are rounded concentrically inside their cell, so selection no longer pinches the corners.

  Tests now cover the role select, a name-only touchpoint's interactive face, and the stakeholder, status, field-label and divider definitions, and their fixtures no longer carry one deployment's vocabulary.

- 4f2926a: The token-discipline guard now reads the two routes to a primitive colour that it used to miss. Absolute `white` and `black` utilities, including their alpha forms such as `bg-white/10` and `ring-black/[0.04]`, count as ramp steps. A `var(--color-{ramp}-{step})` reach is also caught, both in TypeScript and in every stylesheet outside the layers that declare or register the ramps. Categorical colour, such as lane identity fills, path inks, annotation swatches and modal scrims, is exempted file by file with a reason. Each exemption list is checked so that an entry falls away once its file no longer needs it.

  The annotation style bars no longer spell absolute white. They use the mode-invariant ink ladder that `semantic.css` already declared for that chrome (`--foreground-annotation-chrome` and its rungs). Every rung is the same white at the alpha the call site already used, so nothing changes on screen. The stroke-weight swatch lost the `dark` prop it branched on, because its only caller always passed it.

## 1.38.0

The slide sheet behaves like a sidebar, the canvas agent reads back more of
what the board holds, and a set of fixes a deployment grew come home.

**The slide sheet.** The divider sets its height, a card taller than the
sheet scrolls inside itself, the caption grows into the room the card has,
and the sideways scroll bar is gone. A slide has no delete button: it goes
when its last cell does, and asks first when it carries a caption or an
uploaded image.

**The agent.** `get_blueprint` shows each path's dependency edges, `get_cell`
shows the cell's resources, `list_findings` filters by cell, and a
deployment's registered canvas adapter now reaches the system prompt.

**Fixes.** A dependency maps the same way through either door, revert
coverage reaches touchpoint mutations, the open-findings duplicate is named,
and a new blueprint's first version is named for its route rather than
prefilled with its kind.

### Upgrading a deployment

- `SliceSlideEditor` takes a new required `onRemoveCells` prop. A deployment
  that renders it directly passes a handler that settles the slides a change
  emptied; the template's `SliceEditSession` does this with `settleSlides`.
- A replacement `canvas-adapter` registered through `registerReferenceDocs`
  now reaches the agent's prompt as well as `get_reference`.
- Nothing to apply to the database.

### Minor Changes

- a84409b: The canvas agent reads back more of what the board holds, and a deployment's
  own adapter reaches the agent's prompt.

  `get_blueprint` now lists each path's dependency edges after its grid,
  source-first with the edge's kind and id. The board query always joined them;
  the text dropped them, so the agent could write an arrow and not see it in the
  grid. `get_cell` now includes the cell's resources, each one's name and url.
  `list_findings` takes an optional `cell_id` and returns only the findings that
  cite that cell. The no-database sample trial gives the same answers for all of
  these.

  `create_cell_dependency` now says in its description that `leads_to` and
  `enables` are not inverses, since a precondition causes nothing. The tool
  declarations gain a comment on how tools are named.

  The `get_reference` description tells the agent to read `blueprint` first only
  when a deployment has registered a document by that name. Standalone, the
  wording is unchanged.

  The canvas adapter now says what the code does: a read that takes a `service`
  filter covers every service in the deployment when the filter is left out. It
  used to say such a read stayed on the service on screen. A test holds every
  tool description and the adapter to that behaviour.

  The system prompt now takes the canvas adapter from the same record
  `get_reference` serves. Before, a deployment that registered a replacement
  adapter through `registerReferenceDocs` changed what `get_reference` returned
  but not the prompt.

  The eval harness takes its write list from the app's write roster instead of a
  hand-written copy. The copy named one tool twice and left out the evidence and
  stakeholder writes.

### Patch Changes

- 5dbdc21: A board's dependencies now come out of the normalizer the same way whichever door they arrive through. The top-level `cell_dependencies` branch spread the raw row, so any extra column the query carried rode along onto the edge; both branches now share one mapping that lists the six fields an edge has. Tests hold the two doors to the same shape.

  A finding that is reopened while an open twin already exists now says so ("That finding is already open") instead of the generic "something with that name or position already exists", which asked the author to rename something they never named.

  Guards close three gaps. The revert-coverage contract now reads `touchpointMutations.ts`, and lists `rename_touchpoint` as the real function its undo calls. The cell-spec contract now compares every column the board selects for a cell against the normalizer's mapper, not just the five spec columns. And tests pin the retired `frame` presentation-link param as still readable and never written back, plus the undo of a placement edit captured when placements still had screenshot and URL columns.

  Creating a scenario no longer fills the first version's name with "Happy Path": a kind is not a name, and the version already carries its kind. The field starts empty with an example placeholder, the validation message says what a good name looks like, and the RPC fallback is "Main path". `BlueprintStep` now types the `summary` the normalizer already maps, and the dependency `kind` and `note` docs say what each value means.

- a61796f: The slide sheet works like a sidebar turned on its side.

  - It takes the height its divider gives it. The divider used to set only a maximum, so dragging past the tallest card moved nothing.
  - A card taller than the sheet scrolls inside itself instead of cutting off its images and caption. The caption grows into whatever height the card has left.
  - The sideways scroll bar is gone. A trackpad swipes across, and a mouse wheel scrolls the strip sideways once the card under the pointer has nowhere left to scroll.
  - A slide has no delete button any more. Taking its last cell out removes it, whether the cell leaves by the strip's ✕, a drag to another slide, a click on the canvas, or clearing the canvas. When the slide carries a caption or an uploaded image, a confirmation names the slide and what goes with it ("Remove slide 2, “Setup”?"), with Keep slide as the safe answer.

## 1.37.1

### Patch Changes

- 4869a6c: Shared files name the decision they cite instead of an address that means
  something else in a deployment.

  Five comments in the stylesheet cited an ADR by number, and one each in the
  illustration upload, the deployment config and the mobile navigation sheet
  cited a migration version or an issue number, and the reference loader cited
  an ADR by number. A deployment reads these files
  byte for byte, and in its own repository each of those addresses names a
  different record or nothing. Comment-only; no behaviour changes.

## 1.37.0

A type system written down and enforced, three new deployment config seams,
and the decision records that govern the template moved into it.

**The type system.** Two ladders selected by face: sans rungs from 12 to 46px,
and the mono scope on its own scale. Leading comes from the rung, and one
working weight is 400, with 500 for labels and 600 for headings. The floor is
12px. The four sub-12px rungs (`text-2xs` to `text-5xs`) are deleted, and a
guard fails a tenth rung in either scope. The rules are ADR 0012.

**Deployment config.** Three things a deployment used to change by editing
shared code now come from `DeploymentConfig`:

- `pathColorPins`: path names pinned to a colour slot
- `cellBudget`: the cell-text target and warning for each lane kind. The
  cell editor's 120-character hard stop is gone, and a person and the agent
  get the same advice at the same thresholds.
- the agent account: `npm run agent-account` renders a deployment's account
  of its schema from a connected database, and `check:agent-account` holds
  it. A deployment registers the generated document through the
  extra-reference seam.

**Decision records.** Nine ADRs about the template's code and how a
deployment consumes it now live here, as 0013 to 0021. Five copies that had
drifted are folded into this repository's records.

**Also:** "template" replaces "kit" everywhere, including on-screen text. A
presentation cell badge opens its own cell, including when the slice tab was
not open. The storyboard's unreachable presentation layout and its 8px lane
caption are gone.

### Upgrading a deployment

- A class naming `text-2xs`, `text-3xs`, `text-4xs` or `text-5xs` no longer
  generates a size and silently falls back to the inherited one. Move it to
  `xs`, or to the rung the text's job calls for.
- Apply `21000225000000_a_comment_is_prose_that_ships_to_agents.sql` before
  running `npm run agent-account`. It adds `public.schema_comments()`.
- To keep budget numbers other than 120, supply `cellBudget`. Pins that lived
  in the theme file move to `pathColorPins`.

### Minor Changes

- 987c838: A database that answers with nothing is still the answer: the bundled sample
  no longer fills a connected deployment's navigation while the first fetch is
  in flight, or when the workspace genuinely has no phases.

  **A connected deployment was showing this kit's phase and scenario names on
  every page load.** Not through a merge — #497 closed that one — but through
  timing. The navigation fell back to `sample.nav` whenever the structure read
  came back with no rows, and "no rows" covers three states, not one: no
  database configured, a database whose first fetch has not returned yet, and a
  database that holds no phases. Only the first is the fresh clone the sample
  exists for. On the other two the sample arrived as the deployment's own, with
  nothing on screen saying so — and the second of those happens on every single
  load, in the window before the query resolves.

  The question the navigation asks is now `isBundledSampleActive()`, the same
  one the board has asked since #493: is a database configured at all. A
  configured deployment's navigation is its rows, whatever they are, including
  none of them.

  **What you will see change.** If your deployment has a database, the phase
  list is briefly empty on load where it used to be briefly full of somebody
  else's phases, and a workspace with no phases in it now says so — "No phases
  in this workspace yet", on the canvas and in the phone's drawer — instead of
  drawing this kit's blueprint. Loading and empty are deliberately different on
  screen: a load is the progress bar and the skeleton rows it always was, and
  only a read that has actually come back bare gets the empty message. If no
  database is configured, nothing changes at all; the fresh-clone nav is
  exactly what it was, and the test that pins it as EXACTLY `SAMPLE_NAV` is the
  one that already existed.

  **What changed under it.** `EditorContext`'s `slides` is no longer guaranteed
  non-empty, so `activeSlideId` and `activeSlide` are `string | null` and
  `NavItem | null` rather than two `slides[0]!` assertions resting on a fallback
  that has gone. Every reader was made to say what it does with no board: the
  canvas draws an empty state, the docked header and the prev/next controls
  draw nothing, and the camera falls back to fitting the whole canvas. The
  phone's phase list gained the loading skeleton and empty message its slice
  list already had.

- 55ef0ac: The agent searches every service, and nothing configures that.

  The ⚙ settings popover carried a `Scope` row — `Active service` or
  `All services` — offered as the creator's default when a question names no
  service. It configured nothing. `resolveServiceScope` returned the
  whole-deployment scope before the setting was ever read whenever the
  deployment held one service, which is the kit's sample and every deployment
  that exists. A control that cannot change an outcome is worse than no control:
  it invites a reader to believe the app has a behaviour it does not have.

  **The default is now every service.** A question that names none reads across
  the whole deployment. A creator who wants one names it, which the per-call
  `service` argument already does — a service name narrows, `"all"` widens, and
  an unknown name still throws with the real names listed. `resolveServiceScope`
  no longer takes a `defaultMode`, and `AgentServiceScopeMode`, the stored
  `serviceScope` setting, `serviceScopeMode`, `getAgentServiceScopeMode` and
  `AgentScopeField.tsx` are gone. A scope left in a browser's localStorage is
  simply never read again; nothing migrates it.

  **Where this is felt.** On a one-service deployment it is a no-op — that is
  what the short-circuit already guaranteed. On a deployment with several it is a
  real behaviour change: a question naming no service now reads across all of
  them where it previously read the one the URL slug names. The agent's own tool
  description is where a model finds that out, so the `service` parameter now
  says that omitting it searches EVERY service and that the default is the whole
  deployment, not the one on screen.

  **The row also mis-taught the vocabulary.** "Active service" here meant the ONE
  service the URL slug names, singular. There is no `active` column on
  `services` and no such thing as an inactive one, so a reader who took the
  phrase for "the ones switched on" got a plural where the code meant a
  singular.

  **What is pinned.** `serviceScope.test.ts` asserts the multi-service default
  the old short-circuit hid: on a two-service fixture, a call naming no service
  resolves to the whole deployment — including when a slug names one, because
  the URL scopes the canvas and not the agent's reach. The single-service
  short-circuit stays as an OPTIMISATION and says so: the default no longer needs
  it, and what it still buys is the explicitly-named case, where narrowing to the
  only service would pay a join per read and hide catalog rows no lane picks.

### Patch Changes

- 7305345: A presentation cell badge lands on its cell when the slice tab was not open.

  The pending focus was spent the moment the slice viewport registered, while
  its board was still behind the loading skeleton, so the flight missed and the
  tab opened at its default framing. A miss before the board settles now keeps
  the request, and the viewport lands it once its first fit completes. A miss
  after that is final.

- ba61277: Let a deployment pin path colours through its config.

  The one declaration a deployment is expected to change lived inside the
  shared theme file, so that file could never be identical across installs.
  The kit default is empty; a supplied name maps to a colour slot; anything
  else falls through to the ordinary assignment.

- e22dede: Add a class-list reader that matches a token in any order.

  A type rule is almost never about one utility. "Labels are medium" is
  `text-xs` + `font-medium` together; "an eyebrow is register 3" is
  `font-mono` + `uppercase` + `tracking-*` together. A guard that searches
  for a quoted string is defeated the moment those classes are reordered
  or split across `cn()` arguments — which is how the tree actually
  writes them.

  **The reader takes a class list, however the call site spelled it**, and
  answers whether every class of a token is present, in any order. Three
  spellings, and all three are one list: a single `className="…"` string,
  arguments of `cn()`, and a class inside a conditional. Named constants
  such as `PANEL_TEXT.meta` expand, so `cn(PANEL_TEXT.meta, 'truncate')`
  is the named list plus `truncate`, not the extra class alone.

  **It enforces no rule of its own.** It is the seam the weight guard, the
  mono-register guard and the rung roster are written with. What it
  cannot see, no rule built on it can fail.

- 9e6b7cd: A regular creator keeps the agent, and the gate says why.

  Nothing renders differently. A signed-in regular creator and a signed-in admin
  already saw the same ⚙ settings popover — the same Provider, Model and API-key
  rows — because the agent block is gated on `canAgent`, which asks whether there
  is a session and never asks the tier. What changes is that this stops being
  true by accident.

  **The decision.** The agent is a reading tool. Someone who cannot edit a
  blueprint still needs to ask questions of it, and the key is theirs — pasted
  into their own browser, spending their own quota. Tier gates writing, not
  asking. `canAgent`'s own doc in `SupabaseProvider` now says that, and the
  composer that reads it says which flag it is reading and which one it is not.
  The reasoning sits at the seam because every other gate in that file narrows as
  the tier narrows, so this one reads as an oversight to anyone who arrives at it
  cold.

  **Both halves are pinned together.** `agentTierLine.test.tsx` renders the real
  provider over a fake client and asserts, for one signed-in regular session,
  that the three agent rows are on screen AND that `canAgentWrite` is false — the
  agent it talks to holds read tools only. A second case shows an admin getting
  the same three rows, so the write tools are the whole difference between the
  tiers. Reading either assertion alone makes the other look like the bug, which
  is why they are one test. Tier-gating the settings surface fails it with the
  ruling in the message rather than a restated boolean.

- fae6d21: A slide upload lives in a folder of its own, and the bucket admits it.

  **A stock install of this kit could not accept a slide image at all.**
  `illustrationPath` writes `slices/<slice>/<slide>/<id>.<ext>` — three path
  segments, because a slide's images became a set and a set needs a folder per
  slide — and `slice_illustrations_insert` had matched exactly two ever since
  the bucket was made. So every upload was refused by row-level security _after
  the whole file had gone over the wire_: a 403 at the end of an upload, from a
  policy no screen can explain, and nothing an adopter could do about it short
  of writing the policy by hand.

  The policy moved rather than the key, because the key is what the app and the
  rows depend on. The older spellings — one image per slide, `frame-N`,
  `character-ref` — stay accepted, so objects already in the bucket keep
  resolving.

  **The same bucket had never had a DELETE policy.** Deleting a slice calls
  `removeSlideUploadObjects` on each of its slides, and with no policy that call
  matched nothing, returned no error, and left every image where it was. There
  is now a DELETE policy, bounded by the same name pattern as the insert and
  taking its tier gate from the same restrictive companion — and the sweep
  **counts the rows it removed** instead of reading a non-error return as a yes,
  which is the exact trap that hid this for a release.

  A revertible slide drop still leaves its folder alone. `replaceSlides` does
  not sweep, and `restore_slides` only sweeps the slides its inverse does not
  put back: those `image_url`s are written back verbatim, so an object deleted
  there would restore a row pointing at nothing. A slice deleted outright has no
  inverse to protect, and its objects go.

  **What compares them now.** The pattern and the path builder drifted because
  nothing ever put them side by side. `src/lib/storageKeyPolicies.test.ts` reads
  every `storage.objects` policy that matches on `name` out of the migrations,
  runs the real key builders, and asserts the pattern accepts the key each one
  produces and admits exactly the path depths that bucket declares. A policy
  matching on a name with no key builder pinned to it fails that file, so a new
  bucket cannot repeat this quietly. The migration carries the second half in
  SQL: the pattern decides correctly about nine names, and the pattern it
  decided about is the one the three policies actually carry, read back out of
  the catalogue.

  The CI shim now carries the grants Supabase itself holds on `storage.objects`,
  without which no rehearsal here could ever have asked a bucket policy anything
  — it would have met `permission denied` before reaching the policy's answer.

- e75c945: A small button is one size, and the rung is what says so: thirty-seven
  `size="sm"` call sites stop restating the height and the font size the size
  already sets.

  **Two buttons in the same column rendered at two different sizes, and which
  one you got depended on whether the author had remembered to type a class.**
  `ResourcesList` had the pair adjacent on screen: "Upload a file" carried
  `text-xs` and rendered at 12px, while "Save resources" fourteen lines below
  carried only `h-7` and inherited the `sm` rung's own `text-[0.8rem]`, 12.8px.
  `CellPanelEditor` had the same split between "Add value proposition" and the
  Save/Cancel row under it. Thirty-seven of seventy-four `size="sm"` call sites
  wrote one or both of those classes; thirty-seven did not, so the rung decided
  half the buttons and the call site decided the other half.

  **The overrides are gone rather than the rung retuned.** `components.json`
  points the shadcn CLI at `@/components/ui`, so `button.tsx` is regenerated
  rather than authored — `tokenDiscipline.test.ts` already names its
  `text-[0.8rem]` as vendored for that reason, and a retune there would be
  deleted by the next `npx shadcn add button`. The size the rung sets was never
  the problem; nothing trusting it was.

  **What you will see change.** Thirty-three small buttons that were a shade
  under the rung now sit on it — the same 12.8px their untouched neighbours have
  had all along, so an editor panel's controls agree with each other for the
  first time. Nothing changes height: `h-7` was the rung's own value at every
  site that wrote it. Overrides that decide something else stand, including the
  ones that decide a size on purpose: `EditorZoomIndicator` keeps its `h-8`
  elevated card, and the five controls that pair `h-6` with `text-2xs` — the
  filter and ledger openers, replace, retry and the scenario action — are a
  whole step down the ladder rather than a wobble on one rung, and keep it.

  **What holds it.** `lib/buttonSizeContract.test.ts` reads the rung off
  `buttonVariants` and every `size="sm"` call site off the tree, and asks
  `tailwind-merge` — the resolver `cn` runs at render time — which classes are a
  height and which are a font size, so neither the rung's numbers nor the list of
  rung names is written down twice. Two clauses: the rung's height is never
  restated, and a font size is never set on top of the rung's own box.

- abfa780: Every presentation cell badge opens its own cell.

  Clicking any badge under a slide called the same handler with no argument, so
  they all opened the slice tab and none of them the cell they named. Each badge
  now leaves a pending focus for that cell, then opens the slice tab. The slice
  viewport consumes the pending focus when it registers, because a slice tab's
  address carries no cell.

  **What you will see.** On a slide with two cited cells, the two badges open two
  different cells in the slice. A badge's accessible name says it opens that cell
  in the slice.

  **What holds it.** `requestSliceCellFocus` stores the request when no viewport
  is registered for the slice yet, and `registerFocusCells` flies when that
  viewport appears. A component test clicks two badges and asserts two different
  cell ids.

- 64ee45e: Monospace is for identifiers, and two settings rows are prose.

  Read the ⚙ settings popover's agent rows top to bottom and the face used to
  alternate for no reason a reader could recover: Provider, Model, API key and
  Scope were all monospace, and two of the four render English.

  `typography.md` gives mono one job — code, identifiers, and the time-marker
  register. A model id (`claude-opus-5`) and an API key are identifiers and keep
  it. `Anthropic Claude` is an `AGENT_PROVIDERS` label and `Active service` is
  one of two phrases naming a search default; both are ordinary words, and they
  now set in the body face beside the labels and prose they sit among. Trigger
  and open menu move together — the menu shows the same values, so it takes the
  same face.

  **The column agrees on one label width.** The agent rows label at `w-14` and
  the developer rows labelled at `w-20`, and both render into the same
  `flex flex-col gap-2.5` column inside one `w-72` popover, so the control edge
  jogged 64px to 88px partway down the panel. The developer rows take the agent
  rows' width, and their section spaces itself at the column's `gap-2.5` rather
  than a `gap-2` of its own.

  **What is pinned.** `settingsColumnRows.test.tsx` asserts the rule rather than
  today's classes: a table says what kind of thing each row's VALUE is — an
  identifier or prose — and the face is derived from that, in the row and in the
  open menu. A row added to the column without an entry fails the roster, so the
  next row cannot quietly pick a face nobody chose. The alignment test never
  names a width; it asserts there is exactly one.

  **Why it shipped here.** `AgentProviderFields.tsx` and `AgentScopeField.tsx`
  are on a deployment's reconciled allowlist, which promises byte-identity with
  this kit's copy, so the fix comes upstream and returns with a pin bump.

- 41fffd4: Monospace stays in its three registers, and the guard knows the two ladders.

  A `font-mono` call site belongs to exactly one job: code and stored values,
  aligned numerals beside `tabular-nums`, or an eyebrow and wordmark. The
  scan is the class-list reader, so a token present in any order still
  counts, and size is evaluated against the ladder of the scope the site
  renders in — `text-sm` is 13px in prose and 14px inside `.font-mono`,
  and a guard that assumed one ladder would fail a legible code size.

- 9b30de0: One name for the thing a deployment runs: template.

  The glossary now defines **Template** (the canonical application every
  deployment installs) and **Deployment** (an installation that supplies its
  own content, brand and data, and carries no application code). "Kit" is
  retired as a whole word — on-screen copy, comments and published docs —
  and the vocabulary guard fails a reintroduced `kit` without flagging
  `kitchen`, `toolkit` or `-webkit-`.

- d43a236: A surface asks `canWrite`, not the editing tier.

  The provider still derives the tier and still uses it to compute the write
  gate. It no longer publishes that answer. `realCanWrite` stays, named as the
  developer portal's honest readout and never as a second gate. ADR 0011 is
  the ruling; the glossary defines the four axes and `active service`.

- 24f3114: One working weight, and a guard that names the ADR.

  400 is all content, 500 is the one emphasis, 600 is headings only, and
  700 is retired. Both scopes of `--font-weight-normal` stay at 400:
  Ubuntu Sans holds colour at 400, so the Inter 450 is not ported. The
  guard reads class lists, not quoted strings, and fails a second
  functional weight.

- cdbfe6c: `npm run agent-account -- --record` no longer fails on the run that records.

  The ratchet was judged against the baseline the run was replacing, so the
  first record reported the baseline missing and a re-record after a coverage
  gain reported it stale — both failures naming the very command that raised
  them, and both exiting 1. A recording run now writes the baseline and skips
  those two failures; the account's own drift check still applies.

- aaae7d7: The blueprint canvas and its panels land on the new type ladder.

  Sub-12px rungs lift onto `xs`. Panel titles and values sit on `sm`;
  labels and meta sit on `xs`, distinguished by weight and colour. Canvas
  cell chrome stays at `xs` and the face heights do not change. Hand-written
  `leading-*` drops except where a comment names the geometry that still
  needs it.

- c5a8989: Let a deployment supply the cell-text budget through its config.

  The template used to stop a person at 120 characters while the agent could
  write past that point and only hear about it afterwards. The cap protected
  nothing in the schema, and the number lived in shared code a deployment
  could not overlay. The kit default is still that single cap, expressed as
  target and warning per lane kind; a deployment supplies its own pair, and
  both writers get the same advice at those thresholds.

- 5cd03ae: The cover, the mobile shell and the leftover style helpers land on the new
  ladder.

  Cover copy sits at `sm` or above and is never muted-only; inline code
  inherits the sentence beside it. Hand-written `leading-*` on these
  surfaces is gone — the rung supplies the box. `PANEL_TEXT`'s `2xs` roles
  stay until that layer retires. Mobile chrome at phone width keeps `xs`
  and does not zoom on focus.

- 0f65847: The editor shell lands on the new type ladder, and 12px becomes chrome.

  Menu items, buttons, field labels and settings rows move to `sm` (13px).
  Hints, meta and helper text sit on `xs` (12px). Sub-12px rungs in the
  shell lift onto that floor. Hand-written `leading-*` drops except where
  a comment names the geometry that still needs it.

- 9d2e3f5: The new type ladder lands on the names the tree already uses.

  Sans and mono declare the nine rungs at the measured values; the
  line-height ratios sit once on the root. Sub-12px rungs stay until their
  call sites move. The field input goes to `lg` so a 15px `base` cannot
  zoom the page on focus.

- 369eb9d: The palette suite measures a brand it does not name: identity and action are
  two colours by a perceptual distance, and a status signal stays clear of the
  accent.

  **A test a fork has to edit is a test that does not travel.** `palette.test.ts`
  held `contrast(brand, primary) > 1.5` as its "these are two colours" floor, and
  both halves of that were this template's greyscale talking. Contrast is a
  function of lightness alone, so it cannot see either of the ways a branded
  palette separates the two fills — a hue apart and a chroma apart both measure
  1:1 — and 1.5 was read off a neutral seam that stands a near-black control
  beside a mid-grey identity. A deployment that gives both fills one accent and
  separates them by lightness alone measures 1.27 and fails a floor it has not
  violated. It was the last assertion in the file an adopter had to edit to get a
  green suite, which is the habit this repo spends real effort discouraging
  everywhere else.

  **What replaces it is the claim the ratio was standing in for.** Identity and
  action are TWO fills, held as a Euclidean distance in OKLab — the space these
  are authored in — against a floor of one just-noticeable difference. Hue and
  chroma count as separation now, and the colours measured are the gamut-mapped
  ones, because two triples the browser reduces onto each other are one colour on
  the screen whatever the dials said. The floor is a fact about eyes rather than
  about a palette: no brand is named by it and none can be tuned around it. This
  template clears it at 0.39 and 0.33, a branded deployment at 0.07, and a
  palette that dials one fill onto the other lands at 0.

  **The reason `semantic.css` already gave, now held.** `--success-hue` is pinned
  rather than pulled toward the accent, and the comment beside it says why: a
  brand-relative green would collide with `--primary`, and a success state has to
  stay distinguishable from a brand fill. Nothing asserted it. Warning,
  destructive, info and success are each measured against both accents at the
  same just-noticeable floor, in both themes — so an accent moved onto a category
  anchor fails here rather than shipping a destructive fill that is the brand
  fill and carries no signal at all.

  **Demonstrated rather than claimed.** With a real deployment's dials in the
  theme files — one accent, both modes, chroma 0.135 — the file passes 279 of 279
  with no assertion edited. Deliberately broken palettes still fail: the identity
  dialled onto the action fill (0), the identity a hundredth of a lightness step
  off it (0.01), a focus ring dialled into the canvas (1.11:1), and a green brand
  dialled onto the success anchor (0).

- 429f6e9: Retire the panel type-role layer; write the utilities at the call site.

  PANEL_TEXT named four jobs and hid the classes behind a constant 3.9% of
  call sites reached. The four judgements live in ADR 0012; each former
  site writes the same rung, weight and colour it resolved to.

- 5665197: The slice and presentation surfaces land on the new type ladder.

  Editing chrome — the composer, the storyboard sheet, the sidebar — sits on
  `xs`. Stage text sits on `sm` or above and is never muted-only: headings,
  captions, the cell-badge row, slide navigation and the sticky header all
  carry full ink. Sub-12px rungs on these files lift onto that floor.
  Hand-written `leading-*` drops except where a comment names the geometry
  that still needs it.

- 93da572: The storyboard's presentation layout is unreachable.

  `BlueprintStepStoryboard` kept a second panel behind `presentation={true}`.
  Nothing passed that prop — the only caller is the compare cell, which used
  the default cell face. Wiring the walkthrough onto that branch would have
  meant migrating a working layout onto dead code. The prop, the branch, and
  the panel are gone; the walkthrough's own presentation row is the one that
  remains.

- 1644889: The stylesheet reader answers a question about stylesheets: `tokenModel` gains
  `stylesheetMatching`, the counterpart to `sourceMatching` it never had.

  **Every rule built on this model could read the application and not the
  stylesheet it is written beside.** `sourceMatching` sweeps `src/**.ts(x)` and
  reports a `file:line: match` for each hit, and that is how the token discipline
  rules find a raw hex or a forbidden tier. A stylesheet was outside the sample
  entirely, so `semantic.css` was free to spend a primitive that the same rule
  forbade a component to touch, and the rule would pass while saying nothing.
  Widening the model once widens it for every rule that asks, which is what the
  seam exists for.

  **Declared values, not raw text.** A text scan of these files is wrong here in
  a way that is easy to miss: this codebase writes a paragraph of prose above
  almost every block, and those paragraphs quote the names they explain.
  `colors.css`'s header spells `var(--color-amber-100)` twice to explain the
  Tailwind namespace split, in a file that paints nothing — a text scan reports
  both, the first rule written on it fails on a comment, and the next reader
  learns the rule cannot be trusted. `stylesheetMatching` walks the declarations
  the model already parses, whose comments are blanked upstream, so a paragraph
  about a name is not a use of it.

  **A match carries where it came from, not just which file.** Each `StyleUse`
  reports the matched text, the property whose value carried it, the selector
  that declaration sits under, the file and line on disk, and the token layer —
  so a rule can say "not at the semantic tier" rather than naming the files that
  happen to be semantic today, and can tell `theme.css` registering a step
  (`--color-blue-900: var(--color-blue-900)`) apart from `semantic.css` spending
  it on `--annotation-selected`.

  **What holds it.** Seven cases in `lib/tokenModel.test.ts`, all against this
  repo's own stylesheets rather than a fixture: the prose in `colors.css` is not
  a use, a declaration's left-hand side is not a value, a reported line is the
  line the match sits on in the file on disk, the layer arrives with the match,
  the carrying property and selector arrive with it, and a `calc()` reading two
  elevation names reports both rather than the first. A raw-text reimplementation
  of the same signature fails four of them.

  **`Medium` and `Scope` are asserted rather than assumed.** They are the second
  and third question a rule asks after "which theme" — which cascade, and which
  subtree — and a reader that grew reach while quietly losing either would answer
  more questions and fewer of the ones already asked. Two cases now hold them:
  `--surface` flips between `themes/dark.css` and `print.css` with the medium
  while `--color-blue-900` flips the other way, and `--ground` resolves to one
  value at the root and another at `[data-ground='card']`, with the scope taken
  from the stylesheet rather than written down beside it.

- 8c02e75: Delete the four sub-12px type rungs and guard the ladder.

  `--text-2xs` through `--text-5xs` go. The roster fails a tenth rung in
  either scope and passes a legitimate mono `sm`. Authored classes cannot
  name a rung below `xs` or an absolute size below 12px. Presentation
  surfaces cannot carry `xs` or smaller. The geometry defence in
  `theme.css` is answered, pointing at ADR 0012.

- 9cbe601: Let a deployment generate an agent account from a connected database.

  The schema account an agent reads was built beside one install and imported
  by path, so that loader could never match this template's. The generator and its
  check live here now; each deployment's generated document is its own
  content, registered through the existing extra-reference seams. With no
  database configured nothing is generated or registered, and the agent's
  reference list stays this template's own.

- 300bb65: The template holds the ADRs that govern it.

  Nine records move here from BilLogic/plus-uno-blueprint, renumbered after 0012. Five mirrored pairs are folded into this copy; where they disagreed,
  the schema or the code decided.

- 28509f8: The type system's rules, written down before any of them is enforced.

  ADR 0012 records the four axes, the two-scope ladder, the numbers taken
  from the reference and the two declined, and that a semantic type-role
  layer is the alternative this tree already tried. The glossary names the
  eight words a reader needs.

- ed95c51: Resize two containers so the type floor can rise to 12px.

  A nine-pixel digit inside a sixteen-pixel circle already clipped at two digits,
  and an eight-pixel storyboard caption existed only because the cell face was
  split first. Cited-cell order is a ruler column — right-aligned, fixed-width,
  mono with tabular figures, at `xs`. The slide badge sizes to its content
  (`h-5 min-w-5 px-1`), so one digit stays a circle and two or more grow it.
  The storyboard strip no longer draws a per-frame lane name; the
  walkthrough still does.

  The numbers this replaces were two-digit and three-digit cases. A one-digit
  fixture would have missed both bugs.

## 1.36.0

### Minor Changes

- 2ca1837: A check reports where the kit's own content is still what a deployment serves.

  Two guards already sweep for content leaking the wrong way — `check:standalone`
  for the NAMES of the deployment this kit was generalised from, and
  `check:content-coupling` for that deployment's CONTENT with the name filed off.
  Both protect the kit from the deployment it came out of. Neither faces an
  adopter, and nothing else did either: of the checks that shipped, none answered
  _is what this deployment serves still the kit's blueprint rather than its own?_

  `npm run check:sample-content` is the mirror. It knows the meta-blueprint's
  markers — the service name `Keeping a blueprint true`, the `f0000000-…` id
  namespace `fid()` mints, and the six scenario titles — and reports where a
  deployment still carries them, naming the file, the line and the value the way
  the content guard does. The id marker is the one with the name filed off: it is
  thirty-two hex digits that say nothing, so content can read as entirely an
  adopter's and still be keyed on the kit's rows. Its prefix is imported from
  `check-content-coupling.mjs` rather than copied, because the two guards are one
  claim read from two sides — the value that guard trusts as proof of origin is
  the value this one reports.

  **Subject is only the two places a deployment's content lives**: the seed
  `[db.seed]` names, and `src/data/`, the board the app renders with no database.
  The generator, this repository's docs and its README are out. Each of them
  names the sample and always will, and a sweep that included them could never
  reach zero on any deployment — which is how a report becomes wallpaper.

  **Advisory: it reports and exits 0**, says so in its own output and in its
  header, and is not in CI. Both states it reports are legitimate. A fresh clone
  is full of sample content because SETUP.md § 2 asks a new reader to run the app
  against it; a half-migrated deployment — seed replaced, `src/data/` not yet
  re-registered — is a supported place to stand for a while. Failing either would
  fail a supported path, and a check whose readers have learned to scroll past it
  is worse than none.

  Documented where an adopter meets it — SETUP.md § Before you push — as well as
  in the guard set.

- 7b8d831: A connected database is the whole truth: the bundled sample renders only when
  no database is configured.

  **Content on screen today will disappear.** If your deployment has a database
  and your board has gaps, some of what you are looking at is not yours — it is
  this kit's sample, appended underneath your rows. After this release those
  lanes, columns, cells, dependencies and path names are gone, and the gaps they
  were covering are visible. Nothing of yours is deleted: the rows in your
  database are untouched, and everything that disappears is content that was
  never in it.

  What to do about it. Open each board once after upgrading and look for what
  went missing — that is the list of things the sample was answering for. Where
  you want the content, author it: it is now a row in your database like any
  other. Where you do not, the empty lane is the correct answer and was the
  answer all along. A scenario or path the database has nothing for now draws
  nothing rather than the kit's board, so a tab that empties out is a tab whose
  content was never yours either.

  **What changed.** `resolveBlueprintForScenario` no longer merges the two
  sources. On the database path it used to append every fallback lane, cell,
  step and dependency the rows lacked and fill a blank path name, summary or
  note from the fallback's prose, then report `source: 'database'` — so the leak
  was invisible, and the content that leaked was a blueprint of this kit wearing
  the adopter's path names. The path list did the same through
  `mergePathsWithFallback`, which is removed with it.

  **Telling the two states apart.** A `sample data` badge sits in the workspace
  chrome whenever no database is configured. It is the one state the sample is
  reachable in, and connecting a backend hides it permanently.

- 9625089: A lane collision has a rule to name, and the message that names it fires.

  `src/lib/authoringErrors.ts` matched `lanes_path_row_unique` to say "Two lanes
  ended up in the same position." Nothing has ever carried that name. The object
  on those two columns was `lanes_path_row_idx`, a plain non-unique index created
  by the template schema as `layers_path_row_idx` and carried through the
  vocabulary renames — so the branch was dead text, and an author who put two
  lanes in one slot met no refusal at all: the write succeeded and the board
  showed two lanes fighting for one row.

  **The rule.** `21000223000000` adds `lanes_path_position_unique` on
  `(path_id, position)`, deferrable and initially deferred, and drops the
  duplicate index the constraint's own index replaces. Deferred because both
  write paths that move lanes collide mid-transaction on ordinary use:
  `reorder_lanes` renumbers one statement per lane, and `add_lane` opens a slot
  with a single self-colliding `UPDATE`. An immediate constraint would refuse
  every drag of a lane. The migration proves both shapes, and the duplicate that
  settles, on a fixture it rolls back.

  **The message.** The matcher now names that constraint, so the sentence it was
  written for reaches the author instead of the generic duplicate line.

  **The guard.** `authoringErrors.test.ts` drives the database's own text through
  the translator, and holds every identifier-shaped matcher in the table against
  `supabase/generated/portable-core.schema.sql`. A matcher naming something the
  schema does not create now fails a test rather than failing silently in front
  of an author.

- 9701142: The navigation is the rows: the bundled sample no longer merges into a
  connected deployment's tabs.

  **Content on screen today will disappear, and some sentences will change.**
  If your deployment has a database and any of your phase or scenario ids came
  from this kit's sample, part of your navigation is not yours. Two things were
  happening on every render:

  - **Your summaries were being overwritten.** The merge tested the sample's
    summary FIRST and yours only if the sample had none, so wherever an id
    collided the tab described this kit's own service in this kit's words —
    even when your summary was perfectly good. Your `scenarios.layout` lost the
    same way for any scenario the sample registers a blueprint for. After this
    release your rows read exactly as your database holds them.
  - **Scenarios you deleted were coming back.** A scenario the sample ships,
    under a phase you kept, was appended to the nav whether or not your database
    still had it. Those tabs are gone. Since `resolveBlueprintForScenario`
    stopped filling holes from the sample they had nothing behind them anyway:
    a tab that opened onto an empty board is exactly the one this removes.

  Nothing of yours is deleted. Your rows are untouched; everything that
  disappears is content that was never in your database. A tab that vanishes is
  a scenario you do not have, and a summary that changes is the one you wrote.

  **What to do about it.** Open the nav once after upgrading. Where a tab is
  gone and you want it, author the scenario — it is a row like any other. Where
  a summary now reads differently, that is your `phases.summary` or
  `scenarios.summary` speaking for the first time; fill in the blank ones you
  find.

  **What changed.** `src/lib/mergeSlidesWithFallback.ts` is removed, and
  `EditorContext` reads the fetched slides straight through. The whole-nav
  fallback is unchanged: a read with no rows at all — no database configured, or
  the first fetch still in flight — still shows the deployment's `sample.nav`,
  whole and unmixed, which is what a fresh clone's onboarding depends on.

- a8af070: The path open set reserves green and red.

  **Four families, not seven.** A path with a name rather than a type used to be
  drawn from seven families — indigo, tomato, purple, gold, crimson, yellow, red
  — which meant a variant could come out crimson, tomato or outright red while
  not being an exception at all. Red is the one colour on a service blueprint a
  reader should never have to decode, and spending it on a route that is merely
  different is what makes it need decoding. The open set is now `indigo, purple,
gold, yellow`; green belongs to the happy path and red to exceptions, always.

  **A reserved type never consults the name.** `getPathColor` short-circuits
  `happy` and `exception` to their type colour before it looks at anything else,
  so renaming an exception cannot make it stop being red. Two exceptions in one
  scenario are therefore the same fill by design — which is why the dash is now
  read from the path instead of from its type, since inside that scenario the
  dash is the only channel left. Seven patterns against four families, kept
  coprime on purpose: a repeated hue lands on a different pattern, so the pair is
  unique for 28 paths where the old arrangement — seven against seven, both off
  one hash — repeated after 7.

  **One lane overlap instead of two.** `variant` was blue against the blue
  `evidence` lane, and a 2px path line could land in exactly the hue of a lane it
  crossed. Its fallback moved onto the open set's first family. The remaining
  overlap is `happy` against the green `actor` lane, which cannot be reallocated
  — nine lane families plus seven touchpoint tones is the whole palette — so it
  is named in `palette.test.ts` and held to a heavier step than the lane fill.

  **The hash carries more, so it is a real one.** Slots came off a sum of
  character codes, which is order-invariant: two names built from the same
  letters took the same colour AND the same dash. That was survivable while seven
  families were open and pinned paths skipped the hash; it is not, now that every
  unpinned path goes through it. FNV-1a.

  **The palette tests measure the mechanism.** The brand assertion read
  `expect(THEME_DIALS.light.C).toBe(0)` and conceded in its own comment that a
  fork would have to edit it. It now asserts what the number stood for — that
  chroma does not change between themes, true of a neutral template and a branded
  deployment alike — plus that every chroma dial is declared in both theme files
  rather than leaking across. The path assertions read the open set off the
  module rather than naming the template's hues.

- cbbd107: The slide card names its fields, offers removal where it can be seen, and the
  slide sheet is draggable.

  **Labels.** The card had no `<label>` at all — both fields were placeholders,
  and a placeholder disappears the moment somebody types. A filled card was two
  unnamed boxes, and a screen reader got a hint rather than a name. Narrative
  takes a visible one in the schema's word; the title takes an accessible one,
  because the number and the strip beside it already say which slide it is.

  **Removal.** An uploaded illustration could only be removed by right-clicking
  it: invisible, absent on a touch screen, unreachable by keyboard. Every
  upload now carries a visible remove button. Frames do not — a frame belongs
  to its cell and cannot be removed from here.

  **Height.** The slide sheet was a fixed 224px. Five slides citing three cells
  each is more than that, so the rows that did not fit were reachable only by
  scrolling inside a strip that also scrolls sideways — two axes in one small
  box, on the surface where slides are written. Its top edge is now a drag
  handle, in the same idiom `AgentDockDivider` already uses, and the height is
  remembered.

### Patch Changes

- 1b4d7b6: A slide shows a set of images.

  The single-choice columns are gone. A slide nobody has touched shows every cited cell's frames; once an author ticks or unticks, `slide_images` is the set.

- 1b4d7b6: A slide's prose is a caption.

  `slides.narrative` named the sentence under the images as if it were a story
  the slide told. It is a caption, and the column, the authoring format, the
  editor label and the agent tools now say so.

- 1b4d7b6: An upload joins a slide's image set.

  A file saved under `slices/<sliceId>/<slideId>/<uuid>.ext` becomes an `image_url` member of the same set as the cited frames, with a remove control on uploads only.

- 7a1adab: The stacking contract says layer where it means layer.

  Two sentences in `src/lib/canvasStackingContract.test.ts` were carried over by
  the `layers` → `lanes` word replacement while meaning the other word. Neither
  is about a row of the board.

  **The comment misquoted the code it documents.** The header recalls the
  assertion the file used to make, and the quotation had been rewritten along
  with everything else: it pinned `"lane === 'forward' ? 'z-0' : 'z-[30]'"` as
  an exact substring. `IntegratedDependencyArrows.tsx` reads `layer`, and so
  does the regex twenty lines below the comment, so the paragraph explaining why
  the exact-substring pin was dropped named an identifier that has never
  existed. The `z-[30]` inside it is left alone — the arbitrary spelling is the
  whole point of that paragraph, and it is quoting history, not the current
  source.

  **The test title named the wrong noun.** `contains canvas-local lanes in one
stacking context` is about `isolate` and the z bands above it. It reads
  `layers` again.

  Both spellings are what the file held before the rename, so this restores
  rather than decides.

  **The guard says what it could not see.**
  `scripts/tests/a-lane-is-not-a-layer.test.mjs` already keeps a section for its
  own limits, and these are two shapes that belong in it: an identifier quoted
  inside a comment, where `tsc` cannot do the sweep the guard's patterns lean on
  it for, and a test title whose layer word sits after the noun rather than
  before it. Neither was widened for. The first would mean listing
  `lane === 'forward'`, which that header argues against and a test still
  asserts finds nothing; the second would mean reading the whole line, which
  would fire on the true sentences in `EditorShell` and `ScenarioBlueprintPanel`
  that put a lane rail and stacking slots in one breath.

  **Why it shipped here.** The file is on a deployment's reconciled allowlist,
  which promises byte-identity with this kit's copy, so the fix comes upstream
  and returns with a pin bump rather than being applied downstream.

- 1b4d7b6: Un-citing a cell drops it from the slide's image set.

  A `cell_ids` change deletes `slide_images` rows whose cell is no longer cited. Remaining members keep their positions, and an emptied set stays authored rather than flipping back to untouched.

## 1.35.0

### Minor Changes

- 6281442: A slide chooses from its images; it does not swap one set for the other.

  `slides.illustration` held ONE image and, when set, replaced the slide's strip
  entirely. `21000115000000` kept that column and named what would settle it —
  "if it should later become an append to the strip rather than a substitute".
  Append is the wrong answer too: an author who wants one drawn image instead of
  three fragments is not asking for four.

  The slide keeps a pool and chooses from it. `illustrations text[]` is what an
  author uploaded; `active_frame_cell_id` and `active_illustration` say which
  member it shows, and both null means the whole strip — the default, and what
  every existing row still does. A slide can now show ONE frame, which it could
  not ask for before.

  The choice is two columns rather than a jsonb reference so `on delete set
null` retires it when its cell goes; a check keeps them mutually exclusive and
  a second keeps the shown illustration inside the pool.

  Uploads stop overwriting each other, which retires the `{src, updated_at}`
  cache-buster: a name minted per upload means a URL's content never changes.

  Three modules stop calling this a storyboard. A storyboard is a LANE; this is
  a slide's illustration, and `SliceStoryboardField`, `storyboardUpload.ts` and
  `STORYBOARD_BUCKET` all said otherwise while the bucket itself was already
  named `slice-illustrations`.

- d39a902: `stakeholders.parent_id` becomes `stakeholders.part_of_id`.

  `parent_id` names a shape, and the shape it names is a tree of any depth. The
  column is held to exactly one level, so a reader who trusts the name reaches
  for a recursive CTE, or nests a third level and is refused by a trigger the
  name gave no warning about.

  `part_of_id` names the relationship instead. Membership is flat by nature, and
  it is the word the column comment and the glossary already used.

  Forward-only rather than an amendment: 21000216000000 is released, and a
  released migration is somebody else's applied history even when it is one
  version old.

## 1.34.0

### Minor Changes

- 1c4d483: An actor can be part of another actor.

  `stakeholders` gains a nullable `parent_id` self-reference, so a deployment
  that names a function on one lane and a sub-function on another can ask what
  the whole owns. A lane still names the specific actor; the rollup is a join.

  Held to exactly one level — a parent has no parent — by a trigger that checks
  both directions, plus a `check` for the self-reference a single row can see on
  its own. Depth is what turns a self-reference into a cycle, and one level keeps
  the rollup a single join instead of a recursive CTE.

  `UPDATE` on this table is granted column by column, so the new column is named
  in a grant; without it the column would be silently uneditable.

- c4ef8f4: The sample board reaches the deployment seam, and the nav helpers stop
  guessing which board they are about.

  `DeploymentConfig` gains a `sample.nav`: the board a deployment shows before
  its own data arrives. `ResolvedDeploymentConfig.sample.nav` is guaranteed
  non-empty the way `brand.name` is guaranteed a string — the template's default
  supplies one, and an overlay of an EMPTY array reads as "I have nothing to
  say" rather than "show nothing", the same reading `present()` already gives an
  `undefined` field.

  The array itself moves out of `@/types/nav` into `@/data/sampleNav`, which is
  a deployment's own content. `types/nav.ts` is now types and pure helpers with
  no sample in it.

  Eleven helpers lose their `= FALLBACK_NAV` default parameter. A default that
  names one particular board makes a forgotten argument invisible: the call site
  compiles, and answers about a board nobody is looking at.
  `overviewFlowArrowAnchor.test.ts` had pinned exactly that — two assertions
  recording the wrong answers an omission produced. Those calls no longer
  compile.

  `EditorProvider` reads the sample through `useDeploymentConfig`, so it now
  requires `DeploymentConfigProvider` above it — the nesting `App.tsx` already
  has, with the seam outermost.

### Patch Changes

- ce79dcf: Two comments stop citing addresses that mean something else downstream.

  `useCanvasActiveEffect` cited "ADR 0010". ADR numbers are per-repository:
  0010 here is _open views stay mounted_, and in a deployment built on this kit
  it is whatever that repository's tenth decision happened to be. The comment
  read as authoritative in both places and was right in only one. It now states
  the rule it was pointing at, which travels.

  `CoverGuideLink.docPath` gave `docs/guide/01-the-blueprint-model.md` as its
  example. That file exists in this repository and nowhere else, so the example
  resolved to nothing wherever the kit is installed. The field is documented by
  what it is measured against instead.

## 1.33.7

### Patch Changes

- 2c85023: A read-mode board no longer subscribes every lane overlay to the combined
  navigation context. `BlueprintLaneHandles` read the editor and the scenario
  level before deciding it had nothing to draw, so a reader who can never author
  paid for a subscription per lane on every board. The gate moves above the
  hooks, and the part that needs them is a second component mounted only while
  authoring.

  A phase section also stops calling itself navigable when nothing is listening:
  without an `onNavigate` a click does nothing, and the affordance was a promise
  to a pointer and to a keyboard that the section could not keep.

## 1.33.6

### Patch Changes

- dd896e8: The owner select's trigger is the panel's shared one again. Its inlined copy of
  the classes had fallen behind `PANEL_SELECT_TRIGGER_CLASS`: no hover border, no
  inset focus ring, and no disabled treatment, so one control in a column of
  selects answered a pointer differently from all its neighbours.

## 1.33.5

### Patch Changes

- 0d325b3: A doc comment outlived the function it described. Removing
  `isPaleAnnotationSwatch()` left one of its two doc blocks behind, still
  explaining a membership test nothing performs any more.

## 1.33.4

### Patch Changes

- 7377d12: The selected-swatch checkmark in the annotation toolbar was invisible in dark
  mode. `isPaleAnnotationSwatch()` — `color !== ANNOTATION_INK` — picked a frozen
  near-black for every swatch but one, while the fills are theme-flipping ramp
  steps, so in dark the check measured 1.13–1.20:1 on the fill row and 1.33–1.72:1
  on the sticky row. The one exception failed the other way: the Ink swatch took
  the `text-white` branch onto a slate that flips near-white, 1.17:1. Light mode
  failed too on the stroke row, at 2.50:1.

  The button now carries `data-blueprint-fill` and derives its ink from its own
  fill, the mechanism path badges and divider tags already use. A derivation
  cannot be wrong for its fill, because it is a function of it — which is what
  `annotationSwatchContrast.test.ts` has been measuring all along.

## 1.33.3

### Patch Changes

- 211a21c: One comment in `evidenceMutations.ts` named a migration filename. A migration
  version is an address in one repository's series and resolves to something else,
  or to nothing, in a deployment's own — which is why the drift gate refuses an
  enrolled file that carries one. The sentence now says what happened without
  naming the file it happened in.

## 1.33.2

### Patch Changes

- f50ffa1: One `cursor-help` outlived the decision that retired it. Three files already
  say the help cursor is gone — `panelText.ts` names it as one of the two cues
  that announced a word was defined, `EntityHeader.tsx` says "no `cursor-help`",
  `panelShell.tsx` says the same — and a badge in the design toolbar still had
  one. The class is removed, and `definitionCard.test.tsx` now asserts that none
  survives anywhere, so the next one fails a test rather than a reading.

## 1.33.1

### Patch Changes

- 5747e59: The integrated overlay's connectors are measured before the browser paints
  rather than after it. Every input the sweep reads — cell boxes, the band's
  extent — is laid out by the same commit that scheduled it, so measuring in an
  ordinary effect drew one frame of arrows against the previous layout. A compare
  toggle is where that showed: the grid swaps to a different column set and the
  overlay spent a frame anchored to the old one.
- aef92f9: `panelTerms.ts` says why a definition may hang off these two labels at all. It
  had lost the half that makes the sentence checkable — that this is a deliberate
  exception to the badge rule, and that the shape both take is `Field`, which the
  rule exempts as a field explaining its own input — and the note that `evidence`
  was once listed here on the belief that it was a badge, when it was a tab.

## 1.33.0

### Minor Changes

- b5de931: A board now has an address. The URL stopped at the service, so a board could
  not be sent to anyone, a reload started over at the overview, and Back left the
  app instead of stepping through the boards the reader had walked.

  `boardAddress.ts` puts the phase, the scenario, the path selection and the view
  mode in the search, beside the view params `urlViewState.ts` already owns, and
  `BoardAddressSync` is the one bridge between editor navigation, the path
  selection store and the tab state — none of those three providers learns about
  the other two.

  An absent param means "whatever this board says about itself" rather than a
  default spelled out, so a link written while the reader had made no choice
  asserts no choice, and an editor who later re-lays a board out is not overruled
  by every address ever copied. A `view` the URL asks for is adopted through a
  new `seedScenarioDisplayViewType`, which overrides without writing the row:
  following a link is not the same act as an editor choosing a layout.

## 1.32.0

### Minor Changes

- af31284: Every authoring write now leaves a durable record, not only the deletes.

  Deletes were remembered forever and everything else was remembered until the
  tab closed: six `security definer` functions archived what they destroyed into
  `public.deleted_structure`, and every rename, reorder, cell edit and slice
  change lived only in a module-level array in `authoringSession.ts`.

  `public.authoring_changes` replaces that split with one append-only log. The
  client appends through a new `record_authoring_change` RPC; the six delete
  functions append their own row, because a destroyed row's payload can only be
  captured inside the transaction that destroys it. `public.trash` is a view over
  the deletions in the log, in the shape `deleted_structure` had, so every reader
  of the recovery list is unchanged except for the relation it names — and
  `deleted_structure` is folded in and dropped.

  The log is audit-only, and that is now a wall rather than a comment.
  `executeRevert` accepts a branded `SessionEntry` that only `recordChange` can
  mint, so a row read back out of the log cannot reach the inverse-applier —
  it does not compile. `revertBoundaryContract.test.ts` holds the brand to its
  one mint.

  The portable-core generator learned about dropped tables: a recipe fragment
  that enables row-level security or grants on a table the core later drops is
  left out, the same way a column-scoped grant already follows a dropped column.

## 1.31.1

### Patch Changes

- 504e11f: Two comments in `BlueprintDependencyArrows` named things that are not there.
  The filter that keeps panel-only links off the board called them `needs`; the
  kinds are `leads_to` and `enables`. The prop doc said dependencies may not
  include `kind`, when the prop it stands in for is `pathKind`. Both now say
  what the code says, and the colored-dependency type says why `pathKind` needs
  its own word.

## 1.31.0

### Minor Changes

- 2266da5: Three icon-only controls in the phase menubar now say what they do. Stacked,
  Merged and the path selector each carried an `aria-label` and nothing else, so
  a sighted reader hovering the glyph and a keyboard reader focusing it were both
  told nothing. Each gains an `IconTooltip` with action copy, and the compare
  toggle falls back to Stacked when a scenario has never been toggled, so the
  control always points at a segment.

## 1.30.0

### Minor Changes

- eb2f1c7: The slice rename guard compares the fields a form was seeded from rather than
  an `updated_at` stamp. A stamp-based guard can only be wrong in one of two
  directions — refusing renames nobody raced, or waving through an overwrite of
  someone else's — and which one depends on which stamp it sends.
  `updateSliceMetaFromSeed` reads the row back at submit and refuses when the
  meta has moved, at whatever stamp it now carries.

## 1.29.1

### Patch Changes

- 04cf10c: Touchpoint faces in the compare grid carry `data-blueprint-touchpoint` again.
  `CompareCellBlock` rendered `TouchpointCellFace` directly, bypassing the
  wrapper that sets the attribute — so `scrollBlueprintTouchpointCellIntoView`
  could not find a named touchpoint in that view and silently scrolled nothing.

## 1.29.0

### Minor Changes

- 9bd68c8: The cell panel shows a cell's status without opening the editor.
  `CellContentSection` renders it first, as a labelled `Field` with a hint and a
  `StatusBadge` — a status changes how everything under it should be read, and a
  reader had to enter edit mode to find it. The owner labels take `PANEL_TEXT`
  rather than repeating its classes inline.

## 1.28.2

### Patch Changes

- 4320ecd: An undo of a finding update restores both cell columns. `cellIds` wrote
  `cell_ids` and `cell_keys` together but the captured inverse named only
  `cellIds`, so reverting rebuilt `cell_keys` from the ids — discarding the IR
  key paths an imported finding carries. The two are named separately now, and
  `findingMutations.test.ts` holds the inverse to what the write moved.

## 1.28.1

### Patch Changes

- 499c9cc: Two canvas connectors were in the wrong z band. `BlueprintDependencyArrows`
  put its forward layer at `z-2`, over the `z-1` cells, so an ordinary run
  crossing a cell struck through its face — while `IntegratedDependencyArrows`,
  drawing the same relationship, correctly used `z-0`. The phase flow arrow sat
  at `z-50`, over the `z-30` title badges, where the loop arrow beside it used
  `z-20`. `canvasStackingContract.test.ts` now holds both relationships.

## 1.28.0

### Minor Changes

- 8d0a756: The service panel no longer sends the `business_models` read for a reader the
  database will refuse. `SupabaseProvider` publishes `canReadPrivate`, and
  `useServiceSpec` gates the restricted request on it — so a signed-out visitor
  pays no refused round-trip per load, and a 42501 that does arrive is a signal
  again rather than the ordinary case the hook had to swallow.

## 1.27.1

### Patch Changes

- ed55e60: Three contracts written against this template's own code, in a deployment built
  on it, now run here: the DB-wins merge in `resolveBlueprintForScenario`, the
  compare that weighs a cell's touchpoint placements, and the write gate's three
  published flags. All three passed unmodified — they were held there only
  because nobody had run them here.

## 1.27.0

### Minor Changes

- e49cd7a: The top-strip workspace name is the service switcher. With more than one
  service it becomes a dropdown over the roster; picking one makes it active and
  lands on its base view. With one service — the common case — it is exactly the
  workspace tab that shipped before, no chevron and no menu. One element in two
  states, and the name still comes from the deployment config seam.

## 1.26.0

### Minor Changes

- 58e4abf: The cell panel reads its cell off the board instead of fetching it. The board
  query now carries `cells.function`, `form`, `value_props`, `owner`,
  `perceived_owner` and `steps.summary`, the normalizer maps them (and `position`,
  which was selected and dropped), and `useBlueprintCell` hands a panel the cell
  already in memory. `useCellSpec` and `useCellContent` are gone, and with them up
  to two round-trips per cell on panel open and the skeletons they needed.
  `cellSpecContract.test.ts` holds the select and the normalizer to each other.

## 1.25.3

### Patch Changes

- e22e14a: The Phase 4b data gate report survives a registry with nothing registered.
  `generate_fallbacks.py --register` fills the offline registry for a deployment
  that keeps blueprint content offline; one whose content lives entirely in its
  database registers nothing, and the report asserted at least one compared pair.
  It now says there is nothing to compare and stops, and still asserts that a
  registry WITH content yields pairs.

## 1.25.2

### Patch Changes

- 3bfba0d: The stock-logo test cites no issue

  `blueprintTechPictures.test.ts` opened with an issue number. The sentence says
  what the test pins — a stock logo is data a touchpoint carries, not a table
  baked into the renderer — and the address only said where the argument was
  had. It is the one line keeping a deployment from holding this file identical.

## 1.25.1

### Patch Changes

- b6f7e96: The edit-preview dot says why it is a fill

  The warning dot in the edit-preview badge is a `bg-warning` fill, and nothing
  said why that is right rather than a ramp weight. It is a dot with no text in
  it: the badge's own tint sits behind it, so the mark wants the role's solid
  fill, not ink. 2.47:1 on that tint in light and 8.78:1 in dark — a mark, not a
  word, and a reader is not asked to read it.

  Written down because the step this replaced was a ramp weight picked to be read
  as ink, and without the note the next person picks one again.

- 8933a3c: The touchpoint cell hears the registry

  `BlueprintTouchpointCell` called `getTouchpointTone` directly. That function
  reads a module store, and a module store is invisible to React — which is what
  `useTouchpointToneResolver` was written for, and what its own comment says:

  > a cell that called it directly would draw whatever the store held at its
  > first render and never hear that the rows had landed.

  So a touchpoint cell mounted before the deployment's colours arrived kept the
  default tone until something else re-rendered it. Every other surface that
  draws a touchpoint already takes the hook; this one call site never switched.

## 1.25.0

### Minor Changes

- 16a5616: The panel title carries the scenario's note, and a cover fixture stops naming a docs path

  `ScenarioBlueprintPanel` passed `panelTitleInfoTooltip: null` with a comment
  saying the prop is a seam a fork uses, "the template has nowhere to store one".
  That has not been true since `scenarios.note` shipped: `NavItem.note` carries
  it, `phasesToSlides` fills it, and every other surface that shows a scenario's
  aside already reads it. The panel title was the one that did not, so a reader
  who wrote a note saw it everywhere but there.

  Fed from `slide.note`, on the same condition the summary already uses, and the
  comment goes with it.

  Separately, `coverPage.test.tsx` used `docs/guide/02-x.md` as a fixture path.
  No such file exists in any repository, which is fine for a fixture and
  misleading as text: it reads as an address. It is now `guide/section.md`,
  which reads as what it is.

## 1.24.3

### Patch Changes

- 84504d2: The cover contract cites no plan

  `coverPage.test.tsx` opened by citing `plan 2026-08-18-001` — a document in
  the DEPLOYMENT's docs tree, which never existed here and has since been
  retired there along with the rest of that tier. The sentence says what the
  test pins; the address said where to read about it, and there is nowhere.

  This was the one line keeping two otherwise byte-identical copies of this file
  apart.

## 1.24.2

### Patch Changes

- 2b2261a: The gap the detail drawer clears has a name, and a test that keeps it honest

  `CELL_DETAIL_PANEL_BOTTOM_CLASS` was `!bottom-[61px]` with no way to check 61
  against the thing it clears. It is the bottom canvas chrome plus the same 16px
  breathing room the top gap already names, so it is now
  `CELL_DETAIL_PANEL_BOTTOM_GAP_PX` and the literal stands beside it.

  The literal has to stay a literal. Tailwind reads SOURCE text, so an arbitrary
  value built by interpolation — `` `!bottom-[${GAP}px]` `` — produces a class
  the compiler never saw, no rule is generated, and the element silently keeps
  its unstyled position. That is not hypothetical: this drawer shipped that way
  once, with the constant right, the class inert, and the panel running under
  the annotation toolbar.

  So the contract that arrives with it checks two things — that the one literal
  and its constant agree, and that no source file anywhere assembles a Tailwind
  arbitrary value at runtime, so the next one fails in a test rather than on the
  canvas.

## 1.24.1

### Patch Changes

- 12d9a93: The placement gate's contract names the function, not a migration filename

  `placementGateContract.test.ts` pointed twice at `20260830160000`. A migration
  filename is an address in one repository's series and means nothing in
  another's, so the two copies of this shared file could not be held identical
  while it stood there. `sync_cell_touchpoints` is the thing being named, and
  naming it is enough.

## 1.24.0

### Minor Changes

- d74503c: Twenty contracts a deployment wrote against this code arrive here

  A deployment held 43 test files this repository did not, every one of them
  written against behaviour that lives here. They were about to be counted as a
  cost of consolidating — tests that would be deleted when the deployment stops
  keeping its own copy of the application. They are not a cost; they are
  coverage this repository never received.

  All 43 were classified by whether every module they import exists here. 38
  did. Those 38 were run against this tree as they stood: **22 passed
  untouched**. Two more were dropped for a type this repository's `BlueprintCell`
  does not carry, leaving twenty.

  The other sixteen failed, and that is the useful half of the result. A
  contract written against shared code that fails here is a measurement of real
  divergence between the two trees, named file by file, and it belongs to the
  convergence work rather than to this changeset.

  Six of the twenty named a deployment — a fixture named after the deployment, a slug,
  a comment naming the bot that builds a link. Those are neutralised, which is
  what the standalone guard is for, and one comment misused `lane` where it
  meant a boot signal.

  1782 tests to 1996.

## 1.23.0

### Minor Changes

- 29845ab: The selection outline is drawn inside the cell, and the theme toggle keeps one positioning layer

  Selecting a blueprint cell drew a 2px ring OUTSIDE its border box, with two
  consequences.

  The silhouette changed. A ring with spread rounds at the element's radius plus
  the spread, so a selected cell was 2px larger with a 12px outer corner where
  hover had 10px. The radius never changed; the outline around it did, and that
  reads as the corner changing between states.

  And on the board it was barely there. The ring is 2 CSS px in BOARD space, so
  the camera scales it: at a working zoom it lands near one device pixel, and on
  the visual lane it is slate on slate. Selection looked like a corner artifact
  rather than an outline.

  An inset ring fixes both. The outer edge stays exactly the cell's radius in
  every state, and the outline lands on top of the fill where it reads as a
  border and survives being scaled down. It is what this canvas already does for
  connected emphasis, in `blueprint.css`, for the same reason.

  Separately, `ThemeToggle` positioned the resident glyph absolutely inside a
  `relative` box while `popLayout` was already holding the outgoing one's box —
  two mechanisms doing one job, and the `relative` existed only to anchor the
  second. The grid centres both.

## 1.22.1

### Patch Changes

- 30a6c7b: The storyboard walkthrough says what it is, and one error stops being unwrapped by hand

  Two small things a deployment had already fixed and this repository had not.

  The walkthrough dialog announced itself as "Presentation" — to a screen
  reader, the only name it had. It is the storyboard walkthrough, and the app
  calls it that everywhere a reader can see. The accessible name now agrees with
  the visible vocabulary.

  `StructureRowMenu` unwrapped a duplicate failure with an inline
  `instanceof Error ? … : String(…)`. `errorMessage` in `lib/utils` is that
  expression, the same file already imports it, and the rename path two hundred
  lines down already used it. One spelling for one job.

## 1.22.0

### Minor Changes

- 1afc8dc: `@/…` can resolve to the package, so a deployment need not keep a copy of `src`

  A deployment that imports this repository as a dependency should be able to
  read the application out of `node_modules` instead of holding a copy of every
  file. It could not, and the reason was three lines of build configuration.

  `vite.config.ts`, `tsconfig.json` and `tsconfig.app.json` each map `@` to
  `./src`, and a deployment holds all three byte-identical to this repository's.
  So the deployment could not point the alias at the package without editing a
  file it has promised not to change — and with no local `src`, every `@/…`
  import in this package fails to resolve. Measured against a real deployment
  tree with `src` removed: `TS2307: Cannot find module '@/config'` and the same
  for every other alias, from this package's own files.

  Each mapping now names TWO roots, tried in order: `./src`, then
  `./node_modules/uno-blueprint/src`. TypeScript's `paths` takes
  an array and falls back per module. `vite.config.ts` chooses the first root
  that exists on disk.

  Nothing observable changes here or in any deployment that still has a `src`:
  the first root always exists and the second is never reached. With `src`
  removed, the same deployment tree typechecks and builds clean.

  `src` is all or nothing. `paths` falls back per MODULE and the Vite side per
  ROOT, so the two agree exactly when `src` is wholly present or wholly absent
  and can disagree on a half-vendored tree.

## 1.21.0

### Minor Changes

- 5260083: A badge's size is decided in `ui/badge.tsx`, or at every call site at once

  `ui/badge.tsx` offers four closed sizes. Seven call sites ignored them and
  wrote the geometry themselves — three distinct shapes, two of them below every
  size the variant offers, so a badge in the editor chrome was smaller than the
  same badge anywhere else for no stated reason. Each was written in isolation
  against a shape someone else had already chosen, which is the failure review
  cannot catch: every one of those diffs looked reasonable alone.

  The seven overrides are removed and the badges take the variant's `default`.
  Visible in the editor chrome, the canvas design tools, the developer portal
  and the slide artboard.

  Removing them is the afternoon; keeping them gone is the point, so
  `scripts/tests/one-badge-one-size.test.mjs` arrives with them. Its subject is
  what a call site passes to a badge — not a sweep for `text-2xs`, which would
  need an exemption for every span that legitimately has one, and an exemption
  list is where a real finding hides. Wrappers that forward their `className` to
  a badge are DISCOVERED rather than listed, so the next one is covered the day
  it is written rather than the day someone remembers the list.

## 1.20.1

### Patch Changes

- d15118a: The docked navbar says why it is flush left

  `SlideStickyHeader` sits hard against the left edge of the main column with no
  margin, and nothing in the file said why. The sidebar is in flow rather than
  overlaid, so there is no overlay to surrender a margin to — an absence that
  reads as an oversight until someone knows that.

  Written down here because the deployment had already written it down there:
  this is a shared file whose two copies differed by that comment alone. It goes
  upstream so both can carry it.

## 1.20.0

### Minor Changes

- caa347f: A refused write says the tier is stale

  The editing tier is asked of the database and held against the access token the
  client presents. That is right for as long as the token is. It is wrong for the
  window between a server-side demotion and the next token refresh, and during
  that window the reader is shown save controls the database will refuse — a
  button that lies.

  The obvious fix is a revocation path, and it is bigger than the defect. The
  database is already the authority and re-evaluates the session on every
  statement, so a demoted session's writes fail there whatever the UI believes.
  Nothing is getting through; the UI is just still offering.

  So the trigger is the moment the lie is exposed. A write that comes back denied
  on authorization grounds is the one reliable signal that the held answer is out
  of date, and acting on it costs nothing on the happy path: no timer, no polling,
  no round-trip until something has already gone wrong. `toAuthoringError` is
  where it fires, because that translation function is the single funnel every
  failed write passes through — there is no one place those failures are caught,
  each call site raises and the surface above it renders, so the translator is the
  only seam they share. `writeTranslationContract.test.ts` is what makes "every
  failed write" a fact rather than a hope, and it now says so: a module that
  raises the database's own text loses the phrasing _and_ the reconcile.

  The refresh itself is deliberately small and deliberately defensive.
  `refreshSession()` resolves on failure — auth-js catches the error and hands it
  back in `{ data, error }` rather than rejecting — so a reconciler written inline
  in the provider would report success on every failed refresh and its logging
  would be dead code. `sessionRefresher` reads the field and throws, and it is
  tested against that shape rather than against a hand-written rejecting function.
  A burst of denials from one save fanning out over several tables collapses to a
  single refresh, guarded by both an in-flight flag and a cooldown, because the
  rows were all refused by the same token. A refresh that fails logs and stops: the
  reader is already being shown why the save failed, and a second error on top of
  the first would turn one refused save into a lost session.

  The seam is a registration, not an import. The client lives in
  `SupabaseProvider` and `src/lib/` does not reach up into `src/contexts/`, so the
  provider registers a reconciler while a client exists and unregisters when it
  goes. Until it does, the whole path is a no-op — which is also what a boot-order
  failure looks like, and what an app with no database configured gets.

## 1.19.1

### Patch Changes

- 6673939: A loading destination is not a new place to fit

  A canvas already saved its pan and zoom when its tab unmounted, and already
  restored them on the way back. Readers still lost their framing on every tab
  switch, because a return does not remount straight onto its board: it boots on
  a skeleton, under a destination that names the wait, and the real board only
  replaces that a beat after readiness renames the destination. The viewport read
  the hop as _the reader went somewhere else_, threw the saved framing away in
  its state initialiser, and fitted.

  So the destination key is now compared only when it names a board that is
  actually on screen. `cameraDestinationResolved` is what says so — false while a
  surface stands a skeleton in for content that has not arrived — and while it is
  false the inherited framing is HELD rather than judged. The ordinary fit still
  runs underneath, exactly as before, so a board that never had a framing to
  inherit behaves identically and nothing waits on a decision that may never
  come.

  The decision itself moved into one place and grew a second seam. A mount that
  never waited settles it where it always did, inside the fit effect, before the
  fit is scheduled. A mount that DID wait has no `resetKey` change to settle on —
  the destination was already named while the skeleton stood in for it — so the
  arrival of the board is its own layout effect, declared after the fit effect so
  the two can never both decide.

  Two things fell out of separating _what is being adopted_ from _what is on
  screen_. The framing now comes from the snapshot rather than the live
  transform, which by then is the placeholder's fit; and the geometry it is
  checked against is measured at the zoom the board is painted at, not the zoom
  being adopted, because `measureFitBounds` divides client rectangles back out by
  the live scale and mixing the two reports a box off by the ratio between them.

  Both refusals are unchanged and now covered through the wait as well: a
  different semantic destination, and a fit target whose geometry genuinely
  moved, still fall back to the canonical immediate fit. Leaving mid-flight still
  remembers where the camera was, never where it was going — and leaving before
  the board arrives hands the inherited framing straight back rather than filing a
  placeholder under a key that names the wait.

- 6de9d0a: A rulebook for an empty room

  `docs/plans/` held one file, and that file was the rules of the folder: what a
  plan is, that a plan is dated and never edited, that `status:` is required in
  its frontmatter, that a plan is never current guidance. Its own last section
  said the folder was empty — the planning documents were retired when the
  package was generalised out of the deployment it grew from, because they
  described that deployment more than they described this package.

  So the concept goes, not just the files. Keeping the machinery for the plans
  that might land next is the cheap-looking option and the one this rejects: a
  reader who takes the doctrine seriously learns a document class the repository
  does not have, and an agent cannot tell a dormant convention from a live one.

  What went with it. The index generator loses its history directory, the table
  it built, the rule that failed the build on a plan stating no `status:`, and
  the routing row asking whether a plan is still true — `docs/index.md` now has
  one table, and says in a line that everything in it is protocol. `docs/`'s own
  overview, the documentation grammar and the contributing guide stop pointing
  readers at a folder that is not there. The vocabulary sweeps exempt `docs/adr/`
  and nothing else.

  The migration that cited a plan by address loses the line outright rather than
  having it rewritten. The line above it already says what the migration does and
  the block below already states the invariants, so the address was carrying
  nothing but a pointer — and it had already stopped pointing anywhere.

  One thing was rescued before its protection was deleted. The standalone check
  excluded the folder on the argument that those documents ordered the decoupling
  and stripping them would destroy the record of why the boundary exists. That
  exemption is dead, but the argument is not, so it now sits in the header of the
  check itself: standing alone is an assertion this package makes about itself,
  the reader it is made to is a contributor with none of the context the package
  grew up in, and a check is what makes the boundary verified rather than
  assumed.

  The decision is
  [ADR 9](docs/adr/0009-the-queue-is-issues-and-a-durable-decision-is-an-adr.md).
  Work in flight is GitHub issues, a durable decision is an ADR, current
  behaviour is protocol, and the retired content is in the git history.

- d197ac7: `linkedText` stops naming the migration that retired the column it replaced

  The doc comment read "This is the whole job `evidence.ref` was carrying
  (21000208000000)". The parenthetical is an address into this repository's own
  migration series, and a deployment's copy of this file carries a different
  number for the same change — its series is its own.

  That makes the file unenrollable in the byte-identity sense a deployment
  promises: a shared file may not cite an identity that means something else on
  the other side, which is exactly what a migration filename is. Two copies that
  agree on every other byte were kept apart by a number neither reader needs.

  The sentence loses nothing. What `evidence.ref` was for, and why a note holding
  a locator replaces it, is the whole point of the comment; which migration
  performed the retirement is answered by the series itself.

## 1.19.0

### Minor Changes

- 7657564: The scenario note reaches the title that carries it

  `scenarios.note` has been in the schema for a while, with a column comment
  arguing at length for what it is: an aside about the scenario, beside the
  summary that says what it is, held as blueprint data rather than as a `Record`
  keyed on hardcoded scenario ids that only its author can read. The generated
  row type carries it. `EntityDefinitionPopover` accepts a `note` and renders it
  as a section under its own eyebrow. `ScenarioTitleBadge` passes one through.

  Nothing ever read the column. The one caller that passes `note` hands it a
  hardcoded `null`, and the select in `useServicePhases` never asked for the
  field, so every popover in the app rendered the same three-quarters of a
  mechanism. A deployment that wrote a note into a scenario row got a column
  that stored it and no surface that showed it.

  The read seam asks for `note` now, `NavItem` carries it, and a slide header's
  title — an `<h1>`, so not the badge's job — hangs the definition card off the
  word. `ScenarioTitleDefinition` is the piece that was missing: it composes no
  sections of its own, it only decides that a heading gets the same card a badge
  gets, and it deliberately does not pass the summary, which both headers
  already print as prose two lines below.

  The aside rides on the WORD rather than on an ⓘ beside it. Four other surfaces
  use that glyph to mean _opens the panel_, and one glyph cannot mean both that
  and _there is an aside here_.

  Also: `runConformance` was the last place in the repository still inlining the
  `catch` block that `errorMessage` exists to replace. Seventeen files stopped
  writing it by hand; this one did not, because its `detail` is assembled a few
  lines away from where the others set an error message.

## 1.18.6

### Patch Changes

- 2edfeec: The pair rule says where it applies, and names the six policies outside it

  Two sentences shipped in the last two releases claim slightly more than is
  true, and both are in places a reader consults to decide what to write next.

  The write-policy convention said the single-permissive spelling "is
  deliberately not used here". The rule around it is scoped correctly — it says
  _when you put a table on the write surface_ — but "here" reads as the whole
  schema, and `touchpoints` and `resources` carry six such policies off the
  surface. They are reached only through RPCs, they admit exactly a service
  account, and they are not holes. Nothing decided they should keep the older
  spelling; the pair migrations simply scoped themselves to the surface and
  these two are not on it.

  So the clause is scoped, and the exception is named rather than left for
  whoever greps `_service_only` and finds a shape the paragraph above says is
  not used. Whether the pair should extend past the surface stays undecided —
  written down as undecided, which is the part that was missing.

  The second is smaller: the write surface's own header said the app "inserted
  and deleted" `audit_findings`. The scan finds INSERT and UPDATE and no DELETE
  anywhere — a finding is closed by its `status`. The list is derived, so
  nothing behaved on the wrong claim; it was prose describing the derivation.

## 1.18.5

### Patch Changes

- ea6bb90: A restriction needs something to restrict

  Twenty RESTRICTIVE policies, over eleven tables, stood for a verb that no
  permissive policy opens. Under row level security a restrictive policy narrows
  and never admits, so a verb in that position matches zero rows for everyone the
  restriction names — a lock hung on a door that was never cut into the wall.
  `21000214000000` removes them.

  **Nothing about who may write anything changes.** Every one of the twenty verbs
  was refused before this release and is refused after it, and refused for the
  same reason: `authenticated` holds no grant for it at all, so an attempt is
  turned away with a permission error before row level security is ever
  consulted. There was no hole and this release closes none. Read as a patch it
  would say the opposite of what is true, so the migration says so in its own
  header.

  The verbs are `insert` and `delete` on `cells`, `lanes`, `paths`, `phases`,
  `scenarios` and `steps`; all three write verbs on `cell_dependencies` and
  `path_steps`; and `delete` on `audit_findings` and `business_models`. Every one
  of them is reached only through the `SECURITY DEFINER` authoring RPCs —
  `upsert_cell`, `delete_cell`, `add_lane`, `create_path`, `set_path_steps` and
  their siblings — which run as the function owner and never meet a policy at all.
  That was checked rather than assumed, in both directions: the verbs the app
  writes directly come from the scan of the source that the write-surface check
  already runs, and the definer flag comes from the catalogue of a replayed
  database.

  One loop is the whole cause. `20260818002000`, the optional service-account
  tier, walks thirteen tables and creates all three write policies on each,
  unconditionally. Its own comment says what it assumed — "they AND with the
  permissive policies" — and for nineteen of the thirty-nine there was a
  permissive policy to AND with. It was written table-wide over a surface that is
  verb-wide.

  This is the other half of the convention `21000213000000` recorded. That one
  established that a write policy is a pair, and the reading that makes the pair
  worth having: a permissive `_auth` policy with no restrictive `_service_only`
  beside it is a hole. Twenty lone restrictions blunted the same reading from the
  other side, because a rule of the form "these come in pairs" is worth what its
  exceptions cost. Now the two halves appear together or not at all, and an empty
  policy list for a verb means one thing: the direct write path is closed, and
  the RPC is the way in. `docs/connectors/supabase/database.md` § Row Level
  Security carries both halves — write both policies when a table joins the write
  surface, and write neither when it does not.

  The migration's proof asks three questions rather than counting anything. It
  asserts the invariant this file makes true: no restrictive policy in `public`
  stands for a command that no permissive policy opens to a role it names. It
  asserts, per verb it removed a restriction from, that no permissive policy
  stands for that verb — which is what makes the removal a no-op rather than a
  widening, and which raises and names the table on a deployment that has opened
  one of them directly. And it becomes `authenticated` holding a service claim
  and attempts each of the twenty, requiring the write to be refused. Every
  attempt is a bare `default values` or a `where false`, so no deployment's rows
  are read or written even where a grant exists.

## 1.18.4

### Patch Changes

- 758bcbf: One shape for "service accounts only", and it is written down

  Fourteen tables are on the write surface — the ones the panels reach directly,
  under the caller's own privileges, rather than through the definer RPCs. Twelve
  of them said "only the editing tier may write this" as a pair of policies: a
  permissive `<table>_<verb>_auth` with `using (true)`, and a RESTRICTIVE
  `<table>_<verb>_service_only` calling `public.is_service_account()`.
  `stakeholders` and `cell_touchpoints` said it as a single permissive policy
  whose whole predicate was that same call.

  **Nothing about who may write anything changes.** Both spellings admit exactly a
  service account and refuse exactly everyone else; there was no hole and this
  release closes none. The posture before and the posture after are the same
  posture, on every database this replays against, and the migration says so in
  its own header so it cannot be read as a patch.

  What changes is that one rule stops being written two ways. 20260818002000, the
  optional service-account tier, hung the restrictive half on the thirteen tables
  that already had a permissive write policy for it to narrow. The two above
  joined the surface afterwards and each was written from scratch, so each reached
  for the shortest thing that was correct. Both authors were right about the rule;
  neither had anywhere to read the shape, because nothing stated it.

  21000213000000 gives both tables the pair, for insert, update and delete. The
  pair wins over collapsing the other twelve for three reasons. It is what a
  reader meets twelve times before meeting the exception. It keeps two decisions
  apart that have two different owners — the permissive half is the base
  template's ("this table is edited from the browser rather than through an RPC"),
  the restrictive half is the optional recipe's ("and only by the editing tier"),
  and the single-policy form fuses them, staying correct only because the core
  seam's default body is `select true`, which nothing at the call site shows. And
  it makes a _missing_ restriction legible: a surface table with an `_auth` policy
  and no `_service_only` beside it is now unambiguously a gap, which is what
  `services` turned out to be one release ago.

  The convention is now recorded where row-level security is documented —
  `docs/connectors/supabase/database.md` § Row Level Security — because a
  convention nobody writes down is how the second spelling arrived in the first
  place.

  The migration's proof is the post-condition, asked as the role: it becomes
  `authenticated` twice, once holding a service claim and once not, attempts the
  writes the panels make, and asserts that the answer is the seam's both ways. It
  counts nothing in `pg_policies` — a census of the database it happened to meet
  is not a post-condition, and reading the catalogue is exactly what could not
  tell these two spellings apart. Where the optional tier recipe was never applied
  the seam is still `select true`, so the policies admit every signed-in session
  and the proof says so in a notice rather than failing. Independently,
  `npm run check:seed-load` attempts every one of these writes against a seeded
  database as an author who must succeed and as a viewer who must change nothing:
  58 writes an author made and 23 a signed-in reader was refused, unchanged across
  the rewrite.

## 1.18.3

### Patch Changes

- d07c46d: The service record joins the tier every other table already answers to

  `public.services` was the one table on the write surface a plain signed-in
  member could UPDATE. Every other table there admits only a service account, and
  the operations guide says a member outside the editing tier may read and not
  write — of this table that was never true. Anyone who could open a deployed
  board could rewrite a service summary.

  It was an oversight with two authors, neither of them wrong on its own.
  20260818002000 introduced the service-account tier and hung a RESTRICTIVE
  `*_service_only` policy on the tables that had a write policy to restrict.
  `services` was read-only then — the intermediate representation builds a
  service, nothing edited one — so it had nothing to restrict and got nothing.
  21000128000000 then gave it the write policy the Service panel needed,
  `using (true)` to `authenticated`, and did not add the restrictive counterpart
  the earlier migration would have. Nothing anywhere argues that the service
  record should be the one row an ordinary member may rewrite.

  21000212000000 hangs `services_update_service_only`: RESTRICTIVE, UPDATE,
  `authenticated`, `public.is_service_account()` as both its USING and its WITH
  CHECK — the shape the tier built for its thirteen tables. Restrictive is the
  whole of the fix, because a permissive policy naming the tier would OR with
  `using (true)` and change nothing at all. UPDATE only, and deliberately:
  `services` carries no INSERT or DELETE policy for `authenticated`, so both
  verbs already match zero rows, and a restrictive policy over a write nobody is
  admitted to make asserts nothing while reading as though it did. A single-tier
  deployment is untouched — `is_service_account()` is the CORE seam whose default
  body is `select true`, so where the optional tier recipe was never applied the
  new policy admits every signed-in session, exactly as that deployment chose.

  The proof is the post-condition, and it is asked as the role. A migration
  applies as an owner, an owner bypasses row level security, and a policy that
  refuses does not raise — it matches zero rows and returns success — so a proof
  that read the catalogue, or wrote as the owner, would be satisfied by the
  database this migration exists to change. It becomes `authenticated` instead,
  holds a viewer claim and then a service claim, attempts the write the Service
  panel makes, and ends each attempt in a sentinel exception so no row, claim or
  role survives it. What it asserts is agreement with the seam: a service claim
  writes, a session without one writes only where the seam still says
  `select true`. Never a count of the policies that happen to exist. Where it
  cannot get an answer — a session that cannot become `authenticated`, or an
  `authenticated` without the platform's SELECT on the table — it names what was
  missing and asks nothing, rather than reporting the platform's absence as this
  policy refusing.

  The check that found this is the check that proves it. The write surface has
  attempted every write twice since #369, once as an author and once as a
  signed-in reader, and `services` was the single table whose reader half was
  declared off — with its reason, in `ANY_SIGNED_IN_USER_MAY_WRITE`, printed on
  every green run. Deleting that entry re-arms it: twenty-three reader probes
  instead of twenty-two, and `viewer update services` reporting `zero`. Drop the
  new policy and the same probe reports `wrote`, which is what makes the green
  mean anything.

## 1.18.2

### Patch Changes

- 114b9f9: The glossary says the interaction line is a band, and gains four sentences the deployment had been keeping instead

  A deployment is stopping its own `CONTEXT.md` restating this model and
  pointing here instead. Reading the two files side by side to decide which copy
  was better found five places where the deployment's was, and one of them was not
  a matter of taste: this glossary said the line of interaction "draws below the
  lane holding the recipient's own actions", singular, while
  `shouldShowInteractionLineAfter` in this repository has drawn it below the LAST
  such lane since 4c9f5d3. The recipient's side is a band and can be several rows
  deep. A reader of the glossary was told a rule the code had already stopped
  following, and a boundary drawn once per row is not a boundary.

  Four more sentences arrive because nothing here said them and the copy that did
  is being deleted. A path is an **alternative, not a stage** — its paths are read
  beside one another, and nothing connects across them, which the dependency entry
  implied from the edge's end and no entry said from the path's. **Scenario, step
  and path own no spec**, a negative the Spec entry needs, because "four levels,
  one word" does not tell a reader that the other three levels have none. The test
  that separates the two dependency kinds — remove the other cell, and ask whether
  this one never starts or starts and goes wrong — is the operational form of a
  distinction this file otherwise argues only by definition. And **no record at
  all belongs to what-if**: it returns a trace on a copy, and where it records
  anything it records a finding, which is the audit's.

  That last one is why the ownership table can keep its shape. `evidence` reads
  **the cell** here and has since the agent gained `create_evidence`, so "nobody"
  lost its example — but it must stay a sayable answer, or the owner column
  becomes a name drawn from a list of readers and the next table with no owner
  gets assigned to whichever one is loudest. What-if is what "nobody" is said
  about now.

  Nothing else moves. The soft cell references, the `resources` naming rationale
  and the `stacked`/`merged` layout values all read better in the deployment's
  glossary than in this one, and all three are already stated in
  `references/data-model.md` and `references/ir-schema.json`, where they are
  enforced — restating them here would reproduce one level up the duplication the
  deployment is removing.

- 3707e0d: The change list says which half an upsert took

  `upsert_cell` and `set_cell_dependency` both upsert, and both were taught to
  report which half they took so the ledger could stop deriving an inverse from
  the operation's NAME. The sentence a person reads was left behind: the change
  list still said "Added a cell" and "Connected two cells" over writes that had
  edited an existing cell and an existing edge. It is the same mistake, in the
  one place it is visible.

  The entry carries no report of its own, so the describers read the derived
  inverse, which is where the report survives — `delete_cell` and
  `clear_cell_dependency` mean the insert half, `restore_cell_content` and
  `restore_cell_dependency` mean the update half. An entry with no inverse is the
  update half whose before-state did not come back, since an insert always
  derives one, so the absence reads as an edit rather than falling back to the
  create. Rows written before those two fixes all carry the old name-derived
  `delete_cell`, so they still read as creates — that is what they recorded.

  The update half's sentence is "Edited a connection" rather than a new synonym,
  because that is what a deployment carrying `update_cell_dependency` already
  calls the same event.

- c626120: The write surface proves the write, instead of reading the catalogue

  The policy half of the surface asked `pg_policies` whether a policy existed on
  the table, for that command, naming `authenticated` — and a policy that exists
  and admits nobody satisfies an existence test. Every one of these fourteen
  tables carries one. The service-account tier hangs a RESTRICTIVE
  `<table>_update_service_only` on thirteen of them and the rest carry a permissive
  policy whose whole predicate is `is_service_account()`, so the question the
  surface asked could not tell "an author may write this" from "only a service
  account may". That is the one pair whose difference is silent: a session outside
  the editing tier meeting a service-only policy matches zero rows and gets a 200
  back, and `requireRowsWritten` reports the save as a row somebody else deleted.

  So the question is asked as the role. `set local role authenticated`, a
  representative claim, attempt the write, roll it back. A policy that refuses
  cannot satisfy that, and it subsumes the grant half the issue asked about —
  `update t set c = c` is refused on a column the author does not hold, so
  `has_column_privilege` and `exists(select 1 from pg_policies …)` collapse into
  one question per column and verb, answered by the write itself. 58 grants and 23
  policy existence tests become 58 writes an author makes and 22 the same
  statement, run as a signed-in reader, must not.

  **The second half is what makes the first mean anything.** `authenticated` is one
  Postgres role and two audiences — the app says so itself, gating its editors on
  `isServiceAccount` and calling the restrictive policies "the wall" — so the probe
  runs as both. A check that only ever proved a write succeeded would pass just as
  well on a database that let every reader write, which is not a hypothetical: it
  found one. `services` is the single surface table the tier never reached. It had
  no write policy at all when 20260818002000 swept the others, and when
  21000128000000 gave it one it gave it `using (true)`. Any signed-in member can
  rewrite a service summary today, which is precisely what the operations guide
  says a member outside the editing tier may not do. It is named in
  `ANY_SIGNED_IN_USER_MAY_WRITE` with that reason, printed on every green run, and
  its author probe still runs — the exception is a smaller claim, not an exemption.
  The migration that closes it is owed and is not in this change.

  Attempting a write needs a row to write and a role that can evaluate a policy,
  and neither was true before. `PROBE_FIXTURES` stands one row up in the four
  surface tables the sample seed leaves empty, guarded by `where not exists` so a
  seed that starts filling one retires its fixture; a surface table with neither is
  a failing test rather than a probe that reads an empty table's zero rows as a
  refusal. And the shim was lying by omission: Supabase grants `usage on schema
auth` to `anon` and `authenticated`, and without it every policy predicate
  calling `is_service_account()` — which is not `security definer` — answers
  `permission denied for schema auth` to the very role it is written about. Nothing
  noticed while the checks read the catalogue. The first question asked as the role
  found it in one run.

  The `cmd = 'ALL'` gap #368 left behind — `pg_policies.cmd` reads `ALL` for a
  `for all` policy, so an exact-match existence test reports one as missing — is
  gone rather than fixed. Nothing reads `cmd` any more, and a `for all` policy
  either admits the write or does not.

- 43799f4: The write surface asks about every verb the app uses, not only UPDATE

  `PANEL_WRITE_SURFACE` was widened last release from eight tables to fourteen, and
  the widening exposed the same hole in the other axis. The surface asserted the
  UPDATE path and only that: `check:seed-load` asked a real database for an UPDATE
  grant and an UPDATE policy per entry, while the app also inserted into and
  deleted from `evidence`, `slices`, `slides`, `stakeholders` and `audit_findings`.
  So `evidence` was "on the surface" with two of its three write verbs unchecked —
  one verb wide instead of one table wide. The file stated the limit rather than
  implying coverage it did not have, which is how it was found, but a stated limit
  is still a deployment that can revoke INSERT and keep every gate green until an
  author presses a button and gets a refusal the interface cannot explain.

  Each entry now carries the verbs its writers actually use, and each verb is asked
  for twice: the grant, and an RLS policy for that command admitting
  `authenticated`. UPDATE keeps its column list, because the deployment really does
  grant it column by column and `has_column_privilege` is what checks that
  granularity. INSERT and DELETE are asked table-wide, because that is how the
  recipe grants them and a column list for them would be precision the grants do
  not have. The check went from 47 grants and 14 policies to 58 and 23; the failure
  messages say what each one costs an author, which for a missing DELETE policy is
  a row that reappears on the next read rather than an error anyone sees.

  The verbs are derived, not declared. The scan that finds the tables had to read
  the verb to find them at all — `.from('evidence')` is not a write until something
  downstream says `.delete(` — so `writtenVerbsByTable` hands them back from the
  same walk of `src/`, and an insert added to a module that already updates is
  covered the moment it is written. A hand-kept list is what produced the original
  defect, and adding a second one for verbs would have reproduced it. That leaves
  exactly one verb claim still made by hand: the column list is an UPDATE claim, so
  the surface test now fails an entry that lists columns for a table nothing
  updates, and one the app updates that names no columns at all.

  The verbs come off the scan already shared with the write-boundary contract, so
  there is still one parser of the subject and not two.

## 1.18.1

### Patch Changes

- 2390653: The other upsert says which half it took, and its undo stops guessing

  `upsert_cell` upserts. Landing on a square of the grid that already holds a
  cell it updates that row and hands back its id — indistinguishable from the id
  it returns when it inserts. The ledger derived this write's inverse from the
  operation's NAME, so the inverse it recorded was `delete_cell`. On the insert
  half that is exact; on the update half the undo would remove a cell the write
  had only edited, taking its summary, Function, Form, Value props, owner pair
  and status with it — none of which that write touched.

  Nothing reaches the update half today, and that is the argument rather than a
  reason to leave it. Both callers establish the square is empty first: the panel
  calls `upsert_cell` only on a draft, when there is no cell id, and the agent
  tool reads the slot and refuses with "A cell already exists at that slot".
  That check is a read followed by a write — nothing holds the square between
  them, so two agent turns on one board, or an agent and a person, can both see
  an empty slot — and it is carried per caller, so the rule lives in prose in two
  files rather than in the operation. The previous release said this function was
  unaffected _because_ of those guards; a guard standing between a caller and a
  defect is not the same as the defect not being there.

  `21000211000000` makes the write report what it did. `upsert_cell` returns
  `{ id, inserted, previous }` instead of a bare id: `inserted` is read from the
  written row's `xmax` inside the same statement, and `previous` is the cell as
  it stood, captured before the write under a lock. The revert derivation
  branches on it — a delete for an insert, and for an update
  `restore_cell_content`, a new operation that puts one column back on one cell
  by id.

  One column, deliberately. The upsert's `on conflict` sets `content` and nothing
  else; everything else in the row is either the conflict key or minted on the
  insert half. The seven other fields a person types into a cell belong to
  `update_cell_content` and `update_cell_spec`, which capture their own inverses,
  and an undo that reached them would revert somebody else's edit. The restore
  assigns rather than coalescing: `cells.content` is `not null default ''`, so
  the state a coalescing inverse could not express is not null but empty — and a
  blank draft an agent writes onto is the ordinary case here, not the corner.

  The guards stay. Once the write reports for itself they are belt-and-braces
  rather than the safety, and the agent tool's refusal is a better answer than a
  silent update; the tool's reply now also says which half the write took. The
  return type moves, so the function is dropped and recreated and its ACL is
  restated — the core revokes the PUBLIC execute the recreate lands on, the
  recipe half restores the anon revoke and the authenticated grant. An update
  whose before-state did not come back (a concurrent insert between the capture
  and the upsert) records no inverse at all, which is the ledger's existing way
  of saying an undo cannot restore the prior state.

- f989b56: The write surface is held to the writers, not to a list

  `PANEL_WRITE_SURFACE` declares the tables and columns the authoring UI writes
  directly, and `check:seed-load` asks a real database whether a signed-in author
  may reach each of them. Nothing enforced the declaration, so it drifted — not
  by one line but by six tables. `cells`, `cell_touchpoints`, `evidence`,
  `audit_findings`, `slices` and `slides` were all written by the app and named
  nowhere on it, which made the check's own report — "every column the panels
  write is reachable" — true of eight tables and false of the app.

  All six are now listed, with the columns their `.update({…})` names. More to
  the point, a new test walks `src/` for direct table writes and holds the
  surface to what it finds, in both directions: a table the app writes and the
  surface does not name fails, and so does an entry nothing writes any more.
  Where a table is deliberately outside the surface it says so and why —
  `agent_sessions` and `agent_messages` are the agent transcript, best-effort by
  design, and asserting a grant on them would assert the opposite of the intent.

  The columns cannot be scanned for — a payload is as often `.update(patch)` as a
  literal — so they are held instead to `src/types/database.ts`: every name on
  the surface must be a name the schema has. That also removes a bad failure
  mode, because `has_column_privilege` raises on a column that does not exist, so
  a typo used to reach CI as "the fresh-database seed load failed" without ever
  naming the column.

  The scan is shared with the write-boundary contract rather than written twice.
  That rule asks who may write and this one asks what they write, and two parsers
  of one subject would be two readers to drift from each other — which is the
  failure both rules exist to catch.

## 1.18.0

### Minor Changes

- 063cad6: Canvas navigation is one continuous camera flight

  Selecting a phase or a scenario used to cut to a fitted view. It is now a
  flight: one timing family whose duration is read from what the reader can
  see moving — the arrival centre's screen distance and the zoom ratio — and a
  path that keeps the destination's screen-space approach monotonic, so a large
  zoom-in never sends its target further away before arriving.

  Flights interrupt and redirect rather than restart. A newer intent projects
  whatever momentum is still compatible onto the new journey and drops the rest,
  retargets when layout geometry moves underneath it, and carries visual focus
  with the camera. Each canvas tab restores the view it was left at, and the
  mobile shell replaces one scenario with another through a fade that waits for
  the incoming board to fit.

  The agent's `open_phase` and `open_scenario` no longer infer arrival by
  polling for an idle camera — idle is also what a cancelled flight looks like.
  The viewport publishes its exact outcome and the bridge reports that.

## 1.17.1

### Patch Changes

- 5fbafe8: An upsert says which half it took, and its undo stops guessing

  Undoing an agent's dependency write could delete an edge the author already
  had. `set_cell_dependency` upserts: landing on a pair that is already connected
  it updates that row and hands back its id — indistinguishable from the id it
  returns when it inserts. The ledger derived this write's inverse from the
  operation's NAME, and the name says "connected two cells", so the inverse it
  recorded was a delete. On the insert half that is exact; on the update half the
  undo destroyed an edge the write had only edited.

  Only the agent tool reaches it. `create_cell_dependency` on a pair the
  blueprint already connects is a bare upsert onto an existing row — a retry, a
  re-run of a plan, a model connecting two cells it has connected already. The
  panel's add form cannot: its validation refuses a duplicate before any call is
  made. That makes it the worst shape of defect — a write made by a machine, in
  a batch, on rows a person has often already read — and it compounds with how
  the session sheet picks an undo's target, which is the newest entry carrying an
  inverse, not the newest thing the person did.

  `21000210000000` makes the write report what it did. `set_cell_dependency`
  returns `{ id, inserted, previous }` instead of a bare id: `inserted` is read
  from the written row's `xmax` inside the same statement, and `previous` is the
  row as it stood, captured before the write and locked. The revert derivation
  branches on it — a delete for an insert, and for an update
  `restore_cell_dependency`, a new operation that puts the two prose columns back
  on one row by id. It assigns rather than coalescing, which is the point: the
  case the agent causes is an edge that had no note being given one, and an
  inverse that cannot write a null cannot undo that.

  The return type moves, so the function is dropped and recreated and its ACL is
  restated — the core revokes the PUBLIC execute the recreate lands on, the
  recipe half restores the anon revoke and the authenticated grant. An update
  whose before-state did not come back (a concurrent insert between the capture
  and the upsert) records no inverse at all, which is the ledger's existing way
  of saying an undo cannot restore the prior state.

  The other upsert in the derivation table, `upsert_cell`, is not affected: its
  tool refuses an occupied slot, so the delete it derives is a true inverse. The
  agent's reply now also says which half the dependency write took, so a model
  told "set" after landing on an existing edge stops believing it made one.

- 64e1fd4: The portable shim can hold a claim, so a guarded write can be rehearsed

  `supabase/portable/supabase-shim.sql` stood `auth.jwt()` in as `select
'{}'::jsonb` — an empty object, unconditionally, whatever the session had set.
  `public.is_service_account()` reads that object, so behind the shim no session
  could be a service account, and every write RPC that asserts the guard in its
  own body refused. Not a simplification: a different behaviour, in the one file
  whose whole job is to answer the way the thing it stands in for answers.

  What it cost is measurable rather than theoretical. Two rehearsals of guarded
  writes had to redefine `auth.jwt()` inside their own rolled-back transactions
  to get any write to run at all, which proves a copy of the function rather than
  the function. And `21000209000000`'s embedded proof — a fixture that authors an
  edge and re-runs the call the agent tool sends — asked whether the environment
  could hold a service claim, found it could not, and skipped with a notice.
  That is the right thing for a proof to do when it cannot run, and it meant the
  portable replay had been proving less than it looked like it proved.

  All three of GoTrue's request-scoped helpers now read `request.jwt.claims`, the
  GUC Supabase resolves a request's JWT into: `auth.jwt()` returns the claims or
  an empty object, and `auth.uid()` and `auth.role()` read `sub` and `role` out
  of it rather than answering null by construction. An unset GUC still answers
  "nobody", so a replay that sets nothing is unchanged; a
  `set_config('request.jwt.claims', …, true)` inside a rehearsal or a proof block
  now does what its author expects. `nullif` before the cast because a GUC that
  was set and then cleared reads back as the empty string, and `''::jsonb` is a
  syntax error rather than an absent claim — which is exactly the shape the proof
  block's own cleanup leaves behind.

  `is_service_account()` is untouched. The guard was never the defect; the stub
  under it was. The shim is still not a security boundary — a caller who can
  `set_config` can claim anything — and it is still not something an adopter
  installs. It is a CI harness that now answers the question Supabase answers.

  The replay says what changed. Before and after, all 48 migrations apply and
  none fails; the two halves and the replay agree on the same inventory. The only
  difference in the whole log is one line that is no longer printed: the
  omitted-argument proof no longer skips. It runs, behind the shim, and passes.

## 1.17.0

### Minor Changes

- a214003: A source carries one note

  The add-a-source form asked for five things and the saved row wore three type
  treatments. `evidence` held `ref`, `excerpt` and `note` side by side — a
  locator, a quotation, and an aside — and an author had to sort a sentence into
  the right one before writing it. It becomes three fields in one group: Kind,
  Title, Note.

  The count is why. Measured on the deployment that runs this template, across 66
  evidence rows: all 66 carry a title, two carry the quote field, and none carries
  the reference field. The titles say where the references went instead —
  "PR 1151", "Card 2266", "Metabase, 2026-08-08" — and one of the two quotes is a
  note about a meeting, sitting in a field whose placeholder read "Their words,
  not a summary of them". Zero rows means UNUSED, not unreachable: the agent's
  `create_evidence` could write `ref` the whole time and never did, so the number
  is a fact about the field rather than about the surface it was offered on.

  `note` survives as the one general-purpose prose column, and a URL written
  inside it renders as a link wherever a source is displayed. That is the whole
  job the reference column was carrying, for the zero rows that used it.
  `linkedTextSegments` is deliberately narrow about what counts: a scheme is
  required, so `data-model.md` stays a filename and `PR 1151` stays a citation,
  and `safeExternalHref` still has the last word on which schemes may become an
  anchor. Trailing punctuation goes back to the sentence, except a closing
  bracket the address itself opened.

  `21000208000000` moves every excerpt into the note beside it and drops both
  columns. It refuses rather than destroys, twice: a row carrying a reference
  stops it, because a locator is not prose and the migration will not invent a
  sentence around "PR 1151"; and a row carrying an excerpt beside a DIFFERENT
  note stops it too, because it cannot choose between them and will not join two
  sentences on their author's behalf. Both guards are invariants — "no excerpt is
  destroyed", "no reference is destroyed" — true of every database the file will
  ever meet, including an empty one. Neither counts rows, which is the only kind
  of assertion that can replay. No grant moves: `evidence` is granted whole-table
  and never column by column. `scripts/tests/evidence-note-migration.test.sh`
  applies the file with `psql -1` against a populated replay, because a guard that
  raises only means something when the fold rolls back with it.

  The saved row wears one text treatment. The monospaced link, the italic passage
  and the rule down its left edge all go — three ways of saying "this text is
  different", stacked in a panel 264 pixels wide. The kind is a quiet suffix after
  the title now, so the icon reinforces it rather than carrying it alone.

  Every field keeps a label, through the panel's own `Field`, so no field's
  purpose is carried by grey text that disappears the moment an author types. The
  asterisk on Title is this panel's only signal that a field cannot be left empty,
  and its absence on Note is what says Note is optional — a second signal for the
  same thing is how a form starts arguing with itself.

  The agent's evidence tools lose `ref` and carry one prose argument. Their
  descriptions stop calling it a quoted passage: a model reads a description as
  the field's definition, and "the quoted passage that carries the claim" is an
  instruction not to write an observation there — which is exactly what the two
  rows that used the field did anyway. `create_evidence` could never write `note`
  at all before; it passed a hardcoded null.

  `21000116000000` set one word per meaning and then deliberately spared
  `evidence.note` on the argument that a source's note is an aside beside the
  source. Three months of authoring says the aside was doing the work and the
  field beside it was not, so the word stays rather than becoming `summary`: a
  note about a source is still not the source. That is a fold rather than a
  licence — `findings.summary` is still a summary, and the next column whose job
  is a thing's own sentence still gets that word. The rename map records both
  pairs with the reason each carries no `rename column` statement.

  Evidence still does not link to resources, deliberately. A locator field was
  available for 66 rows and filled zero times, and of the 47 cells carrying
  evidence only 20 also carry resources, so a picker would be empty on the other 27. A join table can be added later without disturbing the note; the signal to
  build it is notes filling up with resource names.

- 4b4b962: The dependency editor writes the note, and the badge loses its last reader

  The previous release moved a dependency's why-line into a tooltip on the row and
  stopped drawing the edge's name. It also left the app rendering a column it
  could not write: the panel's connection editor offered one prose field labelled
  "Name (optional)" and the agent's `create_cell_dependency` offered one argument
  called `label`, and both landed in `cell_dependencies.name` — the badge. A note
  reached the database from a seed or an import and from nowhere else.

  That is the whole of the defect, and the data says so from both sides. A
  deployment built on this template measured 434 dependency rows, of which 8
  carried a name and none carried a note — and every one of the 8 was a sentence
  saying why the edge exists rather than a channel tag like "Email". Authors were
  not misusing a badge field; it was the only field they were offered. That
  deployment has since copied all 8 into `note` in a migration of its own, so
  both columns now hold the same sentence there — a backfill, not an author
  working around anything, and it is only possible because someone knew to write
  one. The bundled
  sample agrees from the other direction — 73 dependency rows, no names, 21
  sentence-shaped notes, because a seed can write the column the editor cannot.

  The editor's one prose field now writes `cell_dependencies.note`. It is labelled
  Note and marked optional, and its placeholder is "Anything worth knowing about
  this dependency" — deliberately general. "Why this edge exists" is narrower than
  what authors actually write, and a narrow frame is what sent them to the wrong
  field in the first place.

  The agent's dependency tool lands its prose in the note too, and its argument
  keeps the spelling it was published with. Moving where a value lands is safe for
  a skill pinned to an older release: it goes on sending `label` and the sentence
  now arrives somewhere a reader sees it. Renaming the argument in the same step
  would not be — that skill would send a key the handler no longer reads and the
  value would be dropped in silence. A rename is a separate, sequenced change with
  a release between the two halves.

  `cell_dependencies.name` is not dropped. The badge stopped rendering last
  release and its write surface is retired here; dropping the column is a
  different decision with a deployment's rows attached to it. What does go is
  `linkName`, the field that carried the column into `BlueprintCellConnection`.
  Nothing had read it since the badge stopped being drawn — the panel handed it to
  the connection editor, which never looked at it — so it leaves with the input
  that fed it rather than waiting for a third change to notice it.

  No migration. `set_cell_dependency` has taken a note all along; only the two
  callers were pointed at the wrong parameter.

### Patch Changes

- 4b4b962: An argument nobody sent no longer erases an edge's words

  `set_cell_dependency` upserts, and its conflict clause assigned both prose
  columns straight from the row it had tried to insert — `name = excluded.name,
note = excluded.note`. Both arguments default to null, and a default is
  indistinguishable from a null the caller sent, so a call that said nothing
  about the words did not leave them alone: it cleared them, on an edge that
  already existed, and returned the id as if it had succeeded.

  The agent tool is what reaches it. `create_cell_dependency` needs a source, a
  target and a kind; its prose argument is optional. Asked twice for the same
  edge — a retry, a re-run of a plan, a model connecting two cells it has already
  connected — the second call is a bare upsert onto the first and whatever an
  author wrote there is gone. The panel's connection editor cannot reach it,
  because its validation refuses a duplicate before any call is made; that is a
  validation standing in front of the defect rather than the defect not being
  there.

  The conflict clause now coalesces: `coalesce(excluded.name,
cell_dependencies.name)` and the same for `note`. An omitted argument means
  "leave it as it was" and a supplied one still replaces. Both columns, because
  neither has a caller that clears by sending null — nothing has written `name`
  since the editor and the agent tool were pointed at `note`, and a note is
  cleared by removing the connection and adding it again, which is a delete and a
  fresh insert with no upsert in it.

  The cost, stated rather than hidden: a null can no longer clear either column
  through this function, and neither can an empty string — the body has always
  turned `''` into null before the conflict clause, so those two have never been
  distinguishable here. Emptying a field wants a function whose arguments are
  required, where an omission is a loud "function does not exist"; this one, whose
  job is to add an edge, is not it.

  The migration proves it rather than asserting a body: it builds a fixture,
  authors an edge carrying a name and a note, re-runs the call the agent tool
  sends, and raises unless both columns survive — then supplies new values and
  raises unless they replace. The fixture is given back through a sentinel
  exception. It does not assert what the previous body did, which is a fact about
  this package's history rather than an invariant of the statement, and would
  refuse to apply to a database that arrived at the fix another way.

- 4b4b962: The tooltip wrapper's rules say what the tooltip does

  `IconTooltip`'s doc comment stated as non-optional that a tooltip "never
  appears for a keyboard user who has not hovered". That is false for the Base UI
  version this ships, and a passing test in the dependency why-line's suite —
  "opens on keyboard focus, not on hover alone" — already disproved it. Two green
  files documented opposite rules, and the false one was being quoted as the
  reason a tooltip needs a visually hidden companion in the DOM: a right practice
  resting on a wrong reason, which the next reader can be talked out of by
  disproving the reason.

  The real reason is stronger. Read from the installed `@base-ui/react` 1.7.0
  rather than assumed: no part of the tooltip sets `role="tooltip"`, no part
  wires an `aria-describedby` from the trigger back to the popup, and the only
  props the popup contributes of its own are `tabIndex={-1}` and a data
  attribute. The popup therefore contributes nothing at all to the accessibility
  tree, and whatever is in the DOM is the whole of what a screen reader is
  handed. The rule now says that, version-qualified, because it is a fact about a
  dependency rather than about this code.

  It also records what is true about the keyboard — `TooltipTrigger` wires
  `useFocus` gated on `:focus-visible`, so tabbing to the trigger opens the popup
  and nothing has to be built for it; what has to be checked is that the trigger
  is the focusable element — and about touch, where the hover interaction is
  `mouseOnly` and opens nothing.

  Doc comment only. No behaviour changes and no API changes.

## 1.16.0

### Minor Changes

- f06407d: The why-line waits in a tooltip, and the edge's name stops being drawn

  A dependency row in the cell panel carries two pieces of prose it did not write
  itself: `cell_dependencies.note`, the sentence saying why the edge exists, and
  `cell_dependencies.name`, specified as the word on the arrow. Both change here.

  The note was revealed rather than removed — transparent at rest, opaque under
  hover or focus-within, always visible where the pointer is coarse. Opacity keeps
  a row's height on purpose, so that a list does not move the row being pointed
  at; the cost is that an invisible line is still a line. Eight rows with a note
  drew sixteen, seven of them blank, and the list's shape depended on how talkative
  its author had been. The sentence reads from the app's tooltip now, so eight rows
  draw eight.

  A tooltip is not an accessible name, and this Base UI (`@base-ui/react` 1.7.0)
  makes that literal: the popup carries neither `role="tooltip"` nor an
  `aria-describedby` back to its trigger, so nothing about it reaches a screen
  reader at all. The sentence therefore stays in the DOM, inside the row's own
  button, and is hidden only where the pointer is FINE —
  `[@media(pointer:fine)]:sr-only`. A screen reader reads it as part of the row's
  name whatever the pointer is. A touch screen keeps the printed line, because the
  trigger's hover interaction is `mouseOnly` and would never have opened for it,
  and because the row's one tap target already means "go to the other cell" and
  cannot also mean "show me the note". A keyboard gets the popup, because the same
  trigger opens on focus as well as on hover. Hiding is conditioned on the pointer
  being fine rather than on the absence of a coarse one, so a device reporting no
  pointer at all keeps the line rather than losing it to a rule about mice.

  `ROW_REVEAL_CLASS` stays where it is: the resources list's drag handle is its
  other consumer, and opacity is the right rule for a control that has to stay
  where the cursor expects to find it. It was only ever the wrong rule for prose.

  The edge's name is no longer drawn. It was specified as a badge — a channel name
  like "Email", set beside the lane and the step — and was never used that way:
  what authors put in it were sentences saying why the edge exists, which is what
  the note is for. Two fields making the same claim, one of them a badge too narrow
  to hold a sentence, is worse than one. Nothing is dropped and no migration moves:
  the column stays and the read still carries the value into the panel's connection
  editor. It is simply not drawn anywhere any more. The sample blueprint has 73
  dependencies and names none of them, so nothing in the bundled data looks
  different.

  What this exposes, and does not fix, is that the app cannot write a why-line at
  all. `set_cell_dependency` takes a note, but the panel's connection editor offers
  only a "Name (optional)" field and the agent's `create_cell_dependency` offers
  only `label` — both of which land in the column that no longer renders. A note
  reaches the database from a seed or an import and from nowhere else. That is the
  change to make next, and it is a write-surface change rather than this one.

## 1.15.0

### Minor Changes

- c3bcf69: One list edits everything an owner points at

  A cell's Resources tab and a placement's resource list wrote the same table,
  and only one of them had been designed. The placement's list could set a
  preview, set a button, reorder, and take a pasted link named by its host. The
  cell's own list was a pair of raw boxes per row — a label and a URL — with no
  featuring, no order, and a name you had to type before anything could be
  added. An author who had learned one had not learned the other, and the cell's
  version could not express things the database already stored.

  The list is now one component, `ResourcesList`, which both owners hand rows and
  a pair of writes. `PlacementResourcesList` is the wrapper naming its own two;
  the cell's tab renders the same list with its own. No migration was needed:
  the partial unique index behind "one preview per owner" already indexed a
  cell-owned preview, the featuring function already scoped its clear to a
  placement-less owner, and the cell's list-sync already left `featured` alone.

  Two tempos are kept, and the reason belongs in the code rather than a release
  note: the list itself — add, remove, reorder, rename — is a draft saved by one
  button in one transaction, because a reorder is a whole-list fact, while
  featuring lands at once, because it is one row's flag and the function clears
  the previous preview in the same transaction. Waiting for a save would leave
  the top of the list showing a state the database does not hold.

  Reorder became a drag. The two arrow buttons went, and with them the comment
  saying a drag needed a library — `framer-motion` was already a dependency, so
  the comment had been justifying the arrows with a cost the project had
  long since paid. The handle is a real button: it starts the drag on
  pointer-down and answers Up and Down from the keyboard, because `Reorder.Item`
  is pointer-only and an order that can only be changed with a mouse is not an
  order everyone can change. It is revealed rather than always drawn, by the
  rule the dependency why-line already stated — hover or focus-within, always
  visible where the pointer is coarse, no transition under reduced motion —
  which is now `ROW_REVEAL_CLASS` in one module both consumers import instead of
  two copies that could disagree.

  Naming happens after the fact. A pasted link is named by its host and an
  uploaded file by its name, so nothing has to be typed to get a resource in;
  `Rename…` in the row menu opens a field on the row itself, Enter commits and
  Escape abandons. There is one door into it, deliberately: the row is already a
  drag target, and a click on the name would be a second meaning for one
  gesture. Blur is not an exit either — the menu that opens the field hands focus
  back to its own trigger as it closes, so a rename that settled on blur would
  settle the instant it opened.

  The upload is a row the whole way: dimmed with an indeterminate bar while it is
  in flight, then an ordinary row, and a refused one offers a retry on the row
  rather than sending the author back to the file chooser. The bar is
  indeterminate because the storage client reports no progress, and a filling bar
  would be a number the upload does not have.

  The featured block carries no drag handle, and says so where a reader will
  look: there is at most one preview and the buttons follow the main list's
  order, so the block has no ordering of its own.

### Patch Changes

- de1124c: The ledger sees every write, and a guard says so

  The session ledger is the app's only undo, and it is only as complete as the
  writes that reach it. Every table write is supposed to go through a
  `src/lib/*Mutations` module, where the inverse is captured before the write and
  the change is recorded after it. Nothing checked that, and two writers were
  outside it.

  `SliceStoryboardField` set and cleared `slides.illustration` with a bare
  `.from('slides').update().eq('id', …)`. Replacing a slide image destroyed the
  previous picture with no record that it had existed and no revert control; and
  because `.update().eq()` without `.select()` returns `error: null` when zero
  rows match, clearing the image on a slide that had been merged away reported
  success and cleared nothing.

  `agent/tools/registry.ts` wrote `audit_findings` the same way, from inside the
  tool dispatcher, which is where the omission was hardest to see: the writes
  were made by a machine, in a batch, on rows a person had often already read and
  triaged. An audit run could rewrite a triaged finding's severity and summary
  and leave nothing in the change list saying it had. Worse, undo takes the
  newest entry that captured an inverse — so with the findings writes absent from
  that list, a press after an audit run reached past them and took back the
  person's own last edit instead, silently.

  `src/lib/writeBoundaryContract.test.ts` is the rule as a mechanism. **It walks
  `src/`, not a list of named roots**, because a list of roots can only ever
  cover the directories that existed the day it was written, and one of the two
  writers above sat three levels down inside `lib/`. Everything outside the
  `*Mutations` family is named one by one with the reason it is outside, and each
  name is asserted to exist, so a rename fails loudly instead of quietly widening
  the exemption to nothing. Two exemptions: the ledger's own inverse-applier,
  which cannot record a change because recording one is what it undoes, and the
  agent transcript, which is not blueprint data, has no inverse to capture, and
  is best-effort by design. Reads and storage calls are asserted not to trip it,
  because both look like violations and are not — `client.storage.from(BUCKET)`
  takes a bucket identifier rather than a quoted table name.

  Both writers move behind the boundary. `setSlideIllustration` reads the
  previous pointer and carries it as the inverse, so replacing an image is now
  reversible, and writes with `.select()` so a zero-row write raises instead of
  reporting success. Clearing still leaves the file in the bucket on purpose:
  after a merge two slides can share a derived path, and deleting the object
  would blank a slide nobody asked to change. `findingMutations` takes the dedupe
  branch and both its writes together, because the branch _is_ the write path —
  "an open twin already exists" and "a person dismissed this" are the two answers
  that decide whether anything is written at all. Its updates capture an inverse;
  its insert deliberately does not, and that is a fact about the grants rather
  than an omission, since delete on that table is revoked and never granted back.
  The only ways to quieten a finding are resolved and dismissed, and neither is
  an inverse — an undo that wrote dismissed would suppress that check on every
  future run, invisibly.

  The storyboard field now shows the mutation's own sentence when the row write
  fails, and keeps the storage wording for a storage failure. Two different
  failures reached one catch, and the generic apology was throwing away the only
  message that said what to do next.

## 1.14.0

### Minor Changes

- 89089f8: A service carries its own examples through the authoring pipeline

  `public.services.entity_examples` — one free-text example per core kind, shown
  under that kind's generic definition so a reader is grounded in this deployment
  rather than the textbook — has existed since `21000123000000`, which also
  granted it to a signed-in author. The wire format never learned it. So the
  column was writable from the editor and invisible to the pipeline that writes
  the same rows: `references/ir-schema.json` did not model it, and
  `scripts/generate_seed_sql.py` emitted `insert into public.services (id, name,
summary)`. An example authored in a blueprint source was dropped on the way to
  the seed, and a re-map wrote nothing where a deployment had something.

  The IR now models an optional `entity_examples` map on the service — a kind key
  to a locale map, absent is legal — and the generator carries it into the service
  insert and the conflict clause. The key set is deliberately not an enum: the
  kinds belong to the app, which states them once where the definitions live, and
  the column carries no CHECK for the same reason.

  **What the conflict clause does with silence, and why.** A service block with no
  examples generates `'{}'`, and so does one that authored none — by the time the
  seed exists the two are indistinguishable. Overwriting on `'{}'` would erase
  what a deployment authored from the editor, which is the same silent loss as
  never emitting the column at all. So an empty map reads as _the source said
  nothing_ and leaves the target alone. A map that IS present is the whole truth
  for the service: a kind it omits is cleared, so the generator can still remove
  an example — by authoring the map without that kind, never by emptying the map.
  The reason sits beside the clause, where a reader wondering about it will be.

  Proven by a round trip rather than by reading the generated SQL, because the
  column is written from two places: `scripts/tests/entity-examples-round-trip.test.sh`
  replays the schema, loads a generated seed and reads the row back — an authored
  example arrives, a re-map leaves it alone, a source that says nothing keeps what
  the deployment has, and a source that speaks clears the kind it omits. It fails
  on the previous generator, naming the example that never arrived, and fails
  again if the guard is replaced by a plain overwrite. `scripts/tests/run_tests.sh`
  holds the half a machine with no database can hold: the column is in the insert,
  the text is the seed's own locale's, and the guard is still spelled.

  IR schema version `2026.09.11`. The step is a stamp — the map is optional and
  nothing authored moves — and no migration stamps the version, because the
  database has had the column all along, so a target at an earlier version stays
  compatible. The stamp moves at all because a version names a shape, and
  `2026.09.10` refuses a key this one accepts.

  This is the upstream half. A deployment built on this template regenerates its
  committed seed only after bumping its pin to a release carrying this change;
  changing either side alone reddens the drift gate — immediately in one
  direction, and at the next pin bump in the other.

- ad2629f: The cover's services tab holds one page per service, and the active service
  picks which one renders.

  A tab used to be one thing: a `value`, a `label`, and a fixed `sections` list
  shown to everyone. That is right for the tabs that describe the method — the
  blueprint model, slices, the plugin — and wrong for the one tab that describes
  the service itself, because a deployment can hold more than one service and
  each of them has its own story to tell on the way in. Pointing every service at
  one page makes the cover say something untrue about all but the first of them.

  So `CoverTab` splits. `CoverContentTab` is the old shape, unchanged, and it is
  what every tab in this repository's own content module still is.
  `CoverServicesTab` carries a `CoverServicesIndex` instead of `sections`: a
  `pluralLabel` and one `CoverServicePage` per service, each keyed by the route
  slug `lib/serviceSlug` derives. `coverTabSections` flattens either kind, so the
  walks that want every section a tab can ever render — the figure inventory, the
  content contract's own assertions — ask one function and stop caring which kind
  they were handed.

  The page follows the active service rather than a second piece of tab state.
  `CoverPageView` takes the roster and the active slug as props and matches the
  page case-insensitively, the way routing resolves a slug, falling back to the
  first page. `CoverPage` reads both from `ActiveServiceContext`, so picking a
  service on the cover is the same act as picking one anywhere else: it writes
  the URL slug, re-scopes the board, and the cover page under the selector
  changes with it. There is no cover-local notion of "which service am I
  reading about".

  WITH ONE SERVICE, NOTHING MOVES. The selector row is rendered only when a
  second service exists, the strip label stays the tab's singular `label` rather
  than the plural, and the sole page renders below — including when no roster is
  handed in at all, which is the shape every existing test and the provider-free
  surface already use. A single-service deployment's cover is byte-for-byte what
  it was.

  The selector is the Skills tab's segmented control: a tab per service on a
  recessed track, the active one lifted onto the background, the row labelled
  "Services" so a test can tell it apart from the cover's own strip. It never
  mounts on the single-service page.

  Twelve cases arrive, driven through `CoverPageView` with the roster as props.
  They assert the singular tab is untouched, that a second service pluralizes the
  label and heads the panel with the selector, that clicking a service reports
  its slug, and that the page swaps when the active service does — which is the
  one thing a fixed `sections` list could never be asked.

  `src/components/cover/CoverPage.tsx` and `coverModel.ts` are not enrolled in
  the deployment's reconciled-files list; with this change they and the two new
  files match the deployment's copies except where the deployment's prose cited
  its own issue numbers and named its own service in a fixture, which is written
  neutrally here and has to be rewritten there before any of the four can enrol.

### Patch Changes

- 3eb97d1: `deletion_impact` counts the delete that follows, for all four kinds

  The confirm dialog's whole job is the number, and two of the four kinds
  answered with a number that was not true of the delete they preceded — in
  opposite directions. `deletion_impact('lane', id)` counted the cells of ONE
  `lanes` row, while `remove_lane(scenario_id, lane_name)` deletes every
  same-named lane across every path of the scenario; measured against a live
  blueprint, 11 reported against 93 deleted. `deletion_impact('step', id)`
  counted that step across every path, while `remove_step(path_id, step_id)`
  deletes only the cells on the path it is given; 12 reported against 5 deleted.

  The cause is identity, not arithmetic. A lane delete is addressed by
  (scenario, name) and a step delete by (path, step); the function took a single
  uuid and so could not name either delete. No sum over the wrong row set gives
  the right answer.

  `scope_id` supplies the missing half. `scenario` and `path` are addressed by
  one id, ignore it, and keep the predicates they had, so nothing that calls
  them today changes — the new argument has a default and the two working kinds
  never read it. `lane` needs nothing from the caller: it derives the
  (scenario, name) pair from the lane it is handed. `step` REFUSES without a
  scope rather than guess a path, because an overcount in a delete dialog reads
  as "this is bigger than it is" and an error that says why is better than a
  number nobody can justify.

  `remove_step` is rewritten alongside, because it reads `deletion_impact`
  itself: left calling the two-argument form it would hit the refusal and stop
  deleting steps. Passing the path it was already given also narrows the
  `affected_slices` it archives from "slices touched on any path" to the ones
  this delete actually costs.

  `DeletableKind` was narrowed to `scenario | path | slice` to make the wrong
  numbers unrepresentable, with a note saying the SQL fix could not be verified
  without a migration apply. It is the full set again, the agent's
  `measure_deletion_impact` offers all five kinds with a `scope_id` argument,
  and `DeleteStructureDialog`'s switch grows a `default` arm — it performs three
  of the kinds it can now be handed, and a fall-through there would have closed
  the dialog on a delete that never happened.

- 4b268bc: `addLane` takes `atPosition`, and the cover drops one docs address

  The lane insert's TypeScript argument was `atRow` while the SQL parameter it
  maps to is `at_position`, and rows are not what it positions — a lane is one
  row per version, and the number is its place in the lane order. Three call
  sites, no behaviour.

  `CoverPage`'s docblock also cited a plan section for a decision the same
  sentence already explains, which is an address in one repository's docs tree
  and resolves to nothing in another's.

## 1.13.3

### Patch Changes

- 5733425: Four defects the deployment already fixed

  - `normalizeBlueprint` collapsed cells on `(lane, step)`. Since the tech-cell
    split gives every touchpoint its own row at position 0..n, that kept one
    cell per slot and dropped every sibling — board-wide, over `data.cells`
    entire, whenever any two lane names merged. The key is now the slot.
  - `setSharedCanvasMode` took `'design'` from anyone. The provider guarded it,
    but the agent tool `set_canvas_mode` reaches the store setter directly and
    is not a write tool, so a view-only session could park `'design'` and every
    surface snapped into Edit when write access returned. The permission now
    lives with the state.
  - `AgentDock` registered its window-global listeners on both mount points.
    The gate is now hook-free and only the visible instance mounts the window.
  - `Skeleton` carried `animate-pulse` on top of the `skeleton-breath` rule in
    `animations.css` — two animations on one bar, with the winner decided by
    cascade layer order. It also cost reduced-motion readers the still bar the
    stylesheet gives them.

  `badge` also loses its two dead variants (`ghost`, `link`) and every
  `[a]:hover:` rule: nothing rendered a badge as a link, and a surface that
  repaints under the pointer promises a click that never comes.

- dc0c0cf: The journey reads resolve the active service, not the first one

  `ActiveServiceContext` writes the URL slug into the module store and
  `serviceScope` already honours it, but `useServicePhases` and `useSlices`
  still resolved `findFirstServiceId` — so switching service moved the URL, the
  agent's scope and the caches, and left the board on whichever service is
  first by `created_at`. Both fetchers now resolve `findActiveServiceId`, which
  falls back to exactly that first-by-`created_at` row when no slug is set, so
  a single-service installation resolves byte-for-byte as before.

- 73e0029: Arrivals that converge on one cell draw one trunk and one head whatever column
  each of them left from.

  When several dependencies land on the same edge of the same cell, their last
  segments merge into a single path-coloured trunk carrying one arrowhead: the
  reader is told "these all cause that", which is one fact rather than N. The
  merge chose where to gather by asking one of its members — whichever one the
  group happened to list first — where the column gap before the shared target
  was. That question only has an answer inside that member's own lane, and when
  the lane holds no card in the column before the target the answer fell back to
  a fixed inset from the target's edge that lands inside the arrowhead. The
  clearance test then declined the merge for the whole group, so every member
  kept its own head: three arrowheads stacked on one edge where the promise was
  one trunk and one head.

  Measured on a board that showed it. The target's left edge sits at 992 and the
  head's base at 976, the lane of the first-listed member holds no card in the
  column before the target, so the gather was placed at 980 — four pixels past
  the point the head has to start at — and the merge was declined before the
  per-member test ever ran. The two members whose lane does hold a card there
  would each have answered 966, which merges.

  Two faults on one line. The gather is a property of the shared target's column
  and not of any one member's, so asking a member at all makes the picture depend
  on which member the group happens to list first. And the per-lane fallback is
  not a gap at all; it cannot produce a junction the clearance test will accept.

  So the gather is read off the target column instead: the middle of the clear
  strip between the widest card edge in the column before the target — over every
  lane, because a vertical that crosses lanes needs a strip no card occupies —
  and the target's own edge. Where that column holds no cards the board's own
  column-gap element bounds it, and where neither is measurable the fixed offset
  in front of the entry point remains. That is one answer for the whole group,
  and it is the same answer in either listing order.

  The two clearance guards are untouched, and so are the cases deliberately left
  out: merging still applies only where it reduces overlap, a trunk drawn through
  a card is still worse than N heads, and backward loops and same-column
  connectors still keep their own heads.

  The situation catalog gains the case this was — two arrivals at one cell from
  different step columns, with the far one's lane empty in the column before the
  target. It fails on the previous geometry, two heads and no trunk, and the test
  beside it asserts the trunk is identical when the pair is listed the other way
  round. Every existing catalog frame is unchanged; the three added frames are
  the new case's.

  The four files this touches are enrolled in the deployment's reconciled-files
  list, so that gate stays red there until the next pin bump.

- 6c5304e: The changelog and the changesets leave the content scan, and prose that spells
  a theme key now fails a rule instead of quietly shipping one.

  Tailwind v4 settles which theme keys reach the built stylesheet by scanning the
  repository: a key whose name the scan finds anywhere is emitted at the root,
  and a key it never finds is dropped. In markdown, any name of that shape is
  found — bare or backticked, prose and asides alike. The entry sheet already
  spends three exclusions on that hazard, for the documentation tree, the scripts
  and the test files. The changelog was not among them and neither were the
  changesets waiting to be folded into it, both sitting at the repository root
  squarely inside the scan.

  Measured, not argued. A probe changeset naming a registered-but-unemitted
  radius key, and a probe line in the changelog naming another, each put exactly
  its own key into the built stylesheet and moved nothing else. Removing them
  again is what the two new exclusions do.

  WHAT LEAVES THE ARTIFACT is one theme key and eight utility classes, 0.51 kB
  of 294.73 kB, and nothing renders any of them. The key is the Tailwind-
  namespaced alias for the inverted-ink colour, and it stood in the shipped
  stylesheet for one reason: a release note describing its removal from the
  compatibility layer spelled it in backticks. Its three other occurrences are
  its own registration, a paragraph of stylesheet prose, and a test — none of
  them a read, because a stylesheet offers a name only inside a `var()` and the
  test files are already outside the scan. The semantic token underneath it is
  untouched and still emitted, and the registration is an inline one, so a
  utility written against that name tomorrow compiles to the value and never
  wanted the custom property. The eight classes are each named in exactly one
  release note and in no file a browser reaches; every occurrence of all nine was
  enumerated before the departure was called correct, rather than inferred from
  the size drop.

  WHY IT COMPOUNDS, and the half worth fixing more than the exclusion. Cutting a
  release folds each changeset into the changelog permanently, so a sentence
  written today holds a key in the build for the life of the repository, long
  after whatever it was written about is gone — and nothing fails, which is why
  this stood for two releases. It reached back into the release process, too: a
  note explaining why a token arrived or left had to avoid spelling the token,
  which is not something anyone should have to remember at the moment they are
  writing down what they changed.

  A RULE, NOT A LONGER LIST. The exclusions say which files are prose; nothing
  said the set was complete, and the kind of prose nobody thought of failed
  nothing at all. The new rule states the property instead: no theme key may be
  spelled in any markdown the scan still reaches. It takes the key names and the
  exclusion patterns from the token model and the entry sheet rather than
  restating either, asks git for the file list so the answer moves with
  `.gitignore` instead of with a skip list, and needs no exemptions — the subject
  is a kind of file, several dozen of them today, not an enumeration. It fails on
  the sentence and names its author, so it survives a document being moved or
  renamed, and it went red on all three of the changelog's spellings when the
  exclusions were taken back out.

  Its limit is stated where it lives: class names get no equivalent and cannot
  have one, because any English word can be a utility and there is no finite set
  to intersect against. For those the exclusions remain the whole of the defence.
  The companion rule guarding the other direction — that the token model samples
  nothing the scan is told to skip — pins the exclusion patterns, so it went red
  on the two additions and was updated with them, which is the review it was
  built to force.

  `src/styles/tailwind.config.css` is enrolled in the deployment's
  reconciled-files list, so that gate stays red there until the next pin bump.

- 4eca929: A role's pale tint is measured from the surface it is drawn on instead of from
  the page, and the component that paints a surface is what says which one it is.

  The tint is six percent of the signed canvas-to-ink span, and an elevation rung
  is a step of the same size. Derived from the page it therefore landed on top of
  anything raised off the page: all seven roles measured 1.02:1 against a card in
  dark, where the card itself sits 1.09:1 off the canvas. The role edge was
  carrying the entire shape and the tint was contributing nothing. Light read 1.18
  only because its span runs the other way and the two distances happened to add —
  the same arithmetic, hidden behind a sign.

  `--ground` is the lightness a tint is measured from. At the root it is the page
  and that is the whole of the default. A component that establishes a surface
  carries `data-ground`, `semantic.css` re-derives at that scope for the same
  reason it already re-derives under a themed subtree — custom properties
  substitute before they inherit — and the seven tints and the seven edges that
  step off them follow. One new name, one selector, three ground rules, and no
  second name for any job.

  The grounds are named for their surfaces rather than for their elevation
  ratios, because that is what a component knows about itself: a card knows it is
  a card and does not know it is one and a half steps up. `src/lib/ground.ts`
  holds the vocabulary the components spread, and the rule holds it against the
  scopes the stylesheet declares, so neither tier can drift from the other.

  THE CLAMP IS NOT A SAFETY RAIL, and it was the thing that would have made light
  worse. Light's canvas sits at 0.995 with a step of 0.024, so every rung of its
  ladder runs past 1 and the browser holds all three at white. A ground computed
  without that ceiling measures a card that is not on the screen: the light tint
  lands at 1.07:1 against the card it is drawn on, below the floor and worse than
  the 1.19 the defect it replaces was already reaching. Clamped, it reads 1.17.
  Dark is unaffected either way, which is exactly why this could have shipped
  unnoticed. Reading the same ceiling the browser reads is what keeps the
  measurement and the pixel the same thing.

  WHAT MOVES IN THE COMPILED CSS, built before and after rather than reasoned
  about. The semantic block gains the ground scope in its selector list and one
  declaration; the seven tints swap which name they read; three ground rules
  arrive. On the page the ground resolves to the page, so every value the app
  draws outside a declared surface is unchanged. Inside one, the tint moves and
  its edge moves with it. The two washes of a solid fill leave the artifact along
  with their `@supports` fallbacks, the ink that sat on one of them goes with
  them, and one ink utility arrives. Sixty-seven bytes.

  MEASURED THROUGH THE TOKEN MODEL, on every ground the stylesheet offers, for
  all seven roles, in both themes. A tint now clears its ground at 1.10 to 1.18
  everywhere, against 1.02 on a dark card before. The rule is two invariants
  rather than a table: a tint clears its ground, and the choice of ground may move
  that distance a little and may not decide it. Both go red on a single role
  regressed to the page, and a third rule reproduces the original defect so a
  guard that could never fail is not mistaken for a clean tree.

  The model gained the scope to ask. It answered at the root and nowhere else,
  which was the right shape while every colour here was a property of the page;
  `resolveValue`, `resolveColorValue`, `resolveColor` and `winningDeclaration`
  now take the subtree, spelled as the selectors that match it, so a rule reads
  the cascade's own answer for an element instead of re-deriving a subtree's
  arithmetic in TypeScript beside the CSS.

  THE EDGE BAND WIDENS, and the file's own claim about it was corrected rather
  than left standing. A fixed lightness travel does not buy a fixed ratio at every
  point on the axis, so the same role edge reads 1.24 on the dark canvas and 1.32
  on a dark popover. The prose promised 1.22 to 1.28; across every ground and both
  modes the spread is 1.22 to 1.32. Four hundredths, at a distance nobody can see,
  and still far below the 3:1 that paragraph is defending against.

  The comparison surface's two verdict markers move onto the tint and the ink cut
  for it. They wore the solid fill as ink on a ten-percent wash of itself, which
  is the weakest pairing this vocabulary allows — the fill is tuned for ink to sit
  on it, and an alpha has no ground until it is painted.

  WHAT THIS DOES NOT DO. A surface that never says what it is still hands its
  children the page, silently, which is the failure mode the defect had. That is
  inherent to a value only the component can know, and it is why the ground is
  declared once by each surface primitive rather than at each tinted element: an
  alert does not know what it was dropped into, and now it does not have to.

  `src/styles/semantic.css` is enrolled in the deployment's reconciled-files list
  and was byte-identical to its copy, so that gate stays red until the next pin
  bump.

- 4c9f5d3: The line of interaction is drawn once per board rather than once per
  customer-side lane, and the three readers that decide height and tone from it
  are handed the board so they answer the question the renderer answers.

  The rule was `getLaneRole(lane) === CUSTOMER_ACTIONS_ROLE` and nothing else,
  which is right for exactly as long as every board has one customer-side lane.
  Give a board a second actor row on the customer's own side and it draws a line
  of interaction after each of them. No service blueprint means two: the line is
  the boundary between the people the service is for and the machinery that
  serves them, and a boundary drawn twice is not a boundary. So the line follows
  the LAST customer-side lane. Adding a customer-side lane extends the band; it
  does not divide the board again, and no row has to move to make that true.

  WITHOUT THE BOARD, THE OLD ANSWER. `lanes` is optional, and a lane asked alone
  has no band to be last in, so it is its own band and answers as it always did.
  That is the same shape `shouldShowVisibilityLineAfter` already has, for the
  same reason, and it is what keeps a caller that genuinely has only a lane
  correct. It is also what made the three call sites below silent: each kept the
  old rule while the renderer had already moved to the new one, and nothing
  failed, because nothing disagreed until a second customer-side lane existed.

  TWO OF THE THREE ARE READ AS HEIGHT. `countBlueprintDividerRows` is multiplied
  by the divider row constant and `countBlueprintWrapCorridorMargins` by the
  corridor margin, and both are added to the artboard, so a count that disagrees
  with what the renderer draws is a grid taller than its own contents by exactly
  the rows it over-counted — a divider row and a corridor of space reserved for a
  line and a gap nobody paints. The corridor counter was point-free —
  `lanes.filter(laneHasWrapCorridorBelow)` — so adding a parameter would have
  passed the array index as the board, silently, which is why it is spelled out
  now rather than left to read tidily.

  THE THIRD IS RENDERED, NOT COUNTED. `laneHasWrapCorridorBelow` reaches a lane
  row's real bottom margin through the compare row spec, so a lane in the middle
  of the band opened a routing corridor beneath a row with no line beneath it to
  route to. Its own doc said why the corridor exists — the standard blueprint
  already leaves a band between the row and the line of interaction — which under
  the band rule is true of the last customer-side lane and no other.

  AND A LANE IN THE BAND WAS LETTERED AS IF BELOW THE LINE.
  `getBlueprintLabelSection` searched for the FIRST lane the line follows, so a
  row still inside the band got the tone of the zone under the line while being
  drawn above it — painted, to a reader, on the far side of a boundary they can
  plainly see it is above. A section is a position relative to the lines, so it
  has to find the lines where they are actually drawn.

  WHAT A BOARD DRAWS. With one customer-side lane, nothing moves: same line in
  the same place, same corridor under the same row, same tone on every row, same
  artboard height. With two, one line after the second of them, one corridor
  under that same row, both customer-side rows lettered as sitting above the
  line, and the artboard exactly one lane row taller — not a lane row plus a
  divider row plus a corridor.

  TEN CASES ARRIVE, and this repository had none on any of these rules. They
  state a position relative to the line, or an equality between what is counted
  and what the board draws — never a count of the boards whose customer side is
  deep, which would pass on the day it was written and say nothing about the
  rule. The corridor assertion is made against the rail's own interaction row
  rather than a lane index, because those two are the same fact and the defect
  was that they could disagree. Each of the six hunks was reverted in turn and at
  least one case failed for each.

  `src/lib/blueprintLayout.ts` and `src/lib/sideBySideCompareLayout.ts` are
  enrolled in the deployment's reconciled-files list and were byte-identical to
  its copies; they are byte-identical again, so that gate can go green on the
  next pin bump. `src/lib/blueprintTheme.ts` is not enrolled and has drifted on
  its content-shaped tables, so the one call it makes was ported by hand.

- 5757b3d: The developer portal is a development tool in the build as well as in the
  description: outside a dev build the tier simulation resolves to the real
  session, whatever the browser has in storage.

  It was live everywhere. The provider called `applyDevSimulation` on every
  render in every build, so the two flags the whole editing surface gates on —
  `canWrite`, and the `canAgentWrite` derived from it — were moved by a value
  read out of `localStorage`. A deployed site therefore offered any visitor the
  entire authoring UI, and every control in it then failed against Postgres.

  The server was never fooled and is not what changed. Row-level security and the
  RPC grants never saw the simulated tier, which is why the consequence stayed
  survivable; but a stranger being shown handles, design mode, panel editors and
  the agent's write tools before the database refuses each one is not a UI a
  template should ship, and "the writes fail anyway" is an argument about the
  blast radius rather than about the door being open.

  HIDING THE TWO CONTROLS WOULD HAVE BEEN WORSE THAN LEAVING THEM. The obvious
  fix is a build check in front of the badge and the settings section. That hides
  the door and leaves the lock: a browser that carries the storage key from a dev
  session, or one whose devtools write it, still gets the lifted flags — now with
  the badge that says so gone too. The tell is the part the render gates were
  holding up.

  So the gate is at the seam instead. Every consumer reads the simulation through
  one hook, and that hook is where the build answer is applied; the provider is
  untouched, and the badge needs nothing of its own because a simulation that is
  off renders nothing already. The settings section, which is the controls rather
  than a report on them, is the one place that also returns null — it has no off
  state to collapse to. `applyDevSimulation` stays a pure function of its two
  arguments, which is what keeps it testable in both directions in a build that
  will never call it with a live simulation.

  The flag is read at call time rather than folded into a module constant. A
  build replaces the expression with its literal either way, and reading it when
  it is asked for is what lets a test state the shipped answer to a module that
  has already been imported.

  MEASURED WITH THE KEY PRESENT, because with it absent the assertion is empty.
  Three cases now pin the production behaviour against a stored simulation of
  admin: the flags come back at the real session's values, neither the section
  nor the badge renders, and the stored value is left where it was and honoured
  again the moment the build answer is development. The suite runs with the
  development answer by default, so this block is the only place the other one is
  observable — the file says that where a reader meets it.

  WHAT THIS DOES NOT DO, measured rather than hoped for. The portal's code is
  still in the production bundle — its copy, its storage key, the badge's word
  for itself — because the build answer is read through a call the minifier
  cannot fold, which is the same property the test depends on. Nothing renders it
  and nothing consults it; what changed is the reach, not the byte count. Trading
  that for a constant the minifier could fold would buy a few hundred bytes and
  give up the only assertion that can observe the shipped behaviour, which is the
  wrong side of that trade for a defect that was found by nobody running it.

- 0a871ec: The client asks the database what tier a session is in, instead of inferring
  it from a claim the session does not carry.

  The tier seam is a database function every write RPC asserts in its own body
  and every restrictive write policy ANDs with. It ships permissive — a
  single-tier deployment where every signed-in session edits — and an optional
  recipe replaces it with a read of the session's role claim, splitting
  `authenticated` into editors and viewers. The client used to decide which of
  those two databases it was talking to by looking at the claim: absent meant
  the recipe was never adopted, so every signed-in session edited. A deployment
  built on this template made the opposite call from the same file, granting the
  tier only on an explicit `role === 'service'`. Both readings are defensible
  where they sit and neither survives being the same line of code.

  The function is granted EXECUTE to `anon` and `authenticated`, so it is
  callable over the Data API. Calling it is one round trip on sign-in and is
  right in both postures, including the one where an adopter deletes the recipe
  outright. `IdentityPort.currentTier()` already declared the home for it and
  was implemented only by the two adapters nothing calls; it now has its
  Supabase implementation and its first real caller.

  THE DEFECT THIS FIXES, not merely tidies. `supabase db reset` applies every
  file in the migrations directory, the optional recipe included, so the setup
  as written produces the STRICT database — an adopter has to delete a file to
  get the permissive one the client assumed. The combination that produced was
  the strict database under the permissive client: a signed-in account with no
  role claim was offered the entire editing UI and refused by Postgres on every
  save, from 23 in-body RPC guards and 39 restrictive policies. That combination
  is now unreachable, because there is only one rule and the database states it.

  Before and after, for each session, on both postures. An anonymous visitor is
  unchanged in every case: no session, no write gate, and the tier is settled
  without a round trip — which matters, because the permissive default answers
  `true` to anyone who calls it, `anon` included. A session holding the
  service-role key is unchanged: its JWT carries no role of the kind the seam
  reads, so the key's own arm stays and stays load-bearing. On the permissive
  database a role-less signed-in session still edits, as before. On the strict
  database a role-less signed-in session was an editor in the UI and a viewer in
  the data, and is now a viewer in both. And a session carrying the claim while
  the database says no — a token minted before a revocation, or a claim set by
  hand on a deployment whose seam reads something else — used to write buttons
  it could not use, and now does not, because the claim is no longer consulted
  in either direction.

  THE FIRST ACCOUNT A PROJECT EVER HAS IS A SERVICE ACCOUNT. The recipe's
  allowlist ships empty and nothing in the package inserts a row — no seed, no
  script, no documented step — so a fresh deployment of the tier had no editor
  at all, and the way in was a hand-written update whose text lives in a
  migration header. The trigger that stamps allowlisted sign-ups gains a second
  predicate for it.

  The other predicate that closes the same gap is "the allowlist is empty", and
  it is the dangerous one: an adopter who enables sign-ups and never fills the
  allowlist — the exact adopter being fixed — would stamp every account created
  in that window, unbounded and growing with the deployment. "There are no
  accounts yet" stamps exactly one, ever, and it is the one belonging to whoever
  stood the project up. Rehearsed on a throwaway database: the founding account
  is stamped, the second account created while the allowlist is still empty is
  not, an allowlisted account is stamped case-insensitively, and metadata a
  provider already wrote survives.

  IT STAYS IN THE RECIPE, which is the opposite of where the argument pointed
  before. The stamp is read by exactly one thing — the recipe's own tier
  function — so deleting the recipe leaves a claim nothing consults, and moving
  the trigger to the core would hang auth machinery on adopters who chose the
  single-tier posture, for no effect. What made the argument look the other way
  was a client that decided the tier from the claim: that client goes silently
  read-only against a permissive database, so the stamp had to exist everywhere
  to keep it honest. Asking removes the need, so the trigger goes where its only
  reader is.

  TWO STALE SENTENCES, in the environment sample and in the client module, both
  saying the deployed app is read-only because "there is no sign-in". There is:
  a password form and a magic-link button, mounted whenever a database is
  configured, on the front of every deployed site. What is true is narrower —
  a browser visitor is `anon`, and the magic link is sent with account creation
  off, so it cannot mint the account it would need.

  COVERAGE, which was the acceptance criterion and had none. The permissive arm
  was rewritten to the strict rule and the suite re-run before any of this: 158
  files and 1603 tests before, 158 and 1603 after, zero movement — the rule this
  issue is about was asserted in neither direction. Eleven cases arrive: five
  pinning the resolution itself, six pinning that the provider is wired to it,
  across an anonymous visitor, a stamped account, a role-less account on each
  posture, a claim the database contradicts, a failed ask, and the service-role
  key. Both prior rules were re-applied under them: this repository's fails two,
  the deployment's fails two others.

  `src/lib/supabase.ts` is enrolled in the deployment's reconciled-files list and
  was byte-identical to its copy, so that gate stays red until the next pin bump.

## 1.13.2

### Patch Changes

- 3a1f1d1: A write that is refused is translated, never forwarded raw.

  `AuthoringError` and `toAuthoringError` have been here since the authoring path
  was built, and two of the modules that write around them: thirteen throws
  raised `new Error(error.message)`, which sends the database's own text to the
  panel — `new row violates row-level security policy for table "phases"` is not
  a sentence to show a reader — and discards `.raw`, the only place the original
  survives. `sliceMutations.ts` had twelve of them and `cellSpecMutations.ts` the
  thirteenth.

  `src/lib/writeTranslationContract.test.ts` is what keeps it true. The rule is
  scoped to the modules that WRITE and deliberately no wider: a hook raising
  `error.message` from a `.select()` is a different problem with a different
  answer, and a rule over every file would be a list of exemptions instead. The
  writers are matched by shape — `lib/*Mutations.ts`, anchored at `lib/` so a
  `components/FooMutations.ts` cannot route around the test — plus
  `authoringRpc.ts` named, and both halves are asserted to still match something
  so a rename fails loudly rather than emptying the set.

  The regex is exercised on strings it never read off disk, because a source
  scan passes just as happily when it matches nothing: the two raw shapes fail,
  and a translated throw and a hand-written sentence pass.

  Measured rather than estimated. Under this rule the repository had thirteen
  offenders in two files; the same regex over all of `src/` returns seventy-two,
  and the other fifty-nine are reads, which is the reason for the scope.

  `src/lib/cellSpecMutations.ts` is byte-identical to the deployment's copy as a
  result, so it can be held to this one.

  NOT changed, and it is a real choice: `optimisticConcurrency.ts` still raises
  around the translator, and its comment says why — the PostgREST error is left
  to the caller, which knows whether it wants `toAuthoringError`. The deployment
  translates there instead. That is a difference of position rather than drift,
  and it is decided on its own.

- 9bddd24: Two sentences in shared source stop naming an address that resolves only in a
  deployment, and the surface is measured rather than asserted.

  `src/styles/semantic.css` said "Sidebar selection language (nav plan D8)". D8
  is a row of a plan document in the deployment this vocabulary was ported from;
  nothing here resolves it. The sentence now states the decision — hover and
  selected are distinguished, and this is how — which is what a reader of the
  token needs and what the paragraph beneath it already explains.

  `src/lib/sliceValidation.ts` had the opposite defect: the deployment's copy
  carries an explanation this one lacked, that `slices.origin` became
  `slices.authorship` and why the validator therefore reads what it reads. Both
  halves are true here. Only the migration filename was unportable, so the
  explanation arrives stated without one, pointing at
  `scripts/retired-vocabulary.mjs` — the durable place a reader goes for the
  history, which is the pattern the fold-migration citation established.

  The wording was checked against the deployment's copy rather than assumed: with
  this comment in place the two files differ in nothing else, so the deployment
  can adopt it verbatim and hold the file.

  THE SWEEP, because four instances of one shape is a pattern and the count is
  what says whether it needs a guard. Over the adoption surface — 199 files this
  repository ships that the deployment also has and has not yet held to this copy
  — there are 244 addresses: 80 bare issue numbers, and 25 that resolve to
  nothing here. Twenty-two of the 25 are test fixtures (`docs/a.md`,
  `docs/gone.md`, planted SVG paths) or deliberate cross-repo statements about
  the deployment's own database, correctly framed as such. Exactly one was the
  defect, and it is the one fixed above.

  A GUARD IS NOT WORTH IT, on that measurement. The standing backlog is one file:
  of the 199, exactly one is already byte-identical and unheld, and it is
  `semantic.css`. A rule refusing repo-local addresses in shared source would
  return 80 issue-number findings on its first run, nearly all of them in
  `scripts/` — this repository's own checks, citing this repository's own issues,
  correctly. Eighty exemptions on a first run is a list of sites, not a rule.

  The asymmetry is real and it is closed elsewhere: this repository cannot know
  which of its files a deployment will hold, and the deployment's reconciled list
  already records each blocked file with its reason. That is where the discovery
  happens, and filing it back is how it gets fixed — which is what happened here.

- 7294437: `readWriteOutcome` translates the error it is handed, rather than leaving it to
  the caller.

  The previous comment argued the other way: the PostgREST error was left to the
  caller, "which knows whether it wants `toAuthoringError`". In practice a caller
  that knows is a caller that remembers, and the guarantee a reader wants is the
  simpler one — a refused write is phrased for a person no matter which module
  raised it. The function already sits on the write path of every module that
  checks a row count, so translating here is what makes the rule hold without
  each caller re-deciding it.

  The parameter widens from `{ message: string }` to `PostgrestError | Error`,
  which is what `toAuthoringError` takes and what callers were already passing.

  The sentence beneath now says what became true rather than what is left over: a
  PostgREST error never reaches the row-count check, because this function has
  already translated it.

  The deployment had reached this position first, so the file is byte-identical
  to its copy and can be held to it. The divergence was a difference of position
  rather than drift, and it was settled by its owner rather than by whichever
  side was edited last.

## 1.13.1

### Patch Changes

- 1c60a10: A dependency row's why-line is revealed rather than always drawn.

  `linkNote` says why an edge exists. Read one row at a time it earns its place;
  rendered statically down a list of eight it doubled the height of every row
  that had one, and the list's shape started depending on how talkative its
  author had been.

  It now fades in on hover or focus anywhere in the row, and stays visible where
  the pointer is coarse — the rule `NavRowAction` already states, because an
  affordance that only exists under a mouse is not an affordance for everyone.
  Opacity only: a list whose rows grow under the pointer moves the row being
  pointed at. The sentence stays in the DOM at rest, so a screen reader reads it
  whether or not anything is hovering.

  `cellDependencyWhyLine.test.tsx` pins the three readers that have no hover —
  keyboard, touch, screen reader — one test each, because each is a separate
  mechanism and any one can be lost to a tidy-up that keeps the other two.

## 1.13.0

### Minor Changes

- d94dd9d: **Breaking, for slice files.** The slice authoring format's keys are the names
  of the columns they write.

  | was           | is           | column              |
  | ------------- | ------------ | ------------------- |
  | `type`        | `kind`       | `slices.kind`       |
  | `description` | `summary`    | `slices.summary`    |
  | `origin`      | `authorship` | `slices.authorship` |
  | `order`       | `position`   | `slices.position`   |
  | `frames`      | `slides`     | table `slides`      |

  `select --type` is `select --kind` with it.

  An author had to hold two vocabularies to write one file, and `slice_tools.py`
  carried a comment explaining the split rather than fixing it. `frames` was the
  worst of the five: `frame` is a real and different thing — `cells.frame` is one
  image on one cell — so the format used a live word for the neighbouring
  concept, one line above `insert into public.slides`.

  There is no alias. A file using a retired key is refused by name and told which
  word replaced which, rather than failing on a missing required property.

### Patch Changes

- 4e9f639: Generated SQL is held to the columns the schema has.

  `skills/slice/scripts/slice_tools.py` emitted `insert into public.slices (…,
description, …, origin, …)`. `21000116000000` renamed those columns to
  `summary` and `authorship`, so every slice the skill imported was an INSERT
  Postgres rejects — a model running the shipped script against a real database,
  and the failure arriving as the model being wrong.

  No word list could reach it. `description` and `origin` are live columns
  elsewhere in this schema, which is why the rename map deliberately enforces
  neither fragment and `retiredFragmentsIn('slices.description')` is asserted
  empty. Only the schema dump separates them, per table.

  `npm run check:database-names` grows a third assertion for that. A query path
  was not the only string carrying its own relation: `insert into public.<table>
(<columns>)` and `update public.<table> set <column> = …` do too, so both are
  held against `supabase/generated/portable-core.schema.sql`. Twenty-six
  statements in this tree are literal and read; five are assembled from a
  variable and dropped rather than guessed at, the refusal `selectTree` already
  makes. Adjacent string literals are joined first — the relation and its column
  list are in different strings whenever the statement needs two lines, which is
  the shape the defect was hiding in.

  `skills/` joins the check's roots. The two shipped skill scripts are the most
  exposed code here and no database-name guard walked them at all; both
  pre-existing assertions were already clean there, so the root costs nothing.

  `references/data-model.md` documented the same two dead columns in its `slices`
  row, and its vendored copy follows from `sync-canvas-skills.mjs`.

- 638b63a: The two exemptions in the var-resolution rule are named, and the divergences
  from upstream are written down together.

  The rule that every bare `var()` in a stylesheet resolves to a real declaration
  has been here since the design-system port, and it already permitted both
  things it has to permit. Neither said so. `var(--x, fallback)` was excused by a
  comment; a token a component sets on its own element was excused by nothing at
  all — it rode on the token model folding stylesheet and TypeScript declarations
  into one set, and a tidy-up that made the rule stylesheet-only would have
  condemned three live references in `blueprint.css` with nothing to point at.
  Both arms are now named at the rule, each is asserted to still be carrying
  something, and the predicate is exercised on references it did not read off
  disk: a dangling name fails in either kind, the override seam passes only in a
  stylesheet, and a component's own declaration counts as a declaration.

  `docs/adr/0008` records the vocabulary's relationship to the system it was
  ported from: a primitive is named for its hue, a semantic token for its job
  with no ramp number, brand is not a hue, and where upstream wrote a literal we
  derive while taking the judgement behind it. Five divergences are stated with
  the measurement behind each — the stepped scales, the two brand words, the
  focus ring, the radius dial, and the alert border, where the judgement that an
  edge should be quiet is taken and the ramp step it is spelled with is not.

  `semantic.css` said the role ramps were per-theme literals in the theme files.
  They were removed with the rungs; the header now says so.

- 3721967: A row shape pinned in prose is checked against the schema.

  `agents/auditor.md` tells a model exactly which keys to produce for a findings
  row, and `audit_tools.py` validates against that shape. When `21000116000000`
  renamed `check_name` to `check_key` and `note` to `summary`, the document went
  on asking for the old two — a call the validator raises `KeyError` on, arriving
  as the model being wrong rather than the prose being stale.

  `npm run check:pinned-shapes` binds a fenced block to a relation and holds its
  keys against `supabase/generated/portable-core.schema.sql`, both directions: a
  key that is not a column, and a required column the shape never names.

  The binding is per fence and deliberately short. Three of the four fenced
  blocks in `agents/`, `skills/` and `references/` document an agent's own output
  or a workspace state file rather than a database row, so treating every fenced
  key as a column would be wrong three times in four. Binding to a relation is
  also what makes `note` catchable at all: it is a live column on `paths`,
  `scenarios` and `cell_dependencies`, and wrong only here.

- e0511c2: A portable contract test states the fold without naming an address — or a
  history that is not shared.

  `pathKindContract.test.ts` asserts that each array-shaped path-kind roster holds
  each of its members once, deliberately not a census, and it is the only consumer
  of `BLUEPRINT_ARROW_PATH_KINDS`. Every symbol it imports exists in the
  deployment, and it passes there unchanged: it is exactly the test that would
  have caught the roster that read `['happy', 'exception', 'exception',
'variant', 'variant']` — five entries for three kinds, absorbed by
  `Object.fromEntries` so nothing rendered wrong, and found by hand. The
  deployment refused to copy it, and was right to: its header named the fold
  migration `21000116000000`, a filename that resolves to nothing on the other
  side, and one of the repo-local identities the reconciled allowlist exists to
  keep out of shared prose.

  Replacing the address with the fact it stood for would have been the obvious
  fix and would have been worse. The fold is not the same fact in the two
  repositories. Here `21000116000000` runs one statement and sends both `unhappy`
  and `alternative` to `variant`; the deployment's `one_spelling_each` ran two
  updates and sent `unhappy` to `exception` and `alternative` and `custom` to
  `variant`. Both rename maps say so, each about its own database. A sentence
  reading "`unhappy` and `alternative` collapsed into `variant`" is true in this
  tree and false in the next one — and a wrong address misleads nobody for long,
  while a wrong fact is believed.

  So the header states what both databases share and nothing more: `paths.kind` is
  a CHECK constraint, `paths_kind_check check (kind in ('happy', 'variant',
'exception'))` on both sides, and `variant` is a fold destination on both sides.
  Which older spelling went where is left to `scripts/retired-vocabulary.mjs`,
  read against the migrations that ran in the repository the reader is standing
  in — which is what that map's own comment already says a reader has to do. The
  file now carries no repo-local citation at all, by the deployment's own scanner,
  and can be adopted verbatim.

  The sweep the ticket asked for was run, in the direction the enrolment gate
  measures: the deployment's tree against the pinned template package, over 924
  in-scope paths with 338 already enrolled. Fourteen unenrolled files are
  byte-identical or differ by prose alone. **Three** are held back by exactly one
  repo-local citation — `MobileNavSheet.tsx` (`plan 2026-08-16-002`),
  `findingFingerprint.ts` (`§2`) and `sliceValidation.ts` (migration
  `20260830190000`) — and none by more than one. All three citations are in the
  deployment's copy; this template's copies are already clean, so all three are
  deployment-side edits and none of them is this repository's to make. Eleven more
  carry no citation and are enrollable now for the cost of the allowlist line.

- 3df7841: `unhappy` is not a path kind. `21000116000000` folded it and `alternative` onto
  `variant`, and the CHECK constraint has named `happy`, `variant`, `exception`
  ever since. Three surfaces went on offering the retired spelling as live, and
  what they have in common is that each wears no mark a sweep could key on.

  An agent's review lens said "Dead ends: exception/unhappy paths"; a co-creation
  playbook said "alternative/exception paths reuse scenario steps". Both are
  prose without backticks, and the value sweep finds a value set by its code
  spans, so it had nothing to read. An authored figure labelled three stacked
  boxes `Path · exception`, `Path · variant`, `Path · unhappy` and captioned them
  "happy vs. unhappy" — that drawing renders on the cover page inside the app, so
  a reader meets it, and no vocabulary sweep opened an SVG for values at all. A
  component's doc comment glossed the badge as "(Happy, Unhappy, etc.)" beside a
  labels map whose keys are the three live kinds.

  A sixth site turned up on a last sweep and is the same shape as the fourth: a
  picker's comment said it "groups happy/unhappy into side-by-side columns" while
  the code assigns a column per kind through a total map of the three live ones.

  All six sites now say what the column accepts. The figure's caption became
  "happy vs. exception" rather than "happy vs. variant", because the line above it
  already says the scenario branches into path variants and the stutter would
  read as a typo.

  Two of the three shapes are now swept, and the third is recorded as unreachable
  rather than left silent.

  `retiredValuesInCompany()` is the new rule, beside the value-set grammar it
  extends. A retired value counts as a live claim when the text names the table it
  was retired from AND carries a value that column still accepts — "unhappy
  paths" beside "exception". Both signals are required and the measurement is why:
  seven of the eight values this map retires are ordinary English in this tree, so
  a bare-word sweep for them returns eleven findings of which two are defects,
  and the guard would be a list of exemptions on its first run. `named` alone adds
  sentences about database triggers and side-by-side comparison; `beside` alone
  reads "a single source of truth … the stacked column headers" as a layout
  claim. Together they returned three findings and all three were defects — two of
  which no one had reported.

  The rule asks the rename map what is retired and the schema dump what is live,
  so nothing in it counts sites or names a word. A value folded next month is
  swept next month without the file changing, and a column that still accepts a
  value is not a finding, which is what keeps a fold the instance shipped and this
  template has not from failing here.

  Two subjects. Every swept document, sentence by sentence, with the same
  exemption the value sweep allows — a sentence recording the retirement proves it
  with a correction verb and the migration that ran. And every authored figure,
  read whole: a drawing has no sentences, and three `<text>` nodes labelling three
  boxes drawn behind one another are one enumeration.

  The third shape is a comment inside a component, and it is not swept on evidence
  rather than on effort. Under `src/` the retired words are live: the app matches
  `'unhappy path'` and `'alternative path'` against the name an author types,
  because the fold took the kind and left the names alone. The same rule over
  every comment there returns ten sentences of which two are defects; the other
  eight are the app explaining what it translates, and a comment beside code says
  what changed without citing the migration that changed it, so the correction
  exemption cannot see them. Eight exemptions on a first run is a list of sites.
  Both defects were fixed by hand and the guard says out loud that it does not
  hold that shape, alongside the two blind spots the rule itself has — a sentence
  using a retired value as English beside its own table, and a scope carried
  across a sentence boundary.

- 936c8b3: A step's frames follow lane position, and the order is a guarantee.

  `useStepSpec` reads a step's storyboard frames through an embedded
  `lanes(name, position, lane_role)` select and never sorted them, so the row the
  step panel draws was in whatever order the query plan produced. Nothing looked
  broken, because the rendered row and the image viewer's sibling group are built
  from the same array and therefore agreed with each other — on an order nobody
  chose. A step panel draws one frame per lane precisely so the same moment can be
  compared across actors, and which actor is a position on the board; a new index
  or a different server could have reordered it silently.

  The frame assembly moves into `storyboardFramesFromCells`, a pure function that
  sorts on a TOTAL key — position, then lane name, then the frame — so the result
  is a function of the rows and not of their arrival. The sort runs before the
  dedupe: paths share their imagery, so the surviving row decides which lane a
  frame is captioned with, and that is now the first lane in the order rather than
  the first row off the wire.

  The sort is in the hook, not in the query, which is where this codebase already
  puts it: `normalizeBlueprint` sorts the same embedded `lanes` by the same column
  in JavaScript, the agent's scenario listing sorts its embedded scenarios the
  same way, and no query in the tree orders an embedded resource. One convention,
  followed rather than a second one introduced.

  Every other reader of `lanes` was checked. The canvas and the agent's blueprint
  reads share one select and both normalize, which sorts; the harness sorts in
  JavaScript; the lane panel's sibling query returns a SET of rows to write to,
  where order carries no meaning; and the blueprint dialog counts lanes. This was
  the only gap.

  The test is an invariant, not a fixture: over generated inputs, frames never
  place a lower lane after a higher one, and every permutation of a row set
  returns the same frames. A fixture was rejected because it is the shape that
  would have passed the defect — rows written down in lane order are satisfied by
  a function that returns its input untouched.

- e03d42f: `inline` decides what a utility compiles to; the content scan decides what the
  artifact carries.

  Four comments across `theme.css`, `colors.css` and `theme.shape.test.ts` said
  an `@theme inline` block emits no custom properties. A fifth, further down
  `theme.css`, said it does, and the built CSS agreed with the fifth. Neither
  claim was the mechanism. `inline` decides what a UTILITY compiles to — the
  value rather than the registered name, which is why a colour utility resolves
  straight to its semantic token — and emission is settled afterwards by
  Tailwind's content scan: a `@theme` key whose name the scan finds is emitted
  at `:root, :host` under `@layer theme`, and a key it never finds is dropped.
  Two hundred and twelve of this file's three hundred and twenty keys are in the
  artifact, and no two families are there for the same reason.

  What counts as finding a name depends on the file. A stylesheet offers a name
  only inside a `var()`; a `.tsx` or a `.md` offers it however it is written,
  comments and prose included. So the hue registrations are always emitted —
  their value spells their own name — while three others were in the artifact
  for no reason but a sentence somewhere: the canvas registration because this
  file's own warning against reading it spelled the read, the sans-font key
  because the comment explaining why it must not self-reference spelled the
  self-reference, and one retired alias because a CHANGELOG entry names it. The
  first of those goes with the rewritten warning. It is the one declaration this
  change removes from the compiled CSS, twenty-nine bytes, and nothing read it.

  `declarerOf` still treats every `@theme` name as a declaration, and now says
  why rather than leaving it as the thing nobody had checked. The dangling case
  a stricter rule would have to catch — a stylesheet reading a registered but
  unemitted name — cannot be constructed, because reading a name is one of the
  things that emits it, and the files the token model samples are a subset of
  the files Tailwind scans. Every read a rule can see is a read that emits what
  it reads. That subset relation is now a test rather than a claim: it fails if
  a fourth scan exclusion appears, and it fails if the sample widens to take in
  the test files, which is the direction the model's own header calls safe.

## 1.12.10

### Patch Changes

- 3ab0896: The rename map says which name became which, and a fold says its destination
  once. `scripts/retired-vocabulary.mjs` recorded each rename as a `was` array
  beside an `is` array, which reads positionally because nothing else is on
  offer — and two parallel arrays cannot express a fold, which is the commonest
  kind of rename.

  The path-kind row is where that told a lie. It said `unhappy` / `alternative`
  on one side and `exception` / `variant` on the other, so the map claimed
  `unhappy` became `exception`. `21000116000000` runs one statement —
  `set kind = 'variant' where kind in ('unhappy', 'alternative')` — and both
  spellings landed on `variant`. `exception` already existed, carries "this went
  wrong", and was never a destination; the migration's own note says so. The row
  had been carried across from the deployment's map, where the same pair is
  correct, because that database's `20260821220000` really did send `unhappy` to
  `exception` and `alternative` to `variant`. Two histories, one row, and nothing
  holding either against the SQL that ran.

  The map is a list of PAIRS now. Each retired name says where it went, several
  may name the same destination, and a name that was dropped rather than renamed
  says `null` and why. `kept` is the other half of a fold and the half the old
  shape had nowhere to put: a value that already existed on the column, kept its
  own meaning, and was never landed on. `was` and `is` are derived from the
  pairs, so the two lists cannot drift from them or from each other.

  Two more rows were reading wrong under the same shape. The placement row paired
  `cell_touchpoints.screenshots` with `resources.kind`, and no screenshot ever
  became a kind — every url and every screenshot is copied into `resources.url`,
  and `kind` is what tells a link from an attachment afterwards. The design
  system's row implied `pill` became `badge` and `chip` became `tag`; neither
  word maps onto one, which is why the deployment's own `coverContent.chip`
  became `commandCopy`. Both now say what happened.

  Three readers had inherited the positional guess and no longer do:
  `value-set-claims`, which is what tells an author what a retired value became;
  `check-database-names`, which names the replacement in its failure; and
  `check-instance-vocabulary`, which keeps the old reading only for the
  instance's map, whose shape offers nothing else.

  `scripts/tests/the-map-is-what-the-sql-did.test.mjs` is the guard. It reads
  each row's migrations down to their top-level statements — comments and
  dollar-quoted bodies removed — and asks whether the `update` or `rename` that
  would perform each pair is there. A pair no single statement performs carries a
  `because`, and the excuse is held to being true: declaring one on a pair whose
  statement is in the file fails. Nothing in it counts anything, so a rename
  added tomorrow is checked tomorrow without the file changing. Its header
  records what it cannot see — it proves a statement was written, not that it
  took effect, which is `check:identifiers` against a live catalogue.

- cbdbe4b: A lane is a row of the board again, and a layer is everything else. The rename
  that moved the table `layers` to `lanes` was carried into the prose by word
  replacement, so every sentence using `layer` in one of its ordinary senses came
  out saying `lane`. An earlier pass restored eleven of them. Ninety more had
  survived.

  The cover page was the one a reader met: "All four sit on one shared context
  lane" printed two entries above the same file defining `lane` as "One actor
  across the whole journey". The README said it twice more, once in a figure's
  alt text.

  Behind that, the damage ran in families rather than in scattered lines, which
  is why counting occurrences under-reported it. The **boot layer** — the opaque
  cover the sidebar draws over itself while the canvas stages — was called a
  lane in twenty-two places across the shell, the skeletons, four panels and
  five test names, in a file whose own paragraph two lines up says "The boot
  skeleton is an OPAQUE LAYER over the whole sidebar". The **canvas reveal's**
  rungs, which open one after another on `transitionend`, were lanes in fifteen
  more; the board's actual lane rows fade in at rung one, so both words were
  correct in that comment and only one of them was in the right place. The
  **chrome layer**, the **compositing** boundary WebKit will not resolve across,
  the agent runtime's **tool layer**, the design system's **token tier**, and
  Figma's **layer tree** account for the rest. Outside `src`, the same replacement
  turned a note recording a past rename into `` `lane-roles` -> `lane-roles` ``,
  a rename to itself.

  Two bindings were renamed rather than reworded. `getLaneScale`, `laneRef` and
  `laneInteractive` in the annotation layer, and `laneElement`/`laneRect` beside
  them, name a handle on one element — which is a layer; a lane is a row of data
  drawn by many elements across the whole width of the board and has no single
  element to hold. Nothing reaches them by string, so the compiler carried the
  rename; the DOM contract `[data-canvas-annotation-layer]`, which IS addressed
  by string, already said layer and is untouched. The second was worse hidden:
  the arrow overlay's prop was declared `lane: ArrowLayer` and compared against
  `'forward'` and `'wrap'` on `z-0` and `z-30`, so one file used `lane=` for a
  stacking layer and for a board row seventy lines apart.

  Where a sentence is true under either reading it was left alone. Ten comments
  in the reveal code say "lanes" about the board and stay that way, including
  "phase frames + lane structure" one comment above six that had to change.

  ## The guard, which is the part that lasts

  `scripts/tests/a-lane-is-not-a-layer.test.mjs` asserts that nothing called a
  lane is a layer, over every scanned file, **comments included**. That inverts
  the sibling check next door, whose header says prose may use an English word
  and a name may not misuse one. That rule is right for a word the domain does
  not own; `lane` is this vocabulary's own word, so here the damage IS in the
  prose, and a guard reading names only would have found three of ninety.

  It decides by the company the word keeps. A lane is a row of the board: it is
  not composited, it does not stack, it is not a rung of an animation and it is
  not a tier of software. So `lane` may not stand in the vocabulary of the
  cascade, of paint, of stacking or of an architectural tier. Every pattern names
  a concept rather than a site — "boot lane" is forbidden because a row of the
  board does not boot, not because twenty-two files said it, and the check has no
  idea how many exist.

  Four cheaper shapes were tried against the whole tree first and are recorded in
  the header so the next person does not re-derive them. Position does not
  separate the senses: in one stylesheet, forty of the forty-four correct uses
  are in comments and so are all nine wrong ones. A per-file sense declaration
  fails one level up, because ninety-one of the hundred and eighty-nine files
  that use the word hold no lane identifier at all and still discuss lanes
  correctly, and the three worst-hit files carry both senses, one of them inside
  a single sentence. The pre-rename tree is not an oracle either, though it
  settled a dozen calls: before the rename `layer` was BOTH words, the schema's
  name for a row and the stacking sense, so only its negative direction is
  sound. And an allowlist of modifiers is unbuildable, because what precedes
  "lane" in this tree is overwhelmingly determiners and ordinary adjectives.

  What it cannot see is stated in its header rather than hidden. Measured against
  the sentences actually repaired, the patterns catch a little under half; the
  rest are anaphora — a paragraph naming "the boot layer" once and saying "the
  lane" four sentences later. No line-local rule reaches that, and resolving it
  needs a parser and a model of the paragraph. What makes the limit tolerable is
  that anaphora does not arrive alone: the paragraph almost always names the
  thing once, and naming it is what trips the check.

  The residue sweep beside it gained the fix for a blind spot it had all along. A
  `semantic lane` had been sitting in the customization reference since the
  rename, invisible because the phrase WRAPPED — "so the whole semantic" ended
  one line and "lane renders greyscale" began the next, and a per-line test
  cannot see a phrase no line contains. It now reads each line joined to the one
  after it, with the continuation's comment marker stripped, and reports only
  matches that genuinely straddle the boundary so a wrapped paragraph is not
  blamed twice.

  `CONTEXT.md` now defines **layer** — as explicitly _not_ a domain word, which
  is the entry that was missing. The glossary is what the next sweep checks
  itself against, and the word this vocabulary keeps colliding with had no entry
  in it.

- aa2b358: ADR 0007 says "boot layer" where the rename had left "boot lane", and main is green again.
- b6840ca: Any image worth looking at now opens, and once open it behaves like an image
  viewer.

  An image in this app used to be either too small to read or not openable at
  all. A cover figure authored at 880px is shrunk to the prose measure, so the
  labels inside it are legible in the source file and not on the page. A
  storyboard frame in a detail stack is a picture of a real screen at a size
  where a reader can see that something is written on it without being able to
  read a word. A screenshot attached to a cell rendered at whatever the panel's
  column allowed, and a featured attachment — the one picture a placement chose
  to lead with — got a thumbnail and no way past it.

  Click any of them and the image fills the screen, fit to the viewport. From
  there the wheel or a trackpad pinch zooms toward the cursor, a click toggles
  between fit and the stop above it, and dragging pans once past fit. On a
  phone, pinch and drag do the same work. The cursor says which of those is
  available, so the gestures do not have to be found by accident. Closing is
  unambiguous and never a dead end: click the surrounding margin, press Escape,
  or use the corner button that stays visible at every scale. A click on the
  image itself never closes, because the image is now the thing being operated.

  Where a picture has siblings — the row of lane frames in a storyboard stack,
  several screenshots on one cell — the viewer steps between them with the
  arrow keys, on-screen buttons, or a horizontal swipe, and a counter says which
  one of how many is showing. Each step returns to fit, so no sibling arrives
  already scrolled to a corner of the last one.

  Two pictures deliberately stay shut. Logos and logomarks are iconography
  rather than content, and a brand mark that opened fullscreen would teach the
  reader that the openable affordance is decoration. The storyboard's horizontal
  layout is only ever drawn inside the walkthrough deck, which already binds the
  arrow keys and Escape on the window — a viewer inside it would fight the deck
  for all three. Those frames open in the vertical stack instead, so nothing
  becomes unviewable.

  Nothing about the data model moves. A frame has no caption anywhere in the
  schema and did not get one for the sake of a label: an opened cell screenshot
  is named by the cell's own content sentence, which is what the picture shows.

- 161326e: The components that composed role colour by hand now ask for a job. Five files
  stop reaching past the semantic tier into a ramp step, which leaves the stepped
  role ramps with no consumer in the tree at all.

  **`alert.tsx` is the case the vocabulary was minted for.** It drew one job with
  two mechanisms, because two of its four status roles had a numeric ramp and two
  did not: destructive and warning took a 400 edge on a 200 surface, while info
  and success drew the same idea as the fill at fifteen percent alpha. Both are
  `--surface-{role}` and `--border-{role}` now, the filled icon square is the
  role's own fill with its own on-colour, and the four variants read as four
  values of one recipe rather than as two recipes that happen to agree.

  **The swap is invisible where it was engineered to be.** The role edge was
  retargeted to sit one step off its own tint precisely so this change would not
  turn a hairline into a rule around the box. Measured per site, in both themes,
  the alert border moves from 1.29, 1.21, 1.34 and 1.30 to one against its tint —
  destructive and warning, light then dark — to 1.28, 1.27, 1.22 and 1.24. The
  band the ramp steps drew, held by a derivation instead of by four literals.

  **Two things move on purpose, and both are legibility.** The alpha tint could
  not hold an edge at all: composited on itself in dark, the info and success
  borders measured 1.01:1 and 1.03:1 — a border that was not there. On the opaque
  tint they measure 1.23:1 and 1.27:1, inside the band with the other two. And
  the icon square used to write the role's TINT as the glyph colour on the role's
  own step-600 fill, one colour on another: 2.96:1 for warning, 5.18 for
  destructive in light. The fill's on-colour is what that job is for, and it
  reads 6.89 and 5.74, with all four status roles clearing 4.4:1 in both
  themes.

  **The tinted warning badge changes visibly, and it is the one place to look.**
  Its ink was a ramp step chosen for being the least illegible option available —
  2.8:1 in light, 5.2:1 in dark, and the comment beside it said so. There is no
  job name for a middle of a scale, because a middle of a scale is what this
  vocabulary exists to stop naming. The ink is now the ink for a colour sitting
  on its own tint, at 13.1:1 and 9.2:1, and the ground under it is the opaque
  tint rather than a ten-percent wash — which is what gives any of those numbers
  a ground to be measured against. Amber body copy becomes a dark amber word on a
  pale amber tint. Every badge with `variant="warning"` moves with it.

  `StatusBadge` was one of the call sites re-deriving that shape out of a tint and
  an edge; it asks for the variant now. Its word goes from `--foreground` on the
  tint, at 20:1, to the role's own ink at 13:1 — ordinary copy on a coloured
  badge becoming a word that carries the status itself.

  **A measurement the vocabulary should answer for.** `--surface-{role}` is
  derived from the page, so on a card it is nearly invisible in dark: 1.02:1
  against `--card` for all seven roles, where the card itself sits 1.09:1 off the
  page. Every tinted surface in this change inherits it, and the role's edge is
  what carries the shape there. It is a property of the derivation rather than of
  these call sites, and it is the same in light only because card and page nearly
  coincide there.

  No token is deleted and no Tailwind registration is removed. The stepped ramps have no call site
  now, which is the precondition the deletion pass was waiting on.

- fc48367: `create_slice` and `update_slice` now advertise the argument they read.

  Both declared `description` and read `summary`. Nothing connected the two:
  `specs.ts` builds a JSON schema out of string literals and `registry.ts` reads
  `args['summary']` out of a `Record<string, unknown>`, so both files typecheck
  no matter what they say. A model that filled in the field the schema offered
  created a slice with an empty summary and was told it had been created.
  `update_slice` failed worse — it kept the old summary and reported success, so
  an edit meant to change the text changed nothing.

  The schema now offers `summary`, which is the column it writes. The handler
  still reads `description` as well, so a model taught the old wire keeps the
  word that used to be dropped rather than losing it a second time.

  The general form is now checked. `scripts/tool-arguments.mjs` reads both files
  and compares argument names per tool, in both directions: an argument declared
  and never read is the silent drop, and one read and never declared is an
  argument a model can only send by accident. Aliases are listed with a reason
  and only ever excuse the second direction — a name the schema knows and the
  handler does not is the defect itself, so there is no way to excuse one.

- bf59efa: A cell panel's slice footer shows a skeleton while the slices load, instead of appearing after them and pushing the panel.
- c880fd7: The path classifier is spelled `kind` everywhere, not `type` in half the names.

  `20260830190000` folded the schema's classifiers onto one word: `paths.path_type`
  became `paths.kind`. The type followed — `PathKind` was already the spelling in
  every file — but the constants, the theme module and seven camelCase members did
  not, so one concept was spoken about in two words that a reader had to learn were
  the same.

  Renamed: `PATH_TYPE_COLORS`, `PATH_TYPE_ARROW_COLORS`, `PATH_TYPE_LABELS`,
  `PATH_TYPE_SHORT_LABELS` and `BLUEPRINT_ARROW_PATH_TYPES` onto `KIND`;
  `src/lib/pathTypeTheme.ts` to `pathKindTheme.ts`; and `showPathTypeBadge`,
  `shouldShowPathTypeBadge`, `getPathTypeSectionBorderStyle`,
  `isGenericPathTypeName`, `getPathTypeSuffixIfNeeded`, `defaultPathTypeMarkerIds`
  and `defaultPathTypeMarkerColors` with them. `PathTypeBadgeProps` and
  `PathTypeColorKeyProps` sat inside files already named `PathKind*`.

  `pathColorTheme.ts` is untouched — "path colour theme" carries no classifier
  word. Nor is `path_type` where it names history: `paths_path_type_check` is the
  constraint's real name, and the rename map and the IR migration script have to
  be able to say the retired word to retire it.

  Behaviour is unchanged; every renamed symbol keeps its value and its callers.

- 4565a50: Every coloured role now offers the same seven names, so an author picks a
  colour by naming the job rather than by reading a number off a ramp.

  Seven roles — `primary`, `brand`, `warning`, `destructive`, `info`, `success`,
  `secondary` — and seven names each. The fill (`--{role}`), ink on that fill
  (`--{role}-foreground`), the resting tint (`--surface-{role}`), ink on that
  tint (`--text-on-surface-{role}`), role ink on the neutral page
  (`--text-{role}`), the edge (`--border-{role}`) and the transient state
  (`--wash-{role}`). Roughly seventeen of the forty-nine existed; this fills the
  rest and publishes a Tailwind utility for each.

  **What a reader sees change.** Almost nothing, and that is deliberate: this is
  the expand half of a migration, so the new names land beside the old ones and
  the call sites move separately. Two things do move on screen.

  The info and success alerts are the only live consumers of a role border, and
  theirs becomes solid: the fill at thirty percent alpha drew a different colour
  on every ground it crossed, which is why components reached past it for a ramp
  step. It is also quieter. A role border is not what identifies a control or its
  state — the tinted surface and the filled icon square carry the variant, and
  the edge can go without the alert becoming unreadable — so the target is the
  interval this system's recipe uses rather than the 3:1 a required boundary has
  to clear. That recipe puts a role border one step off the surface it edges,
  which across its own four alert variants measures 1.21:1 to 1.34:1. Every role
  here lands between 1.22:1 and 1.28:1 against its own tint, in both themes. On
  the ground those two alerts draw on today the edge measures 1.23:1 and 1.19:1
  in light, against 1.45 and 1.43 for the alpha it replaces; in dark it measures
  1.09 and 1.08 against 1.67 and 1.88, because those two still tint with
  `bg-{role}/15`, which sits lighter than `--surface-{role}`. That gap closes
  when the call sites move onto the tint.

  And `--border-brand` was derived from the primary fill while brand had no fill
  of its own; it is derived from `--brand` now, which is the colour its name
  always claimed. Nothing consumes that one yet.

  Everything else holds exactly: every custom property under `src/styles`,
  resolved in both themes, with no value moved except those five borders.
  Seventy-two names arrive and twenty leave, and the twenty are the brand ramp
  and nothing else.

  **What an author gets that did not exist.** A name for role ink on a neutral
  ground. `text-destructive` is written at about twenty call sites, all of them
  on the page rather than on a tint, and it resolves to the solid fill — a
  colour tuned for ink to sit on top of it, never measured as ink. `--text-role`
  is that measurement: 8.4:1 to 13.5:1 against the page across both themes. A
  resting tint for every role, so nobody hand-composes `bg-success/10` at the
  call site again. And a transient wash distinct from the tint, so hover does
  not reuse the surface it sits on.

  **Brand becomes two dials, and the ramp goes.** `--brand-lightness` and
  `--brand-chroma` sit in both theme files beside the primary pair, and `--brand`
  derives from them. Rebranding used to mean re-typing a seven-step lightness
  curve per theme; it is two numbers now.

  So the ramp goes with it — `--color-brand-100` through `-1200`, the
  `--brand-200..600` literals in both theme files and in the print block that
  restated them, `--brand-default`, and `--color-brand-link`. Nothing outside
  those declarations read any of them, here or in the deployment that pins this
  package, so nothing on screen moves. It is a rule and not a tidy-up: a
  primitive family is named for its hue — amber, violet, teal — because the hue
  is all it knows about itself, and a family named for a ROLE cannot follow an
  accent, which is exactly what a rebrand asks of it. The role keeps its name in
  the semantic layer, where the value is derived.

  `brand-link` had no consumer either, and the job it named already has a derived
  name: role ink on a neutral ground is `--text-brand`. Deleting it is cheaper
  than deriving a colour nobody has asked for and nobody would measure.

  `bg-brand` renders the colour it always has — #7e7e7e in both themes here,
  since the lightness dial is the OKLCH lightness the anchor step carried. With
  the ramp gone there is no step left to compare it against, so the rule that
  claimed it becomes the derivation instead: the fill is the accent at the two
  brand dials, on the one hue the filled control also runs on.

  Every one of the new names is derived from the role's own accent, and none
  aliases a hue primitive. Status hues are pulled a fraction toward the brand and
  then clamped to their category, so a re-branded deployment's warning still
  reads as a warning; a fixed ramp cannot follow an accent, and aliasing one
  would have deleted that mechanism. The ramps stay for categorical colour —
  lane identity, path variants, annotation swatches — which carries no meaning
  and correctly reaches the primitive layer.

  The contrast claims are measurements rather than assertions. The token model
  learned to resolve a declaration to a colour — `calc`, `clamp`, relative colour
  syntax, both alpha spellings — so a rule reads what the cascade produces
  instead of restating the arithmetic in TypeScript beside it. Every floor was
  re-measured with the accent, chroma and hue a branded deployment ships, and
  holds there too.

  Completeness is an invariant, not a census: the rule is driven off the role
  list, so adding an eighth role covers it automatically and fails until all
  seven of its names are declared and registered.

- 2afde98: The documents an agent reads call the findings table by its name.

  `21000116000000` renamed `findings` to `audit_findings`. Twelve places across
  `CONTEXT.md`, the two reference contracts, both audit-writing skills and the
  whatif change-request schema went on naming the old table — and one of them,
  the adapter contract's column-scoped UPDATE list, still named `note` for the
  column that is now `summary`.

  Three occurrences deliberately keep the old word, because each names the past
  rather than the schema: the migration-history row for
  `20260729120000_derived_layer.sql`, which created a table called `findings`;
  the sentence in `docs/engineering/checks.md` explaining the rename itself; and
  `recordFindings`, whose port really is called `findings` in `ports.ts`.

- fc48367: The findings-row shape in `agents/auditor.md` names the columns it writes to.

  It said `check_name` and `note` while claiming to be "the same shape
  `audit_tools.py --help` documents", two renames after `21000116000000` made
  those `check_key` and `summary`. An auditor following the document to the
  letter produced a row `audit_tools.py` raises `KeyError: 'check_key'` on.

  `findingFingerprint`'s parameter and the findings row in
  `references/data-model.md` carried the same two retired words.

  Shipped in #289 without a changeset; recorded here.

- db56975: The warning and destructive ramps are gone, and the shape that let them exist
  is now checked rather than described.

  Two roles carried a five-step ramp of raw HSL triples — `--warning-200`
  through `--warning-600` and the same for `destructive` — declared in both
  theme files and restated a third time inside the print block, so a reader
  looking one up found three declarations of it. A sixth token,
  `--destructive-default`, sat beside them: named for a POSITION on that ramp
  rather than for a job, identical in both themes, and read by nothing at all.
  The components that used to reach for these ask for a job now, so all thirty-
  two declarations are deleted.

  Ten more lines went with them, and those are the ones that could only be
  removed here. `theme.css` registered every step into Tailwind's colour
  namespace as `--color-warning-200: hsl(var(--warning-200))`, which is the
  entire reason `bg-warning-200` and `border-destructive-400` were ever legal
  classes. The hue primitive families stay: they are the right home for colour
  that carries no meaning, and this template ships them neutral as its brand
  seam. A ramp named for a ROLE is a different thing, and it was living in the
  dial file as raw literals — two tiers below where a meaning belongs.

  **Nothing renders differently.** The compiled stylesheet was built from the
  tree before and after and diffed: three hunks, one per site that declared the
  ramps, removing exactly those thirty-two declarations and no other byte. The
  registrations produced no output to begin with — `@theme inline` emits no
  custom property, it only tells Tailwind a name exists — and the compiled sheet
  contained no `.bg-`, `.text-`, `.border-` or `.ring-{role}-{step}` selector
  before the change either, because nothing was writing one.

  ## The guard, which is the part that lasts

  Deleting the registrations fixes today and does nothing about tomorrow: the
  next person can add them straight back. `src/styles/theme.shape.test.ts`
  asserts the shape of EVERY colour entry in that file, so a registration added
  next quarter is checked next quarter without the test changing and without it
  knowing how many entries there are or what any of them is called.

  A colour registration is one of exactly two things. It is a **namespace
  declaration**, `--color-X: var(--color-X)` — self-referential on purpose, so
  the name exists and its value resolves in `colors.css`; the hue families are
  204 of these. Or it is an **indirection**, `--color-X: var(--Y)` where `--Y` is
  a semantic token: one bare `var()`, no function wrapped round it, no fallback
  arm, nothing beside it, and no declaration of `--Y` in the dial or primitive
  layers. There are 99 of these. `hsl(var(--warning-200))` fails the first half
  of that; `var(--warning-200)`, which is what unwrapping it by hand produces,
  fails the second. Both halves are needed, because the second shape is what a
  plausible repair looks like.

  The rule reads the token model rather than opening the stylesheet, which the
  decision that one token model is the single style seam already asks of any new
  rule — and which matters concretely here, since two declarations in this file
  wrap across lines and a per-line sweep cannot tell a declaration from the same
  characters inside the paragraph above it.

  Three cheaper rules are recorded in the header so the next person does not
  re-derive them. A list of forbidden names is a census: true of the ten lines
  that prompted it, silent about the eleventh. "No `hsl(` on the right" catches
  the exact wreckage and nothing adjacent — `rgb(`, `oklch(`, `color-mix(` and a
  bare hex literal all walk past.

  The third is the interesting one, and it is a finding rather than a rejected
  sketch. "No numeric suffix on the left" was the form the rule was first
  proposed in, and 204 legitimate entries carry one — every step of every hue
  family — so the rule as stated would condemn the layer it was written to
  protect. The number was never what was wrong. `--color-amber-100` is a
  position on a ramp and is supposed to be; what was wrong with
  `--color-warning-200` is that a ROLE is a meaning, and a meaning has jobs
  rather than positions. The five chart-series keys settle it: numbered, not
  self-referential, flagged by a digit rule, and entirely correct — their number
  is a series identity, they point at semantic tokens, and they compute nothing.
  Asking about reach and shape instead of digits covers all of it with no
  exception list at all.

  What the rule does not claim is stated in its header rather than hidden. The
  subject is the colour namespaces; the radius ladder's `calc()` rungs are
  a real derivation it is meant to have, and the literal measures beside them
  are a different question. A colour namespace not containing the word
  `color` — Tailwind's `--fill-*` and `--stroke-*` — is outside the pattern; this
  file registers none today.

  A deployment that has forked this template carries the same declarations in
  its own theme files and print block. They are unread there too, and they go
  when it takes this change.

- 1eb250d: The step panel's lane frames now open, and step to one another in lane order.

  A step panel draws one frame per lane — the same moment as each actor saw it,
  side by side in a row that exists to be compared. Until now that row was the
  one place in the app where the pictures were smallest and the least openable:
  each frame is 128px wide at 4:3, which is enough to see that a screen has
  something written on it and not enough to read a word of it. The image viewer
  had already been wired to the cover figures, the featured resources, the
  storyboard detail stack and the cell panel's screenshots; this row was the
  motivating case for the whole feature and was the one still left inert.

  Click a frame and it fills the screen, fit to the viewport, with the same
  gestures every other openable image has. From there the arrow keys, the two
  on-screen buttons or a horizontal swipe walk along the row — the same moment,
  the next actor — and the counter says which of how many. Each step returns to
  fit, so no lane arrives already scrolled to a corner of the last one, and
  stepping wraps at both ends because a row of three actors is something a
  reader cycles rather than traverses.

  The row is handed to the viewer as an ordered array plus the index of the
  frame that was clicked. It is not discovered by scanning the container, and
  the distinction is the point of this change rather than an implementation
  detail: the order of these frames is lane order, and lane order is what makes
  stepping mean anything. A scan would reproduce it today and only by accident,
  until the day a wrapper element or a CSS reorder quietly rearranged it and the
  viewer went on claiming to walk the lanes.

  Each frame's accessible name is its lane's, the caption already printed under
  it. No field was added to any record to supply one: a frame carries no caption
  anywhere in the schema, and what the picture shows is the moment the panel's
  summary already describes — the lane only says whose view of it this is.

- 604a780: A blueprint cell's lane rule states five properties, not seven:
  `--background-blueprint-cell-origin` and `--ring-blueprint-cell-soft` are gone,
  because neither carried a value of its own.

  Both had readers, which is what made them look real. The button's `blueprint`
  variant chained through `-origin` on its resting and hover fills and through
  `-soft` on all three of its ring, border and pressed-ring colours, and the
  board's preview-hover and connected-emphasis rules read one apiece. But every
  link in every one of those chains was a `var(name, fallback)`, and the fallback
  was the twin: `-origin` falling through to `--background-blueprint-cell`,
  `-soft` to `--ring-blueprint-cell`.

  So the question was only ever whether some role gave a twin a different value.
  Measured through the token model across all sixteen role blocks — nine lanes
  and seven touchpoint tones — in both themes: sixteen of sixteen identical for
  each pair, textually and as resolved sRGB. Every chain resolves to the same
  colour with the two names absent and the fallback taken, so nothing on the
  board changes.

  Two names for one value is what one authored accent per role exists to remove,
  and the same deletion already stands in the deployment this design system is
  shared with. The lane rule now reads the same in both.

## 1.12.9

### Patch Changes

- 5661884: The agent's cell-content budget advises instead of refusing: a cell longer
  than the budget is written in full, and the reply says so.

  An agent that composed 130 characters of cell text used to lose all of them.
  The write path measured the content against a 120-character cap and threw, so
  the sentence the model had already worked out never reached the database and
  the model was left to guess a shorter one. Nothing in the schema asks for 120.
  It is a judgement about how much copy looks right in a card, backed out of the
  canvas geometry — and a judgement should advise rather than discard work
  already done. `upsert_cell` and `update_cell` now write whatever they are
  given and append a note naming the budget, the length they read, and where
  supporting detail belongs. The two tool descriptions say the same thing, so a
  model reads the budget as an aim rather than a wall.

  The `maxLength` on the Content field in the cell editor stays. A box someone
  is typing into can stop them at the budget before anything is lost, which
  prevents; discarding a finished paragraph after the fact does not.

  Nothing about the board moves, because the render never depended on the
  refusal: a narrative cell already draws at a fixed height and clamps its
  preview to the lines that fit, with an ellipsis, while the whole string stays
  in the cell's own text node for the detail panel and for a screen reader. That
  the height is fixed is an existing assertion about the layout estimate — a
  long cell and a short one size their lane identically — rather than a claim
  about any number of characters, and it is what makes the softer write path
  safe to ship.

- 00c0992: The slice editor calls a slide a slide. The title box asks for a Slide title,
  the button at the end of the strip adds a slide, the tooltip on a card deletes
  one, and the ✕ on a cell badge takes that cell out of the slide. All four said
  "screen" before, which is a word this vocabulary does not use for anything.

  Three words are settled and distinct. A **frame** is one image on one cell —
  column `cells.frame`. A **slide** is one row of a slice — table `slides`.
  **screen** is ordinary English: a display, a viewport, the surface a reader
  happens to be looking at. Letting the schema's own prose call a slide a frame
  is the exact defect the `slides` rename fixed, and
  `scripts/retired-vocabulary.mjs` has recorded it ever since; calling a slide a
  screen is that defect wearing a third word.

  `CONTEXT.md` now defines all four of `frame`, `slide`, `strip` and
  `storyboard`, which it did not before. That is the half of this change that
  matters longest: the glossary is what the next sweep checks itself against, and
  none of the four had an entry to check.

  Behind the strings, the bindings that named a slide are renamed to say so.
  `screenIndex` becomes `slideIndex` in the composer, which had been rendering
  the label `Slide {screenIndex + 1}` — the right word printed from a variable
  named for the wrong one. `mergeSelectionIntoScreens` becomes
  `mergeSelectionIntoSlides`. `sequenceByFrame` and `frameProblems` become
  `sequenceBySlide` and `slideProblems`; `FrameNavButton` and `frameCellIds`
  become `SlideNavButton` and `slideCellIds`; the type `FrameLoss` becomes
  `SlideLoss`, and its own doc comment already said it holds slices that lose
  slides.

  The correction runs in both directions, which is the part worth reading twice.
  Three comments in the presentation view had a _frame_ called a _slide_ — the
  strip described as "the slide's own cell slides", several frames on one slide
  as "cell slides in one slide", the empty state as "no card slide". Those are
  the same defect mirrored, and a sweep that only pushed one word toward the
  other would have deepened them.

  Nothing was pushed further than that. `screen` keeps every legitimate sense it
  has: the Testing Library binding, `screenshot`, and prose about viewports and
  surfaces — including the two comments that say a slice and its presentation are
  one object rather than "two unrelated screens", and that presenting is a mode
  of the slice and "not a separate screen". Both are the ordinary word used
  correctly, and rewriting true sentences to satisfy a vocabulary rule is how the
  sibling `layer`/`lane` sweep mangled forty of them. The layout contracts the
  two spellings already agree on — `slideLayout.ts`, and the `data-slide-canvas`,
  `data-slide-id` and `data-slide-sticky-header` attributes — are untouched.

  The reference documents that describe the `slides` **table** stop calling its
  rows frames: the data model listed the table as "One frame of a slice", the
  adapter contract warned about a "frameless slice" and stranded "orphan frames",
  and the guide said a slice's frames point at live cells. The slice authoring
  **file format** is a separate question and is deliberately left alone — its
  `frames` array is a schema key that existing slice files and the skill's own
  tooling read, so it is a compatibility decision rather than a spelling one.

  The assertion that holds this is an invariant, not a census of today's four
  strings: nothing on the slice surface — no identifier, no string a reader
  sees — is named a screen. It says nothing about how many strings there are, and
  it deliberately makes no claim about `frame`, because a frame is a real thing
  on that surface and any rule about the word would be a list of today's
  identifiers. Comments are outside its subject for the same reason the
  sentences above survive: prose may use an English word, a name may not misuse
  one.

- 3d6ff76: A variant path appears once in the path picker, in the column beside the happy
  path, instead of twice — once on each side.

  The picker lays its paths out in columns, and it decided which column a path
  belonged to by filtering the same list against two sets of kinds, `happy` and
  `variant` on the left, `variant` and `exception` on the right, and treating the
  two results as disjoint. They were not. `variant` was in both, so every variant
  path was drawn in both columns: two checkboxes, the same label and the same
  swatch on each, toggling the same filter, with no way for a reader to tell that
  they were one path.

  The overlap is residue from the migration that took path kinds from four to
  three. `unhappy` and `alternative` were two spellings of one idea and both
  became `variant`, on the reasoning the migration states itself: `exception`
  already carries "this went wrong", so `unhappy` was only ever `variant` with a
  mood attached. Before that fold the two sets were disjoint and the split meant
  something — `alternative` on the left, `unhappy` on the right. Putting the new
  spelling in place of both old ones put one value in both sets, and a `Set`
  takes a repeated member without complaint, so the day the split stopped being
  a split, nothing said so.

  Which column a path belongs in is now answered by a single total map from kind
  to column, consulted once per path — not by asking each column in turn whether
  it wants the path. That is what the two sets could not be: every kind is
  assigned, because the map is a `Record` over the kinds and the compiler will
  not accept a gap, and each is assigned exactly once, because a repeated key is
  a syntax error rather than a silently absorbed duplicate. Assigning a kind to
  two columns is no longer a mistake that renders; it is a thing that cannot be
  written down. `variant` is assigned the primary column, beside the happy path,
  which is where the fold leaves it: after the fold a variant is the alternate
  route and `exception` is the whole of what goes wrong, so the secondary column
  holds exceptions alone. A path whose kind this build does not recognise still
  gets a column, so that a newer schema's row is drawn rather than dropped.

  The test is the invariant the defect broke, and it is not a census: for every
  short arrangement of the kinds the app declares, everything handed to the
  grouping comes back out of it exactly once, with nothing dropped and nothing
  invented. It names no kind and no column, and it does not say how many kinds
  there are — a fourth would be a migration, and it should not also be an edit
  to this test.

- c32ce65: Seventeen files call the `errorMessage` helper they already export instead of inlining it.

## 1.12.8

### Patch Changes

- 083164c: The last three repo-local citations leave the shared files, and the placeholder asset keeps its warning.
- 74dcc40: The create-version dialog's Kind picker offers three kinds, not four — Variant
  is one button now, and the console it warned in stays quiet.

  `PATH_KINDS` listed `variant` twice. It is residue from the change that
  collapsed `unhappy` and `alternative` into the single `variant` the database
  has accepted since `paths_kind_check` was rewritten: both old spellings were
  substituted for the new one, and the roster ended up holding it once for each.

  Nothing failed, and the shape of the roster is why. The kind union is derived
  from the array, and a union dedupes on the way out, so the type stayed correct
  and the compiler had nothing to say. Every label and colour map is a
  `Record<PathKind, …>`, and a repeated key there is a syntax error, so those
  defended themselves. Only the array is iterated — the picker draws one button
  per entry — so the duplicate surfaced in the one place it could: two buttons
  reading Variant, doing the same thing, and React warning about two children
  sharing a key.

  The same substitution left the same mark in two more rosters, found by looking
  for it. The blueprint arrow markers keep their own list of kinds and it also
  held `variant` twice; that one is only ever turned into a lookup map, so the
  second entry overwrote the first with the same value and nothing was visible.
  The agent's `create_path` and `duplicate_path` schemas held it twice as well —
  and alongside it `named`, a fourth value that is not a kind, that no map keys,
  and that the database refuses. That one had teeth: it was offered to the model
  as a legal choice, and picking it built a row the insert would have rejected.
  Both schemas now offer the three kinds the constraint accepts, and their
  descriptions name those kinds rather than the retired spellings.

  The assertion that holds this is an invariant rather than a count. It says each
  roster lists each of its members once, that the rosters and the compiler-guarded
  maps hold the same members as each other, and that a tool-schema enum which
  speaks the path-kind vocabulary speaks nothing else. Nowhere does it say there
  are three kinds — a fourth would arrive as a migration and a decision, and this
  test should not have to be edited when it does.

## 1.12.7

### Patch Changes

- 6923d4b: Sixteen shared files that differ from the deployment's copies by prose alone
  lose their repo-local citations, so the drift gate can hold them. The raw-hex
  exemption for `arrowSituationCatalog.ts` goes with them — its only matches were
  the issue references now gone.

## 1.12.6

### Patch Changes

- bd8617d: A connector arriving at a walled cell on the merged canvas lands on its slot's
  outer edge, so no arrow in the catalog ends by travelling backward.

  An arriving end turns back into its card vertically where there is room, and
  falls back to a side entry where there is not — and a side entry out of the
  right gutter draws its last stub leftward. The markers are `orient="auto"`, so
  the head follows that stub and points backward along a grid whose one ordering
  claim is that time runs left to right.

  Six connectors in the golden geometry catalog still ended that way, all of them
  in the merged view: a backward loop within a lane, an upward cross-lane run,
  both runs of a cell that is a target and a source at once, and both links of an
  A→B→C chain. What walled them was the merged canvas's own shape — a slot there
  stacks one sub-cell per path, and a sub-cell sits hard against its neighbour's
  edge, far too close for a head to turn in between them.

  The stack is one slot, though: every sub-cell in it shares a lane and a step
  column, and the stack as a whole still has a free top and a free bottom. So an
  arriving end now measures its horizontal edges from the stack rather than from
  the card, and a head landing on the stack's outer edge names the lane and the
  column its target does. A departing end still leaves its own card's edge — it
  carries no head, and a line that appeared to start at a neighbour's edge would
  misname its source. A cell with no stacked neighbours reports its own box, so
  every route outside the merged view is untouched, point for point.

  The catalog now asserts this as an invariant over every situation and every
  view mode rather than over the six that were known, and pins the number of runs
  each mode draws, so a head cannot be straightened by dropping the arrow.

  The merged fixture was also wrong about the canvas it models. It stacked
  sub-cells without re-spacing the lanes, which overlapped one lane's sub-cell
  with the next lane's card — two cards sharing the same pixels, which the merged
  grid's `minmax(_, auto)` row tracks cannot produce. The packed column that came
  out of that left an arriving head nowhere at all to land. Lanes are re-spaced
  now, each keeping the gap it had. The single and side-by-side renderings are
  byte-identical.

- 4c32a69: Printing from dark mode prints the light palette, all of it.

  `styles/print.css` forces the light palette onto paper by restating dials
  inside `@media print`, under `:root, .dark`. The `.dark` arm is what takes the
  dark theme's declarations back, and it can only take back a name it mentions.
  The block's header comment said exactly that, in prose, and prose does not run:
  the block was written correct and fell **nineteen dials behind** as the theme
  files grew.

  The reported symptom was the filled control. Dark inverts it to a near-white
  fill, `--primary-lightness: 0.922`, and the print ground is `0.968` — so a
  primary button printed from a dark page came out as an L=0.922 fill on an
  L=0.968 sheet, very nearly invisible. The focus ring (`0.62` instead of `0.58`)
  and links (`--brand-link`, 58.3% instead of 26% lightness) went with it.

  Measuring it through the token model found seventeen more. The stepped ramps —
  `--brand-200`…`--brand-600`, and the five-step warning and destructive ramps —
  are per-theme HSL literals rather than derivations, so nothing downstream
  re-derives them into the light; `theme.css` and `colors.css` register them as
  `hsl(var(--brand-600))` and friends at `:root`, and the dark literal is what
  those read on paper. Dark inverts the ordering, 200 darkest, so a printed
  badge or subtle plate came out near-black on white. `--field-alpha` printed at
  dark's `0.12` rather than `0.015`, putting a grey box round every control. And
  `--hue` was pinned in the print block at `177.6`, the upstream brand hue, where
  the light theme has said `159` since this repository's theme files were
  written — moot while `--chroma` is `0`, and a rebrand away from being the
  filled control printing in the wrong hue.

  The print block now restates every dial the two themes disagree about, at the
  light theme's value. It restates nothing else: dials both themes already agree
  on — `--hue`, `--chroma`, `--radius`, `--primary-chroma` — are absent rather
  than copied defensively, because a second unheld copy is what caused this.

  The rule is an assertion now, not a comment. `lib/tokenModel` gained a `medium`
  argument, so the printed cascade can be resolved the way the screen one already
  could: on `print` the `@media print` block wins, and `colors.css`'s
  `@media screen` dark palette — 216 values print.css therefore never has to
  copy — is what gets set aside instead. `styles/tokens.test.ts` holds four
  things against it. Every dial resolves to one value whichever mode the page was
  in; that value is the light theme's, bar two paper tunings named in the test
  with their reason (`--surface` and `--elevation-step`, because light's `0.995`
  ground leaves the elevation ladder no room above it and on paper the plates
  have to read as plates); the tunings are exactly those two; and nothing is
  restated that the dark theme does not take over.

  None of it counts entries or names the dials the block should hold. A dial
  added to the theme files at differing per-theme values is inside the first rule
  the day it is added, which is the one thing a count of thirteen could never do.

- 92b7f97: The derivation layer converges on the copy the deployment runs, and the surface
  hue is a dial rather than a leak.

  `styles/semantic.css` exists twice — once here and once in the deployment
  imported from this package — and the two copies had drifted 161 lines apart
  after the four authored knobs moved into the theme files. Most of that was
  prose, and prose is a real difference to a byte-for-byte drift gate. Two of the
  differences were not prose, and both are settled here.

  **The ink on the filled control flips on the fill's own lightness.** The
  deployment derived `--primary-foreground` from a per-theme constant, which
  produces near-black ink in both modes and is correct only for an accent that
  happens to be light in both. Measured across the accent range at that
  deployment's hue and chroma, the fixed ink falls to 3.19:1 at L 0.45 and 1.11:1
  at L 0.15 — black text on a black button, failing silently, the same shape as
  the warm-grey surface defect. The flip this file already used holds above
  3.43:1 everywhere and is now the mechanism on both sides. Its own weak point,
  accepted rather than hidden, is that 3.43:1 at L 0.60, just under the
  threshold: clear of the 3:1 floor for UI and large text, short of 4.5:1 for
  body. The comment beside the derivation says so.

  **`--surface-hue` is declared in `styles/themes/dark.css`, and the default in
  `styles/semantic.css` is gone.** The dark theme did not restate the dial, and
  what that MEANT was already the warm `34` from the light file — its selector
  list opens on a bare `:root`, so with nothing later to take it back the dark
  surfaces ran on light's hue, and semantic.css's `var(--hue)` default could
  never win under either theme. Writing `34` down in the dark file changes
  nothing about what renders and turns that leak into a decision; the unreachable
  default then has nothing to defend and goes. Every custom property declared
  under `styles/` was resolved in both themes before and after through
  `tokenModel.resolveValue`: 628 names, zero moved.

  The file also gains the annotation chrome's ink ladder — ten rungs of the same
  absolute white the canvas annotation layer already spells at nine alphas, plus
  the plate's own backing — so that a strength on that bar has a name to be
  reached by. Nothing consumes them here yet; moving the call sites onto them is
  its own change.

  `styles/tokens.test.ts` counts `--surface-hue` among the dials that must be
  declared in both theme files and resolve to a number in each. It is not among
  the mode-invariant ones: a theme picks the neutral ramp's hue, and two themes
  may pick differently.

  `lib/tokenModel.test.ts` restates its liveness example as a property.
  `--colors-white` was the whole example of a name a stylesheet-only scan would
  call dead, and the ink ladder now reads it from a stylesheet; the rule now
  asserts that some declared name is read from source and from no stylesheet,
  which is the fact that was ever load-bearing and survives the next ladder.

- bd8617d: The same-column detour test cites no issue number, so it can be held identical
  across both repositories that read it.

  Its header opened by citing a bare number for the arrowhead bug it was written
  for. That number addresses a different ticket in each repository — here it
  belongs to the release tooling — and the deployment's drift gate refused to
  enrol the file for exactly that reason. The engine the file tests is enrolled,
  so the implementation was held to one copy while the test pinning its head
  direction was not, and could drift.

  The citation is replaced by what it stood for, named in prose: the bug where a
  detoured connector's head pointed the wrong way, measured at eleven arrows on
  one board of a deployment built on this template. Comment-only; the test's
  behaviour is unchanged.

## 1.12.5

### Patch Changes

- 34e8200: A detoured same-column arrow stops pointing its head backward along the time axis.

  Two cells in one step column but different lanes are joined by a vertical
  connector. When another card sits between them the straight run would strike
  through that card's text, so the route brackets out through a column gutter
  instead: out of one card's side, along the gutter, and back into the other
  card's matching side.

  Which gutter it took was decided by reach — the nearer one won. That meant the
  head's direction was decided by reach too. A side-on arrival out of the RIGHT
  gutter draws its last stub leftward, and the markers are `orient="auto"`, so
  the head followed that stub and pointed backward along a grid whose one
  ordering claim is that time runs left to right. A same-step connector does not
  move in time at all, so that head was a plain lie about the dependency. It was
  also inconsistent with the connector's own undetoured form, which ends
  vertically with the head pointing down or up. Measured on one board of a
  deployment built on this template: eleven arrows ended with a leftward final
  segment, on a path containing no backward dependencies whatsoever.

  An arriving end now turns back into its card VERTICALLY where there is room —
  onto the edge facing the other cell first, so the head reads exactly as the
  undetoured connector's does, and onto the far edge as a second chance, where a
  head pointing the other way up still says nothing false about a horizontal
  ordering. A departing end carries no head and still leaves side-on, which is
  what made this route preferable to leaving through an edge another card leans
  against.

  Where both horizontal edges are walled in, the arrival falls back to the side
  entry it always used, and the gutter preference changes to make that fallback
  safe: the LEFT gutter now wins outright rather than the nearer one, because its
  stub always travels forward. The nearer gutter was at most a fraction of a
  column gap closer.

  The new legs are swept for clearance as they will actually be drawn.
  `isSameColumnSideRouteClear` only ever covered the mid-height stubs and the
  stretch of gutter between them, and a vertical arrival leaves the gutter
  somewhere else — an arrival on the far edge leaves it beyond the pair
  altogether. When that sweep is not clear the pair falls back to the two side
  stubs, which the route's own test does cover.

  With both ends side-on the path is the one this builder has always drawn, point
  for point, and the undetoured vertical connector is untouched.

  **This is a narrowing, not a proof.** Where the right gutter is the only route
  and both horizontal edges are walled, the fallback still draws a backward head:
  six connectors in the golden geometry snapshot end that way, all in the
  `integrated` view mode, in S3, S5 and two each in S6 and S10. They passed
  before this change and pass after it — the snapshot was never in its scope.
  Refusing to draw them was tried and rejected, because it removes the six
  arrows along with the six heads, and a plain A→B→C chain silently losing both
  its connectors is worse than a head that leans the wrong way. Giving a walled
  cell somewhere to land is issue #250.

- 1639de9: The radius dial is declared in both theme files, not one.

  `--radius` was declared in `styles/themes/light.css` and nowhere else. It
  reached dark mode anyway, because that file's selector list opens on a bare
  `:root`: everything in it applies under `.dark` too, and dark never took it
  back. The corner radius was therefore correct in both modes for a reason
  nobody wrote down, and one that reads the same as a mistake.

  The same mechanism has already shipped a defect here. `--surface-hue` is
  declared only in the light file, so the warm `34` it carries is what every dark
  surface runs on — invisible today because `--chroma` is `0` and every surface
  is an exact grey whatever the hue says, and documented in
  `styles/themes/dark.css` only after `tokenModel.resolveValue` corrected the
  claim the comment there used to make. A mode-invariant value parked in the
  leaky spot is the next one of those waiting to happen: it looks deliberate
  from the light file and is unreadable from the dark one.

  `styles/themes/dark.css` now declares `--radius: 0.625rem`, the value the light
  file has always carried, so both files answer the question and the selector's
  behaviour stops mattering for it. That is the rule `--hue` already follows — it
  is stated identically in both files, and both say in a comment that it is
  mode-invariant. Nothing about what renders changes: radius resolves to
  `0.625rem` in either theme, before and after, and print is untouched because
  `styles/print.css` restates thirteen dials and radius is not among them.

  `styles/tokens.test.ts` gains the invariant behind that arrangement. A
  mode-invariant dial is one whose own theme file wins in its own theme — so
  removing `--radius` from either file fails, because the survivor would then be
  leaking across to cover for the missing one, which is the arrangement the rule
  exists to forbid — and the two declarations must resolve to the same value.
  `--hue` and `--radius` are the two named today, and a third is a string. It
  replaces an assertion that only asked whether light declared radius at the
  root, which the leak satisfied.

## 1.12.4

### Patch Changes

- 8ef645f: Shared files cite no repo-local identity: 116 issue, ADR, migration, docs-path
  and plan citations across 62 files are replaced by what they were standing in
  for. `erdValueSets` no longer defaults its `source` to one repository's ERD path.

## 1.12.3

### Patch Changes

- 5ae8d0f: The cancellation block that never reached our cancellation is removed.

  `readLifetime.test.ts` had a `query cancellation` block, and it tested nothing
  of ours. It built a raw `QueryObserver` with a `queryFn` of its own, so what it
  asserted was that TanStack aborts the signals it hands out — a library
  guarantee, held whether or not `useSupabaseQuery` passes one on. Reverting the
  read-lifetime port leaves all eleven cases in that file green while the two in
  `useSupabaseQuery.test.tsx` fail on `seen?.aborted`, which is the difference
  between a test that reads as covered and one that is.

  Two cases are deleted and nothing replaces them here: both properties — the
  consumer that leaves, and the read superseded by a key change — are already
  asserted through the hook in `useSupabaseQuery.test.tsx`, where taking the
  signal away makes them fail. Rewriting them against the hook would have been a
  second copy of that file, which is its own defect.

  The rest of `readLifetime.test.ts` is untouched and still bites: the deadline
  that aborts the request it bounded, the timer that does not outlive the answer,
  the caller's own cancellation, the one retry a timeout is worth, and the cache
  retention. Both file headers now say which file owns cancellation, so neither
  claims TanStack's guarantee as ours.

- 430f60c: A shared file names the catalog decision instead of numbering it, so
  `useStakeholders.ts` can be byte-identical in a deployment that numbers the
  same ADR differently.
- 3ce29fb: The lane roster gets its reader, and the jargon lint stops naming a retired
  role.

  `BLUEPRINT_LANE_ROLES` was exported and read by nothing, beside a palette test
  that retyped the role-to-family pairs by hand. The pairs are now read off the
  `[data-blueprint-lane]` rules, so what is measured is what is drawn, and the
  completeness check in `palette.test.ts` compares the selectors it parsed
  against the exported roster rather than counting them — for touchpoint tones as
  well as lanes. A count of nine cannot tell nine roles apart from nine typos; a
  selector renamed out of the vocabulary now fails instead of quietly rendering
  an unstyled row.

  `skills/audit/references/check-jargon-lint.md` told a model auditing someone's
  blueprint that `journey_stage` labels render as headers. `journey_stage` is not
  one of the eight roles `lanes_lane_role_check` admits, and the thing that
  renders as a header is a phase. The note now says so, and adds what the file
  left out: a phase is not a lane, so the lane-role test in the next sentence
  does not reach one.

  The bump is a patch. Nothing here renames a skill, a reference filename, a
  schema filename, an agent, a hook event or an agent tool — the identifier lane
  semver is scoped to. `check-jargon-lint.md` keeps its name and its place; only
  what it says has changed, and a reference document's content is not part of
  that contract.

## 1.12.2

### Patch Changes

- b0e9d12: A read that outlives the thing that wanted it is cancelled, not merely ignored.

  `useSupabaseQuery` now hands its fetcher an abort signal alongside the client,
  and every read passes it to the request (`.abortSignal(signal)`). Leaving a
  view, or changing a query's key, ends the request it started instead of leaving
  it on the wire to arrive, be parsed, and be dropped — on the connection that
  was already too slow, which is the connection that could least afford it.

  The deadline underneath changed shape to make that possible.
  `raceSupabaseQuery` was a `Promise.race` between the request and a timer, and
  racing only decides which answer the caller sees: the loser stayed in flight,
  and nothing cleared the timer, so a request answered in 200ms still held a
  ten-second one. `withSupabaseTimeout` runs the read under a real deadline,
  aborts it when the deadline passes, chains in the caller's own cancellation,
  and clears up after itself. It throws a named `SupabaseTimeoutError`, which is
  what lets `queryClient` tell "this attempt was too slow" — worth one more —
  from "the database said no", which would answer the same however often it is
  asked and is still not retried.

  `awaitOrAbort` covers the one read that cannot take a signal.
  `findFirstServiceId` shares one in-flight promise between callers, so
  cancelling it would cancel the lookup everyone else is awaiting; wrapping the
  _wait_ rather than the _lookup_ lets a caller stop waiting without stopping the
  request. Without it the deadline aborted a controller the shared request never
  saw, and a read that was supposed to be bounded sat in `loading` until the
  network answered.

  The tests assert the behaviour, not the plumbing. That a fetcher is handed an
  `AbortSignal` is a fact its type already states; that abandoning the read ENDS
  it is the thing worth failing on, so every fetcher in
  `useSupabaseQuery.test.tsx` answers only when it is cancelled — against a
  wrapper that hands it nothing, the read hangs and the case reports that the
  abandoned request was never cancelled. `readLifetime.test.ts` covers the pieces
  underneath and `service.test.ts` covers `awaitOrAbort`.

  Six hooks — `useEvidence`, `useScenarioPaths`, `useScenarioSpec`,
  `useSliceScenarioId`, `usePhaseSpec` and `useStepSpec` — differed from their
  copies in the deployment this kit was generalised from by this and nothing
  else, and are now byte-identical to them. Four more (`useOwnerTags`,
  `useLaneSpec`, `useStakeholders`, `useCellDeepLink`) are down to prose written
  in that deployment's vocabulary, which is the one class of difference where
  this side is the general one and the fix belongs on the other.
  `useArchiveAvailable` and `useServicePhases` keep their own forks: the archive
  probe names the relation this template's schema actually carries, and the
  service resolution moves as one coordinated switch across several fetchers or
  not at all.

  `references/adapter-contract.md` says deadline rather than race, and asks a
  replacement backend to accept a cancelled request rather than complete it.
  Nothing here touches a skill name, reference filename, schema filename, agent
  name, hook event or agent tool name, so it is a patch.

## 1.12.1

### Patch Changes

- 79d8cf7: A cell's status is editable from the panel, and its revert restores it.

  `StatusSelect` has been in this tree for a while with nothing wired to it. The
  control existed, `entityStatus.ts` held the six-rung ladder, `cells.status`
  carried the value, the board drew the dashed edge for an unbuilt cell — and the
  one governed vocabulary on the board was still the one thing an author could
  not set. The panel's cell form now carries a Status field between Summary and
  the owner pair, which is where the reference table already said it belonged.

  `CellContentUpdate` gains `status`, and it is required rather than optional
  because `previous` is that same type: `updateCellContent` records `previous` as
  the change's inverse, `executeRevert` replays it as an ordinary update, and a
  `previous` missing one field is a revert that restores four and reports "taken
  back" — a write that succeeded and did less than it claimed, which is the one
  failure the ledger's row-count guard cannot see. Required makes omitting it a
  compile error. `cellPanelEditorStatus.test.tsx` asserts the whole inverse, not
  just its new key: the status in it has to be the one the cell held when the
  form opened.

  No migration. `cells.status` and its `grant update (status) ... to
authenticated` both landed with `21000125000000`, whose comment names "the
  three columns the editors that follow will write" — this is one of those
  editors arriving.

  The editor reads the status off the board rather than off `useCellContent`. The
  board query already selects the column, the normalizer already maps it and
  `entityStatusContract.test.ts` already holds both of those true, so the value is
  in memory before the panel opens and a second per-cell read would pay a
  round-trip for it. Where the board does not hold the cell there is no row to
  read anywhere — the sample-content board, where the editor renders nothing for
  an existing cell — and the fallback is the column's own default rather than a
  guess.

  The agent's `update_cell` reads `status` and hands it straight back. The tool
  takes no status argument and this does not give it one: an edit to a cell's
  wording that quietly marked a proposed surface live would be the sentence the
  agent never said out loud. Widening the tool is a separate decision about the
  agent's surface, and would be the change that moves the version — this one
  touches no skill name, reference filename, schema filename, agent name, hook
  event or tool name, so it is a patch.

- 3fb7818: The default deployment config inlines nothing, so a deployment forks one small
  file instead of a large one.

  `asbDefaultConfig` read its wordmark from a constant and omitted the accent
  entirely, which meant an installation wanting either had to fork
  `src/deploymentConfig.ts` — a module whose resolver, merge rules and reasoning
  it has no quarrel with. `src/config.ts` now carries a `Brand` type and a `BRAND`
  constant beside `ORG_NAME`, and the default reads `{ brand: { name: ORG_NAME,
accent: BRAND.accent }, content: { workspaceTitle: coverContent.title } }`. The
  file to fork is the small one that already exists to be forked.

  Nothing repaints. `coverContent.ts` omits `title` on purpose and `BRAND` ships
  no accent — this kit's `--brand-*` ramp is greyscale, so there is no hue for one
  to be — and both `present()` and `applyBrandAccent` treat an absent value as
  nothing to say. The wordmark still resolves to `ORG_NAME`, which the rendered
  navbar and the whole-app render both assert.

  `applyBrandAccent` takes the shared `Brand` and defaults the block to `BRAND`,
  so a host's bootstrap can set the dial before React exists. The module had no
  test; it has one, and the first assertion is that this template writes no dial
  at all.

- d017da6: Three of the twelve differing hooks converge, and the other nine are held by
  three named things rather than by drift.

  Twelve files under `src/hooks/` differ from their copies in the deployment this
  kit was generalised from by fewer than twenty lines each, which reads like
  drift. It is not. Roughly eighty of those hundred-odd lines are a single
  unported feature appearing once per file, and most of the rest are differences
  that cannot converge at all while they stay where they are.

  **What converged.**

  `useScenarioPaths.ts` the embedded-resource alias goes.
  `scenario:scenarios(name)` and `scenarios(name)`
  fetch the same row through the same embed, and the
  alias only renamed a key this file casts anyway.
  Every other hook that embeds a parent names the
  relation plainly.
  `useSliceScenarioId.ts` the cache key is sorted before it is joined. The
  lookup is `.in('id', …)`, which answers the same
  scenario for any permutation of the same ids, so
  reordering a slice's frames used to mint a fresh
  key for an answer already held — a round trip, and
  a second entry kept beside the first. `sliceScenarioKey`
  is exported, as it is there.
  `useServicePhases.ts` a doubled word, with three more of the same
  artefact fixed alongside it in `useSlices.ts`,
  `lib/service.ts` and `CreateSliceSheet.tsx`. The
  journey-to-service rename replaced the word in a
  phrase that already carried it, and one of the four
  is an error message a slice author can hit.

  **What holds the other nine, in three groups.**

  _The read lifetime._ Every one of the twelve passes an abort signal into its
  request — `async (client, signal)` and `.abortSignal(signal)` — because there
  the query wrapper hands the fetcher one. Here it does not. That contract is
  `useSupabaseQuery.ts` plus `lib/supabaseFetchTimeout.ts` (a `Promise.race`
  becomes a real deadline that aborts the request it bounds, and a named timeout
  error), `lib/queryClient.ts` (which retries that error and not the others),
  `lib/service.ts` (`awaitOrAbort`, so a caller can stop waiting on a shared
  lookup without cancelling it for everyone else) and `useCanvasBlueprints.ts` —
  six files, none of them in this cluster, two of them fifty lines apart on their
  own account. It is its own piece of work and wants its own ticket; until it
  lands, no hook in this cluster can be byte-identical, which is why three of the
  twelve converged and not twelve.

  _Prose written in a deployment's vocabulary._ `useOwnerTags.ts`,
  `useLaneSpec.ts` and `useStakeholders.ts` illustrate their arguments with that
  deployment's own party names, and `useCellDeepLink.ts` describes its share link
  in terms of that deployment's bot, channel and documentation path. This side is
  the general one and should stay so — the fix is on the other side, and it is
  the only class of difference here where the template is ahead. `useStakeholders.ts`
  also cites the catalog decision by number, which is ADR 3 here and a different
  number there; a citation that cannot mean the same thing in both copies has to
  be the template's number in both, or not a number at all.

  _A schema this template does not have._ `useArchiveAvailable.ts` probes for the
  recovery archive before any delete affordance ships. The probe names
  `deleted_structure` here because that is the table `portable-core.schema.sql`
  carries and the one the delete functions write to; there it names a `trash`
  view over an authoring-change log that replaced it. Taking the newer name would
  make the probe answer no on every database this template can build, which is
  the exact failure the hook exists to prevent. It converges when the migration
  does, and not before.

  `useEvidence.ts`, `useScenarioSpec.ts`, `usePhaseSpec.ts` and `useStepSpec.ts`
  differ in nothing except the abort signal, so they converge in full the day the
  read lifetime does.

## 1.12.0

### Minor Changes

- 7757f0e: The App is mountable: `App({ config })` and a typed `DeploymentConfig`.

  A deployment of this template mounts the whole app rather than forking it:
  `import { App } from 'uno-blueprint'` and render it with a
  `DeploymentConfig` — `brand` (name, logo, accent), `content` (workspace and
  cover titles) and a reserved `agent` section. Missing keys resolve to the
  template's own defaults, so a config of `{}` is the standalone app, and the
  resolved config never aliases the host's object.

  The default export and the standalone entry are unchanged; the named export
  is additive. `package.json` gains an `exports` map — `.` (with a `types`
  condition), `./styles.css` for the stylesheet the host imports, and a `./*`
  wildcard so every deep path a skill or script already resolves keeps
  resolving.

  Consumed as source for now: a git install, resolved by a bundler that
  understands this repo's `@/` alias and Vite's `import.meta.env` and `?raw`.
  A built distribution that has resolved those at build time is the follow-up.

- 7757f0e: The two declared fork seams become configuration, and the App tree gains four
  things a deployment had been carrying alone.

  `STORAGE_PREFIX` was a constant a deployment edited in place; it is now an
  initialisation call, so the namespace is set rather than patched. Reference
  documents are a registry a deployment adds to rather than a list it respells,
  and the accent and the wordmark read the config — the wordmark through
  `content.workspaceTitle ?? brand.name ?? ORG_NAME`, so a workspace's own name
  can no longer end up on another service's board.

  The fourth question — whether mounting also needed a composition seam, since
  a config object cannot express a provider tree — is answered no. The four
  providers a deployment had been carrying were not deployment-shaped:

  - the slug now resolves to a service and the URL says which one. The route
    parser, the store and the resolver were already here; nothing closed them.
  - a comparison built in one scenario no longer follows the reader into the
    next.
  - a write that did not land says so. All four failing write paths ended in a
    `console.error` and read to the user as success.
  - the provider tree writes down its own order, in bands — a band may read the
    bands outside it, never the ones inside — with the three forced edges named
    individually. The write-failure notices sit outside the error boundary on
    purpose, and a test reads the source to keep them there.

  `App({ config })` is therefore sufficient, and no extension point was added
  for a difference that was not one.

### Patch Changes

- 9ef7112: A partner lane is drawn as a partner lane, and the fill map stops disagreeing
  with the constraint.

  `ROLE_STYLES` carried `journey_stage` and `physical_evidence`, neither of which
  `lanes_lane_role_check` admits, and had no fill for `partner_actions`, which it
  does. So a partner lane fell through to a zone fallback — and both fallbacks are
  the support fill, which is why a party outside the service was drawn as one of
  its own support teams.

  There is now a ninth lane fill, `partner-action`, on the gray family: the only
  one neither a lane, a touchpoint tone nor a path draws from. It states all seven
  cell state properties and is measured for contrast in both themes like every
  other fill.

  `ROLE_STYLES` was the fourth copy of the lane-role roster and the only one
  nothing held. `scripts/tests/lane-role-roster.test.mjs` now holds it too, by set
  equality, so a dead key and a missing canonical role both fail.

## 1.11.0

### Minor Changes

- 13be7b2: The cell-detail panel takes one lane resolution and a real placement editor.

  Three lookups become one `laneResolution`; the panel gains an identity block, a
  labelled Touchpoint field with its role badge, and a labelled Summary in place of
  bare prose held up by a negative margin. `hasRealPlacement` widens, and a defect
  came out with it: the old resolution set `backgroundColor` to a role key rather
  than a colour, so the new-cell badge had rendered untinted since it shipped.

  The editor gains the placement block — summary, role, resources and re-link —
  with the save order after `sync_cell_touchpoints`, now pinned by a test.
  `updateTouchpointPlacement`, `updatePlacementResources` and `setFeaturedResource`
  had been here with no caller at all: writable only by a revert.

  The vendor-specific preview affordance is gone, along with the synthetic row it
  put in the resources tab, and `blueprintTechDescriptions.ts` with its last
  caller.

  The merged compare grid and the path band converge, and
  `buildComparePathShortLabels` retires — dead in both repositories, with a
  contract test already asserting the grid uses full path names.

  One accessibility fix rides along: `BlueprintStepStoryboardProps` never declared
  `aria-describedby` though its caller passes one, and TypeScript does not
  excess-property-check hyphenated JSX attributes, so a storyboard cell in a merged
  grid had never announced its path membership.

## 1.10.0

### Minor Changes

- 26b9095: A rename moves the word in every cell, and the registry gains its first writer.

  The registry has been readable since `21000120000000` and writable in every way
  but one: nothing could change what a touchpoint is CALLED. This adds the write,
  and the reason it is a database function rather than a loop in the client is
  the defect that comes with it.

  `cells.content` is the list of names an author types, and a content save
  re-derives placements from that text. Move the registry row alone and the next
  edit to any affected cell hands `sync_cell_touchpoints` the stale name: the
  renamed placement is not wanted, its registry link is taken away, and a fresh
  entry appears under the old name in its stead. The rename undoes itself one
  save later, which is the drift this package exists to end, arrived at from the
  other direction.

  `21000202000000` adds two functions. `rename_content_item(text, text, text)` is
  `immutable` and pure: it tokenises a delimited content string, keeping the
  delimiters, and replaces only the item that IS the old name — so renaming
  `Zoom` leaves `Zoom Recording` untouched, and the author's spacing survives
  verbatim. `rename_touchpoint(uuid, text)` moves the registry row and every
  bearing cell's text in one transaction, decides WHICH cells from the placements
  rather than from a text search, and refuses to finish if any bearing cell still
  names the old value. It returns the previous name and the cells it rewrote, so
  the caller can record an inverse that restores both halves. Both are
  `security definer` behind `is_service_account()` and granted to
  `authenticated` only, the same posture as every other placement function.

  `src/lib/touchpointMutations.ts` is the client half, ported from a deployment
  built on this template, where both halves have been live since 2026-08-30. It
  carries `renameTouchpoint` and, for
  the other scope of the same subject, `updateTouchpointPlacement` — what an
  author has to say about a tool AT ONE CELL. That writer needs
  `update (summary)` on `cell_touchpoints`, which `21000119000000` granted for
  `role` and for nothing else; the grant lands in the same migration as the
  writer, because a write surface with no writer is a row every posture check has
  to account for before any mutation touches the column.
  `cell_touchpoints_update_service_only` still stands over it, so this widens
  which COLUMN an author may write and not who may write one.

  The placement write UPDATES and can never insert, which is what keeps it from
  routing around the touchpoint-bearing gate inside `sync_cell_touchpoints`, and
  its inverse is captured as column values rather than as form strings, so an
  undo can reach imported data an input validator would refuse.

  `rename_touchpoint` and `update_touchpoint_placement` join `WriteFn`, and
  `restore_touchpoint_placement` joins the revert. `touchpointRename.test.ts`
  ports both functions into a model and opens with a RED case that drives it with
  a registry-only rename, so the tests that follow cannot be passing against a
  model unable to exhibit the bug.

- c6506bb: The editor shell and the touchpoint tone converge.

  `EditorShell.tsx` is byte-identical with the deployment it was generalised from
  for the first time since the fork: the aside model is in flow at every width,
  `railOnly` is `asideHidden`, the sidebar carries a `collapsedByReader` binding,
  and `onToggleAgent` is split from `onSelectPanel`. `shellContext.ts` arrives with
  `describeSidebar`, a second error boundary wraps the active tab, the collapsed
  navbar gains a path selector, and `sidebarCollapsedContext` is guarded by a
  per-mount owner identity.

  The mobile canvas question had two answers here and neither covered what the
  other did — one gate withheld the phase frame's opener while a second
  `useMobileShell()` ran for the scenario panels. There is one gate now, at the
  view, travelling down as an optional prop, and the contract test asserts the
  overview holds no `useMobileShell` at all.

  A touchpoint carries its tone and answers to more than one name:
  `touchpoints.tone`, `touchpoints.aliases` and `scenarios.note` arrive as
  columns, and the colour resolver that reads them — registry, then a generic
  seed, then a deterministic hash — is now one file shared with the deployment.

### Patch Changes

- c6506bb: Four of the agent loop's smaller files converge, and the tool lane stops being
  a layer.

  `attachments.ts`, `role.md`, `sessions.ts` and `providers/openai.ts` are
  byte-identical with the deployment. `layer` was the retired spelling in both
  repositories' vocabulary lists and this one already said "tool lane" elsewhere,
  so that was internal drift rather than a fork.

  `sessions.ts`'s comment now carries both repositories' reasons for reading the
  session store rather than the table — the security history one side remembers
  and the no-database case the other does — each stated without naming a column,
  because the schemas fork there.

## 1.9.0

### Minor Changes

- 2facf2e: A lane role is refused where the author can still fix it, not by a constraint
  mid-import.

  Two documents in this repository said opposite things, and both said them
  deliberately. `references/ir-schema.json` and `scripts/validate_ir.py` took any
  lane role matching `^[a-z0-9][a-z0-9_]*$` — the schema is an authoring contract
  and did not want to be a taxonomy. `references/lane-roles.md` and the
  `lanes_lane_role_check` constraint closed the set at eight. So a document
  validated and was then refused on import, and the refusal arrived as a Postgres
  constraint violation rather than as anything the authoring tools had said
  (#204):

                                                                                                                                                                                                                                          ERROR: new row for relation "lanes" violates check constraint
                                                                                                                                                                                                                                          "lanes_lane_role_check" … compliance_review

  That error at least names the value. Meeting it after validation has passed is
  the wrong moment.

  **The schema closes.** Of the three answers — close the schema, open the
  constraint, or document the gap and live with it — closing is the one the rest
  of this repository already assumes. The constraint, the `lanes.lane_role`
  column comment, `docs/erd.mmd` and `references/lane-roles.md` all state the set
  as closed; `lane_role` is read as exhaustive by code that switches on it, so
  opening the column would have meant auditing every such reader for a value none
  had ever seen. Closing costs one bump and a step.
  `references/ir-schema.json` now carries the eight as an `enum` on
  `$defs/lane.properties.role`, `null` included, and `scripts/validate_ir.py`
  errors on a ninth with the offending value, the lane carrying it, all eight
  legal values and the fact that `null` is the answer for a lane none of them
  names.

  **⚠ BREAKING for anyone holding an IR file with a role outside the eight.** IR
  schema version `2026.09.10`, and `python3 scripts/migrate_ir.py <ir-file>
--workspace blueprint-workspace.json --write` carries a document across it.
  `to_2026_09_10` nulls a role outside the set — the generic swimlane it already
  drew as, no style of its own and no divider anchored on it, which is also the
  answer `21000122000000` gave the rows it found. The lane's `display_name` is
  untouched, and that is what makes this a reclassification rather than a
  deletion: the meaning of a compliance lane lives in the name a reader sees, and
  the role only ever said what the renderer must do about the row. A role is
  authored content inside a scenario's subtree, so the step is **not
  content-preserving** — the third, after the edge turnaround at `2026.09.01` and
  the rename at `2026.09.08`. Watched per scenario as those are: a scenario
  holding a nulled role keeps its recorded hash and reads as stale until someone
  re-signs it, and a document carrying none — which is every document a target
  ever accepted — hashes identically and re-anchors.

  No migration stamps `2026.09.10`, and none needs to: nothing in the database
  changed, and a target sitting at `2026.09.08` is still one this checkout
  speaks. `2026.09.09` set that precedent — a wire-format bump with no DDL behind
  it — and this is the second.

  **The eight now live in four places, and something holds them together.** The
  authority is `lanes_lane_role_check` in `supabase/generated/portable-core.schema.sql`.
  JSON Schema cannot import a list and neither can a stdlib-only Python script,
  so closing the schema made two more copies of the roster — and a duplicated
  list with nothing holding it is exactly how this drift started.
  `scripts/tests/lane-role-roster.test.mjs` compares the enum in
  `references/ir-schema.json`, `CANONICAL_ROLES` in `scripts/validate_ir.py` and
  `CANONICAL_LANE_ROLES` in `src/lib/laneRoles.ts` to the constraint, set for
  set, off the committed dump — so it runs on every pull request with no
  database, beside the ERD sweep that already holds `docs/erd.mmd` the same way.

  `to_2026_09_08` parked this question on purpose and is unchanged; its docstring
  now records where the answer landed instead of pointing at an open one.

  What moved with it:

  `references/ir-schema.json` the role `enum`; `2026.09.10` at the
  head of the version enum
  `scripts/validate_ir.py` a ninth role is an error, not a
  silent pass; the closed set is
  documented where the file states what
  it checks
  `scripts/migrate_ir.py` `to_2026_09_10`, the carry
  `src/lib/backend/schemaVersion.ts` `2026.09.10` supported and spoken
  `references/lane-roles.md` says authoring refuses a ninth, and
  § Adding a role lists the multi-file
  act that adds one
  `references/customization.md` § Lane roles no longer advises minting
  an org-defined role
  `skills/map/…/translate-playbook.md` a foreign lane the eight do not name
  maps to `null`, keeping its own label
  `skills/map/…/crosswalk-schema.json` the `custom_role` disposition is
  `generic_lane`
  `skills/map/…/elicitation-protocol.md` non-spine actors get `null`

  Proven by `scripts/tests/run_tests.sh`: `validator-bad4` asserts the refusal,
  `validator-bad4-message` asserts the message says everything the author needs
  to fix it without opening another document, and § 8c carries a `2026.09.07`
  document holding five retired spellings AND one role from outside the set —
  the first five renamed by `to_2026_09_08`, the sixth nulled by
  `to_2026_09_10`, its display name intact.

- 504684a: A touchpoint names its owner.

  `21000131000000` made the touchpoint registry the deployment's and wrote its own
  promissory note in the header: "A touchpoint will carry a `stakeholder_id` — its
  owner. […] The link waits for both ends to be the deployment's, and after this
  file they are." Both ends are, so `21000201000000` adds the link.

  `touchpoints.stakeholder_id` is a nullable `uuid` referencing
  `public.stakeholders (id)`, with `touchpoints_stakeholder_id_idx` beside it and
  `update (stakeholder_id)` granted to `authenticated` in the recipe half. Null is
  the ordinary state, not a gap: `sync_cell_touchpoints` mints a registry row from
  a cell's text with no owner at all, and "nobody has said yet" is what that row
  means.

  The delete action is `set null`, which is where this file deliberately parts
  company with the deployment it generalises. The deployment writes the reference
  with no delete action — NO ACTION, so removing an actor who owns a touchpoint is
  refused — while `lanes.stakeholder_id` in `21000125000000` already committed
  this template to the opposite rule, in as many words: "an actor taken out of the
  cast un-names its lanes rather than pinning itself." Carrying the deployment's
  shape across would leave the cast holding two contradictory opinions about what
  deleting an actor means, un-naming lanes and refusing touchpoints in the same
  breath. One rule, applied to both things that reference the cast. The migration
  asserts the delete action rather than merely describing it, so the choice cannot
  quietly drift back.

  Nothing authored moves. An IR describes one service and has never had a field
  for who owns a tool, so `registryTouchpoint` is unchanged and the schema version
  stays where `21000122000000` left it — the stance `21000123000000`,
  `21000130000000` and `21000131000000` each took. Both seed generators write
  `(id, name, kind, summary, url, origin)` and are unaffected by a nullable column
  they do not name.

  The ERD, `references/data-model.md` and the Supabase connector's column table
  gain the column and the `stakeholders |o--o{ touchpoints` edge. While there,
  `references/data-model.md` loses a stale `services ||--o{ touchpoints : "registry"`
  edge that `21000131000000` should have taken with it when it dropped
  `touchpoints.service_id` — the ERD had already been corrected, and the two
  diagrams disagreed.

- de07cfc: The compare header row leaves the path frame, and the panel takes the
  deployment's fixes.

  `COMPARE_HEADER_WRAP_EXTRA_INSET` and its three call sites are gone: the
  step-header row stays outside the frame, visible, which is the settled answer to
  a question the layout had been carrying both ways. `ResizableComparePanel` gains
  a layout-effect measure, two state-identity bails, drag teardown on one pointer
  with `pointercancel` and unmount, a locked-only estimate floor and opacity-only
  dimming; `ScenarioBlueprintPanel` gains the memo split and a completion-aware
  jump summary. `MergedSectionFrame` takes the rail-outside geometry.

- de07cfc: The reference specifiers and the storage prefix become declared forks.

  Two things could never be the same in this kit and in an app built from it: where
  the agent's reference documents are resolved from, and the prefix on every
  localStorage key. Each is now a small module of its own —
  `src/lib/agent/tools/referenceDocs.ts` and `src/lib/storageNamespace.ts` — so the
  large files above them stop diverging over it. `read.ts` keeps its drift throw and
  its reader and knows nothing about resolution; every storage key is emitted by
  `storageKey(name)` and is byte-for-byte what it was, so nothing stored in a
  browser needs migrating.

  The extras array that adds a deployment's own reference document is a third leaf,
  `referenceNamesExtra.ts`, rather than living in `referenceDocs.ts`: the eval
  harnesses bundle `specs.ts` with rolldown rather than Vite, so there is no `?raw`
  loader on that path and one import would have broken `agent:harness`.

### Patch Changes

- cbc06fb: The last style guard takes the token model, and the widening finds what the
  shape predicts.

  `src/lib/tokenDiscipline.test.ts` was the one guard ADR 6 left on a reader of
  its own: it walked `src/components/**.tsx`, 185 files out of 399, so anything a
  class string said in `lib/`, `hooks/`, `contexts/`, `content/`, `types/` or
  `dev/` was outside every style rule in this repository. It reads
  `tokenModel` now, which means it reads the whole tree, and widening the sample
  once widens every rule that asks.

  Two defects were sitting in the unread part. `lib/filterToolbarButton.ts`
  carried `border-border/60` and `border-border/50` — the exact pattern the
  neutral-edge rule forbids, in a directory that rule did not look at; both
  states take the named `border-muted` rung now, which is tuned to land on the
  `/60` alpha, so the checked edge is pixel-identical. All twenty-seven hex
  matches in the tree are in `src/dev/`: twenty-one real colours in the dev-only
  `/proto/arrows` instrument, which Vite drops from a production build, and six
  `(#NNN)` issue references in fixture prose. Both files are exempted by name and
  with a reason, and a rule beside them fails if an exemption stops matching, so
  a dead carve-out cannot outlive the thing it excused.

  Three rules arrive with the conversion, and all three found call sites written
  against rungs `styles/theme.css` already declares — the sheet converged with
  the deployment's under #327 S3, so the vocabulary was there and nothing held
  anything to it. Nine bare `rounded` utilities (Tailwind hardcodes 4px there and
  `--radius` cannot reach it) take `rounded-sm`, which is the only one of the
  three that moves a pixel: `calc(var(--radius) - 4px)` against `--radius:
0.625rem` is 6px, so those nine corners round two pixels more and, unlike
  before, follow the dial when it turns. Five bracketed z-indexes take the bare
  integer Tailwind v4 wants, compiling to the identical `z-index`; and four
  font-size literals — `text-[8px]`, `text-[9px]`, `text-[2.5rem]` and
  `sm:text-[2.25rem]` — take `text-5xs`, `text-4xs`, `text-5xl` and
  `sm:text-4xl`, each compiling to the same size it replaced. The two
  `text-[0.8rem]` in `components/ui/` are exempt: `components.json` points the
  shadcn CLI at that directory, so a retune there is deleted by the next
  `npx shadcn add`.

  `stripComments` in `tokenModel` now blanks block comments instead of deleting
  them, and `tokenModel.test.ts` holds it to that. Deleting them collapsed every
  newline in a file's header, so every line number the model reported after it
  was wrong — `dev/ArrowSituationCatalogPage.tsx` opens with a thirteen-line
  header, and its `#2563eb` on line 28 was being reported at line 15, on an
  import. Nothing failed while it was wrong, because a passing rule reports no
  lines at all. A guard that names the wrong line is a guard someone stops
  trusting, and converting this file is what made it start naming lines.

## 1.8.1

### Patch Changes

- 77f5feb: A registry row's id is the deployment's, and its identity is its name.

  `scripts/generate_seed_sql.py` derived a registry row's id from
  `entity_uuid(locale, "registry-touchpoint", f"{service_key}#{name}")`. The
  service key was part of the input, so **two services minted two ids for one
  tool**. That was consistent while `unique (service_id, name)` gave each service
  its own row, and wrong the moment `21000131000000` made the catalog one
  deployment-level pool under `unique (name)`: seeding a second service into a
  target that already held the first was refused by `touchpoints_name_key`, in as
  many words (#201).

  **Two changes, and the second is the one that matters.** The derivation drops
  the service key, so a registry id is deployment-stable — the same identity the
  constraint asserts. And the seed stops treating that id as a lookup key: the
  registry upsert reconciles `on conflict (name)`, and a placement resolves its
  `touchpoint_id` by reading the row back rather than writing a derived id at it.
  A derived id is now only what a row that does not yet exist is **born** with.

  That is what makes two things true at once, and only the second needed working
  out. A second service's seed lands on the row that is already there instead of
  being refused — the model ADR 0003 states, which the seeder could not express.
  And a target seeded **before** the derivation changed stays idempotent: its
  rows keep the ids they were born with, and a re-import updates them in place.

  **No migration, and the reason is worth recording.** The issue proposed a
  migration to remap every existing registry id. It cannot be written. The old
  id is `uuid5(ns, f"{locale}:registry-touchpoint:{service_key}#{name}")`, and
  the database holds neither input: there is no `locale` column anywhere — the
  adapter contract says so under Per-locale artifacts — and the seed writes
  `services (id, name, summary)`, never the IR key the derivation used. A
  template migration could compute neither the id it must find nor the id it must
  write. Resolving by name needs neither, which is why it is the fix rather than
  a way around one.

  **What an import may overwrite.** It wins where it SAYS something and says
  nothing where it was merely minted: an entry the IR never listed arrives as
  kind `other` with no summary and no home — "nobody has judged this yet" rather
  than a judgement — so it does not erase what a curator, or another service's
  IR, already recorded under that name. The merge is `21000131000000`'s own, the
  one it used when it folded each service's rows into the shared pool.

  What moved with it:

  `scripts/generate_seed_sql.py` the derivation, the name-keyed upsert,
  `registry_lookup` and the `Sql` escape
  that lets one column be a subquery
  `references/adapter-contract.md` § 4 states the registry's identity rule
  and the merge, where a reader looking for
  idempotence will find it

  Proven against a local Postgres 17 on this template's own portable core. Two
  services whose IRs name the same tool now seed into one target and share one
  registry row, where the second used to be refused. A target seeded with the
  PRE-change generator then takes the post-change seed twice: one registry row,
  still carrying the id it was born with, one placement resolving to it, and an
  app-curated `kind` and `summary` intact across both runs.
  `scripts/tests/run_tests.sh` adds `seed-registry-id` — two services differing
  only in their key mint one registry id, and the locale is still in the
  derivation, so two locales in one target would not collide — and asserts on the
  emitted SQL that the registry upserts on the name and that no placement writes
  a derived id.

- 77f5feb: A schema version a migration stamps belongs in the list of versions this
  template speaks.

  `21000122000000` stamps a migrated database with `2026.09.08`, and so does the
  generated portable core. The value was never added to the enum in
  `references/ir-schema.json`, to `scripts/migrate_ir.py`, or to
  `src/lib/backend/schemaVersion.ts`. So a target that had run every migration in
  order read as INCOMPATIBLE to `scripts/check-target-schema.mjs` — a check
  written to catch a target that is BEHIND, failing the one that was exactly
  right, for two releases (#197).

  **The step is not an identity bump, and reading the migration is what settles
  it.** `21000122000000` closed `lanes.lane_role` to eight values with a CHECK
  constraint, renaming the roles it retired on the way in. The IR's
  `lanes[].role` IS that column: the schema field says `lanes.lane_role` in as
  many words, and `seed_lane_fields` writes the authored string straight into it
  with nothing in between that normalises anything. A document authored at
  `2026.09.07` may therefore carry a role by its retired spelling, and that
  document now meets a database that refuses the word. `to_2026_09_08` renames
  it — five pairs, transcribed from `scripts/retired-vocabulary.mjs`, which is
  the one list this repository keeps of what a retired word became:

  `frontstage_tech` → `frontstage_touchpoints`
  `backstage_tech` → `backstage_touchpoints`
  `support_systems` → `backstage_touchpoints`
  `visual` → `storyboard`
  `step_visual` → `storyboard`

  A lane's role is authored content inside a scenario's subtree, so the step
  declares itself **not content-preserving** — the second step ever to do so,
  after the edge turnaround at `2026.09.01`. That declaration is watched per
  scenario: a file carrying one of the five keeps its recorded sign-off hash and
  reads as stale until someone re-signs it, and a file carrying none of them
  hashes identically on both sides and re-anchors as usual. Most files are the
  second kind.

  **What the step deliberately does not do.** The migration also sets to null
  every role outside the closed eight, an adopter's own word included; it had to,
  because `add constraint` validates every existing row as it is added. A
  document being carried forward is under no such duress, and at the IR level a
  custom role is still legal — the schema admits any `^[a-z0-9][a-z0-9_]*$`, and
  `scripts/validate_ir.py` passes a role far from every canonical one in silence,
  on purpose. Nulling one here would delete authored content the validator had
  just blessed, and would settle by deletion a question nobody has asked: whether
  the IR closes the set the way the database does. A file that keeps a custom
  role is refused by the target's CHECK, loudly and with the value named, which
  is a better answer than a classification that quietly disappears.

  **Added, never moved.** The stamp sits inside an applied migration and inside
  the generated portable core, and an applied record keeps the spelling it was
  written with. `2026.09.09` stays where it is, so the chain now runs `.07` →
  `.08` → `.09` — ordered, continuous, and still a chain in which each step knows
  only its own predecessor.

  What moved with it:

  `references/ir-schema.json` `2026.09.08` in the enum, and the
  description states why it arrived late
  `scripts/migrate_ir.py` `RETIRED_LANE_ROLES` and
  `to_2026_09_08`; `to_2026_09_09` steps
  from `.08` and records what closed
  the hole it left
  `src/lib/backend/schemaVersion.ts` the version, with the reason
  `references/customization.md` § The versioning rule now records how
  the debt was paid, not only that it was
  owed

  Proven by `scripts/tests/run_tests.sh` § 8c (`migrate-lane-roles`): a
  `2026.09.07` document carrying one lane per retired spelling carries forward,
  validates, lands every role inside the closed set, and leaves the custom role
  beside them untouched. `scripts/tests/target-schema.test.mjs` adds the
  regression the issue was found by — a target reporting `2026.09.08` is
  compatible. `scripts/tests/run_tests.sh` § 8 asserts both hops of the chain
  rather than the one that used to skip.

- 6b8074b: Seven of the eleven non-theme stylesheets become one implementation, and the
  four that do not are all blocked by one thing.

  The deployment this kit was generalised from measures the same stylesheets
  through the same reader now that both repositories share `lib/tokenModel.ts`
  (ADR 0006). That is what made this checkable rather than hopeful: every sheet
  below was compared by what its declarations RESOLVE to at the root under each
  theme, before and after, and no name in either theme changed value.

  **What the template took, and why each was a gap rather than a preference.**

  `base.css` the mono seam, filled. `theme.css` has always read
  `var(--font-source-code-pro, …)` and this package has
  always shipped the face; nothing ever injected it, so
  the seam named in one file was answered in neither.
  `utilities.css` a reduced-motion branch for `delayed-appear`, which
  was the one animated surface in the tree with no
  reduced-motion answer.
  `unset-tw-colors.css` the reset list, corrected. `crimson`, `gold`,
  `tomato` and `scale` are our own family names and
  never Tailwind's, so those four lines cleared nothing
  while stating something false about the framework.
  `compat.css` the alias layer's rules, and one alias fewer:
  `--color-foreground-contrast` sat here at exactly the
  value `theme.css` registers, and `theme.css` imports
  later, so this file's copy could never win. It was not
  an alias at all.
  `animations.css` the `--ease-camera` key beside the `--motion-camera`
  duration that was already here, and the skeleton's
  breath — `animate-pulse` snaps between both extremes,
  which on a panel full of bars reads as flicker.
  `tailwind.config.css` three `@source not` lines. Tailwind scans every
  non-gitignored file from the project root, so a class
  named in a document, a test or a script generates that
  class — including, in a guard that lists the shapes it
  FORBIDS, the very vocabulary it exists to forbid.
  `theme.css` four type rungs the ladder was missing at both ends.

  **Two comments went the other way**, because the template's wording was the
  truer one for a file two repositories share: Ubuntu Sans is the _default_ face
  here, not a brand face, and a fork is told what to swap alongside it.

  **The tests came with the files they pin.** A shared implementation whose test
  stays behind is a shared implementation nobody holds to the same promise, so
  `tailwindColorReset.test.ts` and `compatLayer.test.ts` arrive too — the first
  reads Tailwind's own `theme.css` out of `node_modules` and holds the reset list
  against it in both directions, the second forbids an alias that carries a value
  and an alias shadowing a name `theme.css` already registers, which is what
  keeps the deletion above from coming back.

  `motion.test.ts` moved from a regex over one file to a question asked of the
  token model. Its selector pattern could not read `[data-slot='skeleton']` — it
  stopped at the hyphen and threw on the value — and a guard that names its own
  files only ever covers the surfaces that existed when it was written. It reads
  every stylesheet the entry imports now, so the next animated surface is covered
  wherever someone puts it. `motion.ts` gains `MOTION_CAMERA_EASE` to match.

  One census became an invariant: `tokenModel.test.ts` asserted that
  `unset-tw-colors.css` holds seventeen resets. WHICH families belong there is a
  question with an oracle — the framework's own theme file — and
  `tailwindColorReset.test.ts` now answers it, so the count is gone and the shape
  is what remains.

  **What did not converge, and the single reason three of the four share.**
  `colors.css` and `print.css` differ ONLY in per-deployment brand values —
  seven ramp steps written as literals rather than as indirections through the
  dials in `themes/`, and in `print.css` a block that must restate them because
  `themes/dark.css` sets its own copies with no `@media screen` around them.
  `semantic.css` differs in where three dials live, which is the same question
  seen from the other side. All three wait on the brand seam, which is settled
  separately and deliberately leaves `themes/*.css` each deployment's own.
  `blueprint.css` is the fourth, and it waits on work still open elsewhere plus a
  lane role the template's schema does not carry.

## 1.8.0

### Minor Changes

- 89cc073: A touchpoint belongs to the deployment, and a placement links to one inline.

  **⚠ A column is dropped. Apply `21000131000000` before generating a seed from
  this checkout.** `touchpoints.service_id` is gone and uniqueness moved from
  `(service_id, name)` to `(name)` across the whole deployment. The seed
  generators stop emitting the column, so a seed built here needs a target that
  has applied the migration — the ordinary rule that migrations land before the
  artifacts built from them, stated because this is the first drop the seed
  shape follows.

  This finishes ADR 0003 rather than reversing it. That ADR decided the catalog
  of nouns a journey references is one deployment-level pool and landed only the
  actors: `stakeholders` was born with no `service_id` in `21000125000000`, while
  `touchpoints` kept the service scope it was born with. The ADR's own
  consequences say the tools "make the same move in a later migration", and that
  the argument belongs in the file that drops the column. `21000131000000` is
  that file, and it carries the argument. `CONTEXT.md`'s touchpoint entry
  reverses with it, as that ADR said it would.

  The migration folds before it drops, which is the one place it differs from
  the deployment this template was generalised from. That deployment holds a
  single service, so `unique (service_id, name)` and `unique (name)` were already
  the same constraint over its rows and the column could go outright. A template
  cannot assume that: an adopter may hold several services, each with its own
  "Zoom" row. So every placement is repointed at the oldest row of its name, the
  survivor takes any description it was missing from the rows folding into it,
  and the rest are deleted — licensed by the rule the ADR states, that an
  identical name means the identical thing. On a single-service database the fold
  matches nothing.

  `sync_cell_touchpoints` and `set_placement_touchpoint` are rewritten from
  `pg_get_functiondef` rather than restated, so the three migrations that already
  edited those bodies cannot be reverted by hand; each replacement is asserted,
  and the finished body is swept for the word. The other three placement
  functions never named `service_id` and are untouched, and neither rewrite is
  re-granted — `create or replace` keeps a function's ACL, and the migration
  asserts that in the recipe half rather than re-stating it.

  What moved with it:

  `src/hooks/useRegistryTouchpoints.ts` the read is unscoped; the cell →
  path → scenario → phase join went
  with the column
  `src/types/database.ts` `service_id` off Row/Insert/Update,
  and the relationship it keyed
  `scripts/generate_seed_sql.py` mints a registry row with no service
  `scripts/generate_sample_blueprint.mjs` the same, and upserts the registry
  rather than letting a service delete
  cascade to it
  `scripts/check-seed-loads.mjs` `@registry` is the unscoped read the
  hook now makes
  `references/data-model.md`, the registry is one pool, unique by
  `docs/erd.mmd`, name across the deployment
  `docs/connectors/supabase/database.md`

  **A placement offers its own link to the registry.** `RegistryLinks` — one
  block listing a cell's name-only placements, each a bare select and two
  buttons — is replaced by `RegistryLink`, one card per placement, adopted from
  the deployment this template was generalised from. Two things come with it.
  The card names the placement it is about, so the sentence can say which name
  the registry lacks. And the list is filtered by the names the cell's text
  already shows: offering one of those produced a link the database refuses
  ("that cell already shows that touchpoint"), so the entry is left out of the
  list instead of failing on the click. The ledger write and its inverse were
  already in `src/lib/placementLinkMutations.ts` and are unchanged.

  `Registry` is a new panel label, so `scripts/interface-schema-map.mjs` binds it
  to `cell_touchpoints.touchpoint_id` — the same split `Actor` draws over
  `lanes.stakeholder_id`, where the label is the pool and the name is the pointer.

  The journey read is `list_scenarios` and stays that way. The deployment's queue
  settled the name against `list_blueprint`, which this repository never carried:
  `READ_TOOL_NAMES`, `TOOL_SPECS`, `identifiers.json` and
  `references/canvas-adapter.md` all already say `list_scenarios`, and
  `check:read-surface` holds the document to the set. Recorded here so the
  question is answered rather than open.

- a313930: One arrangement, one membership drawing, one cell face.

  **Components removed.** `SideBySideCompareGrid`, `CompareDivergenceStrip` and
  `CompareZoneBadge` are deleted. A fork that imports any of them, or that
  renders `ScenarioBlueprintPanel` with `fixedSwimlaneBodyHeight`, or that hands
  `ResizableComparePanel` a `chromeBar` / `chromeBarHeight`, has a compile error
  to fix rather than a silent behaviour change.

  **A scenario is one board, drawn at two sizes.** The overview used to lay each
  path out in its own narrow grid beside its siblings, and opening the scenario
  re-laid the same paths out as bands on one step axis. Now a tile is the board
  smaller: navigation changes framing, not topology. The swimlane-body height
  model existed only to make those two pictures agree inside a locked-height
  tile, so `expandRowSpecsToSwimlaneBodyHeight` goes with them and a phase row
  aligns on one panel height.

  **Merged membership reads in full.** A cell's member paths were marked with a
  colour wash and an invented two-letter code, which collided whenever two path
  names began with the same letter. They are a thin rounded outline on the
  cell's own face now — one arc per member path — with the full names disclosed
  on hover and on keyboard focus. `getPathWashStyle` is removed from
  `pathColorTheme`; `CompareCellPathRail` is now `CompareCellPathMembership` and
  has no `label`.

  **A cell face is a fixed size, and it shows its status.** Narrative cells no
  longer measure their own text to size themselves and their lane:
  `NARRATIVE_CELL_HEIGHT` is the canvas face and the complete prose lives in the
  detail panel. `TOUCHPOINT_ITEM_HEIGHT` grows to 52 / 42 so two label lines
  fit, storyboard rows to 176 / 168; `getTextBlockMinHeight` and
  `getMaxLineCountInLane` are deleted. A cell's `status` is threaded through the
  path band and the compare block, so an unbuilt cell stops rendering as a
  shipped one.

  **One name change a fork will see.** `isSupportHandoffLane` no longer falls
  back to the lane labels `Support Actions` and `Tech Support Actions` when a
  lane carries no role. A board whose lanes have roles is unaffected; a board
  relying on those two English labels should give those lanes the
  `support_actions` role, or add the mapping to `LEGACY_NAME_TO_ROLE`, which is
  the one declared place a name stands in for a role. `BLUEPRINT_INSERT_HIT_HALF`
  is now exported from `blueprintLayout` rather than declared privately in each
  of the two handle components.

## 1.7.0

### Minor Changes

- ef06086: An edge list is `dependencies`, in the wire format too.

  **⚠ BREAKING for anyone holding an IR file.** A path's `triggers` array is now
  its `dependencies`, at IR schema version `2026.09.09`. An IR authored against
  `2026.09.07` no longer validates and is refused by name;
  `python3 scripts/migrate_ir.py <ir-file> --workspace blueprint-workspace.json
--write` carries it across, in one hop, and re-anchors sign-off. The field is
  renamed in place, so the diff a reviewer reads is the one line whose name
  changed rather than everything below it. Nothing authored moves, so the step is
  content-preserving and every signed scenario re-anchors rather than de-signing.

  The word was settled in three estates and this is the third. The database has
  said `cell_dependencies` since `21000103000000`. The app's domain layer took
  `dependency` at 1.5.0 — `BlueprintData.dependencies`,
  `remapMergedPathDependencies`, and the prose around the arrows. The
  interchange format was the estate left over, which meant the retired word
  survived in exactly the file a person hand-edits (#159).

  What moved with it:

  `references/ir-schema.json` `path.triggers` → `path.dependencies`,
  `$defs/trigger` → `$defs/dependency`,
  and `2026.09.09` at the head of the enum
  `scripts/validate_ir.py` reads and reports the new name; the
  cross-path message says "edges"
  `scripts/generate_seed_sql.py` `seed_trigger_fields` →
  `seed_dependency_fields`
  `scripts/generate_fallbacks.py` follows the field function
  `scripts/adapter_parity.py` follows the field function
  `skills/slice/scripts/slice_tools.py` journey adjacency reads the new name
  `scripts/migrate_ir.py` `to_2026_09_09`, the carry
  `src/lib/backend/schemaVersion.ts` `2026.09.09` supported and spoken
  `references/adapter-contract.md` the parity claim names the new function

  `seed_dependency_fields` is a rename on a published surface: the adapter
  contract's parity claim names the two field functions, so a consumer that calls
  it changes one import.

  The UUIDv5 namespace label stays the string `"trigger"`. It is derivation
  input rather than vocabulary — changing it would give every existing edge a new
  id and stop a re-import being idempotent, which is the one property the
  derivation exists for. `generate_seed_sql.py` says so where it is used.

  `2026.09.08` is skipped, and it is spent rather than free: `21000122000000`
  stamps a migrated database with it for the lane-role vocabulary and never
  taught the IR enum or `migrate_ir.py` the value. Spending it here would give
  one stamp two shapes. Closing that gap means writing the lane-role step that
  migration never shipped, and `references/customization.md` § The versioning
  rule now records the debt where the rule is stated.

  Proven by `scripts/tests/run_tests.sh`: `migrate-triggers-refusal` asserts a
  document spelling the array `triggers` is refused with one error naming the
  upgrade, and `migrate-triggers` asserts it then carries forward — validating,
  landing on the current fixture exactly, and keeping the array in the slot the
  old name held. The two older fixtures keep the spelling they were written
  with, which is what makes the carry a real round trip.

### Patch Changes

- 2181065: Style enforcement rides one token model, and three guards that chose their own
  sample stop choosing.

  `src/lib/tokenModel.ts` is new and is the seam. It answers what the token layer
  declares (with the selector, the wrapping at-rules, the file and the line),
  what a name resolves to at the root under a named theme (`@media print` set
  aside, the `:root`-versus-`.dark` tie broken on the import order read out of
  the entry sheet, `var()` chased through), who consumes it — from a stylesheet
  or from source, as `var(--x)` or as Tailwind v4's bare-value shorthand, with or
  without a fallback — and what the colour is, since the HSL and OKLCH
  conversions, the gamut solver and the contrast formula move here too.
  `docs/adr/0006-one-token-model-is-the-single-style-seam.md` records why, and
  `src/lib/tokenModel.test.ts` asserts the reader itself, sheet by sheet against
  the raw text, because a blind spot in one model is a blind spot in everything
  at once.

  `styles/tokens.test.ts` and `lib/palette.test.ts` are rewritten onto it. Ten of
  the twelve rules in the first fold across unchanged in intent; two retire
  because `palette.test.ts` now holds a strictly stronger form of each — which
  roles exist, and that each declares the full property set, is asserted there
  beside the contrast measurements that need the same parse.

  **Four of the folded rules could not previously be asked properly, and the
  model is what makes them askable.** A dial is now checked for resolving to a
  number under each theme, not merely for appearing in a theme file — `print.css`
  restates thirteen of them inside `@media print`, and `themes/light.css`
  declares most of them under a bare `:root` that matches under dark as well. The
  semantic re-derivation rule now asks whether each of the forty-five tokens sits
  inside a `:root, .dark, .light` block, rather than whether such a block exists
  somewhere in the file. The "no blueprint cell token at the root" rule asks the
  cascade instead of grepping one `:root { … }` block, so a declaration under
  `.dark` or in a later sheet can no longer pass it. And the "only token
  references, never a raw colour" rule now covers the seven touchpoint tone
  blocks alongside the eight lane blocks.

  **Three defects surfaced, and none of them was failing anything before.**

  The reference rule meant to cover Tailwind's bare-value shorthand
  (`w-(--anchor-width)`, `origin-(--transform-origin)`) required a letter before
  the parenthesis, where every such utility ends in a hyphen — so it matched
  nothing the `var()` pattern beside it had not already matched, and nineteen
  references in eight files were outside every rule in that file. They resolve
  now, against a named allowlist of the nine Base UI positioner properties the
  primitives write at runtime.

  Every contrast assertion compared two halves of the same primitive ramp, so the
  board's divider caption — a `gray` ink on a `slate` ground — ran at 2.64:1 in
  light and 2.74:1 in dark inside a file that measures contrast a hundred times.
  Step 1100 does not clear it either (4.11:1 light); `BLUEPRINT_THEME.dividerLabel`
  moves from step 900 to step 1200, the smallest rung that clears AA in both
  themes, and the pair is now measured rather than the step number trusted.

  The interaction-state block matched `[data-blueprint-lane]` only, so all seven
  touchpoint tones were excluded from every contrast assertion in the file —
  seven of fifteen allocated families, setting the same seven properties from the
  same ramps and rendering as cell surfaces exactly the way lanes do. They are
  inside it now, in both themes, and all seven pass.

  Two claims are narrowed rather than widened, because widening the sample proved
  them false as written. "Keeps named paths off the lane families" sampled forty
  synthetic names all hard-coded to `kind: 'variant'`, which `getPathColor`
  short-circuits into the open set — the one family group disjoint from the lanes
  by construction — so `happy` and `exception` were structurally unreachable
  through it. Extended honestly, `happy` is green against the green `actor` lane
  and `variant` is blue against the blue `evidence` lane. Eight lane families plus
  seven tones is fifteen and there is no spare hue to move either to, so the file
  now names both overlaps and holds what it actually can: each is drawn at step
  1100 against a step-500 lane fill, six steps apart. Beside it, the constraint
  nobody had written down — the palette is full — is asserted, so a ninth lane
  fails before it is drawn.

  `themes/dark.css` gains a corrected comment: it claimed `--surface-hue` falls
  back to `var(--hue)` there, and the cascade says otherwise. `themes/light.css`
  declares it under `:root, .light`, the bare `:root` matches under dark, and
  nothing later takes it back — so the dark surfaces run on light's warm 34. Moot
  at chroma 0, and exactly the class of claim the old reader could not check.

  `lib/tokenDiscipline.test.ts` is deliberately untouched and still carries its
  own reader over `src/components/**.tsx`. Converting it changes what it samples,
  which is its own change; the ADR's consequences say so rather than letting the
  gap go unrecorded.

## 1.6.4

### Patch Changes

- 80f4e67: A badge is not a chip, in the figures either.

  #324 stopped `chip` being a name under `src` and #358 stopped it being a
  comment there, and both sweeps walked past `docs/assets/`. Fifty-one class
  strings in the cover figures still said the retired word — forty-one
  `class="chip"` attributes and ten `.chip` rules across ten of the thirteen
  files — because no check had ever opened an SVG looking for a NAME.
  `retired-copy.test.mjs` does open them and was right not to catch this: its
  subject is the words a reader sees, which in an SVG means the text nodes.

  The figures are AUTHORED, so this is an edit to the source and not to an
  output: `scripts/sync-cover-assets.mjs` copies `docs/assets/` to `public/cover/`
  and changes nothing, and `public/cover/` is generated and gitignored. Nine
  files take `badge` straight — the marker those rounded rects draw is the one
  this design system calls a badge, one per thing and never drawn from a set.
  `data-model-hierarchy.svg` is the tenth and could not: it already HAD a
  `.badge`, at 7.5px, on the lane markers in its miniature path panel, which is
  the same thing `blueprint-anatomy.svg` calls a badge. Its phase markers are
  badges too, so they say which badge they are and became `.phaseBadge` rather
  than collapsing two rules with different metrics into one name. Every rule and
  every attribute moved together, so the diff is fifty-three lines for
  fifty-three and no figure renders a pixel differently.

  `scripts/tests/badge-and-tag.test.mjs` gains a third subject, which is the
  half that stops this recurring. A figure is styled only by its own `<style>`
  block — `CoverFigure` serves it through an `<img>`, which seals page CSS out —
  so two assertions hold over one walk of the class vocabulary. No class name
  may say a retired word, in either place a figure can write one: the rule in
  the stylesheet and the token in a `class` attribute. And every class a figure
  uses must have a rule in that same file, which is what makes the first
  assertion impossible to satisfy by halves — rename the rule alone and the
  attributes style nothing, rename the attributes alone and the rule does. The
  converse is deliberately not asserted, and four unused rules stand today: a
  rule nobody uses teaches nobody, because a name is learned where it is used.

  The word list stopped being a literal in the same change. `RETIRED_DESIGN_WORDS`
  is now read off `RENAME_MAP` by the map's own shape — the rows that retired no
  database identifier and carry no migration, which is exactly the kind of rename
  no schema and no generated type can hold and precisely what this file exists to
  hold instead. It selects the `pill`/`chip` row today, a test states that as a
  fact about the map, and a second such row would be picked up on the day it
  lands.

- 0a8a77d: The selection seam reads a cell, not a string.

  `getTouchpointItems` took a cell's `content` and split it, so the touchpoint
  names the board drew were whatever the grid's text happened to say. That is
  one of the two sources a cell has, and since placements became rows it is the
  weaker one: a NAME-ONLY placement (#112) names its touchpoint by name alone,
  because the registry has no entry for it, and nothing obliges the cell's text
  to repeat that name. Split the text and the placement is not merely undrawn —
  it is unreachable, because the same list is what the panel and the touchpoint
  picker select from. `getTouchpointNames` replaces it and takes the cell:
  placements where the cell has them, the text where it does not.

  All five call sites had the cell in hand already — `blueprintCellConnections`,
  twice in `blueprintStepTech`, and the slot-cell branch of `CompareCellBlock` —
  save one, the branch of `CompareCellBlock` that has only a bare `content`
  string, which passes `{ content }` and gets the old reading, correctly: a
  compare slot's face is assembled from text and there are no placements there
  to prefer.

  The text fallback is therefore not dead code and is asserted as behaviour, not
  tolerated as a leftover. The hand-written fixture boards and the compare slots
  hand these readers a cell that never went through the normalizer, and
  splitting the text is what those sources mean.

  `getMaxTouchpointCountInLane` moves with it. The row height a touchpoint lane
  reserves is a count of the same list, and leaving it reading the text alone
  would have drawn each name-only face into a row with no space for it — the
  count and the list have to agree or the fix is a clipping bug. It now counts
  placements where a cell has them and the text where it does not, which is the
  reading `getTouchpointNames` does.

  Whether a name IS a name-only placement is still `isNameOnlyPlacement` in
  `cellTouchpoints.ts`, and deliberately stays there. That predicate reads the
  row as well as the registry link, so a fallback placement — no row and no
  registry — is not mistaken for one; a second predicate keyed on the registry
  link alone would disagree with it on every fixture board.

## 1.6.3

### Patch Changes

- 0d084e4: A storyboard is not a visual.

  `21000122000000` renamed the lane role and the rename map has carried
  `visual` in both its `retired` and `copy` lists ever since. Neither list could
  see the app. Check A reads database identifiers and Check C reads JSX text and
  five props, so between them sat what the `pill`/`chip` row calls the app's own
  vocabulary — a component, a file name, a data attribute, a flag — and the whole
  walkthrough surface was still spelled `Visual` two migrations after the role
  stopped being. 247 occurrences across 51 files; 220 of them moved.

  **Eight files carry the word in their names and no longer do.**
  `visualWalkthrough.ts` → `storyboardWalkthrough.ts`,
  `blueprintVisualPlaceholder.ts` → `blueprintStoryboardPlaceholder.ts`,
  `VisualWalkthroughContext.tsx` → `StoryboardWalkthroughContext.tsx`, and under
  `components/blueprint/`: `BlueprintStepVisual` → `BlueprintStepStoryboard`,
  `VisualWalkthroughShell` / `Modal` → `StoryboardWalkthroughShell` / `Modal`,
  `BlueprintVisualPlayButton` → `BlueprintStoryboardPlayButton`,
  `VisualStepDetailStack` → `StoryboardStepDetailStack`. 165 identifiers follow
  them, including the two flags: `BLUEPRINT_STORYBOARD_LANE_UI_ENABLED` and
  `BLUEPRINT_STORYBOARD_WALKTHROUGH_ENABLED`. The second is still `false` and
  the machinery under it is still deliberately retained — this change moves the
  word and not one line of behaviour.

  **`data-visual-walkthrough-modal` is now
  `data-storyboard-walkthrough-modal`.** It is resolved by string in three
  places and set in one, and all four moved together: the modal sets it,
  `SliceView` and `ServiceOverviewView` query for it, and `print.css` hides it.
  A producer renamed without its readers is the defect this repository has a
  whole check family for.

  **`visual-<stepId>` did not move, because it already had.** The synthesized
  anchor the stacked grid uses is emitted as `storyboard-<stepId>` at all four
  producer sites here; only the comment on `MergedSubCellMember` still described
  the old spelling, and it says what the code does now. The deployment's four
  sites still emit `visual-` and are its own change.

  **Where `visual` is the English adjective it stays.** Fifteen sites: a panel
  is `visually` de-emphasised, WebKit's `visual` viewport is a platform term, a
  divider band has a `visual` width, reading order and `visual` order agree on
  the cover. So do six data values — `Visual` is a lane DISPLAY NAME in content
  that predates `lane_role`, so it keeps its key in `LEGACY_NAME_TO_ROLE` and
  `LANE_STYLES` (whose `'Step Visual'` entry becomes `Storyboard`, the
  deployment's own spelling, since `step_visual` is the role `21000122000000`
  dropped), and `/step-visual-placeholder.svg` is a sentinel a `cells.frame` may
  carry, so renaming the asset would silently turn every placeholder into a real
  frame. Its copy moved; its name is a value.

  **Three sentences came out singular, and the guard is why.** "Step visuals, 3
  images" replaced mechanically says there are three storyboards; one cell is
  one step's storyboard holding three images, so the label is `Step storyboard,
3 images`. `No visuals for this step` is `No storyboard frames for this step`,
  because a storyboard is made of frames and `21000115000000` settled that word.

  `MANGLED` in `scripts/tests/retired-copy.test.mjs` gains three shapes for this
  rename — `storyboardly`, the `storyboardi[sz]e` / `-ation` family, and
  `storyboard element`, which is `visual element` with the noun swapped and
  never what a sentence here means. No pattern is offered for "storyboard
  centre" or "storyboard order": both halves are ordinary English, and the only
  rule separating them is the list of sentences they came from.

  No path in `identifiers.json` moves and none in `check-reference-paths.mjs`
  does, so this is a patch — the plugin contract is untouched and the template
  app is explicitly not the semver surface. Five files a deployment enrols
  byte-identical do move (`blueprintDisplayFlags.ts`,
  `applyBlueprintDisplayFilters.ts`, `BlueprintVisualPlayButton.tsx`,
  `VisualWalkthroughShell.tsx`, `VisualWalkthroughContext.tsx`), so its drift
  gate goes red until it adopts on a pin bump. That is the release order this
  change is written for.

## 1.6.2

### Patch Changes

- 087c571: A badge is not a chip, in comments too.

  #324 stopped `chip` being a NAME under `src` and the copy list stopped it
  reaching a reader, but forty comments went on calling a badge a chip — the
  same gap #327 closed for `layer`, one word over. Neither sweep read comments,
  by design, so the codebase kept teaching the next reader a word the design
  system had withdrawn.

  The sentences say what they mean now. Where the thing is this design system's
  descriptive marker it is a `badge` — `ui/badge.tsx`'s four size variants and
  its warning-role note, the slice presentation's cell badges, the slide
  editor's, the loading skeletons', `SliceHeaderBand`, `MobilePathSelector`,
  `PathMultiSelect`'s badge layouts, `CanvasDesignTools`' preview badge,
  `DevPortal`'s badge row, `AgentPanel`'s accent badge, `tokenDiscipline`'s
  badge that does not track its role, and `ScenarioTitleBadge` /
  `badgeGeometry.test.tsx`, which meant the default SIZE and now say so. Where
  it is something else, the word is the thing: `ui/alert.tsx`'s icon sits on a
  filled square, `SupabaseProvider`'s edit-preview tell is a banner,
  `AnnotationCaptureMenu` and `agent/attachments.ts` / `agent/loop.ts` carry an
  attachment with a label, `ScenarioBlueprintPanel` reads the menubar's `[≠ N]`
  count, and the cell panel's "← Back to Differences" is a button, which is what
  it renders as. Every one of those spellings that the deployment had already
  written is taken from it verbatim rather than reinvented.

  `scripts/tests/badge-and-tag.test.mjs` gains the second half of its own walk.
  One pass over `src` now yields two things — the code with comments stripped,
  and the comments that stripping removed, blanked in place so a line number
  still means what it says — and each gets an assertion. `pill` is in it from
  the start: the tree carries none under `src`, and the cheapest time to guard a
  clean word is while it is clean.

  There is no exemption list, and that is the subject rather than an oversight.
  The four documents this repository exempts everywhere else — that test, a
  changeset, the CHANGELOG and a migration — are outside `src` by construction,
  so the rename map and the guard can still write the retired word down. The
  figures under `docs/assets/` keep theirs: a `class="chip"` is a name, not a
  comment, and this change touches no class string.

## 1.6.1

### Patch Changes

- 4b8b959: A deployment's content cannot hide in shared code without its name.

  `check:standalone` is a word-grep. It sweeps every file a commit would carry
  for the handful of words that NAME the deployment this template was
  generalised from, and it caught eighteen sentences nobody had read in months.
  The other half of the same leak walked straight past it: content with the name
  filed off. A cell id copied out of that database is thirty-two hex digits and
  names nothing. `Regular Tutor` is its cast, not its title. `Standard
Scheduling` is one of its scenarios. Each is as unusable to an adopter as its
  repository name in a comment, and none of them is a name.

  **`npm run check:content-coupling`**, beside `check:standalone` in CI, in
  SETUP.md § Before you push and in `docs/engineering/checks.md` § 4. Four
  patterns, every one a SHAPE rather than a copy of somebody's catalogue, each
  carrying the `why` the failure report prints:

  - **An opaque id.** A UUID literal that is neither the sample's own nor a
    placeholder somebody typed — and both allowances are checkable rather than
    listed. Every id in the sample blueprint and its seed comes out of `fid()`
    in `scripts/generate_sample_blueprint.mjs`, so the `f0000000-…` prefix is a
    proof of origin; and a UUID a person types is a few digits repeated, so
    three or fewer distinct hex digits — once the version and variant nibbles a
    v4 is required to carry are dropped — is the line. The gap either side of it
    is enormous: the deployment's own ids run five and up.
  - **The cast**, word-bounded and case-insensitive, so `tutorial` is untouched.
  - **Its scheduling vocabulary** — the words for a dropped shift, the cover for
    one, and the scenario holding both.
  - **A `/touchpoint-logos/` asset path**, which is a file only that deployment
    has; the template's own fixture passes by shape.

  Subject is `src/`, `skills/`, `agents/`, `references/`, `evals/`, `scripts/`
  and `docs/`, tracked plus untracked the way the sibling sweep reads it since
  #181. Tests are out, because a fixture has to be able to write the value down
  — the rule `check-database-names.mjs` already states for a dead relation.
  `src/data/sampleBlueprint.ts` stays IN: the id rule passes it for a reason
  worth asserting, and the day one of its thousand ids is outside the sample
  namespace, something was pasted in.

  **Twenty lines fixed across fourteen files, none allowlisted.** Seventeen
  were comments and reference-doc sentences illustrating a mechanism with
  somebody else's staff; three were LIVE strings the canvas agent reads as its
  tool contract, where the example its model is shown was another company's job
  title (`list_stakeholders`, `create_stakeholder` and `create_evidence`). Each now uses the sample blueprint's own vocabulary —
  `Blueprint owner`, `Read the sources` → `Draft the structure`,
  `A critical finding reopens`. `ALLOWED` therefore ships **empty**, with its
  shape held by fixtures rather than by a live entry: a site that cannot move
  without a design decision is named by file and value — never by line, which
  churns — and an entry nothing matches any more is itself a failure.

  **The inline annotation sweep found nothing to delete.** The tree carries no
  ad-hoc "do not use the deployment's examples" comment for the check to
  replace; what it carries instead is prose explaining design decisions
  (`LEGACY_NAME_TO_ROLE`'s shim, `TOUCHPOINT_COLORS`' empty alias map,
  `VISUAL_WALKTHROUGH_LANE_NAMES`), and those stay.

  One boundary is stated rather than swept: a role noun that is also ordinary
  English. `Supervisor` was one deployment's actor, quoted as "the live example"
  in an audit-check document; no bounded pattern separates it from the word a
  template may honestly write, so it was fixed by hand and the class is named in
  the script's § What is NOT matched, deliberately.

  No identifier in `identifiers.json` moves and no path in
  `check-reference-paths.mjs` does.

- a1bb7d4: A layer of tokens is not a lane.

  `21000104` renamed `layers` to `lanes`, and the prose was carried across by
  word replacement, so eleven sentences using `layer` in its ordinary English
  sense came out with `lane` substituted into the middle of a word or an
  unrelated idea: tabs "laneed" over the base view, rules "deliberately
  unlaneed", and the design system's own token tier called "the semantic lane"
  in seven places. Every one passed `tsc`, every check and review, because a
  comment is the subject of none of them.

  The sentences are restored, and the copy sweep is untouched: what `21000104`
  retired is the COLUMN, not the English word, and Check C already draws that
  line by subject — JSX text and five reader-facing props, comments removed — so
  a token tier living in a comment, a module or a stylesheet reaches no reader
  and is never read. Narrowing the pattern instead would have let
  `aria-label="Add a layer"` through, which is the retired name on screen and
  the one case that check plants to prove itself.

  A changeset, the CHANGELOG and the guard's own test may quote the residue —
  a note explaining the fix has to name both spellings, and a dated record keeps
  the words it was written with. Beside Check C now sits a guard on the residue
  itself — a word that exists in no
  dictionary (`laneed`, `unlaneed`) and one phrase whose meaning the rename
  inverted (`semantic lane` with no role after it, which is why `lane_role` and
  "semantic lane roles" pass) — over every file a commit would carry, so the
  next mechanical rename cannot leave the same wreckage unnoticed.

  Four files reach byte-identity with the deployment as a result, and a fifth
  carries the decision the module stores were already following: ADR 5,
  cross-surface state is a module store, not context.

## 1.6.0

### Minor Changes

- 34513c7: A service has a slug, and the agent has a scope module to read by it.

  ADR 3 says a deployment may hold more than one service: the journey is a hard
  per-service boundary, the catalog is the deployment's. The schema had the
  boundary and nothing to name a side of it — no way for a URL, or an agent read,
  to say _which_ service. Two halves land here, and the read tools that will use
  them do not.

  **`services.slug`** (`21000130000000_a_service_has_a_slug`). A short, stable,
  URL-safe identity of its own, `unique (slug)` across the deployment. Derived
  from the name at read time would need no column and is the version worth
  arguing against: it moves a service's URL every time somebody edits the name,
  and it has nothing to say when two names slugify alike. The column fixes both.
  It lands nullable, is backfilled through `public.key_slug` — the database's own
  slugifier, the one `src/lib/serviceSlug.ts` documents itself as mirroring — and
  takes the unique constraint only once it is populated. It STAYS nullable: the
  reader keeps a name-derived fallback for a null, which is only meaningful if
  null is reachable. No `grant update (slug)`, because nothing writes it yet; the
  edit panel adds the grant and the policy together, the way the examples panel
  did in `21000123000000` / `21000128000000`.

  **The scope module.** `serviceSlug.ts` reads the column with that fallback,
  `contexts/activeServiceStore.ts` (over `lib/serviceRoute.ts`) holds which slug
  the app is looking at as a module-level fact — non-React fetchers resolve the
  active service, which is the condition that rules context out — and
  `lib/service.ts` gains `findActiveServiceId`, one shared lookup per slug.
  `agent/tools/serviceScope.ts` is what a read will take: a `ServiceScope` that
  is `all` or one named service, resolved from the tool's `service` argument and
  the creator's default. A deployment with one service always resolves to `all`,
  so single-service behaviour is byte-for-byte the unscoped read it is today and
  none of the machinery runs. `serviceStakeholderIds` derives a service's cast by
  walking phases → scenarios → paths → `lanes.stakeholder_id`, which is ADR 3's
  implicit membership as a join — there is no `stakeholders.service_id` to filter
  on, and the test asserts the catalog table is never queried.

  **The creator's default is a setting.** `AgentSettings` gains
  `serviceScope: 'active' | 'all'`, and `AgentScopeField` puts it beside the
  provider and model rows. `active` keeps every answer inside the service on
  screen so a large deployment does not search all of them on every question; a
  per-call `service` filter overrides either way.

  **The read tools are deliberately untouched.** Rewriting their bodies to take a
  scope is the next step, and it wants a blueprint search that does not exist here
  yet; this changeset delivers the module and its tests so that step has something
  to build on. `touchpoints.service_id`, `touchpoints.stakeholder_id` and the
  registry hook are out of scope too — the first is an owner call about whether
  this template's per-service registry becomes the deployment-wide catalog ADR 3
  gives stakeholders.

  A schema column is a contract addition, so this is a minor. No identifier in
  `identifiers.json` moves and no path in `check-reference-paths.mjs` does.

- ecfa989: The agent reads the catalogs it could only write into, and every read takes a
  service scope.

  The deployment's tool roster is this one's plus fourteen. Thirteen of the
  fourteen need no migration — `lanes`, `cell_dependencies`, `stakeholders`,
  `evidence`, `business_models` and `agent_sessions` are all in the portable core
  with the columns these reads select — so the template takes them, under the
  deployment's exact names, descriptions and argument schemas.

  **Nine reads.** `list_references` (the rulebook vocabulary, live),
  `list_lanes` (the lane labels actually in use, distinct from the lane-roles
  doc, which says what the roles MEAN), `list_cell_dependencies` (the read half
  of `create_cell_dependency` — the agent could write an edge it had no way to
  read back), `list_stakeholders`, `list_evidence` / `get_evidence`,
  `get_business_model`, and `list_sessions` / `get_session`. The last two read
  the session store the switcher reads rather than `agent_sessions`, which is
  deliberately narrower than RLS permits: the agent sees exactly what the user
  sees.

  **Four writes.** `create_stakeholder` / `update_stakeholder` and
  `create_evidence` / `update_evidence`, each dispatching onto the same wrapper
  the panel calls, so the ledger entry and the captured inverse come free.
  `updateEvidence` is new — an edit with no inverse would have been the one
  change in the session log that could not be taken back — and lands with its
  `WriteFn`, its describe line and its revert case.

  **That gives evidence an owner.** CONTEXT.md's ownership table said
  **nobody** wrote `evidence`, and that was a fact about the roster rather than a
  position: the panel was its only writer. `who-writes-what`'s rule 2 — every
  write tool naming one of these records is assigned an owner — is what forced
  the answer rather than letting the row go quietly stale. Evidence belongs to
  **the cell**: the claim the source grounds, and the one thing every evidence
  row the agent can write names.

  **Scope replaces the cache.** `registry.ts` held one `cachedServiceId`,
  resolved once and reused for every write. It is gone. Reads take a
  `ServiceScope` through `resolveServiceScope` — the tool's own `service`
  argument first, then the creator's `serviceScope` setting, and always `all` on
  a deployment with one service, so single-service behaviour is byte-for-byte the
  unscoped read it was. Writes land on `resolveActiveServiceId`, the service on
  screen. `list_scenarios` and `list_stakeholders` carry the filter: the first by
  `phases.service_id`, because the journey is the hard per-service boundary; the
  second by ADR 3's implicit-membership join, because the shared catalog has no
  `service_id` to filter on. `readScope.test.ts` pins both.

  **The no-database trial keeps its arm.** Every new read answers with a null
  client. `list_lanes` and `list_cell_dependencies` gained sample readers over
  the bundled board; `list_references`, `list_sessions` and `get_session` never
  had a database behind them and serve the same implementation the live app does.
  `list_stakeholders`, `list_evidence`, `get_evidence` and `get_business_model`
  are deliberately off the trial roster — the sample is a board, not a
  deployment, and it carries no cast, no provenance and no business model — so
  they land on the honest "no database connected" sentence rather than an
  invented empty one. `sampleTrial.test.ts` now walks every registered data tool
  through a null client.

  Out of scope, and named so nobody looks for them: `search_blueprint` (needs a
  `public.search_blueprint` RPC this kit has no migration for), the
  `list_blueprint` name (this repo keeps `list_scenarios` — it names what it
  returns), the reference-doc import seam (the deployment's nineteenth doc,
  `blueprint`, has no file here, so `REFERENCE_NAMES` stays at eighteen) and the
  localStorage prefix (the template's `ub-` against the deployment's own).

  Thirteen agent tool names are contract identifiers in `identifiers.json`, so
  this is a minor. No existing identifier moves, and no path in
  `check-reference-paths.mjs` does.

### Patch Changes

- d5b28b2: The standalone sweep sees what a commit would.

  `npm run check:standalone` read tracked files only, so a changeset written
  and checked before `git add` passed the script and failed `npm test` the
  moment it was committed. The subject is now tracked plus untracked files
  git would not ignore — one function, read by the script and the test alike —
  with a test that builds a throwaway repository and proves an untracked file
  is swept and an ignored one is not.

## 1.5.2

### Patch Changes

- 0fcfd28: A touchpoint cell says what state it is in, and keeps the height the canvas
  reserved for it.

  The deployment's touchpoint cell had four behaviours this one lacked, and all
  four are the kind a template cannot grow later without the surfaces that
  consume them. It takes them now.

  **Status reaches the face.** `entity_status` has been a domain on
  `cells.status` since `21000125` and an entity has carried it in the types since
  #155, and nothing drew it: fifty design explorations would have read as shipped
  surfaces. `BlueprintCellButton` gains an optional `status`, marks itself
  `data-blueprint-cell-status`, and gives an unbuilt cell a dashed edge, a
  drained fill and a little transparency — three cheap signals that agree, so it
  still reads as unbuilt at the zoom where the dashes have collapsed into a grey
  line. `deprecated` exists and works, so it keeps its solid face and only fades;
  `at_risk` gets nothing at all, because dimming a working surface people rely on
  tells a reader not to. `entityStatusContract.test.ts` said these assertions
  would land with the face that draws them rather than with the vocabulary, and
  this is where they land.

  **A fixed height.** `TOUCHPOINT_ITEM_HEIGHT` and its compact twin were private
  to `blueprintLayout.ts`, so the stack estimate counted a height nothing
  enforced and a two-line touchpoint overflowed the row track reserved for it.
  Both are exported and the cell sizes itself to them. `inline` opts out, for the
  prose and list surfaces — the panel's dependency lists, the selected
  touchpoint's own field — where a canvas-height face would be absurd; those
  three call sites pass it.

  **A read-only surface, and a described one.** `selectionContext` is optional
  now: its absence is what makes the cell a face rather than a control, which is
  the state print, the compare grid's unselectable side and the dependency lists
  were all already in. `asSpan` hands straight to `TouchpointCellFace`, which
  this repo keeps as its own component; `aria-describedby` reaches both halves,
  so a compare cell can point at the caption that qualifies it.

  `nameOnly` stays a prop on `BlueprintCellButton` here rather than a
  `data-name-only` spread at the call site: a spread onto a typed component is
  not excess-property checked, so the attribute it means to set is dropped in
  silence. `blueprintTouchpointCell.test.tsx` comes across with the behaviour and
  holds the dashed face.

  The plugin contract is untouched — no identifier in `identifiers.json` moves,
  no path in `check-reference-paths.mjs` does — so this is a patch. A fork of
  `src` takes these as a visible merge conflict, which is what a template
  refactor is allowed to be.

## 1.5.1

### Patch Changes

- 6d76c42: `set_cell_dependency` is called with `name`, and the argument names are a check
  now.

  `21000116000000` renamed `cell_dependencies.label` to `.name` and moved the RPC
  parameter with it, and `src/lib/authoringRpc.ts` kept posting `label`.
  PostgREST resolves an RPC by matching the body's KEYS to a function's parameter
  names, so a key the function does not have means no candidate matches at all:
  the reply is `PGRST202 — could not find the function`, a 404 at the seam rather
  than a null column. Every arrow saved from `CellDependencyEditor` failed, and so
  did every `create_cell_dependency` the agent called. `client.rpc` is reached
  through an `any` cast — the file says why, and it is a good reason — so nothing
  in TypeScript could see it, and no guard was looking either.

  The word moves end to end: the wrapper's input, `DraftDependency`,
  `ExistingDependency`, the panel's field and its placeholder, and the generated
  `Args` for the function. The agent tool keeps saying `label` and `registry.ts`
  maps it, which is the deployment's spelling of the same seam: the word a model
  is asked for is not the schema's, and moving a published surface for a spelling
  costs more than the mapping does. `DeletionImpact.label` is untouched — that is
  the deletion target's display label, and the deployment still spells it that
  way.

  **The guard that would have caught it**: `npm run check:rpc-arguments` reads
  every RPC argument object in `authoringRpc.ts` — the `call`/`read` sites and
  the revert specs, because an inverse posts the same body one undo later — and
  holds their keys against the parameter lists parsed from
  `supabase/generated/portable-core.schema.sql`. Three failures, each naming the
  line: a key that is not a parameter, a parameter with no default the call omits,
  and a function the dump does not have. The `p_` prefix is compared verbatim,
  because PostgREST strips nothing and the `p_`-prefixed functions are called with
  the prefix.

  The rename map gains the other half of `21000115000000`: `slice_items` →
  `slides`, and `slice_items.caption` → `slides.title`. It enforces nothing yet,
  and the header says why rather than leaving the silence to be read as an
  oversight — `slices_referencing` is `language sql`, so its body kept the text it
  was created with and still selects `from public.slice_items`. Calling it raises
  `42P01`. Keying the fragment today would fail the dump sweep on that defect
  instead of on residue; finishing the rename is a migration of its own, and the
  row is written down while that is true.

  The plugin contract is untouched, so this is a patch: no identifier in
  `identifiers.json` moves and no path in `check-reference-paths.mjs` does either.

- 8f93a55: `slices_referencing` reads `slides`, and calling every `language sql` body is a
  check now.

  `21000115000000` renamed `slice_items` to `slides` and moved every dependent
  name a catalogue holds — four constraints, two indexes, a trigger, four
  permissive policies. It missed the one no catalogue holds: the text a function
  body was created with. `slices_referencing` is `language sql`, so its body survived the
  rename verbatim and still selected `from public.slice_items`:

  ```
  select public.slices_referencing(array[]::uuid[]);
  ERROR:  relation "public.slice_items" does not exist
  ```

  `deletion_impact` reads that function for `affected_slices`, and `delete_cell`,
  `delete_path`, `delete_scenario`, `remove_step`, `remove_lane` and
  `remove_lanes` all read `deletion_impact` — so no structural delete could
  succeed on a fresh core, and the confirm dialog raised `42P01` at the moment
  somebody was deleting something. Creation was no defence: the body was valid the
  day it was written, and the rename that falsified it validates nothing.

  `21000129000000` recreates the one affected body — the definition the schema
  dump holds, with the two occurrences of the relation written `public.slides` and
  nothing else changed. The signature, `language sql stable`, the `search_path`
  and the ACL are untouched: `create or replace function` keeps the object's
  grants, which matters here because the function is in the portable core and its
  `grant execute … to anon, authenticated` is in the Supabase recipe. Its proof
  sweeps every body in `public` and then CALLS both functions, because a `language
sql` body is text until something calls it.

  The same rename also missed three names a catalogue _does_ hold — the optional
  service-account tier (`20260818002000`) builds its RESTRICTIVE policies from a
  table list that still read `slice_items`, so a database replaying the whole
  series carried `slice_items_insert_service_only`,
  `slice_items_update_service_only` and `slice_items_delete_service_only` on
  `public.slides`, and `21000129000000` renames all three (a rename, so the
  definitions stay byte-for-byte) in its recipe half, guarded by the catalogue
  because the generated recipe already creates them under the current name.

  The rename map's row flips with it: `slice_items` is in the `retired` list now,
  and the header says what changed rather than leaving the old "enforces nothing
  yet" to be read as an oversight. Flipping it found the second copy of the same
  defect one estate over — `scripts/agent-harness/run.mjs` asked PostgREST for the
  retired relation as an embed (`slice_items(…,caption,…)`, alongside `description`
  and `origin` on `slices`), a string no compiler reads and `npm run
check:database-names` does; it reads `slides(…,title,…)` from `summary` and
  `authorship` now.

  **The guard that would have caught it**: `npm run check:function-bodies` stands
  up a fresh core + recipe + seed and CALLS every `language sql` function in
  `public` — a typed null per argument, inside a rolled-back transaction — plus
  `slices_referencing` and `deletion_impact` with real ids out of the seeded
  content. Only the SQLSTATEs that mean "that is not there" fail it, so a function
  raising its own exception on null input passes as tolerated. `--self-test`
  plants the defect in its own order — a table, a body that reads it, then the
  rename — and asserts the call is reported, because a run where every function
  answered looks identical to a run that called none of them. It runs in the
  `portable-core` CI job beside `check:seed-load`.

  Neither of the two static sweeps could have found this. The dump regenerates
  happily — a broken body dumps like any other — and
  `scripts/tests/portable-schema.test.mjs` blanks single-quoted strings before
  tokenising, which swallows the region inside a dollar-quoted body. Only
  `check:identifiers`, reading `pg_proc.prosrc` on a live database, saw it, and
  only once the word was retired.

  The plugin contract is untouched, so this is a patch: no identifier in
  `identifiers.json` moves and no path in `check-reference-paths.mjs` does either.

- 6d80772: The harness reads `audit_findings` and its `summary`, and a query path is
  checked against the schema now.

  `21000116000000` renamed the `findings` table to `audit_findings` and
  `findings.note` to `.summary`, and `scripts/agent-harness/run.mjs` kept asking
  for `findings?select=…,note,…`. PostgREST answers that with a 404, so the
  harness's `list_findings` case could only ever fail against a live project —
  and the two lines above it were the same defect twice more: `realGetSlice`
  selected `slices.description` and `slices.origin`, renamed by the same
  migration to `summary` and `authorship`, and embedded `slice_items(…caption…)`,
  which `21000115000000` renamed to `slides(…title…)`. Six dead names in one
  file. The reads the app makes were already right; the harness mirrors them by
  hand, which is what the header says and what nothing was holding it to.

  No guard could see any of it. The rename map retires `check_name` and nothing
  else from that row, on purpose — `finding` is the live domain word a panel has
  to be able to say, and `note`, `description` and `origin` are live words
  elsewhere in the tree. A word list is the wrong instrument for a name that is
  still a word.

  **The guard that would have caught it**: `npm run check:database-names` gains a
  second assertion. A raw PostgREST query PATH — `<relation>?select=<columns>` —
  puts a relation in the one position PostgREST reads as a relation, and
  everything inside `select=` is either a column of it or an embed of another
  relation, so both halves are held against
  `supabase/generated/portable-core.schema.sql` rather than against the rename
  map. A name the dump does not have fails whether or not anybody wrote it down
  as retired, and a retired relation is still followed THROUGH the map, so the
  dead table and its dead column are reported from one site instead of in two
  rounds against a live database:

  ```
  scripts/agent-harness/run.mjs:274: PostgREST query string names `findings`,
    which is not a table or view in the schema dump (→ `audit_findings`)
  scripts/agent-harness/run.mjs:274: PostgREST query string selects `note`, which
    is not a column of `audit_findings` (→ `audit_findings.summary`)
  ```

  The column half stops at the query path and stays there. A bare
  `.select('id, name')` carries the same information, but the relation it belongs
  to is the `.from(…)` on another line; a check that chased it would be reading a
  query builder rather than a literal, and the first correct call it failed would
  be the argument for switching it off. A view is a name whose columns are
  unchecked — the projection is its own business — so a query still cannot name
  one that is gone.

  The plugin contract is untouched, so this is a patch: no identifier in
  `identifiers.json` moves and no path in `check-reference-paths.mjs` does either.

- The lockfile states the version too.

  `npm run check:version` held three files to one number — `package.json`,
  `.claude-plugin/plugin.json`, the CHANGELOG heading — and `package-lock.json`
  sat outside it, still saying `0.5.0` five releases on. Every `npm install` in
  a fresh worktree rewrote the two lockfile lines from the manifest and left a
  dirty file for the next commit to carry or discard. The check now reads the
  lockfile's two statements (its root and its `packages[""]` entry, which must
  agree with each other before either is trusted), `--write` propagates into
  them, and the tree says one number in all four places.

- 5e43094: The template takes the deployment's names and its camera policy.

  Two files converge outright. `PhaseOverviewPhaseLoopArrow` drew the phase loop
  at `z-[60]`, sharing a layer with the annotation surface, which made the two
  order by DOM position; it is `z-20` now, with the deployment's own sentence
  saying why — above board content, below title badges and edit chrome.
  `badgeGeometry.test.tsx` had two case names calling the default size "the
  chip". Both files are byte-identical to the deployment's copies.

  `chip` stops being a name here, which is the other half of the row #158 could
  only take half of. Every spelling comes from the deployment: the cover's
  copy button is `CoverCommandCopy` reading `content.commandCopy`
  (`CoverCommandChip`, `coverContent.chip`), the menubar's count is
  `CompareDifferencesCount`, and the ledger's two markers split along the
  definition the rename map states — a `VerdictBadge` and a `CompareZoneBadge`
  describe the thing they sit on, a `FilterTag` is one value out of a set. A
  drag handle's group is `group/cell`, and the sample blueprint's findings panel
  lists severity badges. `scripts/tests/pill-is-not-a-name.test.mjs` becomes
  `scripts/tests/badge-and-tag.test.mjs` — the deployment's name for the same
  guard — and its subject is now the row's whole pair.

  `picture` moves only where the deployment moved it: `resolveCellDetailPictures`
  is `resolveCellDetailImages`, and the panel's `detailImages` / `showImages` /
  `imageBlock` follow. The word stays a name everywhere both repositories still
  use it — `visualPictures`, `getTechItemDetailPictures`,
  `BlueprintStepVisualPicture` — because a sweep past that point would diverge
  from the deployment rather than converge on it. What the rename map gains is
  the row for `cells.picture` → `cells.frame`, which `21000115000000` shipped
  here and nothing recorded; `picture` is a substring of no surviving database
  name, so unlike most of that block the row enforces.

  Two edge names take the deployment's spelling: `linkLabel` → `linkName`, and
  the lane's row position is `laneRowPosition` / `selectedLaneRowPosition` /
  `getSelectedCellLaneRowPosition` in `blueprintCellConnections.ts`,
  `CellDependencySections.tsx` and the cell panel.

  `src/lib/canvasCameraPolicy.ts` arrives whole, with the behavioural test that
  replaced asserting literals against a component's source text. Its three
  functions — `getMinFitZoom`, `getSemanticZoomThreshold`,
  `getFocusedComparisonCameraKey` — take over from `ServiceOverviewView`'s two
  inline constants and its path-free camera key. The key is a widening rather
  than a reversal: it returns `'stable'` outside a focused scenario, so a filter
  toggle at the overview still keeps the reader's pan and zoom, while a focused
  comparison changing its own geometry becomes the camera event it is.

  Check C's extraction now strips comments, which is what its own header always
  claimed. `JSX_TEXT` reads between a `>` and the next `<`, so a doc comment
  containing a backticked `<textarea>` handed it a whole paragraph of prose as a
  "reader-facing string" — the false positive its header says to answer by
  narrowing the subject, never the word list.

  The plugin contract is untouched, so this is a patch: no identifier in
  `identifiers.json` moves and no path in `check-reference-paths.mjs` does
  either.

## 1.5.0

### Minor Changes

- e647d9b: An edge is a dependency.

  The database has said `cell_dependencies` since `21000103`, and the domain
  layer above it went on saying `trigger` — `BlueprintData.triggers`,
  `BlueprintCellTrigger`, `IntegratedTriggerArrows`, `remapMergedPathTriggers`,
  the doc comments explaining what an arrow is, the prose the reader meets on
  the cover, and the tests. One concept, two words, with the seam falling
  exactly where a person crosses from the schema to the code that reads it.

  The word is now `dependency` everywhere it means the edge:
  `BlueprintData.dependencies`, `BlueprintCellDependency`,
  `IntegratedBlueprintDependency`, `IntegratedDependencyArrows`,
  `BlueprintDependencyArrows` (both components renamed to match their type),
  `remapMergedPathDependencies`, `blueprintLaneHasCorridorDependency`,
  `blueprintHasInLaneDependency`, `flattenDependenciesFromCells`,
  `normalizeDependencyKind`, `dependencyId`, `dependencyKeys`. `BlueprintData`
  is a public read-surface type, so this is a breaking rename for anyone reading
  it — hence a minor, and the map above is the whole of it.

  `trigger` stays where it means a Postgres trigger — `cells_validate_path_match`
  and the `updated_at` triggers — and where it means the thing a UI control
  opens, or the word that carries a branch in the router. Those are three other
  concepts that happen to share a spelling, and none of them is an edge.

  The band vocabulary lands in the same pass. A storyboard lane is a storyboard
  lane in code as well as on screen (`isStoryboardLane`,
  `resolveStoryboardStripEntries`, `StoryboardFrameEntry`,
  `StoryboardBlueprint`), and a touchpoint is a touchpoint rather than a "pill"
  — `isTouchpointLane`, `touchpointLanes`, `titleRepeatsTouchpoint`, and the
  comments around them. "Pill" was a third design-system word for what is either
  a badge or a cell, and the shape has been a variant since the touchpoint split.

### Patch Changes

- 8bbe6c7: A badge is one size, in one place.

  `PathLabelBadge`, `PathKindBadge` and `ScenarioTitleBadge` each wrote their
  own height, padding and type scale around `<Badge>`, and the three did not
  agree: all three called the small shape `compact` and all three meant
  something different by it. `ui/badge.tsx` now carries a `size` variant —
  `default`, `fitted`, `roomy`, `comfortable` — and the wrappers name a shape
  instead of deriving one. Same pixels, pinned by `badgeGeometry.test.tsx`,
  and a deployment's `one-badge-one-size` contract holds without an exemption
  for these three files.

- a6bdde2: A reference path is an interface.

  A deployment imports twenty-two of this repo's documents by fixed path at
  build time from a pinned tag — eighteen references and the four skill
  bodies. Nothing here guarded those paths: a move landed green and was found
  at the consumer's build. `check:reference-paths` holds the list and fails
  this repo first, and ADR 0004 records the rule: moving one is a version bump
  plus a matching consumer change, never a silent move.

- 2fcfbc9: A retired kind has no quiet spelling.

  `cell_dependencies.kind` has been `leads_to` and `enables` since
  `21000114000000`, but two documents still taught the pair it replaced:
  `references/canvas-adapter.md` promised "trigger-vs-needs semantics" and
  `evals/behavioral/evals.json` graded the whatif skill on whether it "Walks
  trigger/needs edges". `check:dependency-kinds` banned those words in their
  code-span form and neither wore backticks, so both stayed green for a
  release — and a third, the comment beside the adjacency walk in
  `slice_tools.py`, was outside the sweep's markdown-only reach entirely.

  All three now say `leads_to` and `enables`, and the check has a second
  retired-spelling assertion that would have caught them: a short list of
  phrases in which the two words can only be dependency kinds, swept over
  `references/`, `skills/`, `agents/` and `evals/` — their JSON and Python
  included. The phrases are narrow rather than the words, so the integrity
  trigger `cells_validate_path_match` and the English verb stay out of reach
  without an exemption; `BARE_ALLOWED` holds the two sentence kinds that do
  need one, with a reason each.

- 1ba2c9b: A deployment's own seed, loaded onto this template's portable core.

  `check:seed-load` proves the loop closes on content this repository generated
  itself, which the generator and the schema can hardly disagree about. The
  question a reconciliation ticket actually asks is whether the portable core is
  SUFFICIENT for the content a real deployment holds, and only a deployment's own
  seed answers it.

  `npm run check:deployment-seed-load` stands up the same fresh stack — shim,
  platform default, core, recipe — and loads a deployment's seed in place of this
  one's, in the order the deployment itself states under `[db.seed]` in its
  `supabase/config.toml`. Then the same anon reads: every table the seed writes
  comes back non-empty to the key a browser holds, and the blueprint grid and the
  service hierarchy return rows.

  It applies the seed with `ON_ERROR_STOP` off on purpose. Here the failing
  statements are the deliverable, not a bug to stop at, so every one is collected
  and grouped by reason with counts and examples — and knock-on failures (a
  foreign key whose row an earlier failure never inserted, the core's own
  row-validation raises, an aborted transaction block) are reported separately, so
  the root cause is not buried under the forty rows it caused.

  Point it at a deployment with `--seed <path>` or `DEPLOYMENT_SEED=<path>`; with
  neither it finds a checkout beside this one that ships a `supabase/seed.sql` and
  declares a different package name, and skips with a message when there is none
  or more than one. CI checks out one repository, so it would skip on every run —
  it is documented as a local guard instead, and its parsing and skip logic are
  held by `scripts/tests/deployment-seed-load.test.mjs`, which does run in CI.

  `SETUP.md` now carries the path it guards as a five-step checklist — clone, run
  with no database, set the two variables, replay, your own content — each step
  ending in something to check rather than something to look at, because this app
  renders bundled content whenever it cannot reach a database and every step after
  a silent failure still looks like it worked.

- e4880a0: An entity carries its status in the types.

  `entity_status` has been a domain on `cells.status` and `paths.status` since
  migration `21000125`, and `src/lib/entityStatus.ts` has spelled the ladder for
  the app the whole time — but no entity in `src/types/blueprint.ts` had a
  status, so the board query never selected the column and the normalizer never
  mapped it. A status a migration guarantees and no read carries is a column
  nobody can see. `BlueprintPath` now requires `status`, `BlueprintCell` carries
  an optional one, `PATH_BLUEPRINT_SELECT` asks for both columns, and
  `normalizeBlueprint` narrows what comes back through `asEntityStatus` — a rung
  the renderer has no treatment for reads as absent rather than as an
  unrecognised marker, and a path with nothing said about it reads as `live`.
  Both generators emit the same default, so an offline board says what the
  database says.

- 7ded4a7: `CONTEXT.md` becomes a glossary.

  It was 31,839 characters, and three of its six sections were not definitions: a
  rename map, an interface-to-schema map, and a section of reasoning about which
  words a sweep should skip. Every session that opened the file to look up one
  word paid for all three. It is 13,076 characters now, and each of the three
  lives beside the thing it is about.

  The rename map's prose table is deleted — `scripts/retired-vocabulary.mjs`
  already carried the same rows in code, and a parity test held the two together.
  With the prose half gone the pair is a single list, so that test goes and the
  commentary moves into the data file's header: why each name went, and which
  renames the `retired` and `copy` word lists deliberately leave out. The section
  on words that keep a retired spelling moves, word for word, into the header of
  `scripts/check-retired-identifiers.mjs`, beside the exemption list that applies
  it — so a skipped word and the reason for skipping it are one edit.

  The interface-to-schema map is now `references/interface-schema-map.md`,
  reached by one pointer from the router and generated: its binding table from
  `LABEL_COLUMNS` in the new `scripts/interface-schema-map.mjs`, and under it a
  coverage line counting the `COMMENT ON` statements in
  `supabase/generated/portable-core.schema.sql` and naming the eight bound names
  that carry none. The comments are counted rather than reprinted, because two of
  them are stale in a way the markdown sweeps cannot see — `paths` still calls its
  kinds "happy, unhappy, exception, alternative" — and a generated reference that
  teaches an agent a retired value is the defect this repo already has a check
  for. It sits under `references/` so that a deployment that wants it can import
  it at a path that holds still (ADR 0004); nothing imports it yet, so it is not
  in `CONSUMER_IMPORTS`.

  `npm run check:glossary` is what stops the file growing them back — headings,
  prose and `**term** — definition` rows, failing on a code fence, on a table
  naming a `table.column`, and on a section that defines no term — and
  `npm run check:interface-map` holds the generated document to its sources. Both
  join the guard set and both are driven from fixtures that break them.

- e30cb9a: Pill is retired outside touchpoints too.

  The deployment settled this word in two halves. #160 took the half where
  "pill" meant a touchpoint — `isTouchpointLane`, `touchpointLanes`, the cell
  variant — and left the other half standing: the three components that used
  "pill" as a shape, and the forty-odd comments that named one. So the app went
  on calling the collapsed sidebar's floating navbar a pill, the zoom control a
  pill, the menubar's difference count a pill, and the cover's segmented row a
  pill row, each of which is a badge, a button or a control and none of which is
  a name the design system still has.

  Three components take the deployment's spelling exactly:
  `FloatingSidebarPill` → `FloatingSidebarNavbar` (exported from
  `EditorChrome.tsx`, with its `data-editor-sidebar-pill` attribute now
  `data-editor-sidebar-navbar`), `SliceRefocusPill` → `SliceRefocusButton`, and
  `PathNotionPill` → `PathNotionToggle`. `FloatingSidebarNavbar` is exported
  from `EditorChrome.tsx`, so a fork of `src` adopting these names lands the
  import change with them — a visible merge conflict, which is what a template
  refactor is allowed to be; the plugin contract is untouched, so this is a
  patch. No path in `check-reference-paths.mjs`'s `CONSUMER_IMPORTS` moves:
  nothing a deployment imports by fixed path from a pinned tag is touched.

  Thirty-nine comments follow, each taking the sentence the deployment's copy of
  the same file already reads; where the word meant a touchpoint inside `src` —
  five comments in `blueprint.css` — it becomes `touchpoint`, which is what the
  deployment's stylesheet says. The two cover figures name their lane labels
  `badge` rather than `pill`.

  `scripts/tests/pill-is-not-a-name.test.mjs` is what keeps it. The `pill`/`chip`
  row of the rename map enforces no identifier — no database object ever bore
  either word — and its copy list only reaches what a reader sees, so the app's
  own names had nothing but review behind them, which is exactly how three
  components survived #160. The new guard's subject is every name under `src`
  with comments stripped, so a component, a prop, a constant, a variant string, a
  data attribute or a file name written next week fails on the word. It takes
  `pill` alone: `chip` is still a live name here (`coverContent.chip`) and
  retiring it is its own change.

  `lane_role`'s catalogue comment still reads "pill cells", because no migration
  has moved it. The documents that quote it — `references/data-model.md`,
  `references/ir-schema.json`, `agents/render-checker.md` — quote it accurately
  and are unchanged, as the deployment's own mirrors of that comment are.

- 27306f0: The settings surface is two halves with one seam.

  `AgentSettingsFields` was one 323-line component holding two jobs that share
  nothing: the auth drafts, the busy flag and the magic-link state on one side,
  the provider/model/key trio on the other, with no state crossing between them.
  It is now `AdminSessionFields` and `AgentProviderFields` — each reading only
  the context field it needs — and a 62-line composer that owns what genuinely
  spans both: the column, the headings, the rule between them and the gate that
  decides whether the second half exists at all. The split is the one a
  deployment built on this template already made, taken here byte for byte, so
  the two files stop diverging; `agentSettingsFields.test.tsx` pins the seam by
  asserting which half is on screen for whom.

  The move carries a fix. The model-list fetch gated on `open` — the global
  `window.open`, always truthy — so the `active` prop it meant to read never
  gated anything, and a closed settings surface still made the provider
  round-trip. It reads `active` now.

  Template-only affordances stay in the composer, each marked: the no-database
  sample trial (an unconfigured build opens the key field with no session to
  gain, and shows a sentence where the sign-in form would be) and
  `DevPortalSection`. The scope field of that deployment's split is not here —
  it needs a multi-service model this template does not have yet.

- 55fe7f4: The compare data layer says it once.

  Three compare modules bucketed items by a derived key with the same
  push-or-seed loop, written out longhand each time — and the merged grid
  carried a parallel array beside its map, because the loop that seeds a
  bucket is also the only place that knows the order. `groupBy` in `lib/utils`
  says it once and iterates in first-seen order, so slots by column, the
  column agreement groups, the ledger's accordion groups and the merged
  signature groups all read as what they are. `compareSlots` also drops a dead
  count guard — a one-path slot is `only`, never `divergent`, so the field
  comparison never sees it — with a test that says so; and the path band and
  the merged grid stop restating locally what the layout module already
  exports.

  One contract narrows: the scenario panel registers its compare review — the
  `[≠ N]` chip, the ledger, the agent's compare commands — only while the
  board is the focused scenario (`focusActive`), never by mount order. The
  template's own overview already passes that flag, so nothing it renders
  changes; a deployment that renders the panel solo must now say the board is
  focused to get a review on it.

- 10050b8: The router gets its three checks.

  `AGENTS.md` is the whole always-loaded tier — the one file a session is handed
  before it decides anything — and it was already close to a router. Nothing
  held it there. It now stays under a stated char budget that fails downward as
  well as up, its prohibition count only falls, and every pointer in it resolves,
  leads with the word that carries the branch, and names a document at all.
  Three items that were bodies rather than pointers moved out. § Rules that hold
  for every skill is exempt from the trigger rules, because those bind before any
  pointer could fire; their paths still have to resolve.

  `check:budget`, `check:negation` and `check:pointers` join the guard set, all
  three reading one list of what is in the tier
  (`scripts/always-loaded.mjs`), and each is driven from a router that breaks it
  rather than only from the one that passes. The writing vocabulary the three
  share — pointer, ladder, disclosed, leading word, sprawl — enters `CONTEXT.md`.

- 81541b2: The router is swept.

  `AGENTS.md` is the one file every session is handed without choosing, and
  it was the one file the vocabulary sweeps never read. It joins the swept
  set, so a retired value stated in the router fails the build like it would
  anywhere else.

## 1.4.0

### Minor Changes

- 3dea76d: The frame carries both axes.

  A path outline is a frame around the path's own cells. It was drawn around the
  lane-label rail as well, because the rail was just the grid's first column and
  the frame spanned the whole band — so the row-axis labels, which name lanes the
  whole scenario shares and belong to no single path, sat inside one path's box.
  `ComparePathSectionFrame` takes `excludeLabelRail` now and starts after the
  label track, offset by `COMPARE_LABEL_TRACK_WIDTH + STEP_COLUMN_GAP` on the
  compare arrangements and by `LANE_COLUMN_WIDTH` on the service grid.

  The frame carries the other axis at the same time. `extraTopInset` still
  stretches it up past the step-header row, and the light band that tints that
  row now takes its left edge from the frame's own inset rather than from the
  horizontal constant — with both axes on, a band written against the constant
  painted the header tint straight across the rail.

  The rail converges with it. The caption and its rule are one row again, so the
  line begins where the words end and runs `ruleOverhang` past the outline it
  crosses (`COMPARE_DIVIDER_RULE_OVERHANG`, and the same formula rather than the
  same number for the service grid). The lane label takes `BLUEPRINT_SLOT_INSET`
  on both edges, the inset the cells it names already use, which is the rhythm
  `railRhythmContract.test.ts` pinned and the rail did not yet keep. The rail's
  right-hand hairline is gone — two vertical lines a few pixels apart described
  one edge — and so is the second coat of rail colour on every lane row, which
  under the canvas transform antialiased into a hairline rectangle around each of
  them. `BlueprintStickyLabelBackdrop` paints that column, once.

  A divider caption is an outlined block that says what its line separates, and
  the path badge is a badge: no dismiss control, one cursor whether or not there
  is a definition behind it, and the explanation on hover, focus and tap. The
  scenario title's aside is `note`, which is what it is, rather than
  `infoTooltip`, which is what it used to be shown in.

- 43d3b70: The rail axis is one width.

  The label rail was 208 wide, and "LINE OF INTERNAL INTERACTION" — the longest
  canonical divider caption — does not fit in 208 at `text-2xs`. It is
  `shrink-0`, so it neither wrapped nor truncated: it ran out of the painted rail
  and the only thing left between those words and the path outline was the gap to
  the board. That gap was then sized to hold text rather than geometry, and every
  value that made the lane label look right put the caption on the outline. The
  rail is 214 now, which is what the caption needs, and the gap has a name of its
  own — `COMPARE_RAIL_GUTTER`, 8 — with `COMPARE_LABEL_TRACK_WIDTH` naming the
  grid track the two make together, wider than the rail it paints. The horizontal
  inset inside a path outline is `COMPARE_PATH_SECTION_H_INSET`, 16, split from
  the top and bottom pair it used to share a constant with;
  `COMPARE_PATH_SECTION_INSET` stays as a deprecated alias so nothing has to move
  at once. `railRhythmContract.test.ts` pins the result: 30px from the lane label
  to the outline, 30px from the outline to the first cell, and the caption
  clearing the outline by the same 30.

## 1.3.0

### Minor Changes

- d772ff3: The agent drives the camera, and a focus is verified before it is reported.

  A `canvas_camera` UI command (pan, zoom, fit, cancel) and an active-canvas
  focus registry give the agent the same camera a person has. `focus_cell`,
  `open_phase`, `open_scenario` and `open_cell_panel` now wait for the move
  they started — bounded, and read from the camera's own state line — and
  report a timeout, a miss or a superseded fly as exactly that, never as a
  landing.

- 9c2970c: The annotation state is two contexts.

  One context value carried both the marks and the tool. The marks change on
  every pointer sample of a drag; the tool changes when somebody clicks the
  toolbar. A context consumer re-renders whenever the value's identity
  changes, whichever field it reads, so dragging one sticky note re-rendered
  every cell on the board. The tool, the pen settings and the `isAnnotating`
  verdict now travel in `CanvasAnnotationToolContext`, read through
  `useCanvasAnnotationTool` and its optional variant; the marks and their
  mutators stay in `CanvasAnnotationContext`. The cells, the marquee, the pen
  cursor and the viewport read only the slow half, and a subscription test
  counts renders to prove a drag cannot reach them. The agent gains a
  `set_canvas_tool` command and a `canvas-tool` line in its UI context.

## 1.2.0

### Minor Changes

- ea3ceac: A step says what its moment is, and the service panel may write its own.

  The first of four slices porting the entity panel editors (#357). One column
  and three grants: `steps.summary` — the one sentence that makes a step's
  column legible without reading five cells, rendered as the caption on the
  storyboard frame — and UPDATE on `steps.summary`, `services.summary` and
  `services.entity_examples` for the signed-in author, because the editors that
  follow write these fields directly rather than through a definer function.

  With it, the pure modules those editors stand on: `entityStatus` (the shared
  vocabulary and its labels), `panelText`, `openPanelStore` (the cell-vs-entity
  drawer arbiter), `panelEditorBusy`, `panelSheetSnap`, `canvasHeaderStyle`,
  `usePanelFooterHost`, a `Select` primitive, and `describeLaneRole` /
  `labelLaneRole`.

  Every change is additive: no row is touched, no IR field moves, and the schema
  version does not. Nothing renders differently yet — the shell, the panels and
  the affordances are the next three slices.

- dd18a6d: Every label is a door.

  The last of four slices porting the entity panel editors (#357). The
  service bar, the phase bar, a scenario's path heading, the lane labels and
  the step headers each become an affordance: hover discloses the definition
  card with the deployment's own example, and a click opens the matching
  panel in the one drawer. The cell drawer and the entity drawer now exclude
  each other from both sides, and a scenario board publishes its scope so the
  lane and step openers know they are on one. A service identity header
  arrives where the template rendered none.

- 1b36c57: Five panels write what they show.

  The third of four slices porting the entity panel editors (#357). Service,
  Phase, Scenario, Lane and Step each gain a panel in the one drawer shell —
  summary and business model for the service, the six per-kind examples,
  business impact and operational requirements for a phase, a scenario's paths
  with their kind, note and status, a lane's owner team, KPIs, tools and actor,
  a step's caption — with the read hooks and the mutations under them, every
  write recorded and revertible. `stakeholders` gets its picker, badge and
  mutations. The drawer is mounted and inert: the affordances that open it are
  the last slice.

  One grant rode in: `phases.summary` had never been granted to the signed-in
  author (the description → summary rename moved the word, not a grant that
  did not exist), so the Phase panel's first field would have been the one it
  could not save.

## 1.1.0

### Minor Changes

- 1ab4435: An entity has a status, and a lane names its actor.

  Two things the panel editors need that the core never held. `cells.status`
  and `paths.status` arrive on one shared `entity_status` domain — `proposed`,
  `planned`, `built`, `live`, `at_risk`, `deprecated`, default `live` — so how
  far along a thing is lives in a column a badge renders from, not in a name
  prefix a reader has to parse. And `stakeholders` arrives: the deployment's
  cast list, one row per name across the whole deployment, no `service_id`
  (ADR 0003); a lane names its actor by a new nullable `lanes.stakeholder_id`,
  and a structural lane names nobody.

  Every change is additive. No row is touched, no IR field moves and the schema
  version does not; the panel editors that write these columns follow.

## 1.0.0

### Major Changes

- 1271d7b: `cells.links` held two concepts and was named after neither. It is now two
  tables, and the IR splits with it.

  The column stored a jsonb array in two shapes. Entries typed `url` were
  resources — what the cell points at, and all the Resources tab has ever
  listed. Entries typed `tech_description` were prose, a screenshot and a design
  link about ONE touchpoint used at that cell, found again by matching the
  entry's `label` against a line of `cells.content`. No label could name that
  column: `Links` over the tab promises both and shows one, `Resources` on the
  column is wrong for half its rows.

  `21000113000000` makes the split.

  - **`cell_touchpoints`** is the placement — this touchpoint, used at this
    cell — and it owns the `summary`, `screenshots` and `url` that belong to
    THIS moment. The old join was a string, so renaming a pill in the grid
    silently orphaned the paragraph behind it; a row survives a rename.
    `picture` and `pictures` fold into one `screenshots` array, which is what
    those two fields were always describing.
  - **`resources`** is what a cell — **or one placement** — points at, with
    `kind` carrying the subtype because a link is one kind of resource.
    `num_nonnulls(cell_id, cell_touchpoint_id) = 1` is in the schema rather than
    in the client, and that constraint is what lets a design link belong to the
    tool it documents rather than to the cell at large. Nothing attaches one to
    a placement yet; the constraint and the capability ship, and the migration
    header says so rather than leaving it to be discovered.
  - Provenance citations — a shape the IR never admitted but a jsonb column has
    always accepted — go to `evidence`, where they belong. The migration refuses
    to run on an entry shape it does not recognise, because dropping the column
    under one destroys it.
  - A cell's resources are replaced through `sync_cell_resources` in one
    transaction: the editor rewrites a whole list, every statement over the wire
    is its own transaction, and a deferred position constraint only forgives a
    collision until COMMIT.
  - `duplicate_path` and `duplicate_scenario` carry both new tables onto a copy.
    They carried this content before as a column of the row they copied, and a
    split that quietly stopped copying it would be the loss this change exists
    to end.

  **Upgrading: `schema_version` moves to 2026.08.31, and an IR must be
  migrated.** A cell's `links` array becomes `resources` (`label` → `name`) and
  `touchpoints` (`label` → `name`, `description` → `summary`,
  `picture`/`pictures` → `screenshots`). Every authored value survives under its
  new name and the step is content-preserving, so:

  ```
  python3 scripts/migrate_ir.py blueprint/blueprint.json \
    --workspace blueprint/blueprint-workspace.json --write
  ```

  carries sign-off hashes across with it.

### Minor Changes

- 42512f1: The arrow router is one generic engine, shared byte-for-byte with the
  deployment that pins this template.

  The template's arrows were routed by an overhead-rail bus: a backward loop that collided
  with a parallel row dropped into a reserved lane above the row and ran there.
  The deployment had since replaced that with a data-driven engine — anchor slots
  that separate a cell's in and out edges, a confluence planner that merges
  same-side arrivals into one trunk, gap-first corridor scoring that rides the
  roomiest lane instead of a pinned one, and a co-traveller offset pass — and
  retired the rail. This change adopts that engine wholesale.

  `blueprintArrowGeometry.ts` and the new `arrowAnchorSlots.ts` are now the SAME
  file in both repos, so the deployment can enrol them in its byte-identity drift
  gate and they cannot silently diverge again. The `OverheadRail*` geometry
  exports are gone; `planAnchorSlots` / `planArrowConfluences` /
  `planArrowCorridors` / `isWrapDependency` / `findBidirectionalDependencyPairs`
  replace them. The `BlueprintTriggerArrows` / `IntegratedTriggerArrows`
  renderers wire the new engine; the trigger data vocabulary is unchanged. The
  old rail-geometry unit test is replaced by the S1–S11 golden-geometry parity
  net (`src/dev/arrowSituationCatalog`), which freezes the `d` strings the shared
  engine produces.

  No deployment content leaks in: the engine is generic (no cell-id gates),
  standalone-clean.

## 0.5.0

### Minor Changes

- 5918319: A schema_version bump now ships the migration that carries existing
  `blueprint.json` files across it, in the same change.

  The IR has stated its own `schema_version` since the field existed, and the
  enum in `references/ir-schema.json` has listed the versions this template
  knows — but "knows" was doing two jobs. `2026.07.16` is in that list and an IR
  carrying it validated cleanly, then failed on the first renamed field, because
  the lane-vocabulary bump moved `lifecycle` → `service`, `layers` → `lanes`,
  `layer` → `lane` and `description` → `summary`. Being in the list means
  migratable, not current.

  `validate_ir.py` now refuses an IR that is not at the version the template
  speaks, with one error naming the command that fixes it, and stops before the
  body — otherwise every renamed field is reported as an unknown key and the one
  actionable line is buried. An unknown version says no migration carries it and
  where the steps that exist live.

  `scripts/migrate_ir.py` is that command. Steps chain, so a file two bumps
  behind is carried through both; the 2026.07.16 → 2026.08.25 step walks the
  tree by shape rather than rewriting text, so a link's `description` — prose
  about the link, still called `description` — is left alone.

  Sign-off is the reason this exists. It binds to a SHA-256 of a scenario
  subtree, and the renames land inside that subtree, so every recorded hash
  would stop matching and every signed scenario would silently de-sign.
  `--workspace blueprint-workspace.json` re-anchors each signed scenario's
  `content_hash` onto its migrated subtree and keeps `signed_at`/`signed_by` —
  sound because a step renames field names only, and a step that ever edits
  authored content declares itself non-content-preserving and gets refused. A
  hash matching neither side was already stale before the migration ran; it is
  reported and left, because that is a re-review, not a rename.

  The rule, in `references/customization.md` and next to the enum it governs:
  every future bump ships its migration in the same change. Consumers hold
  signed-off data that cannot be re-derived, so a bump with no step is a bump
  with no answer.

- 7ea6f15: A dependency edge in the IR now says which kind it is, so a `needs` edge
  survives an export.

  The database has checked `cell_dependencies.kind in ('trigger','needs')` since
  `20260729120000`, the app draws an arrow for one and a panel row for the other,
  and the authoring RPC refuses any third value. The IR was the half that could
  not say it: `$defs.trigger` carried `source` and `target` under
  `additionalProperties: false`, so a needs edge could not be written down at
  all. Exporting a blueprint that had one dropped it silently, and a re-import
  could not put it back. That is data loss, not a documentation gap.

  `schema_version` 2026.08.26 gives the edge an optional `kind`. Optional, and
  absent means `trigger` — the column default, and what every edge authored
  before this bump already meant — so every existing file is already a valid
  2026.08.26 file.

  The kind is part of the edge's **identity**, not just its payload. The
  database's uniqueness key is `(source_cell_id, target_cell_id, kind)`: one pair
  may carry both an arrow and a needs edge, and those are two rows. So the
  validator's duplicate check reads the kind, and the UUIDv5 qualified key ends
  in `#<kind>` — without that, the second edge of a pair would be minted with the
  first one's id and quietly replace it. Every dependency edge's id therefore
  changes across this bump, which is invisible in practice: an import is a
  scenario-scoped delete-and-reinsert, and nothing outside `cell_dependencies`
  references an edge id.

  **The migration, and what it does to sign-off.** The rule holds — the bump
  ships its step in the same change — and the step is a version stamp and nothing
  else. Sign-off binds to a SHA-256 of a scenario subtree, and a dependency edge
  lives inside one, so writing `"kind": "trigger"` into every existing edge would
  have re-hashed every signed scenario in every workspace. That would have been
  _content-preserving_ in the sense the machinery means — no authored value would
  have moved, and `--workspace` would have re-anchored each hash — but it would
  have put every signed blueprint one forgotten flag away from de-signing itself,
  in exchange for saying at length what absence already says. So
  `2026.08.25 → 2026.08.26` is `content_preserving = True` and touches nothing:
  every scenario hashes to the byte-identical digest afterwards, and `--workspace`
  reports each signed scenario as already anchored. The suite checks that, rather
  than the changelog asserting it.

  Both v1 adapters carry the kind, because both project the same field function —
  the SQL seed emits it as a column, the no-DB module serves it on the edge, and
  `npm run check:parity` compares them. The test suite covers a `needs` edge
  round-tripping through both, a pair carrying both kinds getting two distinct
  ids, an unknown kind refused by name, the pre-bump fixture migrating with its
  hashes intact, and `2026.08.25` refused as superseded with the upgrade command
  in the message.

  The database gets a migration too, and it carries no DDL: the columns were
  already right. `schema_version` is one contract version across both halves, so
  the number moves on both. A target left at `2026.08.25` stays supported and
  stays correct.

- d5041c4: The portable Postgres core and the Supabase recipe are generated from the
  migrations, and CI applies both.

  The partition was a paragraph in the header of `supabase/schema.reference.sql`,
  a file that was never executed and was hand-refreshed beside a tree that moved
  underneath it. It is now marked in the migrations — `-- @recipe` and `-- @core`
  — and `npm run generate:portable-core` emits both halves from those marks into
  `supabase/generated/`. The snapshot is deleted; a second hand-maintained SQL
  artifact was the drift surface this repo kept paying for.

  The claim is executed rather than stated. Every pull request applies the
  generated core to a stock `postgres:17` with no Supabase and no shim in front
  of it, then applies the recipe on top, then checks that the full migration
  replay lands in the same place. A deliberately broken core is fed to the same
  job, so the guard is known to be able to fail.

- 8b66dfe: The app's backend seam is named: repository interfaces per aggregate
  (`src/lib/backend/ports.ts`), an identity port that answers in tiers rather
  than claims, and two conformance levels — Transactional and Idempotent — so a
  store without transactions can serve the app correctly and visibly. A
  framework-free conformance suite ships with it, passed by two reference
  implementations. `adapter-contract.md` no longer states our PostgREST coupling
  as though it were a property of the world.
- 134a529: The schema speaks the vocabulary the rulebook already taught. Ten renames:
  `layers` → `lanes`, `cells.layer_id` → `lane_id`, `layers.layer_role` →
  `lane_role`, `cell_triggers` → `cell_dependencies`, `service_lifecycles` →
  `services` (and `service_lifecycle_id` → `service_id`), `service_scenarios` →
  `scenarios` (and `service_scenario_id` → `scenario_id`), `row_position` ·
  `column_position` · `slot_position` · `order_position` → `position`, and
  `description` → `summary` on services, phases, scenarios, paths and cells.

  The package was half-renamed and contradicting itself in one statement:
  `create or replace function public.add_lane` inserted into `public.layers`.
  `references/data-model.md` — what the canvas agent reads before touching data
  — was already 100% the new vocabulary, so the agent was taught a schema its
  own backend did not have.

  Breaking for anyone holding data or calling the RPCs directly. Table and
  column names, `upsert_cell(lane_id)`, `add_lane(lane_role, at_position)`,
  `create_phase(summary)`, and the IR's field names all move. The database now
  carries a `schema_version` row saying which shape it is, so a mismatch is a
  named error instead of a column that is not there.

  Not renamed, deliberately: `cell_dependencies.kind` keeps `('trigger',
'needs')` — "trigger" there is one of two kinds of dependency, not the
  container; `slices.description` stays, because a slice's description is prose
  about the slice rather than a one-line gloss of a row; and the
  `tech_description` link payload keeps its `description`.

  Upstream migrations are now allocated from a reserved timestamp band
  (`21000101000000`–`21991231235959`) so a fork's pull can only ever append.

- 03c71e1: The plugin contract's identifier lane is written down in `identifiers.json`,
  generated from the tree and diffed in test, so renaming a skill, reference,
  schema, agent, hook or tool shows up in review instead of at a consumer's
  runtime. One version number is pinned across `package.json`, `plugin.json` and
  the CHANGELOG.

  The two v1 adapters now project one shared field list, and
  `scripts/adapter_parity.py` checks that they agree — closing a drift that had
  the no-DB adapter silently dropping `cell_key`, `position`, every cell
  spec field and the edge `kind`. No-DB is stated as the first run, and as
  read-only.

  CI runs all of it, plus the IR round-trip suite that previously ran nowhere.

- 134a529: **"Did the migration run" is answerable.** `npm run check:target` asks the live
  database for `public.schema_version` over the same Data API and anon key the app
  uses, and distinguishes _never migrated_ from _stale_ from _fine_. It matters
  more here than elsewhere: without a configured project the app serves its no-DB
  fallback and renders perfectly, so a misconfigured target looks exactly like a
  working one. Not in CI — CI has no target, and a check that needs a live
  database is a check that gets skipped and then trusted.

  **A desync runbook** for forks whose migration history diverged before the
  reserved band existed: read both histories, apply pending files out of order
  with `db push --include-all` (safe, because no upstream migration depends on
  anything a fork built), repair `supabase_migrations.schema_migrations` per
  version when they genuinely disagree, and `db pull` as the last resort. Inside
  the band it cannot recur.

  **The boundary, stated as a boundary** rather than a list of apologies, beside
  README's "Bring your own backend": no auth beyond the anon/authenticated split,
  no multi-tenancy, no backup or restore, no migration ops beyond the shipped
  chain — and the one operational failure the package does own, with the runbook
  attached.

  **The seed's role is on the record**: `supabase/seed.sql` is the META-BLUEPRINT,
  the service blueprint of this template itself, and one generator emits it and
  the no-DB fallback module from the same source. That is why "no database" is a
  supported mode and not a degraded one.

### Patch Changes

- e2ebf0e: The two contracts this repo ships are named in an ADR, and the tag that makes
  one of them pinnable is now checkable. ADR 1 records the split — a plugin
  contract consumers resolve by name at runtime, and a template surface they fork
  — the frozen identifier layer inside it, that semver covers the plugin contract
  only, and why `private: true` stays with no `files` allowlist. Every release
  gets an annotated `v<version>` tag on `main`, which is the only thing a
  consumer can pin, and `npm run check:release-tag` refuses a tag that names an
  unreleased version, a tag pointing at a tree that states a different one, and
  — once tagging has started — a release that skipped it.
- a30cd05: `schema.reference.sql` is now checked rather than hand-refreshed: offline
  against the generated types, and in CI by replaying every migration against a
  stock Postgres behind a small shim. The first run found the snapshot two
  migrations stale — `agent_sessions` and `agent_messages` were missing — which
  is what an adopter carrying it would have built.

All notable changes to the `ub` plugin are
documented here. The plugin and the blueprint template app share this
repository and one version number, checked by
`npm run check:version` across `package.json`, `.claude-plugin/plugin.json`
and this file's top heading.

**Semver is scoped to the plugin contract** — the identifier lane recorded in
[`identifiers.json`](./identifiers.json): skill names, reference filenames,
schema filenames, agent names, hook events, agent tool names. A rename there is
a major, because a consumer resolves those by name at runtime with nothing to
catch a break. Refactoring the template app is not, however much of it moves: a
consumer forks that surface and takes our changes as a visible merge conflict.
Entries below flag identifier changes under **### Plugin contract**. The two
contract tiers and what semver covers are recorded in
[ADR 1](./docs/adr/0001-two-contract-tiers-and-a-frozen-identifier-layer.md);
how a release is cut and tagged is in
[`docs/engineering/releasing.md`](./docs/engineering/releasing.md).

## 0.4.0 — 2026-08-18

Template app brought to parity with its production reference deployment;
dead visual-walkthrough machinery removed ahead of the release cut.

- **Dead-code sweep**: the flag-gated visual-walkthrough playback feature
  (constant-false since it shipped) is deleted — flag, context, shell,
  modal, play button, row overlay — along with three never-imported
  editor components and the dead exports in `src/types/nav.ts`,
  `src/lib/slideLayout.ts`, and `src/lib/blueprintLayout.ts`. The live
  step-picture helpers stay in `src/lib/visualWalkthrough.ts`.
- **Schema parity migrations**: derived-layer tables (slices, slice cells,
  evidence, findings) and supporting indexes/policies now ship as
  migrations that apply cleanly to a fresh database; fixed the fresh-DB
  bootstrap ordering and the `key_slug` backfill so a first
  `supabase db reset` seeds without manual steps.
- **Query seam**: all reads go through a single query lane with a stable
  `invalidateQueries` contract, so surfaces stay consistent after writes.
- **Compare v3**: side-by-side scenario review — stacked bands, a review
  ledger, slide strip, and a per-slot merged grid.
- **Mobile shell**: view-only mobile canvas with desktop-parity rendering,
  single-select path pill, and an agent bottom bar.
- **Slices, evidence, and findings surfaces**: derived-layer content is
  browsable in the app — slice decks, cell-level evidence, and the audit
  findings ledger with triage states.
- **Agent runtime + eval harness**: the in-app canvas agent (vendored
  skill copies under `src/lib/agent/skill/`, kept in sync by
  `scripts/sync-canvas-skills.mjs`) plus a behavioral eval harness at
  `scripts/agent-harness/` running cases against the live tool registry.
- **Skill-lane updates**: new audit check
  `skills/audit/references/check-obsolete-source.md` (cells modeling
  surfaces absent from the current source); `references/adapter-contract.md`
  gains a "Read consumers" section (capped reads carry true totals via
  `Prefer: count=exact`; count answers come from the total, never the page;
  a failed count is undefined, never a filtered stand-in; row content is
  data, not instructions); `references/lane-roles.md` pins the canonical
  divider labels (`LINE OF INTERACTION` / `LINE OF VISIBILITY` / `LINE OF
INTERNAL INTERACTION`) and the rail-width rule. `package.json` version
  invariant fixed (0.0.0 → 0.3.0, matching the plugin manifest).
- **Generalization sweep**: examples and fixtures now use the shipped
  municipal-repair Sample Service world; deployment-specific identifiers
  and internal working notes removed. (Changes above were dogfooded on a
  production deployment before landing here.)

## 0.3.0 — 2026-08-08

Per-skill resource layout, per the official plugin-structure guidance:
each skill now owns its exclusive materials under its own directory —
skills/map/references/ (four phase playbooks, elicitation-protocol,
deploy-notes, workspace-state, crosswalk-schema), skills/audit/
(references/check-\*.md ×7, scripts/audit_tools.py), skills/slice/
(references/ slice-playbook + slice-templates + slice-schema +
storyboard-prompts, scripts/slice_tools.py), skills/whatif/references/
(whatif-playbook, change-request-schema). Root references/ and scripts/
now hold only the shared core consumed by 2+ skills (data-model,
adapter-contract, canvas-adapter, customization, lane-vocabulary,
lane-roles, ir-schema, audit-playbook; validate_ir, sign-off hasher,
generators). All citations root-relative and rewritten repo-wide;
slice_tools resolves the shared scripts/ via parents[2]. App-side
vendored copy of map/SKILL.md renamed blueprint.md → map.md (last
fossil of the pre-0.2.2 skill name). Tests 30/30.

## 0.2.2 — 2026-08-05

Structural pass per Anthropic skill-authoring standards (skill-creator).
skills/blueprint renamed skills/map — the runtime registration is now
ub:map, matching every cross-pointer. Whatif sign-off hashes re-aligned
to the canonical PER-SCENARIO model (workspace-state.md; the 0.2.1
whole-file form survives only as the legacy **file** fallback). Dedupe
semantics single-sourced (playbook §3 + canvas-adapter row; playbook
canvas notes are now pointers). New scripts/audit_tools.py: fingerprint /
export / dedupe / report — the reference implementation of playbook §2-§3
and the no-DB ledger substrate. Roster & skips moved to playbook §1.5.
journey_stage added to lane-roles. Slice type table single-sourced in
SKILL.md. blueprint-reviewer three modes. Map description gains reverse
pointers to audit/whatif. adapter-contract multi-account paragraph
compressed (mechanics live in review-import §6). sweep_orphans.py marked
planned. plugin.json says JSON IR.

## 0.2.1 — 2026-08-05

Nineteen text-level gaps closed after blind cold-follow evals of ub:audit
and ub:whatif (fresh-context agents following the SKILL.mds literally on a
real workspace): two-target staleness guard, **file** hash form, orphan-
reopen gap shape, zero-cell fingerprint reason slugs, audit cell-key
convention, export + no-DB findings-report substrate, entry-state
precedence, roster-owned skips, reviewer whatif-claim mode, impact-tracer
trigger-only IR caveat, accept-route hard stop, plus polish. AGENTS.md
router added for non-Claude harnesses (Cursor/Codex). Canvas adapter:
check docs binding per executed check; audit pacing rule (batch doc
reads, record per check).

## 0.2.0 — 2026-08-05

The plugin is `ub` and its skills are bare tokens (`map`, `slice`,
`audit`, `whatif`), so invocations read `ub:map`, `ub:slice`,
`ub:audit`, `ub:whatif` on every surface (IDE plugin and canvas composer).
Prose references swept across skills, references, agents, and hooks.

Canvas translation upgraded from read-only to full write parity:

- `ub:audit` on canvas records findings rows via `record_finding` with the
  same dedupe discipline (open updates in place, dismissed stays dismissed,
  resolved reopens); triage via `set_finding_status`; ledger via
  `list_findings`. Canvas cell identity uses cell ids (cell_keys written as
  ids), so canvas and IDE fingerprints are separate dedupe spaces.
- `ub:whatif` on canvas keeps the variant conversational (analysis never
  writes cells), records consequence findings (source `whatif`), and on
  explicit acceptance promotes directly through the ordinary canvas write
  tools; optimistic-concurrency tokens replace the hash staleness guard.
- `references/canvas-adapter.md`, `references/audit-playbook.md` §6, and
  `references/whatif-playbook.md` §5 carry the updated translation.

## 0.1.0 — 2026-07-16

Initial plugin scaffold.

- `ub` skill: entry-state detection, playbook gating, hard
  rules (validator gate, hash-bound sign-off, system-vs-journey refusal,
  secrets rules, target confirmation, co-equal backend choice), deterministic
  per-phase exit conditions.
- Agents: `document-reader` (corpus survey / deep read / foreign-blueprint
  extraction), `blueprint-reviewer` (fresh-context adversarial IR review),
  `render-checker` (post-import browser walk with screenshots).
- Hooks: session-start workspace status, post-edit IR auto-validation,
  pre-write service-role secret guard.
- References: IR JSON Schema, crosswalk JSON Schema, data model, lane roles,
  adapter contract, workspace-state spec, ingest / co-create / translate /
  review-import playbooks, elicitation protocol, deploy notes, customization
  guide.
- Assets: `HANDOFF.md.template` for per-workspace maintenance handoff.
- Not yet included (next units): `scripts/validate_ir.py`,
  `scripts/generate_seed_sql.py`, `scripts/generate_fallbacks.py`,
  `assets/schema.ddl.sql`, `assets/policies.supabase.sql`, marketplace entry.
