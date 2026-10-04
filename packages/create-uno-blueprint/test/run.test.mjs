/**
 * The initialiser, called the way its bin calls it and read the way a user
 * reads it: the files that landed, the text that was printed, the exit code.
 *
 * Every case hands `run` a release tarball built here, in memory, a throwaway
 * folder to write into, and an install that records what it was asked and
 * does nothing. Nothing reaches the network or starts a package manager.
 *
 * Run: npm test
 */
import { afterEach, beforeEach, test, vi } from 'vitest'
import assert from 'node:assert/strict'
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
  lstatSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { gzipSync } from 'node:zlib'

import { NODE_FLOOR } from '../src/node-floor.mjs'
import { installWith, run } from '../src/run.mjs'

const REPO_ROOT = fileURLToPath(new URL('../../..', import.meta.url))

/**
 * Where this package really sits in the template, read off the disk rather
 * than written down again — so the fixture below puts the initialiser where a
 * release tarball has it, and a move that `run` did not follow fails here.
 */
const OWN_FOLDER = relative(REPO_ROOT, fileURLToPath(new URL('..', import.meta.url)))
  .split(sep)
  .filter(Boolean)
  .join('/')

const VERSION = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
).version

/** Where the release for this version is downloaded from. */
const RELEASE_URL = `https://codeload.github.com/BilLogic/uno-blueprint/tar.gz/refs/tags/v${VERSION}`

/** The folder a release tarball wraps everything in: the repository name, then the tag without its `v`. */
const TOP = `uno-blueprint-${VERSION}`

/** A path too long for the header's name field, and with a last segment too long to split across its prefix. */
const LONG_NAME = `docs/${'a-very-long-folder-name/'.repeat(8)}${'n'.repeat(120)}.md`

/** One 512-byte ustar header. `name` is written as given, so a case can hand it a path no archiver would. */
function header({ name, size = 0, type = '0', mode = 0o644, prefix = '' }) {
  const block = Buffer.alloc(512)
  block.write(name, 0, 100, 'utf8')
  block.write(mode.toString(8).padStart(7, '0'), 100, 8, 'ascii')
  block.write('0000000', 108, 8, 'ascii')
  block.write('0000000', 116, 8, 'ascii')
  block.write(size.toString(8).padStart(11, '0'), 124, 12, 'ascii')
  block.write('00000000000', 136, 12, 'ascii')
  block.fill(' ', 148, 156)
  block.write(type, 156, 1, 'ascii')
  block.write('ustar\x0000', 257, 8, 'binary')
  block.write(prefix, 345, 155, 'utf8')
  const sum = block.reduce((total, byte) => total + byte, 0)
  block.write(`${sum.toString(8).padStart(6, '0')}\0 `, 148, 8, 'binary')
  return block
}

/** A header and its data, padded to the block. */
function member(fields, data = '') {
  const body = Buffer.from(data)
  const padding = Buffer.alloc((512 - (body.length % 512)) % 512)
  return Buffer.concat([header({ ...fields, size: body.length }), body, padding])
}

/** One pax record: its own length, a space, `key=value`, a newline. */
function paxRecord(key, value) {
  const rest = ` ${key}=${value}\n`
  let length = Buffer.byteLength(rest)
  while (Buffer.byteLength(`${length}${rest}`) !== length) length += 1
  return `${length}${rest}`
}

/**
 * A gzipped tar holding `entries`, shaped as a release tarball is: a pax
 * global header first, then every path under the one top-level folder. A path
 * past 100 bytes travels in a pax header ahead of its entry, unless the case
 * splits it across the header's prefix field itself. `raw` writes the path as
 * given, outside the top-level folder if it says so.
 */
function tarball(entries) {
  return gzipSync(tar(entries))
}

/** The same archive before it is gzipped, for a case that has to damage it first. */
function tar(entries) {
  const blocks = [member({ name: 'pax_global_header', type: 'g' }, paxRecord('comment', 'f'.repeat(40)))]
  for (const { path, data = '', type = '0', mode, raw = false, prefix } of entries) {
    const full = raw ? path : `${TOP}/${path}`
    const fields = { type, mode: mode ?? (type === '5' ? 0o755 : 0o644) }
    if (prefix !== undefined) {
      blocks.push(member({ ...fields, name: path, prefix: `${TOP}/${prefix}` }, data))
    } else if (Buffer.byteLength(full) > 100) {
      blocks.push(member({ name: 'pax-header', type: 'x' }, paxRecord('path', full)))
      blocks.push(member({ ...fields, name: full.slice(0, 100) }, data))
    } else {
      blocks.push(member({ ...fields, name: full }, data))
    }
  }
  blocks.push(Buffer.alloc(1024))
  return Buffer.concat(blocks)
}

