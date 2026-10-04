/// <reference types="vitest/config" />
import { existsSync, readFileSync, renameSync, rmSync, writeFileSync } from 'fs'
import path from 'path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv, type Plugin } from 'vite'

/**
 * Where `@/…` points: the running repository's own `src`, or the package's,
 * with that `src` laid over it PER PATH.
 *
 * A deployment that imports the template as a dependency reads the
 * application out of `node_modules` and keeps, in its own `src`, only the
 * files it still has a reason to hold — its residents. Its build config is
 * the same file as this one — held byte-identical by the deployment's
 * reconciled set — so the choice cannot be made by editing it there. It is
 * made by what is on disk: when the package is installed, the package is the
 * application and `src` is the overlay; when it is not, `src` is the
 * application. In the template the package is never installed — it has no
 * self-dependency — so there the alias points at `src` and the overlay
 * plugin is never loaded. The two tsconfigs carry the same pair of roots, in
 * the same order, and already resolve per module.
 *
 * The ALL-OR-NOTHING rule this file used to state — the alias pointed at one
 * root, the first that existed, so a half-vendored `src` captured every
 * import and resolved none of the rest — is withdrawn; the decision that the
 * deployment overlays the package per path records the overlay, and the
 * package's `overlay` module is the rule. That module is imported BY
 * PACKAGE NAME, which is the one spelling that resolves on both sides: out of
 * `node_modules` in a deployment, and by self-reference in the template. A
 * relative import would name a file a deployment does not have, and a config
 * that imports a module the tree lacks is a config that does not load.
 *
 * THE PAIR IS WRITTEN DOWN A FOURTH TIME, in `scripts/sweep.mjs`, for the
 * checks that WALK the application — they have to land on the files the build
 * resolves or they are measuring a tree nobody ships. They cannot read it from
 * this file: it is loaded by bundling it in isolation. The template's own
 * suite is what makes the copies one fact: edit the roots in the template and
 * it goes red.
 */
const APP_SOURCE_ROOTS = [
  path.resolve(import.meta.dirname, './src'),
  path.resolve(import.meta.dirname, './node_modules/uno-blueprint/src'),
]

const [residents, packagedApplication] = APP_SOURCE_ROOTS as [string, string]

/**
 * Whether the application arrived as a PACKAGE.
 *
 * Everything below turns on this one fact, and nothing below is reached in a
 * repository of the other kind. The same bytes serve both: the branch is
 * taken by what is on disk, exactly as the roots above are.
 */
const applicationIsAPackage = existsSync(packagedApplication)

const appSource = applicationIsAPackage ? packagedApplication : residents

/**
 * The overlay, when there is one: the package's root is the alias, and the
 * plugin answers with a resident's file for every path `src` still holds.
 * Loaded only where the package is — see the account above of why by name.
 */
const overlay = applicationIsAPackage
  ? (await import('uno-blueprint/overlay')).overlayPlugin({
      layers: APP_SOURCE_ROOTS,
    })
  : null

/**
 * What the dev server pre-bundles, once the application lives in
 * `node_modules`.
 *
 * A production build is unaffected by any of this — it has no pre-bundling
 * step — which is why the whole of it is invisible to a build, to a test run,
 * and to every check. Only the dev server pre-bundles, and only a deployment
 * has an application inside `node_modules` for it to pre-bundle.
 *
 * TWO THINGS GO WRONG, and they have to be fixed together.
 *
 * The first is the application itself. The optimizer bundles a dependency
 * with rolldown, and rolldown knows nothing of Vite's own import forms: a
 * `?raw` specifier reaches it as a filename ending in the four characters
 * `?raw`, which names no file, and the build stops. `role.md` and the skill
 * and reference documents are all reached that way, so the whole application
 * fails to pre-bundle and the page never loads. That is what `exclude` is
 * for. It takes the package's own name AND `@`, because the alias resolves
 * into `node_modules` too and every `@/…` import is otherwise registered as
 * a dependency of its own.
 *
 * The second is what excluding costs. Vite discovers dependencies by
 * crawling from an entry, and it refuses to register one whose importer sits
 * inside `node_modules` — a rule that is right for a normal dependency and
 * wrong for an application that lives there. Exclude the application and the
 * crawl stops at it, so nothing the application imports is pre-bundled
 * either, and the first CommonJS-only package it reaches is served to the
 * browser as CommonJS and throws on a named export. So `entries` points the
 * crawl at the application's own files, which is what puts its dependencies
 * back on the list; the tests are held out because a deployment installs the
 * application's dependencies and not its development ones, and a crawl that
 * reads a test file asks for a package that is not there.
 */
