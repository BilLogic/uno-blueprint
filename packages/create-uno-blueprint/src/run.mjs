/**
 * `create-uno-blueprint`: one command that writes an Uno Blueprint workspace.
 *
 * A workspace is the whole template at one release — the release whose tag is
 * this package's own version, so the number a user installed is the number
 * they started from. It is downloaded as the tarball GitHub serves for that
 * tag and unpacked here: gunzip from the standard library, the tar reader
 * beside this file. No git, no system tar, no runtime dependency, no prompt.
 *
 * ONE FUNCTION IS THE WHOLE INTERFACE. `run` takes everything it would
 * otherwise reach for — arguments, environment, working directory, the two
 * streams, the Node version, where the tarball comes from, what installs the
 * dependencies — and returns the exit code. The bin hands it the real process;
 * a test hands it a temporary folder, a tarball built in memory and an install
 * that only records the call, and reads back what a user would see. The two
 * other exports are the halves of that hand-over the bin does not write out
 * itself: `runInProcess`, which is `run` over the real process, and
 * `installWith`, which is the install when nothing replaces it.
 *
 * Once the files are written it installs their dependencies with the package
 * manager that called it, and ends by saying what to type next in that
 * package manager's own words.
 */
import { spawn } from 'node:child_process'
import { accessSync, constants, existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { gunzipSync } from 'node:zlib'

import { NODE_FLOOR } from './node-floor.mjs'
import { readTar } from './tar.mjs'

const NAME = 'create-uno-blueprint'

/** This package's version, which is the template's: the version guard holds the two together. */
const VERSION = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version

const DEFAULT_DIRECTORY = 'uno-blueprint'

/**
 * Where this package sits in the template, which is the one folder a
 * workspace does not get: it has already done its work by the time the
 * workspace exists.
 */
const OWN_FOLDER = ['packages', 'create-uno-blueprint']

const USAGE = `Usage: ${NAME} [directory] [options]

Writes an Uno Blueprint workspace, the template at release ${VERSION}, into
[directory], and installs its dependencies with the package manager that ran
this command. The folder must be empty or not exist yet. Default: ${DEFAULT_DIRECTORY}

Options:
  --no-install   Write the workspace and skip installing dependencies
  --help         Show this message
  --version      Show the version
`

/** The tarball GitHub serves for this version's release tag. */
const RELEASE_URL = `https://codeload.github.com/BilLogic/uno-blueprint/tar.gz/refs/tags/v${VERSION}`

/**
 * Two bounds on what comes back from the network, because nothing here has
 * seen it before. A connection that stalls would otherwise be a command that
 * never ends, and a few kilobytes of gzip can unpack to more than a machine
 * holds. The template is about a tenth of the second; both are far enough out
 * that neither is met by a release.
 */
const DOWNLOAD_TIMEOUT_MS = 60_000
const UNPACKED_LIMIT_MB = 128

/** Download a tarball with the platform fetch. Throws on anything but a 2xx, and on the timeout. */
async function fetchRelease(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS) })
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  return new Uint8Array(await response.arrayBuffer())
}

/**
 * The package managers a workspace installs and runs under. One entry is
 * everything said about a manager: the command, what it is given to install,
 * and what it is given to start the canvas. What is run and what is printed
 * are both read from here, so the line a user is told to type is the line
 * that was typed for them.
 *
 * `npm` is the one that needs `run`; the other three take a script's name as
 * a command of their own.
 */
const PACKAGE_MANAGERS = {
  npm: { command: 'npm', install: ['install'], dev: ['run', 'dev'] },
  pnpm: { command: 'pnpm', install: ['install'], dev: ['dev'] },
  yarn: { command: 'yarn', install: ['install'], dev: ['dev'] },
  bun: { command: 'bun', install: ['install'], dev: ['dev'] },
}

/** A command and its arguments as the line a user types. */
const typed = (command, args) => [command, ...args].join(' ')

/**
 * Which package manager called. `npm create`, `pnpm create`, `yarn create`
 * and `bun create` each put their name and version first in
 * `npm_config_user_agent`, as `pnpm/10.1.0 npm/? node/v22.12.0 …`. Only that
 * first word is read: the three that are not npm name npm further along, to
 * say what they stand in for. Run by hand, or by anything else, it is npm.
 *
 * YARN IS TWO PROGRAMS UNDER ONE NAME, and the version is what tells them
 * apart. Yarn 1 runs this template. Yarn 2 and later do not run the `pre`
 * scripts `dev` and `build` rely on and install without a `node_modules` by
 * default, so an install there would exit 0 over a workspace that then does
 * not start. That caller is answered with `unsupported` and what it calls
 * itself, and nothing is installed. A Yarn that states no version is taken
 * for the first.
 */
