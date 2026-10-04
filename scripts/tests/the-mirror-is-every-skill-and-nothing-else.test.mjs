/**
 * THE MIRROR HOLDS EVERY SKILL, BYTE FOR BYTE, AND NOTHING ELSE.
 *
 * Other coding agents discover skills under `.agents/skills/<name>/SKILL.md`
 * and none of them scans a top-level `skills/`. `skills/` stays canonical —
 * its paths are a published interface — so `.agents/skills/` is a copy, and
 * `sync-agent-skills.mjs` is what keeps it one. A copy nothing checks is a
 * second source by the next edit, so the check walks both ways: every skill
 * has an identical copy, and every file under the mirror is a copy of a skill.
 *
 * The tree is staged rather than described. The script reads the tree it is
 * run in, so a throwaway root holding copies of the two trees it touches is
 * the only way to plant drift without planting it in this repository. The
 * staged root is not a git checkout, and that is the point of the first test:
 * a workspace is not one either, and the check has to run there.
 *
 * Run: npm test
 */
import { test } from 'vitest'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const ROOT = resolve(new URL('../..', import.meta.url).pathname)
const SCRIPT = join(ROOT, 'scripts/sync-agent-skills.mjs')
const SKILLS = ['map', 'slice', 'audit', 'whatif']

/** The two trees the mirror reads and writes, copied into a throwaway root. */
function stage({ mirror = true } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'mirror-'))
  cpSync(join(ROOT, 'skills'), join(root, 'skills'), { recursive: true })
  if (mirror) cpSync(join(ROOT, '.agents'), join(root, '.agents'), { recursive: true })
  return { root, done: () => rmSync(root, { recursive: true, force: true }) }
}

/** The sync, run in a staged root. `{ status, output }`, never throwing. */
function run(root, ...args) {
  try {
    const output = execFileSync('node', [SCRIPT, ...args], {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    return { status: 0, output }
  } catch (error) {
    return { status: error.status, output: `${error.stdout ?? ''}${error.stderr ?? ''}` }
  }
}

test('this repository’s mirror is in step with its skills, outside any git checkout', () => {
  const t = stage()
  try {
    assert.equal(existsSync(join(t.root, '.git')), false)
    const { status, output } = run(t.root, '--check')
    assert.equal(status, 0, output)
  } finally {
    t.done()
  }
})

test('the mirror holds the four skills, each byte-identical to its source', () => {
  for (const name of SKILLS) {
    assert.deepEqual(
      readFileSync(join(ROOT, '.agents/skills', name, 'SKILL.md')),
      readFileSync(join(ROOT, 'skills', name, 'SKILL.md')),
      `.agents/skills/${name}/SKILL.md`,
    )
  }
})

test('a copy that differs from its skill is drift, named', () => {
  const t = stage()
  try {
    writeFileSync(join(t.root, '.agents/skills/slice/SKILL.md'), '# edited in the copy\n')
    const { status, output } = run(t.root, '--check')
    assert.equal(status, 1, output)
    assert.match(output, /drift: \.agents\/skills\/slice\/SKILL\.md/)
  } finally {
    t.done()
  }
})

test('a skill with no copy is drift, named', () => {
  const t = stage()
  try {
    rmSync(join(t.root, '.agents/skills/whatif'), { recursive: true })
    const { status, output } = run(t.root, '--check')
    assert.equal(status, 1, output)
    assert.match(output, /missing: \.agents\/skills\/whatif\/SKILL\.md/)
  } finally {
    t.done()
  }
})

test('a file under the mirror that no skill produced is an orphan, named', () => {
  const t = stage()
  try {
    mkdirSync(join(t.root, '.agents/skills/invented'), { recursive: true })
    writeFileSync(join(t.root, '.agents/skills/invented/SKILL.md'), '# not a copy\n')
    writeFileSync(join(t.root, '.agents/skills/map/notes.md'), '# not a copy either\n')
    const { status, output } = run(t.root, '--check')
    assert.equal(status, 1, output)
    assert.match(output, /orphan: \.agents\/skills\/invented\/SKILL\.md/)
    assert.match(output, /orphan: \.agents\/skills\/map\/notes\.md/)
  } finally {
    t.done()
  }
})

test('a sync writes the mirror from nothing, and the check then passes', () => {
  const t = stage({ mirror: false })
  try {
    const before = run(t.root, '--check')
    assert.equal(before.status, 1, before.output)

    const sync = run(t.root)
    assert.equal(sync.status, 0, sync.output)
    for (const name of SKILLS) {
      assert.deepEqual(
        readFileSync(join(t.root, '.agents/skills', name, 'SKILL.md')),
        readFileSync(join(t.root, 'skills', name, 'SKILL.md')),
      )
    }
    const after = run(t.root, '--check')
    assert.equal(after.status, 0, after.output)
  } finally {
    t.done()
  }
})

test('the copy’s folder is the skill’s frontmatter name, not its directory', () => {
  const t = stage()
  try {
    mkdirSync(join(t.root, 'skills/draft'), { recursive: true })
    writeFileSync(
      join(t.root, 'skills/draft/SKILL.md'),
      '---\nname: sketch\ndescription: A staged skill.\n---\n\n# Sketch\n',
    )
    const sync = run(t.root)
    assert.equal(sync.status, 0, sync.output)
    assert.equal(existsSync(join(t.root, '.agents/skills/sketch/SKILL.md')), true)
    assert.equal(existsSync(join(t.root, '.agents/skills/draft')), false)
  } finally {
    t.done()
  }
})

test('a sync does not delete an orphan; it names it and fails', () => {
  const t = stage()
  try {
    writeFileSync(join(t.root, '.agents/skills/stray.md'), '# stray\n')
    const { status, output } = run(t.root)
    assert.equal(status, 1, output)
    assert.match(output, /orphan: \.agents\/skills\/stray\.md/)
    assert.equal(existsSync(join(t.root, '.agents/skills/stray.md')), true)
  } finally {
    t.done()
  }
})

test('a skill with no frontmatter name is refused, named', () => {
  const t = stage()
  try {
    mkdirSync(join(t.root, 'skills/nameless'), { recursive: true })
    writeFileSync(join(t.root, 'skills/nameless/SKILL.md'), '# no frontmatter\n')
    const { status, output } = run(t.root)
    assert.equal(status, 1, output)
    assert.match(output, /no frontmatter name: skills\/nameless\/SKILL\.md/)
  } finally {
    t.done()
  }
})

test('a frontmatter name that is not a bare slug is refused, and nothing is written outside the mirror', () => {
  // The name becomes a folder under `.agents/skills/`, so `../x` would write
  // beside the mirror rather than in it.
  const t = stage()
  try {
    mkdirSync(join(t.root, 'skills/escape'), { recursive: true })
    writeFileSync(
      join(t.root, 'skills/escape/SKILL.md'),
      '---\nname: ../x\ndescription: A staged skill.\n---\n\n# Escape\n',
    )
    const { status, output } = run(t.root)
    assert.equal(status, 1, output)
    assert.match(output, /name is not a slug: skills\/escape\/SKILL\.md/)
    assert.equal(existsSync(join(t.root, '.agents/x')), false)
  } finally {
    t.done()
  }
})

test('an empty folder left under the mirror is an orphan too, in both modes', () => {
  const t = stage()
  try {
    mkdirSync(join(t.root, '.agents/skills/retired'), { recursive: true })
    for (const args of [['--check'], []]) {
      const { status, output } = run(t.root, ...args)
      assert.equal(status, 1, output)
      assert.match(output, /orphan: \.agents\/skills\/retired\//)
    }
  } finally {
    t.done()
  }
})