/** A small template: a manifest, a script that must stay executable, a nested folder, the initialiser's own folder. */
const TEMPLATE = [
  { path: '', type: '5' },
  { path: 'package.json', data: '{ "name": "uno-blueprint" }\n' },
  { path: 'scripts/', type: '5' },
  { path: 'scripts/run.sh', data: '#!/bin/sh\n', mode: 0o755 },
  { path: 'src/', type: '5' },
  { path: 'src/components/', type: '5' },
  { path: 'src/components/Canvas.tsx', data: 'export {}\n' },
  { path: 'packages/', type: '5' },
  { path: `${OWN_FOLDER}/`, type: '5' },
  { path: `${OWN_FOLDER}/package.json`, data: '{}\n' },
  { path: `${OWN_FOLDER}/src/run.mjs`, data: '\n' },
]

let cwd

beforeEach(() => {
  cwd = mkdtempSync(join(tmpdir(), 'create-uno-blueprint-'))
})

afterEach(() => {
  vi.unstubAllGlobals()
  rmSync(cwd, { recursive: true, force: true })
})

/** Every path under the throwaway folder, sorted: what the disk holds, to compare before and after. */
function disk() {
  return readdirSync(cwd, { recursive: true }).map(String).sort()
}

/**
 * Run the initialiser in the throwaway folder and hand back everything a user
 * would see, plus what it asked of the two things it does not do itself: the
 * download and the install. The install here is a stand-in that records the
 * call and reports success, unless a case gives it another answer; no case
 * starts a package manager.
 */
async function create(argv, { entries = TEMPLATE, fetchTarball, install, env = {}, ...rest } = {}) {
  const out = []
  const err = []
  const asked = []
  const installs = []
  const code = await run({
    argv,
    env,
    cwd,
    stdout: { write: (text) => out.push(text) },
    stderr: { write: (text) => err.push(text) },
    nodeVersion: '22.12.0',
    // `null` leaves the download to the initialiser's own, for the cases that
    // stand in for the platform fetch instead.
    ...(fetchTarball === null
      ? {}
      : {
          fetchTarball: async (url) => {
            asked.push(url)
            return fetchTarball ? fetchTarball(url) : tarball(entries)
          },
        }),
    install: async (request) => {
      installs.push(request)
      return install ? install(request) : 0
    },
    ...rest,
  })
  return { code, out: out.join(''), err: err.join(''), asked, installs }
}

/** One line, and only one, on stderr. */
function oneLine(err) {
  assert.match(err, /^create-uno-blueprint: [^\n]+\n$/)
}

test('a named folder receives the template at the release matching this version', async () => {
  const { code, out, err, asked } = await create(['my-blueprint'])

  assert.equal(code, 0)
  assert.equal(err, '')
  assert.deepEqual(asked, [RELEASE_URL])
  assert.equal(
    readFileSync(join(cwd, 'my-blueprint/package.json'), 'utf8'),
    '{ "name": "uno-blueprint" }\n',
  )
  assert.equal(
    readFileSync(join(cwd, 'my-blueprint/src/components/Canvas.tsx'), 'utf8'),
    'export {}\n',
  )
  // The wrapping folder is the tarball's, not the workspace's.
  assert.equal(existsSync(join(cwd, 'my-blueprint', TOP)), false)
  assert.ok(out.includes(`Uno Blueprint ${VERSION}`))
  assert.match(out, /Next steps:\n\n {2}cd my-blueprint\n {2}npm run dev\n$/)
})

test('with no folder named, the workspace lands in uno-blueprint', async () => {
  const { code, out } = await create([])

  assert.equal(code, 0)
  assert.equal(existsSync(join(cwd, 'uno-blueprint/package.json')), true)
  assert.match(out, /\n {2}cd uno-blueprint\n/)
})