function callingPackageManager(env) {
  const [name, version] = String(env?.npm_config_user_agent ?? '').trim().split(/\s+/)[0].split('/')
  if (!Object.hasOwn(PACKAGE_MANAGERS, name)) return { pm: 'npm' }
  const major = parseInt(version, 10)
  if (name === 'yarn' && major >= 2) return { pm: name, unsupported: `Yarn ${major}` }
  return { pm: name }
}

/**
 * Install a workspace's dependencies: run `command` with `args` in `cwd`,
 * its output going straight to the terminal the command was run in.
 * Resolves with the exit code. Rejects when it could not be started at all,
 * and when a signal ended it, which is not an install that finished.
 *
 * The command and arguments are taken as words, never as anything a user
 * typed: on Windows they are joined into one string for a shell, unquoted.
 * `run` passes an entry of the table above, whose words need no quoting, and
 * any other caller has to pass words that do not either.
 *
 * @param {object} request
 * @param {string} request.command  a package manager's command from the table, or another word that needs no quoting
 * @param {string[]} request.args  its arguments, on the same terms
 * @param {string} request.cwd
 * @param {import('node:child_process').StdioOptions} [request.stdio]
 * @returns {Promise<number>}
 */
export function installWith({ command, args, cwd, stdio = 'inherit' }) {
  return new Promise((resolveCode, reject) => {
    // On Windows a package manager is a `.cmd` shim, which only a shell runs,
    // and a shell is handed one string rather than a list it would have to
    // join unquoted. Safe for the words this is given, which the comment
    // above holds every caller to.
    const child =
      process.platform === 'win32'
        ? spawn(typed(command, args), { cwd, stdio, shell: true })
        : spawn(command, args, { cwd, stdio })
    child.on('error', reject)
    child.on('close', (code, signal) =>
      code === null ? reject(new Error(`ended by ${signal}`)) : resolveCode(code),
    )
  })
}

/**
 * The command as its bin runs it: `run`, handed the real process. Anything in
 * `overrides` replaces what the process would have supplied, which is how the
 * helper that writes a workspace from a checkout swaps the download and
 * nothing else.
 *
 * @param {Partial<Parameters<typeof run>[0]>} [overrides]
 * @returns {Promise<number>} the exit code
 */
export function runInProcess(overrides = {}) {
  return run({
    argv: process.argv.slice(2),
    env: process.env,
    cwd: process.cwd(),
    stdout: process.stdout,
    stderr: process.stderr,
    nodeVersion: process.versions.node,
    ...overrides,
  })
}

/**
 * Write a workspace and install it, or say in one line why not.
 *
 * @param {object} options
 * @param {string[]} options.argv  the arguments after the command's own name
 * @param {Record<string, string | undefined>} options.env
 * @param {string} options.cwd  what a relative directory is resolved against
 * @param {{ write(text: string): unknown }} options.stdout
 * @param {{ write(text: string): unknown }} options.stderr
 * @param {string} options.nodeVersion  `process.versions.node`
 * @param {(url: string) => Promise<Uint8Array>} [options.fetchTarball]  the gzipped tarball at a URL
 * @param {(request: { pm: 'npm' | 'pnpm' | 'yarn' | 'bun', command: string, args: string[], cwd: string }) => number | Promise<number>} [options.install]
 *   installs the dependencies of the workspace at `cwd` by running `command` with `args`, which are
 *   `pm`'s own, and answers with the exit code
 * @returns {Promise<number>} the exit code: 0 only when the workspace is complete
 */