const packagedApplicationOptimizeDeps = {
  exclude: ['uno-blueprint', '@'],
  entries: [
    'index.html',
    `${appSource}/**/*.{ts,tsx}`,
    `!${appSource}/**/*.test.{ts,tsx}`,
    // And the residents, which import from the package too.
    `${residents}/**/*.{ts,tsx}`,
    `!${residents}/**/*.test.{ts,tsx}`,
  ],
}

/**
 * Where `~/…` points: the deployment's own source root.
 *
 * The paragraph above settles where the APPLICATION comes from, and what a
 * deployment's `src` is: residents, files the package also has, each held for
 * a reason the residents list records. The deployment's OWN files — its
 * config module, its content, whatever else it authors — are not residents,
 * and do not go in `src`: a file there stands for a package file of the same
 * path, and a file that stands for nothing is a resident with no reason.
 *
 * So they live in `deployment/`, reached by an alias that is deliberately NOT
 * the application's. Two roots, two prefixes, and an import says at a glance
 * which side it is on: `@/…` is the application, whichever layer answers,
 * and `~/…` is this deployment's.
 *
 * The directory is named in the template rather than by each deployment,
 * because a deployment holds this file byte-identical. The same bytes have to
 * serve a repository that has a deployment root and one that has not. The
 * template is the second kind: it has no `deployment/` and never will, so
 * there the alias is never reached and the test glob below matches nothing.
 * The template's own suite holds both halves — that the three lines name the
 * root, and that a tree without one is unchanged by their naming it.
 */
const deploymentSource = path.resolve(import.meta.dirname, './deployment')

/**
 * Where under its host the app is served: `/`, or a prefix such as `/demo/`.
 *
 * ONE SETTING, `BASE_PATH`, read from the build environment — a host's build
 * settings, a `[build.environment]` table, or a `.env` file — and never from
 * `DeploymentConfig`, because a config is read when `App` renders and the
 * prefix has to be in every asset URL the build emits. Vite takes it as
 * `base`, and the application reads it back as `import.meta.env.BASE_URL`
 * through its one base-path module, which is where every path the app reads
 * or writes crosses it.
 *
 * The build is written UNDER the prefix too — `dist/demo/…` — so the files on
 * disk sit at the paths the browser asks for. That is what lets one output
 * serve both ways a host mounts it: published directly, where `/demo/*` falls
 * back to `/demo/index.html`, and proxied from another site, which forwards
 * `/demo/*` to the same path here unchanged. `vite preview` serves the nested
 * output at the prefix, so the render walk previews exactly what ships.
 *
 * Unset, both are what they always were: `base` is `/` and the output is
 * `dist`. The rule for the value is stated inline rather than imported: this
 * file is bundled in isolation. The template's hosting check states it too,
 * and the template's own suite holds the two to one answer and pins the
 * application's base-path module to the same table.
 */
export function basePath(value: string | undefined): string {
  const trimmed = (value ?? '').trim()
  if (!trimmed) return '/'
  if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed) || trimmed.startsWith('.') || /[?#]/.test(trimmed)) {
    throw new Error(`BASE_PATH must be a path such as /demo/, not ${JSON.stringify(value)}`)
  }
  const segments = trimmed.split('/').filter(Boolean)
  return segments.length === 0 ? '/' : `/${segments.join('/')}/`
}