test('an empty folder that already exists is a fine place to write', async () => {
  mkdirSync(join(cwd, 'empty'))

  const { code } = await create(['empty'])

  assert.equal(code, 0)
  assert.equal(existsSync(join(cwd, 'empty/package.json')), true)
})

test('a folder that already has files is refused in one line, untouched', async () => {
  mkdirSync(join(cwd, 'mine'))
  writeFileSync(join(cwd, 'mine/notes.txt'), 'keep me\n')

  const { code, out, err, asked } = await create(['mine'])

  assert.equal(code, 1)
  assert.equal(out, '')
  oneLine(err)
  assert.match(err, /mine already has files in it/)
  assert.deepEqual(asked, [])
  assert.deepEqual(readdirSync(join(cwd, 'mine')), ['notes.txt'])
})

test('a Node below 22 is refused before anything else, naming the version needed', async () => {
  const { code, out, err, asked } = await create(['--help'], { nodeVersion: '20.11.1' })

  assert.equal(code, 1)
  assert.equal(out, '')
  oneLine(err)
  assert.match(err, /Node 22/)
  assert.match(err, /20\.11\.1/)
  assert.deepEqual(asked, [])
})

test('a failed download is reported in one line naming where it tried', async () => {
  const { code, out, err } = await create(['my-blueprint'], {
    fetchTarball: async () => {
      throw new Error('getaddrinfo ENOTFOUND codeload.github.com')
    },
  })

  assert.equal(code, 1)
  assert.equal(out, '')
  oneLine(err)
  assert.ok(err.includes(RELEASE_URL))
  assert.match(err, /ENOTFOUND/)
  assert.equal(existsSync(join(cwd, 'my-blueprint')), false)
})

test('--help prints the interface and writes nothing', async () => {
  const { code, out, err, asked } = await create(['--help'])

  assert.equal(code, 0)
  assert.equal(err, '')
  assert.ok(out.includes('create-uno-blueprint [directory]'))
  for (const flag of ['--no-install', '--help', '--version']) assert.ok(out.includes(flag), flag)
  assert.deepEqual(asked, [])
  assert.deepEqual(readdirSync(cwd), [])
})

test('--version prints this version and writes nothing', async () => {
  const { code, out, asked } = await create(['--version'])

  assert.equal(code, 0)
  assert.equal(out, `${VERSION}\n`)
  assert.deepEqual(asked, [])
  assert.deepEqual(readdirSync(cwd), [])
})

test('--no-install writes the workspace and installs nothing, on either side of the folder', async () => {
  const before = await create(['--no-install', 'one'])
  const after = await create(['two', '--no-install'])

  for (const [result, folder] of [[before, 'one'], [after, 'two']]) {
    assert.equal(result.code, 0)
    assert.equal(result.err, '')
    assert.equal(existsSync(join(cwd, folder, 'package.json')), true)
    assert.deepEqual(result.installs, [])
    // The install it skipped is the user's next line.
    assert.ok(result.out.includes(`Uno Blueprint ${VERSION} is in ${folder}.\n`))
    assert.match(result.out, new RegExp(`Next steps:\\n\\n {2}cd ${folder}\\n {2}npm install\\n {2}npm run dev\\n$`))
  }
})

test('an option it does not know is refused in one line', async () => {
  const { code, err, asked } = await create(['my-blueprint', '--template=other'])

  assert.equal(code, 1)
  oneLine(err)
  assert.ok(err.includes('--template=other'))
  assert.deepEqual(asked, [])
})

test('the workspace does not carry the initialiser', async () => {
  const { code } = await create(['my-blueprint'])

  assert.equal(code, 0)
  // Its folder is gone, and so is the parent that held nothing else.
  assert.deepEqual(readdirSync(join(cwd, 'my-blueprint')).sort(), ['package.json', 'scripts', 'src'])
})

test('a folder beside the initialiser is kept', async () => {
  const { code } = await create(['my-blueprint'], {
    entries: [...TEMPLATE, { path: 'packages/other/index.mjs', data: '\n' }],
  })

  assert.equal(code, 0)
  assert.deepEqual(readdirSync(join(cwd, 'my-blueprint/packages')), ['other'])
})