export async function run({
  argv,
  env,
  cwd,
  stdout,
  stderr,
  nodeVersion,
  fetchTarball = fetchRelease,
  install = installWith,
}) {
  const fail = (message) => {
    stderr.write(`${NAME}: ${message}\n`)
    return 1
  }

  // First, before the arguments are even read: every later line assumes it.
  // Written as "not at least" so a version that cannot be read is refused
  // rather than compared with nothing and let through.
  if (!(parseInt(String(nodeVersion).replace(/^v/, ''), 10) >= NODE_FLOOR)) {
    return fail(`Node ${NODE_FLOOR} or later is needed; this is Node ${nodeVersion}.`)
  }

  const asked = parseArguments(argv)
  if (asked.fault) return fail(`${asked.fault} Run with --help to see what it takes.`)
  if (asked.help) {
    stdout.write(USAGE)
    return 0
  }
  if (asked.version) {
    stdout.write(`${VERSION}\n`)
    return 0
  }

  const directory = asked.directory ?? DEFAULT_DIRECTORY
  const target = resolve(cwd, directory)
  /** Whether the workspace is the folder the command was run in, which changes how it is spoken of. */
  const here = target === resolve(cwd)
  // The highest folder this run will make: the target, or the first of its
  // parents that is not there yet. It is what a failed write takes back.
  let made = null
  try {
    const existed = existsSync(target)
    if (existed && !statSync(target).isDirectory()) {
      return fail(`${directory} exists and is not a folder.`)
    }
    if (existed && readdirSync(target).length > 0) {
      return fail(
        `${here ? 'this folder' : directory} already has files in it. Name an empty folder, or one that does not exist yet.`,
      )
    }
    // `lstat`, not `exists`: a link that points nowhere is a thing that is
    // there, and it is the user's. Followed, it reads as absent, and a failed
    // write would take it back as though this run had made it. Anything but
    // absence — a file where a folder has to go, a parent that cannot be
    // searched — throws, and is answered below.
    for (let path = target; lstatSync(path, { throwIfNoEntry: false }) === undefined; path = dirname(path)) {
      made = path
    }
    // The folder the new ones go into has to be one, and one this user can
    // write in. Asked now, so a target that can never be written costs no
    // download.
    if (made !== null) {
      const parent = dirname(made)
      if (!statSync(parent).isDirectory()) throw new Error(`${parent} is not a folder`)
      accessSync(parent, constants.W_OK | constants.X_OK)
    }
  } catch (error) {
    return fail(`could not use ${directory} (${reason(error)}).`)
  }

  const url = RELEASE_URL
  let tarball
  try {
    tarball = await fetchTarball(url)
  } catch (error) {
    return fail(`could not download the template from ${url} (${reason(error)}).`)
  }

  // The whole archive is read and every path judged before the first byte is
  // written, so a tarball that is refused leaves nothing behind.
  let entries
  try {
    entries = workspaceEntries(
      readTar(gunzipSync(tarball, { maxOutputLength: UNPACKED_LIMIT_MB * 1024 * 1024 })),
    )
  } catch (error) {
    const why =
      error?.code === 'ERR_BUFFER_TOO_LARGE'
        ? `it unpacks to more than ${UNPACKED_LIMIT_MB} MB`
        : reason(error)
    return fail(`the template downloaded from ${url} could not be unpacked (${why}).`)
  }

  try {
    for (const { segments, kind, mode, data } of entries) {
      const path = join(target, ...segments)
      if (kind === 'directory') {
        mkdirSync(path, { recursive: true })
        continue
      }
      mkdirSync(dirname(path), { recursive: true })
      // Git records one thing about a file's mode — whether it can be run —
      // so that is the one thing carried over; the umask decides the rest.
      writeFileSync(path, data, { mode: mode & 0o111 ? 0o755 : 0o644 })
    }
  } catch (error) {
    // The folder was empty or absent a moment ago, so all that is in it now
    // is half a workspace, and leaving it would make the next run refuse.
    // What goes is what this run made and nothing else: the folders it had to
    // create on the way down, or, in a folder that was already there, what it
    // put inside. Taking it back can fail for the reason the write did; the
    // write's failure is the one worth reporting.
    try {
      if (made !== null) {
        rmSync(made, { recursive: true, force: true })
      } else {
        for (const name of readdirSync(target)) rmSync(join(target, name), { recursive: true, force: true })
      }
    } catch {
      // Nothing to add: the line below already says the workspace is not there.
    }
    return fail(`could not write the workspace to ${directory} (${reason(error)}).`)
  }

  const { pm, unsupported } = callingPackageManager(env)
  const { command, install: installArgs } = PACKAGE_MANAGERS[pm]
  const where = here ? 'this folder' : directory
  stdout.write(`Uno Blueprint ${VERSION} is in ${where}.`)

  // Yarn 2 and later get the workspace and not the install. Asked to install,
  // that is a refusal; asked not to, it is what was asked for, and what is
  // owed is who can install it and the steps in the words of one that can.
  if (unsupported && asked.install) {
    stdout.write('\n')
    return fail(
      `the workspace is in ${where}, but it was not installed: ${unsupported} cannot run it. It runs under npm, pnpm, Bun and Yarn 1, so install with one of those in ${where}.`,
    )
  }
  if (unsupported) {
    stdout.write(`\n${unsupported} cannot install or run it; npm, pnpm, Bun or Yarn 1 can, and the steps below are npm's.\n`)
    stdout.write(nextSteps({ manager: PACKAGE_MANAGERS.npm, directory: here ? null : directory, installed: false }))
    return 0
  }

  if (asked.install) {
    // Said before the install rather than after, so the wait that follows has
    // a reason on screen and the package manager's own output has a heading.
    stdout.write(` Installing its dependencies with ${pm}.\n\n`)
    // A package manager that exits non-zero, one that was killed and one that
    // could not be started are the same failure here. Either way the files
    // stay, and what is left to do in them is the line this names.
    let why = null
    try {
      const code = await install({ pm, command, args: installArgs, cwd: target })
      if (code !== 0) why = `exit code ${code}`
    } catch (error) {
      why = reason(error)
    }
    if (why !== null) {
      return fail(
        `the workspace is in ${where}, but ${typed(command, installArgs)} failed (${why}). Run it in ${where} to finish.`,
      )
    }
  } else {
    stdout.write('\n')
  }

  stdout.write(nextSteps({ manager: PACKAGE_MANAGERS[pm], directory: here ? null : directory, installed: asked.install }))
  return 0
}