/**
 * The hosting rules a build served from a path writes for itself.
 *
 * `netlify.toml` is written for the root, and a repository that serves the
 * root from it cannot also serve a prefix from it. So under a prefix the build
 * writes the prefixed rules into the files a host reads BEFORE that table:
 *
 *   `_redirects` — `/` sent on to the prefix with a 301, the
 *   `/<prefix>/assets/*` 404 for a hashed chunk the deploy no longer ships,
 *   then the `/<prefix>/*` single-page fallback. In that order, and none of
 *   them forced: the 404 below the fallback is never reached, and a forced
 *   404 answers for every asset that IS there.
 *
 *   `_headers` — the year-long cache on the hashed output moves to
 *   `/<prefix>/assets/*`, the only path the hashed names are served from.
 *   Headers that already name it are a deployment writing the rule by hand,
 *   and are left as they are.
 *
 * A `_redirects` the repository wrote itself is kept, first, so its own rules
 * still apply above the fallback. A line that states one of the generated
 * rules exactly is dropped, since the build writes it below. Any other rule
 * that answers a path the generated rules are for — `/`, the prefix itself,
 * or every path under it, through a splat or a `:placeholder` — would answer
 * in their place, and the build refuses it in one line rather than publish a
 * site whose deep links depend on which rule a host met first. The rules are
 * written once, so a file the build wrote passed back in comes out unchanged.
 *
 * The rules are stated here rather than imported because this file is bundled
 * in isolation. The template's hosting check states them too, and the
 * template's own suite reads what this writes back through that check, so the
 * two are one fact.
 */
const IMMUTABLE = 'public, max-age=31536000, immutable'

/**
 * Whether a redirect's `from` answers for the app under `base`: the site root,
 * the prefix itself, or any path beneath it — the case a splat or a
 * placeholder in the segment after the prefix makes. A literal segment there
 * (`/demo/api/*`) names a path of the repository's own and answers nothing
 * else.
 */
export function answersForTheApp(from: string, base: string): boolean {
  if (from === '/') return true
  const want = base.split('/').filter(Boolean)
  const have = from.split('/').filter(Boolean)
  for (const [index, segment] of want.entries()) {
    const said = have[index]
    if (said === undefined) return false
    if (said === '*') return true
    if (said !== segment && !said.startsWith(':')) return false
  }
  const next = have[want.length]
  return next === undefined || next === '*' || next.startsWith(':')
}

export function hostRulesUnder(
  base: string,
  own: { redirects: string | null; headers: string | null },
): { redirects: string; headers: string } {
  const assets = `${base}assets/*`
  const rules = [
    ['/', base, '301'],
    [assets, `${base}assets/:splat`, '404'],
    [`${base}*`, `${base}index.html`, '200'],
  ]
  const written = rules.map((rule) => rule.join('  '))
  const comment = [
    `# Written by the build for BASE_PATH=${base}: the site root goes on to the`,
    '# prefix, a hashed chunk the deploy no longer ships answers 404, and every',
    '# other path under the prefix is the app. Read before netlify.toml.',
  ]

  const kept: string[] = []
  for (const [index, raw] of (own.redirects ?? '').split('\n').entries()) {
    const line = raw.trim()
    if (comment.includes(line)) continue
    if (!line || line.startsWith('#')) {
      kept.push(raw)
      continue
    }
    const [from, to, status] = line.split(/\s+/)
    if (rules.some((rule) => rule.join(' ') === [from, to, status].join(' '))) continue
    if (!rules.some(([generated]) => generated === from) && !answersForTheApp(from, base)) {
      kept.push(raw)
      continue
    }
    throw new Error(
      `public/_redirects line ${index + 1} sends ${from}, which a host reads before the rules ` +
        `this build writes for BASE_PATH=${base} (${rules.map(([one]) => one).join(', ')}) and ` +
        'so answers in their place. Remove the line; the build writes the prefixed rules itself.',
    )
  }

  const before = kept.join('\n').trim()
  const redirects = `${before ? `${before}\n\n` : ''}${[...comment, ...written].join('\n')}\n`

  const block = `${assets}\n  Cache-Control: ${IMMUTABLE}\n`
  const lines = (own.headers ?? '').split('\n')
  let headers: string
  if (!own.headers?.trim()) headers = block
  else if (lines.some((line) => line.trimEnd() === assets)) headers = own.headers
  else if (lines.some((line) => line.trimEnd() === '/assets/*')) {
    headers = lines.map((line) => (line.trimEnd() === '/assets/*' ? assets : line)).join('\n')
  } else headers = `${own.headers.replace(/\n*$/, '')}\n\n${block}`

  return { redirects, headers }
}

