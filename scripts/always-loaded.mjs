/**
 * The always-loaded tier: what a session is handed before it decides anything.
 *
 * One list, shared by the three checks that hold the router's shape — the char
 * budget (`check-router-budget.mjs`), the negation ratchet
 * (`check-negation-ratchet.mjs`) and the pointer sweep (`check-pointers.mjs`).
 * Two lists would drift the way two vocabularies do: a file added to one and
 * not the others is a file half the guards read. Same reason the `docs` subject
 * of `sweep.mjs` holds the swept set once.
 *
 * ONE MODULE, READ FROM TWO SIDES. The template and every deployment built
 * from it hold this file byte-identical, so everything below is written to be
 * true in whichever repository is running it — and where the two differ, it
 * says which side it means rather than saying "here".
 *
 * WHAT COUNTS AS ALWAYS-LOADED. A file is in this tier when the harness hands
 * it to the session without the session choosing. On both sides the one
 * whole file in it is `AGENTS.md`: neither repository tracks a `CLAUDE.md` or
 * a `.claude/` bundle at its root, and no prompt assembler builds one.
 *
 * DESCRIPTIONS ARE IN, as a second census. A plugin host that loads skills
 * and agents — Claude Code is one — puts every skill's and every agent's
 * frontmatter `description` in front of the session on every turn, so that
 * the session can decide to reach for one. The body loads when the pointer
 * fires; the description is the pointer, and it is paid for whether or not it
 * fires. So the `description` field of each `skills/<skill>/SKILL.md` and each
 * `agents/<agent>.md` is counted, and nothing else in those files. It is a
 * separate census from the router's because it has its own budget: the two
 * shrink for different reasons, and one number over both would let a cut in
 * one hide growth in the other. A repository holding no skills or agents of
 * its own counts none, and holds that census at zero.
 *
 * A plugin manifest is the near miss, and it is OUT on purpose. The plugin
 * host reads it at install time, to learn the plugin's name, version and
 * where its skills live; nothing puts its bytes in front of a session. So a
 * manifest is a fact about installation, and the tier is a fact about
 * context.
 *
 * WHAT ELSE IS DELIBERATELY OUT, and why each is a Tier-2 read rather than an
 * omission:
 *
 *   - `GLOSSARY.md`, `INDEX.md` and `SETUP.md` are named by the router's first
 *     section, which makes them the first three pointers to fire, not part of
 *     the tier. A session that touches no vocabulary and knows where it is
 *     going pays for none of them. They are also large — a glossary alone
 *     runs to several times the router — so counting them would make a
 *     budget on the router meaningless.
 *   - a `README.md`, and any contributor or security policy beside it,
 *     addresses a human arriving at the repository.
 *   - a skill's own `SKILL.md` below its frontmatter, an agent's prompt, and
 *     the reference documents either reads, load when the description fires,
 *     which is the whole point of the description.
 *   - a hook — the secret guard is one — runs. It is executed, never read
 *     into context.
 *
 * The tier is a list rather than a walk because membership is a fact about the
 * harness — which file the tool loads unbidden — and no directory encodes it.
 * Adding a file here is a deliberate act that moves three checks at once, in
 * every repository holding this module, which is the intended cost of growing
 * a tier that every session pays for.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'

/** Repo-relative paths, in load order. */
export const ALWAYS_LOADED = ['AGENTS.md']

/** What the reports say they counted, so a number is never printed bare. */
export const TIER_NOUN = 'always-loaded tier'

/** The files whose frontmatter description is always loaded: one per skill, one per agent. */
export const DESCRIBED = /^(?:skills\/[^/]+\/SKILL|agents\/[^/]+)\.md$/

/**
 * Every file matching `DESCRIBED` under `root`, repo-relative and sorted.
 *
 * Found by looking where a plugin host looks — `skills/<skill>/SKILL.md` and
 * `agents/<agent>.md` — rather than through the prose sweep's folder list,
 * because the two answer different questions: the sweep reads the folders a
 * repository names as prose, and the host loads whatever skills and agents
 * the repository holds. A folder that is not there — or a file where the
 * folder would be — holds none, which is a fact about the tree and nothing to
 * announce. A dot-entry is skipped, as every sweep skips one.
 */
function describedFiles(root) {
  const entriesOfFolder = (dir) => {
    const at = join(root, dir)
    if (!statSync(at, { throwIfNoEntry: false })?.isDirectory()) return []
    return readdirSync(at)
      .filter((name) => !name.startsWith('.'))
      .map((name) => `${dir}/${name}`)
  }
  return [
    ...entriesOfFolder('agents'),
    ...entriesOfFolder('skills').map((dir) => `${dir}/SKILL.md`),
  ]
    .filter((rel) => DESCRIBED.test(rel) && statSync(join(root, rel), { throwIfNoEntry: false })?.isFile())
    .sort()
}

/** What the description census is called wherever it is printed. */
export const DESCRIPTIONS_NOUN = 'skill and agent descriptions'

/**
 * A document's frontmatter `description`, or null when it carries none.
 *
 * The value as the host hands it over. A plain value is one line plus any
 * indented continuation lines, folded onto it with a single space. A YAML
 * block scalar reads the same way: `>` folds its lines with a space, `|`
 * keeps each line break, and a chomping indicator after either (`>-`, `|+`)
 * changes only trailing newlines, which a description never carries.
 */
export function descriptionOf(text) {
  const front = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text)
  if (!front) return null
  const lines = front[1].split(/\r?\n/)
  const at = lines.findIndex((line) => /^description:/.test(line))
  if (at === -1) return null
  const head = lines[at].replace(/^description:\s*/, '')
  const block = /^([>|])[-+]?$/.exec(head)
  const parts = block ? [] : [head]
  for (const line of lines.slice(at + 1)) {
    if (!/^\s+\S/.test(line)) break
    parts.push(line.trim())
  }
  return parts.join(block?.[1] === '|' ? '\n' : ' ').trim()
}

/**
 * Every always-loaded description in the repository at `root`: `{ file, text }`,
 * sorted by path. A repository holding no skills or agents has none.
 */
export function descriptionsIn(root = process.cwd()) {
  const base = resolve(root)
  return describedFiles(base)
    .map((rel) => ({ file: rel, text: descriptionOf(readFileSync(join(base, rel), 'utf8')) }))
    .filter((one) => one.text !== null)
}