test.skipIf(process.platform === 'win32')('a file that was executable stays executable', async () => {
  await create(['my-blueprint'])

  assert.notEqual(statSync(join(cwd, 'my-blueprint/scripts/run.sh')).mode & 0o100, 0)
  assert.equal(statSync(join(cwd, 'my-blueprint/package.json')).mode & 0o100, 0)
})

test('a name too long for the header arrives whole, by either road an archiver takes', async () => {
  const split = {
    prefix: 'docs/a-folder-deep-enough-to-push-the-whole-path-past-one-hundred-bytes/and-then-some',
    path: 'a-file-with-a-name.md',
  }
  const { code } = await create(['my-blueprint'], {
    entries: [...TEMPLATE, { path: LONG_NAME, data: 'long\n' }, { ...split, data: 'split\n' }],
  })

  assert.equal(code, 0)
  assert.equal(readFileSync(join(cwd, 'my-blueprint', LONG_NAME), 'utf8'), 'long\n')
  assert.equal(readFileSync(join(cwd, 'my-blueprint', split.prefix, split.path), 'utf8'), 'split\n')
})

test('a tarball that reaches outside the folder is refused and nothing is written', async () => {
  for (const path of [`${TOP}/../escaped.txt`, `${TOP}/src/../../escaped.txt`, '/escaped.txt']) {
    const { code, out, err } = await create(['my-blueprint'], {
      entries: [...TEMPLATE, { path, raw: true, data: 'out\n' }],
    })

    assert.equal(code, 1, path)
    assert.equal(out, '')
    oneLine(err)
    assert.match(err, /could not be unpacked/)
    assert.equal(existsSync(join(cwd, 'escaped.txt')), false)
    assert.equal(existsSync(join(cwd, 'my-blueprint')), false)
  }
})

test('a download that is not a tarball is reported, not thrown', async () => {
  const { code, err } = await create(['my-blueprint'], {
    fetchTarball: async () => Buffer.from('<html>rate limited</html>'),
  })

  assert.equal(code, 1)
  oneLine(err)
  assert.match(err, /could not be unpacked/)
  assert.equal(existsSync(join(cwd, 'my-blueprint')), false)
})

/** A template that cannot be written whole: `a` lands as a file, and then `a/b` needs it to be a folder. */
const UNWRITABLE = [
  { path: 'package.json', data: '{}\n' },
  { path: 'a', data: 'a file\n' },
  { path: 'a/b', data: 'under a file\n' },
]

test('a write that fails part-way takes back every folder it made, and only those', async () => {
  mkdirSync(join(cwd, 'mine'))
  writeFileSync(join(cwd, 'mine/notes.txt'), 'keep me\n')
  const before = disk()

  const { code, out, err } = await create(['mine/new/deep'], { entries: UNWRITABLE })

  assert.equal(code, 1)
  assert.equal(out, '')
  oneLine(err)
  assert.match(err, /could not write the workspace to mine\/new\/deep/)
  assert.deepEqual(disk(), before)
})

test('a write that fails part-way in a folder that was already there leaves it there, empty', async () => {
  mkdirSync(join(cwd, 'empty'))
  const before = disk()

  const { code, err } = await create(['empty'], { entries: UNWRITABLE })

  assert.equal(code, 1)
  oneLine(err)
  assert.deepEqual(disk(), before)
})

test.skipIf(process.platform === 'win32')(
  'a dangling link on the way to the target is the user\'s, and a failed write leaves it',
  async () => {
    symlinkSync(join(cwd, 'nowhere'), join(cwd, 'mine'))

    const { code, err } = await create(['mine/new'], { entries: UNWRITABLE })

    assert.equal(code, 1)
    oneLine(err)
    assert.equal(lstatSync(join(cwd, 'mine')).isSymbolicLink(), true)
  },
)

test('a file on the way to the target is refused in one line, before anything is downloaded', async () => {
  writeFileSync(join(cwd, 'afile'), '')

  const { code, out, err, asked } = await create(['afile/new'])

  assert.equal(code, 1)
  assert.equal(out, '')
  oneLine(err)
  assert.match(err, /afile\/new/)
  assert.deepEqual(asked, [])
  assert.deepEqual(disk(), ['afile'])
})