/**
 * The host's own files, put back where the host reads them, with the rules
 * the prefix needs.
 *
 * `public/_headers` and `public/_redirects` are read from the ROOT of the
 * published directory and nowhere else. Under a prefix the whole output —
 * `public/` included — lands in `dist/<prefix>/`, so without this step the
 * two files are published one level down, where the host never looks, and
 * every rule in them (the CSP, the hashed-asset cache) silently stops
 * applying. Once they are back at the root, `hostRulesUnder` writes the
 * prefixed rules into them. At the root there is nothing to move or write,
 * and the step is not loaded.
 */
const HOST_FILES = ['_headers', '_redirects']

function hostFilesAtPublishRoot(base: string): Plugin[] {
  if (base === '/') return []
  const publishRoot = path.resolve(import.meta.dirname, 'dist')
  const at = (file: string) => path.join(publishRoot, file)
  const read = (file: string) => (existsSync(at(file)) ? readFileSync(at(file), 'utf8') : null)
  return [
    {
      name: 'host-files-at-publish-root',
      apply: 'build',
      closeBundle() {
        // Only `dist/<prefix>/` is emptied before a build under a prefix, so
        // a previous build's files at the root are still there. A file the
        // repository does not ship this time is one to remove, not to read
        // back as if the repository had written it.
        for (const file of HOST_FILES) {
          const nested = path.join(publishRoot, base, file)
          if (existsSync(nested)) renameSync(nested, at(file))
          else rmSync(at(file), { force: true })
        }
        const written = hostRulesUnder(base, {
          redirects: read('_redirects'),
          headers: read('_headers'),
        })
        writeFileSync(at('_redirects'), written.redirects)
        writeFileSync(at('_headers'), written.headers)
      },
    },
  ]
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const base = basePath(loadEnv(mode, import.meta.dirname, '').BASE_PATH)
  return {
    base,
    build: { outDir: base === '/' ? 'dist' : path.join('dist', base) },
    plugins: [
      ...(overlay ? [overlay] : []),
      react(),
      tailwindcss(),
      ...hostFilesAtPublishRoot(base),
    ],
    optimizeDeps: applicationIsAPackage ? packagedApplicationOptimizeDeps : {},
    resolve: {
      alias: {
        '@': appSource,
        '~': deploymentSource,
      },
    },
    test: {
      // Node by default (colour math, layout helpers, script-level suites);
      // component tests opt into jsdom per-file with a
      // `// @vitest-environment jsdom` docblock.
      environment: 'node',
      // The suite runs with the dev-server flags OFF, whatever a developer
      // keeps in their own `.env.local`. `VITE_DEV_AUTHORING_UI=true` is how a
      // deployment shows its edit surfaces on a dev server without an
      // authoring key; it is read once at module load, so no `stubEnv` inside
      // a test can reach it, and a suite that inherits it starts with write
      // flags already up. That fails on the machine that has the flag and
      // passes in CI, which is the shape of failure that costs the most to
      // diagnose.
      env: { VITE_DEV_AUTHORING_UI: '' },
      include: [
        'src/**/*.test.ts',
        'src/**/*.test.tsx',
        // A deployment's own tests, in its own root. The template has none —
        // see the deployment source root above.
        'deployment/**/*.test.ts',
        'deployment/**/*.test.tsx',
        'scripts/tests/**/*.test.mjs',
        // The initialiser's, beside the package they test. A workspace is
        // written without that folder, and there this matches nothing.
        'packages/**/*.test.mjs',
      ],
    },
  }
})