/**
 * The lines left to type, in one manager's words: into the workspace unless
 * it is the current folder (`directory` null), the install unless it was
 * done here, and the line that starts the canvas.
 */
function nextSteps({ manager, directory, installed }) {
  const steps = [
    ...(directory === null ? [] : [`cd ${directory}`]),
    ...(installed ? [] : [typed(manager.command, manager.install)]),
    typed(manager.command, manager.dev),
  ]
  return `\nNext steps:\n\n${steps.map((step) => `  ${step}\n`).join('')}`
}

/**
 * What the arguments ask for: at most one directory, and the three flags.
 * `-h` and `-v` are the short forms a person tries first.
 */
function parseArguments(argv) {
  const asked = { directory: undefined, install: true, help: false, version: false, fault: undefined }
  for (const argument of argv) {
    if (argument === '--help' || argument === '-h') asked.help = true
    else if (argument === '--version' || argument === '-v') asked.version = true
    else if (argument === '--no-install') asked.install = false
    // An empty argument is what a script passes when its variable was unset.
    else if (argument === '') continue
    else if (argument.startsWith('-')) asked.fault ??= `unknown option ${argument}.`
    else if (asked.directory !== undefined) asked.fault ??= `one directory at a time: got ${asked.directory} and ${argument}.`
    else asked.directory = argument
  }
  return asked
}

/**
 * The archive's entries as a workspace takes them: the wrapping top-level
 * folder dropped, the initialiser's own folder left out, and every path
 * proven to stay inside the target. Throws on the first entry that does not.
 */
function workspaceEntries(archive) {
  const entries = []
  for (const { path, kind, mode, data } of archive) {
    const segments = segmentsInsideTop(path)
    if (segments.length === 0 || isAtOrBelow(segments, OWN_FOLDER)) continue
    // A link can point anywhere, and a template has no use for one.
    if (kind === 'other') throw new Error(`${path} is neither a file nor a folder`)
    entries.push({ segments, kind, mode, data })
  }
  // A folder that held nothing but the initialiser is not written either: an
  // empty `packages/` in a workspace would be a question with no answer.
  return entries.filter(
    ({ segments, kind }) =>
      kind !== 'directory' ||
      !isAtOrBelow(OWN_FOLDER, segments) ||
      entries.some((other) => other.kind === 'file' && isAtOrBelow(other.segments, segments)),
  )
}

/**
 * An archive path as segments below its top-level folder, or a throw.
 *
 * A release tarball wraps the tree in one folder named after the tag, and
 * that segment is dropped. What is left has to be a plain way down: an
 * absolute path, a `..`, or a backslash — which Windows reads as a separator —
 * is a tarball that is not the template, and none of it is written.
 */
function segmentsInsideTop(path) {
  const segments = path.split('/').filter((segment) => segment !== '' && segment !== '.')
  if (path.startsWith('/') || segments.some((segment) => segment === '..' || segment.includes('\\'))) {
    throw new Error(`${path} reaches outside the folder`)
  }
  return segments.slice(1)
}

/** Whether `path` is `folder` or somewhere beneath it, both as segments. */
function isAtOrBelow(path, folder) {
  return folder.every((segment, index) => path[index] === segment)
}

/** Why something failed, on one line. A failed fetch keeps its cause one level down, so that is read too. */
function reason(error) {
  const messages = [error?.message, error?.cause?.message].filter(Boolean)
  return (messages.join(': ') || String(error)).replace(/\s+/g, ' ')
}