// Root searches and writes any folder, so there is nothing to refuse.
for (const [mode, shape] of [
  [0o000, 'cannot be searched'],
  [0o555, 'cannot be written'],
]) {
  test.skipIf(process.platform === 'win32' || process.getuid?.() === 0)(
    `a parent that ${shape} is refused in one line, before anything is downloaded`,
    async () => {
      mkdirSync(join(cwd, 'locked'))
      chmodSync(join(cwd, 'locked'), mode)
      try {
        const { code, out, err, asked } = await create(['locked/new'])

        assert.equal(code, 1)
        assert.equal(out, '')
        oneLine(err)
        assert.match(err, /locked\/new/)
        assert.match(err, /EACCES/)
        assert.deepEqual(asked, [])
      } finally {
        chmodSync(join(cwd, 'locked'), 0o755)
      }
    },
  )
}

// Root reads a mode-000 folder like any other, so there is nothing to refuse.
test.skipIf(process.platform === 'win32' || process.getuid?.() === 0)(
  'a folder that cannot be read is reported in one line, before anything is downloaded',
  async () => {
    mkdirSync(join(cwd, 'locked'))
    chmodSync(join(cwd, 'locked'), 0o000)
    try {
      const { code, out, err, asked } = await create(['locked'])

      assert.equal(code, 1)
      assert.equal(out, '')
      oneLine(err)
      assert.match(err, /locked/)
      assert.match(err, /EACCES/)
      assert.deepEqual(asked, [])
    } finally {
      chmodSync(join(cwd, 'locked'), 0o755)
    }
  },
)

test('a name that is a file is refused before anything is downloaded', async () => {
  writeFileSync(join(cwd, 'a-file'), '')

  const { code, err, asked } = await create(['a-file'])

  assert.equal(code, 1)
  oneLine(err)
  assert.deepEqual(asked, [])
})

test('a Node version that cannot be read is refused, not waved through', async () => {
  const { code, err, asked } = await create(['my-blueprint'], { nodeVersion: 'unknown' })

  assert.equal(code, 1)
  oneLine(err)
  assert.match(err, /Node 22/)
  assert.deepEqual(asked, [])
})

test('a dot writes into the current folder, and the next steps have no cd', async () => {
  const { code, out } = await create(['.'])

  assert.equal(code, 0)
  assert.equal(existsSync(join(cwd, 'package.json')), true)
  assert.ok(out.includes(`Uno Blueprint ${VERSION} is in this folder.`))
  assert.match(out, /Next steps:\n\n {2}npm run dev\n$/)
})

test('a dot is refused like any folder when the current one has files', async () => {
  writeFileSync(join(cwd, 'notes.txt'), 'keep me\n')

  const { code, err, asked } = await create(['.'])

  assert.equal(code, 1)
  oneLine(err)
  assert.deepEqual(asked, [])
  assert.deepEqual(disk(), ['notes.txt'])
})

test('an empty argument is no argument', async () => {
  const { code, out } = await create([''])

  assert.equal(code, 0)
  assert.equal(existsSync(join(cwd, 'uno-blueprint/package.json')), true)
  assert.match(out, /\n {2}cd uno-blueprint\n/)
})

test('a link in the tarball is refused and nothing is written', async () => {
  const { code, out, err } = await create(['my-blueprint'], {
    entries: [...TEMPLATE, { path: 'link-to-elsewhere', type: '2' }],
  })

  assert.equal(code, 1)
  assert.equal(out, '')
  oneLine(err)
  assert.match(err, /could not be unpacked/)
  assert.deepEqual(disk(), [])
})

test('a backslash in a path is refused and nothing is written', async () => {
  const { code, err } = await create(['my-blueprint'], {
    entries: [...TEMPLATE, { path: 'src\\..\\..\\escaped.txt', data: 'out\n' }],
  })

  assert.equal(code, 1)
  oneLine(err)
  assert.match(err, /could not be unpacked/)
  assert.deepEqual(disk(), [])
})

test('a tarball cut short is reported in one line and nothing is written', async () => {
  const whole = tar([...TEMPLATE, { path: 'docs/long.md', data: 'x'.repeat(2000) }])
  // Past the last header and into its data, with the end marker gone.
  const cut = whole.subarray(0, whole.length - 1024 - 1536)

  const { code, out, err } = await create(['my-blueprint'], {
    fetchTarball: async () => gzipSync(cut),
  })

  assert.equal(code, 1)
  assert.equal(out, '')
  oneLine(err)
  assert.match(err, /could not be unpacked/)
  assert.deepEqual(disk(), [])
})

