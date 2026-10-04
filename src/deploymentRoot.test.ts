/// <reference types="vitest/config" />
import { execFileSync } from 'node:child_process'
import {
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  realpathSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import ts from 'typescript'
import { createServer, resolveConfig } from 'vite'
import { afterAll, describe, expect, it } from 'vitest'
import { coverFigures } from '@/components/cover/coverModel'
import { filesOn, hasSource } from '@/lib/sourceTree'
import { coverContent } from '@/content/coverContent'

/**
 * The deployment source root: the second place application source can live.
 *
 * A deployment that mounts this package stops keeping a copy of the
 * application and reads it out of the package instead — `@/…` finds the
 * package, laid under whatever its own `src` still holds (its residents; see
 * the overlay block below). That leaves its OWN files with nowhere to go: its
 * config module, its content, whatever else it authors. They are not
 * residents — a file in `src` stands for a package file of the same path, and
 * a file that stands for nothing is a resident with no reason.
 *
 * So they go in `deployment/`, and the three build files name it: an alias
 * that is not the application's, a TypeScript include, and a test glob. All
 * three ship HERE, in the template, because all three are files a deployment
 * holds byte-identical to this repository's — the same bytes have to serve a
 * repository that has a deployment root and one that does not.
 *
 * This repository is the second kind. It has no `deployment/` directory and
 * never will, so every assertion below about what the configuration NAMES is
 * paired with one about this tree being unchanged by the naming.
 */

/**
 * The tree this guard runs in: the working directory, the same root
 * `lib/sourceTree` takes the reading from — the reading this file already
 * asks, two imports up.
 *
 * It used to be arithmetic on this file's own URL, which was right whatever
 * directory the runner started in. That is a real property and this trades it
 * away deliberately: `scripts/tests/every-sweep-knows-what-it-measures.test.mjs`
 * keeps the opposite spelling, with the reason, for a suite that measures the
 * scripts of THIS tree. A guard of the APPLICATION cannot have it — the
 * application is the deployment's `src` laid over the package's, and a guard
 * resolved from its own location inside `node_modules` would measure the
 * package rather than the tree that installed it.
 */
const repoRoot = process.cwd()

/** The directory the convention reserves, and the alias that reaches it. */
const DEPLOYMENT_ROOT_DIRNAME = 'deployment'
const DEPLOYMENT_ALIAS = '~'

function aliasEntries(alias: unknown): Array<{ find: unknown; replacement: string }> {
  return alias as Array<{ find: unknown; replacement: string }>
}

/**
 * Throwaway trees. Every staged tree below is registered here and removed when
 * the file is done with it, whether its test passed or threw.
 */
const scratches: string[] = []

afterAll(() => {
  for (const scratch of scratches) rmSync(scratch, { recursive: true, force: true })
})

/**
 * A tree holding this repository's build files byte for byte, and everything
 * this repository has installed. What a test puts in it after that — a package
 * to read the application out of, a `src` to read it out of instead — is what
 * that test is about.
 */
function stageBuildFiles(): string {
  const scratch = mkdtempSync(path.join(tmpdir(), 'uno-blueprint-deployment-'))
  scratches.push(scratch)

  for (const file of [
    'vite.config.ts',
    'tsconfig.json',
    'tsconfig.app.json',
    'tsconfig.node.json',
  ]) {
    copyFileSync(path.join(repoRoot, file), path.join(scratch, file))
  }
  writeFileSync(
    path.join(scratch, 'package.json'),
    `${JSON.stringify({ name: 'a-deployment', private: true, type: 'module' }, null, 2)}\n`,
  )

  const modules = path.join(scratch, 'node_modules')
  mkdirSync(modules)
  for (const entry of readdirSync(path.join(repoRoot, 'node_modules'))) {
    symlinkSync(path.join(repoRoot, 'node_modules', entry), path.join(modules, entry))
  }

  return scratch
}

/**
 * This repository, under the name a deployment depends on it by. A link rather
 * than a copy: the point is to resolve against the real package, not a
 * snapshot of it.
 */
function mountThePackage(scratch: string): void {
  symlinkSync(repoRoot, path.join(scratch, 'node_modules', 'uno-blueprint'))
}

/**
 * The package INSTALLED, under the name a deployment depends on it by — copied
 * in rather than linked.
 *
 * The distinction is the whole reason two of the blocks below exist. Vite
 * resolves a symlink to its target before it decides whether a file is in
 * `node_modules`, so a linked package is never one: it is never pre-bundled,
 * and a path inside it is never the path the browser would ask for. A
 * deployment installs. This installs.
 *
 * `src` and `docs` both, because an install ships the published tree and the
 * application reaches out of `src` for the figures it draws; and `scripts`,
 * because the config imports the overlay out of the package's `scripts/` the
 * moment the package is there. Nothing else is needed: what a test puts in the
 * tree after this is what that test is about.
 */
function installThePackage(scratch: string): string {
  const installed = path.join(scratch, 'node_modules', 'uno-blueprint')
  mkdirSync(installed, { recursive: true })
  copyFileSync(path.join(repoRoot, 'package.json'), path.join(installed, 'package.json'))
  for (const directory of ['src', 'docs', 'scripts']) {
    cpSync(path.join(repoRoot, directory), path.join(installed, directory), {
      recursive: true,
    })
  }
  return path.join(installed, 'src')
}

function readTsConfig(configPath: string, overrideInclude?: string[]) {
  const read = ts.readConfigFile(configPath, ts.sys.readFile)
  expect(read.error).toBeUndefined()
  const json = read.config as { include?: string[] }
  if (overrideInclude) json.include = overrideInclude
  return ts.parseJsonConfigFileContent(json, ts.sys, path.dirname(configPath))
}

describe('the deployment source root', () => {
  it('is what the alias that is not the application’s points at', async () => {
    const config = await resolveConfig(
      { configFile: path.join(repoRoot, 'vite.config.ts') },
      'serve',
    )
    const entries = aliasEntries(config.resolve.alias)

    const app = entries.find((entry) => entry.find === '@')
    const deployment = entries.find((entry) => entry.find === DEPLOYMENT_ALIAS)

    expect(app?.replacement).toBe(path.join(repoRoot, 'src'))
    expect(deployment?.replacement).toBe(
      path.join(repoRoot, DEPLOYMENT_ROOT_DIRNAME),
    )
    // Two roots, two aliases. One prefix cannot name both: Vite maps a prefix
    // to exactly ONE directory, so a shared prefix would be a choice between
    // the roots rather than a pair of them — and where a per-module fallback
    // IS available, it is the path-shadowing this seam exists to end.
    expect(deployment?.replacement).not.toBe(app?.replacement)
  })

  it('has its tests collected by the shipped test globs', async () => {
    const config = await resolveConfig(
      { configFile: path.join(repoRoot, 'vite.config.ts') },
      'serve',
    )
    expect(config.test?.include).toContain(
      `${DEPLOYMENT_ROOT_DIRNAME}/**/*.test.ts`,
    )
    expect(config.test?.include).toContain(
      `${DEPLOYMENT_ROOT_DIRNAME}/**/*.test.tsx`,
    )
  })

  it('is on the TypeScript program, under the same alias', () => {
    const app = readTsConfig(path.join(repoRoot, 'tsconfig.app.json'))
    expect(app.raw.include).toContain(DEPLOYMENT_ROOT_DIRNAME)
    expect(app.options.paths?.[`${DEPLOYMENT_ALIAS}/*`]).toEqual([
      `./${DEPLOYMENT_ROOT_DIRNAME}/*`,
    ])

    // The root config carries the same mapping so an editor resolves what the
    // build resolves; it compiles nothing itself.
    const root = readTsConfig(path.join(repoRoot, 'tsconfig.json'))
    expect(root.options.paths?.[`${DEPLOYMENT_ALIAS}/*`]).toEqual([
      `./${DEPLOYMENT_ROOT_DIRNAME}/*`,
    ])
  })
})

describe('a repository with no deployment root', () => {
  it('is this one', () => {
    expect(existsSync(path.join(repoRoot, DEPLOYMENT_ROOT_DIRNAME))).toBe(false)
  })

  /**
   * The regression the naming could have caused, measured rather than argued:
   * the set of files TypeScript compiles is IDENTICAL to the set it compiled
   * when `include` named `src` alone. An include pattern that matches nothing
   * contributes nothing — this is what says so, on the shipped file.
   */
  it('compiles exactly the files it compiled before the root was named', () => {
    const configPath = path.join(repoRoot, 'tsconfig.app.json')
    const shipped = readTsConfig(configPath)
    const beforeTheRootWasNamed = readTsConfig(configPath, ['src'])

    expect(shipped.errors).toEqual([])
    expect(shipped.fileNames.length).toBeGreaterThan(0)
    expect([...shipped.fileNames].sort()).toEqual(
      [...beforeTheRootWasNamed.fileNames].sort(),
    )
  })

  /**
   * And the same for the suite. The deployment globs are rooted at a directory
   * this repository does not have, so they can match nothing; asserting the
   * directory's absence is the whole of the proof, and it is a stronger one
   * than a file count, which would drift with every test anyone adds.
   */
  it('collects no test from the deployment globs, because there is nothing to collect', async () => {
    const config = await resolveConfig(
      { configFile: path.join(repoRoot, 'vite.config.ts') },
      'serve',
    )
    const deploymentGlobs = (config.test?.include ?? []).filter((glob) =>
      glob.startsWith(`${DEPLOYMENT_ROOT_DIRNAME}/`),
    )
    expect(deploymentGlobs.length).toBeGreaterThan(0)
    expect(existsSync(path.join(repoRoot, DEPLOYMENT_ROOT_DIRNAME))).toBe(false)
  })
})

/**
 * The whole seam, end to end, on a tree that actually has a deployment root.
 *
 * Everything above reads the configuration. This one RUNS it: a throwaway
 * project holding the four build files of this repository byte for byte, this
 * package linked in under its own name, no `src` of its own, and one module
 * plus one test in `deployment/`. It is the state a deployment reaches on the
 * far side of the switch, and the only way to show the three shipped lines
 * carry it is to put a test in that directory and watch it run.
 */
describe('a deployment that brings its own source root', () => {
  function stageDeployment(): string {
    const scratch = stageBuildFiles()
    mountThePackage(scratch)

    const deployment = path.join(scratch, DEPLOYMENT_ROOT_DIRNAME)
    mkdirSync(deployment)
    writeFileSync(
      path.join(deployment, 'workspaceName.ts'),
      "export const WORKSPACE_NAME = 'A Deployment'\n",
    )
    writeFileSync(
      path.join(deployment, 'workspaceName.test.ts'),
      [
        "import { expect, it } from 'vitest'",
        // Its own module, through its own alias.
        "import { WORKSPACE_NAME } from '~/workspaceName'",
        // The application's, through the application's alias, out of the
        // package — this tree has no `src` for it to come from.
        "import { ORG_NAME } from '@/config'",
        '',
        "it('reads its own root and the package it mounts', () => {",
        "  expect(WORKSPACE_NAME).toBe('A Deployment')",
        '  expect(ORG_NAME.length).toBeGreaterThan(0)',
        '  expect(ORG_NAME).not.toBe(WORKSPACE_NAME)',
        '})',
        '',
      ].join('\n'),
    )

    return scratch
  }

  it('resolves both roots and runs the tests it keeps there', () => {
    const scratch = stageDeployment()
    expect(existsSync(path.join(scratch, 'src'))).toBe(false)

    const output = execFileSync(
      path.join(repoRoot, 'node_modules', '.bin', 'vitest'),
      ['run', '--reporter=verbose'],
      {
        cwd: scratch,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
        // The summary below is read as text, so it has to BE text. A reporter
        // that colours its output writes escape sequences between the words,
        // and `Test Files  1 passed` stops matching anything — which is a
        // green run reported as a failure. Locally the pipe is enough to turn
        // colour off; a CI runner turns it back on.
        env: { ...process.env, NO_COLOR: '1', FORCE_COLOR: '0' },
      },
    )

    expect(output).toContain('workspaceName.test.ts')
    expect(output).toMatch(/Test Files\s+1 passed \(1\)/)
  }, 180_000)
})

/**
 * The Overlay, end to end: a deployment that still holds a resident or two.
 *
 * The rule used to be all or nothing — the alias pointed at the first root
 * that existed, so a `src` with one file in it captured every `@/…` import
 * and resolved none of the rest. Now the package is the application whenever
 * it is installed, and the deployment's `src` lies over it PER PATH: the
 * deployment's copy where it has one, the package's everywhere else. This
 * stages exactly the tree the old rule broke on — the package mounted, a
 * `src` holding two files, one of them nested — and runs a test in it that
 * imports a resident, a resident's neighbour that only the package has, and
 * a module in a directory the deployment never touched.
 *
 * The decision that the deployment overlays the package per path records
 * this; `scripts/overlay.mjs` is the rule.
 */
describe('a deployment that keeps residents in its src', () => {
  const RESIDENT = 'lib/blueprintLaneCollapse.ts'
  const NESTED_RESIDENT = 'lib/agent/role.md'

  function stageDeploymentWithResidents(): string {
    const scratch = stageBuildFiles()
    mountThePackage(scratch)

    // Both residents stand for files the package has at the same paths.
    for (const resident of [RESIDENT, NESTED_RESIDENT]) {
      expect(hasSource(resident)).toBe(true)
    }
    const residents = path.join(scratch, 'src')
    mkdirSync(path.dirname(path.join(residents, NESTED_RESIDENT)), { recursive: true })
    writeFileSync(
      path.join(residents, RESIDENT),
      "export const WHO_ANSWERED = 'the resident'\n",
    )
    writeFileSync(path.join(residents, NESTED_RESIDENT), '# the resident role\n')

    const deployment = path.join(scratch, DEPLOYMENT_ROOT_DIRNAME)
    mkdirSync(deployment)
    writeFileSync(
      path.join(deployment, 'overlay.test.ts'),
      [
        "import { expect, it } from 'vitest'",
        // The resident, under the application's alias: a name the package's
        // file of that path does not export.
        `import { WHO_ANSWERED } from '@/${RESIDENT.replace(/\.ts$/, '')}'`,
        // The nested resident, as text, the way the application reads it.
        `import role from '@/${NESTED_RESIDENT}?raw'`,
        // A neighbour of the nested resident that only the package has.
        "import { stopAgent } from '@/lib/agent/loop'",
        // A module in a directory the deployment never touched.
        "import { ORG_NAME } from '@/config'",
        '',
        "it('reads each path from the layer that holds it', () => {",
        "  expect(WHO_ANSWERED).toBe('the resident')",
        "  expect(role).toBe('# the resident role\\n')",
        "  expect(typeof stopAgent).toBe('function')",
        '  expect(ORG_NAME.length).toBeGreaterThan(0)',
        '})',
        '',
      ].join('\n'),
    )

    return scratch
  }

  it('points the alias at the package and loads the overlay', async () => {
    const scratch = stageDeploymentWithResidents()
    const config = await resolveConfig(
      { configFile: path.join(scratch, 'vite.config.ts'), root: scratch },
      'serve',
    )
    const app = aliasEntries(config.resolve.alias).find((entry) => entry.find === '@')
    // The config resolves its own directory to its real path; so does this.
    expect(app?.replacement).toBe(
      path.join(realpathSync(scratch), 'node_modules', 'uno-blueprint', 'src'),
    )
    expect(config.plugins.map((plugin) => plugin.name)).toContain('uno-blueprint:overlay')
  })

  it('resolves a resident to the deployment and everything else to the package', () => {
    const scratch = stageDeploymentWithResidents()
    const output = execFileSync(
      path.join(repoRoot, 'node_modules', '.bin', 'vitest'),
      ['run', '--reporter=verbose'],
      {
        cwd: scratch,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
        env: { ...process.env, NO_COLOR: '1', FORCE_COLOR: '0' },
      },
    )
    expect(output).toContain('overlay.test.ts')
    expect(output).toMatch(/Test Files\s+1 passed \(1\)/)
  }, 180_000)
})

/**
 * The stylesheet the two roots build, compared.
 *
 * Tailwind writes a rule for a class name only where it finds that name
 * written down, and the scan it does by itself starts at the project root and
 * refuses `node_modules`. A repository that keeps the application in `src` is
 * covered by that scan by coincidence — the root it starts at is the root the
 * markup lives in. A deployment that reads the application out of the package
 * is covered by nothing, and nothing says so: the build succeeds, the file is
 * written, and every element on the page is unstyled. `styles/tailwind.config.css`
 * carries the line that closes it and why the path is written the way it is.
 *
 * So this builds the same application twice — once read out of the package,
 * once read out of a `src` of its own — and compares what came out. A byte
 * count would answer the question and would drift with every release; what
 * fails here is a class name the markup writes going missing from the
 * deployment's stylesheet, which is the thing itself.
 */
describe('the stylesheet built from each root', () => {
  /**
   * The class names the compiled stylesheet has a rule for. Read off the
   * selectors rather than the whole text, so a class name quoted inside a
   * declaration — a `content:'.foo'`, a data URI — is not mistaken for one.
   */
  function classesWithARule(css: string): Set<string> {
    const found = new Set<string>()
    const source = css.replace(/\/\*[\s\S]*?\*\//g, '')
    let prelude = ''
    let quote: string | null = null

    for (let index = 0; index < source.length; index += 1) {
      const character = source[index]
      if (quote) {
        if (character === '\\') index += 1
        else if (character === quote) quote = null
        continue
      }
      if (character === '"' || character === "'") {
        quote = character
      } else if (character === '{') {
        // An at-rule's prelude is a query, not a selector list.
        if (!prelude.trimStart().startsWith('@')) {
          for (const match of prelude.matchAll(/\.((?:\\.|[\w-])+)/g)) {
            found.add(match[1].replace(/\\(.)/g, '$1'))
          }
        }
        prelude = ''
      } else if (character === '}' || character === ';') {
        prelude = ''
      } else {
        prelude += character
      }
    }

    return found
  }

  /** Every class name the application's markup writes as a plain literal. */
  function classesTheMarkupWrites(): Set<string> {
    const written = new Set<string>()

    for (const { text } of filesOn(
      'app',
      (file) => file.endsWith('.tsx') && !file.includes('.test.'),
    )) {
      for (const match of text.matchAll(/className="([^"{}]*)"/g)) {
        for (const name of match[1].split(/\s+/)) if (name) written.add(name)
      }
    }

    return written
  }

  /** One entry, importing one stylesheet, and the page that loads it. */
  function writeStylesheetEntry(scratch: string, entry: string, stylesheet: string): void {
    writeFileSync(path.join(scratch, entry), `import '${stylesheet}'\n`)
    writeFileSync(
      path.join(scratch, 'index.html'),
      [
        '<!doctype html>',
        '<html lang="en">',
        '  <head><meta charset="UTF-8" /><title>A Deployment</title></head>',
        `  <body><div id="root"></div><script type="module" src="/${entry}"></script></body>`,
        '</html>',
        '',
      ].join('\n'),
    )
  }

  function buildStylesheet(scratch: string): Set<string> {
    execFileSync(path.join(repoRoot, 'node_modules', '.bin', 'vite'), ['build'], {
      cwd: scratch,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    const assets = path.join(scratch, 'dist', 'assets')
    const stylesheets = readdirSync(assets).filter((file) => file.endsWith('.css'))
    expect(stylesheets).toHaveLength(1)

    return classesWithARule(readFileSync(path.join(assets, stylesheets[0]), 'utf8'))
  }

  /** The arrangement under the flip: the package mounted, no `src` at all. */
  function stageReadingTheApplicationOutOfThePackage(): string {
    const scratch = stageBuildFiles()
    mountThePackage(scratch)
    mkdirSync(path.join(scratch, DEPLOYMENT_ROOT_DIRNAME))
    writeStylesheetEntry(
      scratch,
      `${DEPLOYMENT_ROOT_DIRNAME}/stylesheet.ts`,
      'uno-blueprint/styles.css',
    )
    return scratch
  }

  /** The arrangement this repository is in: the application in a `src`. */
  function stageReadingTheApplicationOutOfSrc(): string {
    const scratch = stageBuildFiles()
    cpSync(path.join(repoRoot, 'src'), path.join(scratch, 'src'), { recursive: true })
    writeStylesheetEntry(scratch, 'stylesheet.ts', './src/styles/tailwind.config.css')
    return scratch
  }

  it('is the same stylesheet, whichever root the application is read from', () => {
    const fromSrc = buildStylesheet(stageReadingTheApplicationOutOfSrc())
    const fromThePackage = buildStylesheet(stageReadingTheApplicationOutOfThePackage())

    /*
     * What the markup needs, named by the markup: every class the application
     * writes into a `className` that this application also compiles a rule for
     * when it is read out of `src`. The second half is what tells a utility
     * from a word — `group` is written in the markup and gets no rule of its
     * own, `flex` gets one — and it is decided by Tailwind rather than by a
     * list kept here.
     */
    const needed = [...classesTheMarkupWrites()].filter((name) => fromSrc.has(name))
    /*
     * A floor, not a measurement. Two empty stylesheets compare equal, so the
     * comparison below is only worth something while there is something to
     * compare; the markup names hundreds and this only asks that it names any.
     */
    expect(needed.length).toBeGreaterThan(100)
    expect(needed.filter((name) => !fromThePackage.has(name))).toEqual([])

    // And the rest of the stylesheet with it — the utilities reached through a
    // `cn()`, a variant map, a component's own defaults, which no literal in
    // the markup names.
    expect([...fromSrc].filter((name) => !fromThePackage.has(name))).toEqual([])
  }, 180_000)
})

/**
 * The dev server a deployment runs, and the documents the application imports
 * as text.
 *
 * `vite build` has no pre-bundling step, so everything below is invisible to
 * a build, to this suite's other files, and to every check in this
 * repository. The dev server does pre-bundle, and what it pre-bundles is
 * whatever it resolves into `node_modules` — which, once the application is
 * a package, is the application. The optimizer hands those files to rolldown,
 * rolldown has never heard of `?raw`, and `role.md` and the skill and
 * reference documents stop loading. The page is blank and the build is green.
 *
 * INSTALLED, NOT LINKED, and that is the whole reason this is a separate
 * block. The tests above mount the package with a symlink, which is the right
 * shape for what they ask — they want the real package, not a snapshot. But
 * Vite resolves a symlink to its target before it decides whether a file is
 * in `node_modules`, so a linked package is not one, is never pre-bundled,
 * and cannot show this. A deployment installs; this installs.
 */
describe('a deployment’s dev server', () => {
  /** A deployment whose entry mounts the package, and nothing else. */
  function stageDeployment(): { scratch: string; appSource: string } {
    const scratch = stageBuildFiles()
    const appSource = installThePackage(scratch)

    const deployment = path.join(scratch, DEPLOYMENT_ROOT_DIRNAME)
    mkdirSync(deployment)
    writeFileSync(
      path.join(deployment, 'main.tsx'),
      [
        "import { createRoot } from 'react-dom/client'",
        "import { App } from 'uno-blueprint'",
        '',
        "createRoot(document.getElementById('root')!).render(<App />)",
        '',
      ].join('\n'),
    )
    writeFileSync(
      path.join(scratch, 'index.html'),
      [
        '<!doctype html>',
        '<html lang="en">',
        '  <head><meta charset="UTF-8" /><title>A Deployment</title></head>',
        `  <body><div id="root"></div><script type="module" src="/${DEPLOYMENT_ROOT_DIRNAME}/main.tsx"></script></body>`,
        '</html>',
        '',
      ].join('\n'),
    )

    return { scratch, appSource }
  }

  /**
   * Every document the application imports as text, by the file it names.
   *
   * Read off the application's own source rather than listed here, so the
   * expectation grows with the code: a document added tomorrow is one this
   * test then requires the dev server to serve.
   *
   * The pattern is anchored at the start of a line because `bootstrap.ts`
   * spells one of these imports inside a comment, to show a host how to
   * register its own, and a comment is not an import.
   */
  function documentsTheApplicationImports(appSource: string): Set<string> {
    const documents = new Set<string>()

    const visit = (directory: string) => {
      for (const entry of readdirSync(directory)) {
        const child = path.join(directory, entry)
        if (statSync(child).isDirectory()) visit(child)
        else if (/\.tsx?$/.test(child) && !/\.test\.tsx?$/.test(child)) {
          const source = readFileSync(child, 'utf8')
          for (const match of source.matchAll(/^import\s+\w+\s+from\s+'([^']+)\?raw'/gm)) {
            const specifier = match[1]
            documents.add(
              specifier.startsWith('@/')
                ? path.join(appSource, specifier.slice(2))
                : path.resolve(path.dirname(child), specifier),
            )
          }
        }
      }
    }
    visit(appSource)

    return documents
  }

  /** The module URLs a served module asks the browser to fetch next. */
  function importedUrls(code: string): string[] {
    const urls: string[] = []
    for (const pattern of [
      /\bfrom\s*["']([^"']+)["']/g,
      /\bimport\s*\(\s*["']([^"']+)["']/g,
      /^\s*import\s*["']([^"']+)["']/gm,
    ]) {
      for (const match of code.matchAll(pattern)) urls.push(match[1])
    }
    return urls.filter((url) => url.startsWith('/') && !url.startsWith('/@vite/'))
  }

  /** `export default "…"` — the document, as the browser receives it. */
  function servedText(body: string): string {
    const match = /export default ("(?:[^"\\]|\\[\s\S])*")/.exec(body)
    expect(match, `not a text module: ${body.slice(0, 120)}`).not.toBeNull()
    return JSON.parse(match![1]) as string
  }

  it('serves the whole application, and the documents it imports as text', async () => {
    const { scratch, appSource } = stageDeployment()
    const expected = documentsTheApplicationImports(appSource)
    // A floor, not a measurement: an empty expectation would be met by a dev
    // server that served nothing at all.
    expect(expected.size).toBeGreaterThan(20)

    const server = await createServer({
      configFile: path.join(scratch, 'vite.config.ts'),
      root: scratch,
      logLevel: 'silent',
      // Everything but the package itself is linked into this tree from the
      // repository's own `node_modules`, which a deployment's would not be.
      // This is about where the test put the files, not about the seam.
      server: { port: 0, fs: { allow: [realpathSync(scratch), repoRoot] } },
    })

    try {
      await server.listen()
      const base = server.resolvedUrls!.local[0].replace(/\/$/, '')

      const failures: string[] = []
      const served = new Map<string, string>()
      const queue = [`/${DEPLOYMENT_ROOT_DIRNAME}/main.tsx`]
      const seen = new Set(queue)

      while (queue.length > 0) {
        const url = queue.shift()!
        const response = await fetch(`${base}${url}`)
        const body = await response.text()
        if (!response.ok) {
          failures.push(`${response.status} ${url}`)
          continue
        }
        // A document, reached by the URL the application's own module asked
        // for. Nothing here guesses that URL.
        if (/[?&]raw\b/.test(url)) {
          served.set(path.resolve(scratch, decodeURIComponent(url.split('?')[0]).slice(1)), body)
          continue
        }
        for (const next of importedUrls(body)) {
          if (seen.has(next)) continue
          seen.add(next)
          queue.push(next)
        }
      }

      /*
       * Another floor. The two assertions below are about what the crawl
       * reached, and both are met by a crawl that reached almost nothing —
       * so this says the crawl walked the application rather than a corner
       * of it. A number, because the alternative is a census that drifts
       * with every module anyone adds.
       */
      expect(seen.size).toBeGreaterThan(200)
      expect(failures.slice(0, 5)).toEqual([])
      expect([...served.keys()].sort()).toEqual([...expected].sort())
      for (const [file, body] of served) {
        expect(servedText(body)).toBe(readFileSync(file, 'utf8'))
      }
    } finally {
      await server.close()
    }
  }, 300_000)
})

/**
 * The figures the cover draws, fetched from a deployment that installed the
 * package.
 *
 * INSTALLED, NOT LINKED, for the reason the block above is: a link is
 * realpathed before anything decides where a file lives, and the whole of
 * this is about where a file lives.
 *
 * What goes wrong has no error in it anywhere. A figure named as a path the
 * site serves — `/cover/why-now.svg` — is a path only a tree with that file
 * in its `public/` serves. A deployment's `public/` is its own, and the
 * figure is not in it, so the request lands on the single-page fallback and
 * comes back 200 with a page of HTML in it. The browser puts a broken-image
 * box where a diagram belongs; the network tab reports a success; no build
 * step, no bundler and no check ever sees a thing. That is the defect under
 * the defect, and it is why this went a release unnoticed.
 *
 * So what is asserted here is bytes, not status. Every figure the cover
 * renders is fetched at the URL the deployment's own modules ask for — read
 * off the served modules rather than guessed here, so this says nothing about
 * HOW a figure arrives and everything about whether it does — and each
 * response has to BE the figure: an image content type, an SVG document, and
 * the same bytes the package authored. A page of HTML fails, which is the
 * whole point.
 */
describe('a deployment’s cover figures', () => {
  const COVER_ENTRY = `${DEPLOYMENT_ROOT_DIRNAME}/cover.ts`
  const AUTHORED_FIGURES = path.join(repoRoot, 'docs', 'assets')

  /**
   * The figures the cover renders, by the file each one names.
   *
   * Read off the cover's own content rather than listed here, so a figure
   * added tomorrow is one this block then requires a deployment to be able to
   * fetch. Only the basename travels: WHERE a figure is served from is what
   * differs between this repository and a deployment, and is the thing under
   * test. A figure's dark file counts as well: the cover shows it whenever
   * the app is dark, so a deployment has to be able to fetch it too.
   */
  function figuresTheCoverRenders(): string[] {
    return coverFigures(coverContent).flatMap((figure) =>
      [figure.src, figure.srcDark]
        .filter((src): src is string => typeof src === 'string')
        .map((src) => path.basename(src.split('?')[0])),
    )
  }

  /** A deployment whose only module is the cover's content. */
  function stageCoverDeployment(): string {
    const scratch = stageBuildFiles()
    installThePackage(scratch)

    const deployment = path.join(scratch, DEPLOYMENT_ROOT_DIRNAME)
    mkdirSync(deployment)
    writeFileSync(
      path.join(deployment, 'cover.ts'),
      [
        "import { coverFigures } from '@/components/cover/coverModel'",
        "import { coverContent } from '@/content/coverContent'",
        '',
        'export const srcs = coverFigures(coverContent).flatMap((figure) =>',
        '  figure.srcDark ? [figure.src, figure.srcDark] : [figure.src],',
        ')',
        '',
        '// Read, so that a build keeps every one of them.',
        "document.title = srcs.join(' ')",
        '',
      ].join('\n'),
    )
    writeFileSync(
      path.join(scratch, 'index.html'),
      [
        '<!doctype html>',
        '<html lang="en">',
        '  <head><meta charset="UTF-8" /><title>A Deployment</title></head>',
        `  <body><div id="root"></div><script type="module" src="/${COVER_ENTRY}"></script></body>`,
        '</html>',
        '',
      ].join('\n'),
    )

    return scratch
  }

  /** Every absolute URL a served module names, however it names it. */
  function urlsNamedBy(code: string): string[] {
    const urls: string[] = []
    for (const match of code.matchAll(/["'](\/[^"'\s]+)["']/g)) urls.push(match[1])
    return urls
  }

  /**
   * What the figures resolve to, as URLs the browser would ask for. A dev
   * server hands an asset module the URL of the file it stands for, and
   * appends `?import` to the specifier that reaches it; neither query belongs
   * to the file.
   */
  function requestedUrlsByFigure(
    served: string[],
    figures: string[],
  ): Map<string, Set<string>> {
    const wanted = new Map(figures.map((name) => [name, new Set<string>()]))
    for (const body of served) {
      for (const url of urlsNamedBy(body)) {
        const bare = url.split('?')[0]
        const slot = wanted.get(path.basename(bare))
        if (slot) slot.add(bare)
      }
    }
    return wanted
  }

  it('serves every one of them as the image it is, and never as a page', async () => {
    const figures = figuresTheCoverRenders()
    // A floor, not a census: an empty expectation is met by a cover with no
    // figures at all.
    expect(figures.length).toBeGreaterThan(10)
    expect(figures).toContain('why-now.dark.svg')

    const scratch = stageCoverDeployment()
    const server = await createServer({
      configFile: path.join(scratch, 'vite.config.ts'),
      root: scratch,
      logLevel: 'silent',
      // Everything but the package itself is linked into this tree from this
      // repository's own `node_modules`, which a deployment's would not be.
      // This is about where the test put the files, not about the seam.
      server: { port: 0, fs: { allow: [realpathSync(scratch), repoRoot] } },
    })

    try {
      await server.listen()
      const base = server.resolvedUrls!.local[0].replace(/\/$/, '')

      // The module graph the cover's content reaches, so that the URLs below
      // are the ones the application asks for rather than ones named here.
      const served: string[] = []
      const queue = [`/${COVER_ENTRY}`]
      const seen = new Set(queue)
      while (queue.length > 0) {
        const url = queue.shift()!
        const response = await fetch(`${base}${url}`)
        if (!response.ok) continue
        const body = await response.text()
        served.push(body)
        if (/\.(svg|png|jpe?g|webp|gif)(\?|$)/.test(url)) continue
        for (const next of urlsNamedBy(body)) {
          if (seen.has(next) || next.startsWith('/@vite/')) continue
          seen.add(next)
          queue.push(next)
        }
      }

      const requested = requestedUrlsByFigure(served, figures)
      const unreached = [...requested]
        .filter(([, urls]) => urls.size === 0)
        .map(([name]) => name)
      expect(unreached).toEqual([])

      const failures: string[] = []
      for (const [name, urls] of requested) {
        for (const url of urls) {
          const response = await fetch(`${base}${url}`)
          const type = response.headers.get('content-type') ?? ''
          const body = await response.text()
          if (!response.ok) failures.push(`${name}: ${response.status} ${url}`)
          // The shape of this defect exactly: a success, a page, and a broken
          // image where a diagram belongs.
          else if (!type.startsWith('image/')) {
            failures.push(`${name}: ${response.status} ${type} at ${url}`)
          } else if (body !== readFileSync(path.join(AUTHORED_FIGURES, name), 'utf8')) {
            failures.push(`${name}: served bytes are not the authored figure`)
          }
        }
      }
      expect(failures).toEqual([])
    } finally {
      await server.close()
    }
  }, 300_000)

  it('builds every one of them into the deployment’s own output', () => {
    const figures = figuresTheCoverRenders()
    const scratch = stageCoverDeployment()

    execFileSync(path.join(repoRoot, 'node_modules', '.bin', 'vite'), ['build'], {
      cwd: scratch,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    // A build has no fallback to hide behind — it emits a file or it does not,
    // and what it emits is all a static host will ever have.
    const dist = path.join(scratch, 'dist')
    const emitted = new Map<string, string>()
    const visit = (directory: string) => {
      for (const entry of readdirSync(directory)) {
        const child = path.join(directory, entry)
        if (statSync(child).isDirectory()) visit(child)
        else emitted.set(path.relative(dist, child), readFileSync(child, 'utf8'))
      }
    }
    visit(dist)

    const missing = figures.filter((name) => {
      const authored = readFileSync(path.join(AUTHORED_FIGURES, name), 'utf8')
      return ![...emitted.values()].some((body) => body === authored)
    })
    expect(missing).toEqual([])
  }, 300_000)

  it('is asserting something a fallback cannot satisfy', async () => {
    // A guard nobody has watched fail is a guard nobody knows the shape of.
    // This is the failing case, held still: a path the deployment does not
    // serve, answered by the single-page fallback with a success and a page.
    const scratch = stageCoverDeployment()
    const server = await createServer({
      configFile: path.join(scratch, 'vite.config.ts'),
      root: scratch,
      logLevel: 'silent',
      server: { port: 0, fs: { allow: [realpathSync(scratch), repoRoot] } },
    })

    try {
      await server.listen()
      const base = server.resolvedUrls!.local[0].replace(/\/$/, '')
      const response = await fetch(`${base}/cover/${figuresTheCoverRenders()[0]}`)

      expect(response.status).toBe(200)
      expect(response.headers.get('content-type')).toMatch(/^text\/html/)
      expect(await response.text()).toContain('<!doctype html>')
    } finally {
      await server.close()
    }
  }, 300_000)
})
