#!/usr/bin/env node
/**
 * One-way sync of each skill's `SKILL.md` into `.agents/skills/<name>/`, the
 * folder other coding agents — Cursor, Codex, Gemini CLI, Copilot, Windsurf —
 * scan for skills. None of them looks at a top-level `skills/`, and that tree
 * cannot move: its paths are a published interface a deployment imports by
 * fixed path. So `skills/` stays the source and `.agents/skills/` is a copy,
 * held byte-identical here: `--check` exits 1 on drift instead of copying.
 *
 *   node scripts/sync-agent-skills.mjs           # copy skills → mirror
 *   node scripts/sync-agent-skills.mjs --check   # drift guard (exit 1)
 *
 * ONLY `SKILL.md` IS MIRRORED. Skill text resolves every path from the
 * repository or workspace root, so the references, scripts and agents a skill
 * names are found where they already are; copying them would be a second
 * surface to hold in step for nothing.
 *
 * THE FOLDER IS THE FRONTMATTER `name`, not the source directory, because the
 * name is what the discovering agent offers as the command. A skill without
 * one is refused rather than guessed at, and so is a name that is not a bare
 * slug: the name becomes a path, and `../x` would write beside the mirror
 * rather than in it.
 *
 * COPIES, NOT LINKS. The release tarball is refused by the initialiser if it
 * holds any link, so a symlinked mirror would break every new workspace.
 *
 * IT WALKS BOTH WAYS, for the reason the canvas sync gives: a forward walk
 * alone compares every skill with its copy and never asks what else is under
 * the mirror. Anything there that no skill produced is an orphan — named,
 * never deleted, and a failure in both modes. An empty folder counts: it is
 * what a retired skill leaves when only its copy is deleted, and an agent
 * scanning the mirror still finds it.
 *
 * IT NEEDS NO GIT. It reads the tree it is run in — the working directory —
 * by walking it, because a workspace is written from a release tarball and is
 * not a checkout.
 */
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
} from 'node:fs'
import { join, relative, resolve } from 'node:path'

const ROOT = process.cwd()
const SKILLS = resolve(ROOT, 'skills')
const MIRROR = resolve(ROOT, '.agents/skills')

const check = process.argv.includes('--check')

/** A repository-relative path with forward slashes, for messages. */
const label = (path) => relative(ROOT, path).split('\\').join('/')

/** The `name:` in a SKILL.md's leading frontmatter block, or null. */
function frontmatterName(text) {
  const block = /^---\r?\n([\s\S]*?)\r?\n---\r?\n/.exec(text)
  if (!block) return null
  const line = /^name:\s*['"]?([^'"\r\n]+?)['"]?\s*$/m.exec(block[1])
  return line ? line[1] : null
}

/** A skill name that is safe to use as a folder: lowercase, digits, hyphens. */
const SLUG = /^[a-z0-9-]+$/

/**
 * Every file under a directory, absolute, plus every empty directory with a
 * trailing slash; nothing when the directory does not exist.
 */
function entriesUnder(dir) {
  if (!existsSync(dir)) return []
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    if (!entry.isDirectory()) return [path]
    const inside = entriesUnder(path)
    return inside.length > 0 ? inside : [`${path}/`]
  })
}

if (!existsSync(SKILLS)) {
  console.error(`no skills under ${ROOT}: there is nothing to mirror.`)
  process.exit(1)
}

let drift = 0
const written = new Set()
const sources = readdirSync(SKILLS, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => join(SKILLS, entry.name, 'SKILL.md'))
  .filter((path) => existsSync(path))
  .sort()

for (const source of sources) {
  const bytes = readFileSync(source)
  const name = frontmatterName(bytes.toString('utf8'))
  if (!name) {
    console.error(`no frontmatter name: ${label(source)} — the mirror folder is named by it.`)
    drift += 1
    continue
  }
  if (!SLUG.test(name)) {
    console.error(
      `name is not a slug: ${label(source)} — "${name}" would name a folder; ` +
        'use lowercase letters, digits and hyphens.',
    )
    drift += 1
    continue
  }
  const target = join(MIRROR, name, 'SKILL.md')
  if (written.has(target)) {
    console.error(`duplicate name: ${label(source)} — another skill is already named ${name}.`)
    drift += 1
    continue
  }
  written.add(target)

  if (existsSync(target) && readFileSync(target).equals(bytes)) continue
  if (check) {
    console.error(`${existsSync(target) ? 'drift' : 'missing'}: ${label(target)}`)
    drift += 1
  } else {
    mkdirSync(join(MIRROR, name), { recursive: true })
    copyFileSync(source, target)
    console.log(`synced: ${label(target)}`)
  }
}

for (const path of entriesUnder(MIRROR)) {
  if (written.has(path)) continue
  console.error(
    `orphan: ${label(path)}${path.endsWith('/') ? '/' : ''} — no skill produces it, so it is a copy of ` +
      'nothing. Add the skill it belongs to under skills/, or delete it.',
  )
  drift += 1
}

if (drift > 0) process.exit(1)
console.log(check ? 'the mirror matches every skill' : 'done')