test('a tarball that unpacks past any size a template could be is refused', async () => {
  // Zeros compress to almost nothing, which is the whole of the trick.
  const { code, err } = await create(['my-blueprint'], {
    fetchTarball: async () => gzipSync(Buffer.alloc(129 * 1024 * 1024)),
  })

  assert.equal(code, 1)
  oneLine(err)
  assert.match(err, /could not be unpacked/)
  assert.match(err, /128 MB/)
  assert.deepEqual(disk(), [])
})

test('its own download gives up after a time, and reports a refusal by status', async () => {
  const calls = []
  vi.stubGlobal('fetch', async (url, options) => {
    calls.push({ url, options })
    return { ok: false, status: 404 }
  })

  const { code, out, err } = await create(['my-blueprint'], { fetchTarball: null })

  assert.equal(code, 1)
  assert.equal(out, '')
  oneLine(err)
  assert.ok(err.includes(RELEASE_URL))
  assert.match(err, /HTTP 404/)
  assert.equal(calls.length, 1)
  assert.equal(calls[0].url, RELEASE_URL)
  // The bound is a signal the platform aborts on its own; without one a
  // stalled connection is a command that never ends.
  assert.ok(calls[0].options?.signal instanceof AbortSignal)
  assert.deepEqual(disk(), [])
})

test('its own download that runs out of time is one line naming where it tried', async () => {
  vi.stubGlobal('fetch', async () => {
    throw new DOMException('The operation was aborted due to timeout', 'TimeoutError')
  })

  const { code, err } = await create(['my-blueprint'], { fetchTarball: null })

  assert.equal(code, 1)
  oneLine(err)
  assert.ok(err.includes(RELEASE_URL))
  assert.match(err, /timeout/)
})

/**
 * The four callers: what each puts in `npm_config_user_agent`, what the
 * initialiser runs to install with it, and the two lines it tells a user.
 */
const CALLERS = [
  {
    agent: 'npm/10.9.2 node/v22.17.0 darwin arm64 workspaces/false',
    pm: 'npm',
    command: 'npm',
    args: ['install'],
    installLine: 'npm install',
    devLine: 'npm run dev',
  },
  {
    agent: 'pnpm/10.33.0 npm/? node/v22.17.0 darwin arm64',
    pm: 'pnpm',
    command: 'pnpm',
    args: ['install'],
    installLine: 'pnpm install',
    devLine: 'pnpm dev',
  },
  {
    agent: 'yarn/1.22.22 npm/? node/v22.17.0 darwin arm64',
    pm: 'yarn',
    command: 'yarn',
    args: ['install'],
    installLine: 'yarn install',
    devLine: 'yarn dev',
  },
  {
    agent: 'bun/1.2.10 npm/? node/v22.17.0 darwin arm64',
    pm: 'bun',
    command: 'bun',
    args: ['install'],
    installLine: 'bun install',
    devLine: 'bun dev',
  },
]

test.each(CALLERS)(
  'called by $pm, it installs with it and the next step is its own',
  async ({ agent, pm, command, args, devLine }) => {
    const { code, out, err, installs } = await create(['my-blueprint'], {
      env: { npm_config_user_agent: agent },
    })

    assert.equal(code, 0)
    assert.equal(err, '')
    // Once, in the workspace, after the files are there.
    assert.deepEqual(installs, [{ pm, command, args, cwd: join(cwd, 'my-blueprint') }])
    assert.ok(out.includes(`Installing its dependencies with ${pm}.`))
    // No install line: it has just been done.
    assert.ok(out.endsWith(`Next steps:\n\n  cd my-blueprint\n  ${devLine}\n`), out)
  },
)

test.each(CALLERS)(
  'called by $pm with --no-install, the install is the next step in its own words',
  async ({ agent, installLine, devLine }) => {
    const { code, out, installs } = await create(['my-blueprint', '--no-install'], {
      env: { npm_config_user_agent: agent },
    })

    assert.equal(code, 0)
    assert.deepEqual(installs, [])
    assert.ok(out.endsWith(`Next steps:\n\n  cd my-blueprint\n  ${installLine}\n  ${devLine}\n`), out)
  },
)

test.each(CALLERS)('what is run for $pm is what is printed for it', async ({ agent, installLine }) => {
  const { installs } = await create(['my-blueprint'], { env: { npm_config_user_agent: agent } })

  const [{ command, args }] = installs
  assert.equal([command, ...args].join(' '), installLine)
})

const LATER_YARNS = ['yarn/2.4.3 npm/? node/v22.17.0 darwin arm64', 'yarn/4.9.1 npm/? node/v22.17.0 darwin arm64']

test.each(LATER_YARNS)(
  'called by Yarn 2 or later (%s), the workspace is written, not installed, and it says who can',
  async (agent) => {
    const { code, out, err, installs } = await create(['my-blueprint'], { env: { npm_config_user_agent: agent } })

    assert.equal(code, 1)
    assert.deepEqual(installs, [])
    oneLine(err)
    assert.match(err, /the workspace is in my-blueprint/)
    assert.match(err, /Yarn [24]\b/)
    assert.match(err, /npm, pnpm, Bun and Yarn 1/)
    assert.match(err, /in my-blueprint\.\n$/)
    // The files are there for whichever of those the user picks.
    assert.equal(existsSync(join(cwd, 'my-blueprint', 'package.json')), true)
    // And nothing tells them to type `yarn dev` into a workspace Yarn cannot run.
    assert.equal(out.includes('Next steps'), false)
    assert.equal(out.includes('yarn'), false)
  },
)

test.each(LATER_YARNS)(
  'called by Yarn 2 or later (%s) with --no-install, that is what was asked for: exit 0, and one line on who can install it',
  async (agent) => {
    const { code, out, err, installs } = await create(['my-blueprint', '--no-install'], {
      env: { npm_config_user_agent: agent },
    })

    assert.equal(code, 0)
    assert.equal(err, '')
    assert.deepEqual(installs, [])
    assert.equal(existsSync(join(cwd, 'my-blueprint', 'package.json')), true)
    assert.match(out, /\n[^\n]*Yarn [24]\b[^\n]*npm, pnpm, Bun or Yarn 1[^\n]*\n\nNext steps:/)
    // The steps are npm's, since the caller cannot take them.
    assert.ok(out.endsWith('Next steps:\n\n  cd my-blueprint\n  npm install\n  npm run dev\n'), out)
  },
)

test('the workspace is whole before the install is asked for', async () => {
  let seen
  await create(['my-blueprint'], {
    install: ({ cwd: workspace }) => {
      seen = readdirSync(workspace).sort()
      return 0
    },
  })

  assert.deepEqual(seen, ['package.json', 'scripts', 'src'])
})

test('a dot installs in the current folder', async () => {
  const { installs } = await create(['.'])

  assert.deepEqual(installs, [{ pm: 'npm', command: 'npm', args: ['install'], cwd }])
})

test('with no user-agent, or one it does not know, it is npm', async () => {
  const agents = [undefined, '', 'deno/2.1.4 npm/? deno/2.1.4 darwin aarch64', 'npminstall/7.0.0', 'toString/1.0.0']
  for (const [index, agent] of agents.entries()) {
    const { code, out, installs } = await create([`workspace-${index}`], {
      env: { npm_config_user_agent: agent },
    })

    assert.equal(code, 0, agent)
    assert.deepEqual(
      installs,
      [{ pm: 'npm', command: 'npm', args: ['install'], cwd: join(cwd, `workspace-${index}`) }],
      agent,
    )
    assert.ok(out.endsWith('  npm run dev\n'), agent)
  }
})

test('a Yarn whose version cannot be read is taken for Yarn 1', async () => {
  const { code, installs } = await create(['my-blueprint'], { env: { npm_config_user_agent: 'yarn' } })

  assert.equal(code, 0)
  assert.equal(installs[0].pm, 'yarn')
})

test('nothing is installed when the workspace was not written', async () => {
  mkdirSync(join(cwd, 'mine'))
  writeFileSync(join(cwd, 'mine/notes.txt'), 'keep me\n')

  const refused = await create(['mine'])
  const offline = await create(['my-blueprint'], {
    fetchTarball: async () => {
      throw new Error('offline')
    },
  })
  const unwritable = await create(['other'], { entries: UNWRITABLE })
  const help = await create(['--help'])

  for (const { installs } of [refused, offline, unwritable, help]) assert.deepEqual(installs, [])
})

test('an install that fails leaves the workspace, says so in one line and exits non-zero', async () => {
  const { code, out, err, installs } = await create(['my-blueprint'], {
    env: { npm_config_user_agent: 'bun/1.2.10 npm/? node/v22.17.0 darwin arm64' },
    install: () => 1,
  })

  assert.equal(code, 1)
  assert.equal(installs.length, 1)
  assert.equal(
    err,
    'create-uno-blueprint: the workspace is in my-blueprint, but bun install failed (exit code 1). Run it in my-blueprint to finish.\n',
  )
  // The files are the user's to keep: the install is theirs to run again.
  assert.equal(
    readFileSync(join(cwd, 'my-blueprint/package.json'), 'utf8'),
    '{ "name": "uno-blueprint" }\n',
  )
  assert.equal(existsSync(join(cwd, 'my-blueprint/src/components/Canvas.tsx')), true)
  // And it does not go on to say the canvas is one step away.
  assert.equal(out.includes('Next steps'), false)
})

test('an install that fails in the current folder is spoken of as this folder throughout', async () => {
  const { code, err } = await create(['.'], { install: () => 1 })

  assert.equal(code, 1)
  assert.equal(
    err,
    'create-uno-blueprint: the workspace is in this folder, but npm install failed (exit code 1). Run it in this folder to finish.\n',
  )
})

/**
 * The installer the bin uses, at its own seam: handed a command, its
 * arguments and a folder, it runs them and answers with the exit code. These
 * hand it Node itself and a name nothing answers to, so what is exercised is
 * the starting, the waiting and the three ways it can end, and no package
 * manager is started. Not on Windows, where it goes through a shell and the
 * path to Node would need quoting that a package manager's name never does.
 */
const viaTheRealInstaller = (command, args) => ({
  install: ({ cwd: workspace }) => installWith({ command, args, cwd: workspace, stdio: 'ignore' }),
})

test.skipIf(process.platform === 'win32')(
  'its own installer, given a command that does not exist, is one line saying so',
  async () => {
    const { code, out, err } = await create(['my-blueprint'], viaTheRealInstaller('no-such-package-manager', ['install']))

    assert.equal(code, 1)
    oneLine(err)
    assert.match(err, /npm install failed/)
    assert.match(err, /ENOENT/)
    assert.equal(existsSync(join(cwd, 'my-blueprint/package.json')), true)
    assert.equal(out.includes('Next steps'), false)
  },
)

test.skipIf(process.platform === 'win32')(
  'its own installer, when the child exits non-zero, reports that exit code',
  async () => {
    const { code, err } = await create(
      ['my-blueprint'],
      viaTheRealInstaller(process.execPath, ['-e', 'process.exit(3)']),
    )

    assert.equal(code, 1)
    oneLine(err)
    assert.match(err, /\(exit code 3\)/)
    assert.equal(existsSync(join(cwd, 'my-blueprint/package.json')), true)
  },
)

test.skipIf(process.platform === 'win32')(
  'its own installer runs in the workspace, and a child that exits 0 is a finished install',
  async () => {
    const { code, err } = await create(
      ['my-blueprint'],
      viaTheRealInstaller(process.execPath, [
        '-e',
        'require("node:fs").writeFileSync("installed-here", "")',
      ]),
    )

    assert.equal(code, 0)
    assert.equal(err, '')
    assert.equal(existsSync(join(cwd, 'my-blueprint/installed-here')), true)
  },
)

test.skipIf(process.platform === 'win32')(
  'its own installer, when the child is killed, names the signal and not an exit code',
  async () => {
    const { code, err } = await create(
      ['my-blueprint'],
      viaTheRealInstaller(process.execPath, ['-e', 'process.kill(process.pid, "SIGTERM")']),
    )

    assert.equal(code, 1)
    oneLine(err)
    assert.match(err, /SIGTERM/)
    assert.equal(err.includes('exit code'), false)
  },
)

test('the Node floor the command checks is the one both manifests state', () => {
  for (const manifest of [new URL('../package.json', import.meta.url), join(REPO_ROOT, 'package.json')]) {
    assert.equal(JSON.parse(readFileSync(manifest, 'utf8')).engines.node, `>=${NODE_FLOOR}`, String(manifest))
  }
})
