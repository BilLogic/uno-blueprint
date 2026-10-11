/**
 * The three checks that keep `AGENTS.md` a router, each proven by a router that
 * breaks it.
 *
 * A guard seen only passing is not evidence: the committed router passes today,
 * and it would pass just as quietly if the check had stopped looking. So every
 * rule here is driven from a subject that violates it — a padded tier, an added
 * prohibition, a dead pointer, a buried trigger, an item that names nothing —
 * and the committed router is asserted last, as one case among several rather
 * than as the whole suite.
 *
 * The pointer sweep is exercised against throwaway repositories, because its
 * rules are about a document's structure and a temporary tree can hold a broken
 * one without the repository having to. The budget and the ratchet are
 * exercised through their pure `verdict` functions, so a failing branch can be
 * asserted without a prohibition or a padded file ever being written into the
 * real router.
 *
 * One suite in every repository that holds it, byte-identical. Two of its
 * cases — a Python pointer is swept, and the exempt section is § Rules that
 * hold for every skill — build their own router in a throwaway tree, so both
 * hold wherever the suite runs.
 *
 * THE FIXTURE PATHS SIT UNDER `notes/`, AND NOT UNDER EITHER REPOSITORY'S
 * DOCUMENTATION TREE, DELIBERATELY. They are files this suite CREATES in a
 * throwaway directory and deletes again — the folder name is arbitrary, and
 * nothing here is a reference to any repository's documents. A fixture is not
 * a citation. But this file is read from two repositories at once, and the
 * gate that decides whether a deployment may hold it is line-based over
 * bytes; it has to be, because it reads a foreign repository's file with no
 * parser for the language. It cannot see that the file is written two
 * characters later, and neither can a person skimming. So the fixtures are
 * spelled so they cannot be read as an address in either tree, which costs
 * nothing and saves the reader the same second it saves the scan.
 */
import { test } from 'vitest'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'

import {
  BUDGET,
  SLACK,
  DESCRIPTIONS_BUDGET,
  DESCRIPTIONS_SLACK,
  measure as measureChars,
  measureDescriptions,
  verdict as budgetVerdict,
} from '../check-router-budget.mjs'
import {
  RECORDED,
  countProhibitions,
  measure as measureBans,
  verdict as negationVerdict,
} from '../check-negation-ratchet.mjs'
import {
  EXEMPT_SECTION,
  SUBJECTS,
  itemsIn,
  leadingWord,
  pointersIn,
  sweep as sweepRouters,
} from '../check-pointers.mjs'
import { repoConfig } from '../repo-config.mjs'

const ROOT = resolve(new URL('../..', import.meta.url).pathname)

/**
 * A sink that keeps a fixture's announcements out of this run's annotations.
 *
 * Each throwaway repository below is a router and the two or three files the
 * case needs, so the prose sweep that hands the check its bytes has swept
 * folders it cannot see and something true to say about them. An annotation
 * raised by a fixture is one a reader has to learn to ignore.
 */
const QUIET = { env: {}, write: () => {}, append: () => {} }

/** The pointer sweep, quietly. */
const sweep = (root, subjects = SUBJECTS) => sweepRouters(root, subjects, QUIET)

function run(script) {
  const result = spawnSync(process.execPath, [join(ROOT, 'scripts', script)], {
    cwd: ROOT,
    encoding: 'utf8',
  })
  return { code: result.status, out: `${result.stdout}${result.stderr}` }
}

/** A throwaway repo: a router plus whatever files the test says exist. */
function repo(router, files = {}) {
  const root = mkdtempSync(join(tmpdir(), 'router-'))
  for (const [rel, body] of Object.entries(files)) {
    mkdirSync(dirname(join(root, rel)), { recursive: true })
    writeFileSync(join(root, rel), body)
  }
  writeFileSync(join(root, 'AGENTS.md'), router)
  return { root, done: () => rmSync(root, { recursive: true, force: true }) }
}

/* ------------------------------------------------------------- the budget */

test('the committed always-loaded tier is under its budget', () => {
  const { code, out } = run('check-router-budget.mjs')
  assert.equal(code, 0, out)
})

test('a tier over budget fails, and the failure says by how much', () => {
  const { failures } = budgetVerdict({
    counted: [{ file: 'AGENTS.md', chars: BUDGET + 42 }],
    total: BUDGET + 42,
  })
  assert.equal(failures.length, 1)
  assert.match(failures[0], /over budget/)
  assert.match(failures[0], /42 over/)
})

test('a tier far under budget fails too, asking for the budget to be lowered', () => {
  const total = BUDGET - SLACK - 1
  const { failures } = budgetVerdict({ counted: [{ file: 'AGENTS.md', chars: total }], total })
  assert.equal(failures.length, 1, 'a budget that no longer describes the file is a stale budget')
  assert.match(failures[0], /lower router\.budget in scripts\/repo-config\.mjs/)
})

test('the pass line names every file it counted', () => {
  const { line } = budgetVerdict(measureChars())
  assert.match(line, /AGENTS\.md/)
  assert.match(line, /to spare/)
})

/* ------------------------------------------------------ the descriptions */

/**
 * A throwaway repository holding one skill and one agent, each with a body the
 * description census has to leave alone. Every swept folder is present, so the
 * prose sweep has nothing to announce.
 */
function described({ skill, agent }) {
  const swept = Object.fromEntries(repoConfig.sweptDirs.map((dir) => [`${dir}/keep.md`, '']))
  return repo('# Router\n', {
    ...swept,
    'skills/pick/SKILL.md': `---\nname: pick\ndescription: ${skill}\n---\n\nNever read past this line.\n`,
    'skills/pick/references/notes.md': '---\ndescription: Never counted, a reference.\n---\n',
    'agents/runner.md': `---\nname: runner\ndescription: ${agent}\ntools: Read\n---\n\nBody.\n`,
  })
}

test('the description census counts each skill and agent description, and nothing beside it', () => {
  const r = described({ skill: 'Picks one.', agent: 'Runs once, when dispatched.' })
  try {
    const { counted, total } = measureDescriptions(r.root)
    assert.deepEqual(counted, [
      { file: 'agents/runner.md', chars: 27 },
      { file: 'skills/pick/SKILL.md', chars: 10 },
    ])
    assert.equal(total, 37)
  } finally {
    r.done()
  }
})

test('descriptions over their budget fail, and the failure names the descriptions budget', () => {
  const total = DESCRIPTIONS_BUDGET + 7
  const { failures } = budgetVerdict(
    { counted: [{ file: 'skills/map/SKILL.md', chars: total }], total },
    { budget: DESCRIPTIONS_BUDGET, slack: DESCRIPTIONS_SLACK, key: 'descriptions.budget' },
  )
  assert.equal(failures.length, 1)
  assert.match(failures[0], /7 over/)
  assert.match(failures[0], /descriptions\.budget/)
})

test('descriptions far under their budget fail, asking for that budget to be lowered', () => {
  const total = DESCRIPTIONS_BUDGET - DESCRIPTIONS_SLACK - 1
  const { failures } = budgetVerdict(
    { counted: [{ file: 'skills/map/SKILL.md', chars: total }], total },
    { budget: DESCRIPTIONS_BUDGET, slack: DESCRIPTIONS_SLACK, key: 'descriptions.budget' },
  )
  assert.equal(failures.length, 1)
  assert.match(failures[0], /lower descriptions\.budget in scripts\/repo-config\.mjs/)
})

test('the committed descriptions sit inside their budget and its slack', () => {
  const { total } = measureDescriptions()
  assert.ok(total <= DESCRIPTIONS_BUDGET, `${total} over ${DESCRIPTIONS_BUDGET}`)
  assert.ok(DESCRIPTIONS_BUDGET - total <= DESCRIPTIONS_SLACK, `${total} stale against ${DESCRIPTIONS_BUDGET}`)
})

test('the ratchet counts a prohibition in a description, and not one in the body under it', () => {
  const r = described({ skill: 'Picks one; never two.', agent: 'Runs once.' })
  try {
    const { files, counts, total } = measureBans(r.root)
    assert.equal(files, 3, 'the router and two descriptions')
    assert.deepEqual(counts, { 'skills/pick/SKILL.md (description)': 1 })
    assert.equal(total, 1)
  } finally {
    r.done()
  }
})

/* ---------------------------------------------------------- the ratchet */

test('the committed tier scores exactly its recorded prohibition count', () => {
  const { code, out } = run('check-negation-ratchet.mjs')
  assert.equal(code, 0, out)
  assert.equal(measureBans().total, RECORDED.tokens)
})

test('a prohibition added to the tier fails, and the failure names the file', () => {
  const { failures } = negationVerdict({
    files: RECORDED.files,
    counts: { 'AGENTS.md': RECORDED.tokens + 1 },
    total: RECORDED.tokens + 1,
  })
  assert.equal(failures.length, 1)
  assert.match(failures[0], new RegExp(`rose ${RECORDED.tokens} -> ${RECORDED.tokens + 1}`))
  assert.match(failures[0], /AGENTS\.md/)
})

test('a tier that lost a file fails rather than reporting a smaller, greener number', () => {
  const { failures } = negationVerdict({ files: 0, counts: {}, total: 0 })
  assert.equal(failures.length, 1)
  assert.match(failures[0], /shrank/)
})

test('a fall passes, with the new number to record', () => {
  const { failures, line } = negationVerdict(
    { files: RECORDED.files, counts: {}, total: RECORDED.tokens },
    { ...RECORDED, tokens: RECORDED.tokens + 2 },
  )
  assert.deepEqual(failures, [])
  assert.match(
    line,
    new RegExp(`Down 2: lower router\\.prohibitions\\.tokens in scripts/repo-config\\.mjs to ${RECORDED.tokens}\\.`),
  )
})

test('quoted speech and code spans are not prohibitions', () => {
  assert.equal(countProhibitions('Never widen a grant.'), 1)
  assert.equal(countProhibitions('Say "I don\'t know" rather than guessing.'), 0)
  assert.equal(countProhibitions('The column `never_null` is set.'), 0)
})

/* ----------------------------------------------------------- the sweep */

test('a pointer to a file that exists resolves', () => {
  const r = repo('## Routes\n\n- **Vocabulary** — load `notes/a.md` first.\n', { 'notes/a.md': '# A' })
  try {
    assert.deepEqual(sweep(r.root).failures, [])
  } finally {
    r.done()
  }
})

test('a pointer to a missing file fails, and names it', () => {
  const r = repo('## Routes\n\n- **Vocabulary** — load `notes/gone.md` first.\n', { 'notes/here.md': '# H' })
  try {
    const { failures } = sweep(r.root)
    assert.equal(failures.length, 1)
    assert.match(failures[0], /notes\/gone\.md/)
    assert.match(failures[0], /does not resolve/)
  } finally {
    r.done()
  }
})

test('a section pointer checks the heading, case-insensitively', () => {
  const r = repo('## Routes\n\n- **Imports** read `notes/t.md` § Validating an import.\n', {
    'notes/t.md': '# T\n\n## Validating An Import\n',
  })
  try {
    assert.deepEqual(sweep(r.root).failures, [])
  } finally {
    r.done()
  }
})

test('a section pointer to a renamed heading fails', () => {
  const r = repo('## Routes\n\n- **Imports** read `notes/t.md` § Imports.\n', {
    'notes/t.md': '# T\n\n## Exports\n',
  })
  try {
    const { failures } = sweep(r.root)
    assert.equal(failures.length, 1)
    assert.match(failures[0], /§ Imports/)
  } finally {
    r.done()
  }
})

test('a routing item that leads with filler fails, and names the word', () => {
  const router =
    '## Skill routing\n\n| Trigger | Load |\n|---|---|\n| Any task that writes | `notes/a.md` |\n| Writes of any kind | `notes/a.md` |\n'
  const r = repo(router, { 'notes/a.md': '' })
  try {
    const { failures, triggers } = sweep(r.root)
    assert.equal(triggers, 2, 'the header and separator rows are the table frame, not items')
    assert.equal(failures.length, 1)
    assert.match(failures[0], /"Any task that writes" leads with "any"/)
  } finally {
    r.done()
  }
})

test('a routing item carrying no pointer fails — a body in the router', () => {
  const r = repo('## Routes\n\n- Scenario, path, phase, step, cell, lane, dependency, need.\n', {
    'notes/a.md': '',
  })
  try {
    const { failures } = sweep(r.root)
    assert.equal(failures.length, 1)
    assert.match(failures[0], /carries no pointer/)
  } finally {
    r.done()
  }
})

test('a rule that holds for every skill is exempt from the trigger rules, and its pointer still has to resolve', () => {
  const bare = repo(
    `## ${EXEMPT_SECTION}\n\n- Secrets live in a gitignored .env and nowhere else.\n`,
  )
  try {
    assert.deepEqual(sweep(bare.root).failures, [], 'a rule needs no pointer and no trigger word')
  } finally {
    bare.done()
  }
  const dead = repo(
    `## ${EXEMPT_SECTION}\n\n- Secrets: see \`notes/gone.md\` § Secrets.\n`,
    { 'notes/here.md': '' },
  )
  try {
    const { failures } = sweep(dead.root)
    assert.equal(failures.length, 1)
    assert.match(failures[0], /notes\/gone\.md/)
  } finally {
    dead.done()
  }
})

test('a Python pointer is swept — the validator and the secret hook are not prose', () => {
  const live = repo('## Routes\n\n- **Validation** is `notes/validate_ir.py` exit 0.\n', {
    'notes/validate_ir.py': '',
  })
  try {
    assert.deepEqual(sweep(live.root).failures, [])
  } finally {
    live.done()
  }
  const dead = repo('## Routes\n\n- **Validation** is `notes/validate_ir.py` exit 0.\n', {
    'notes/other.py': '',
  })
  try {
    const { failures } = sweep(dead.root)
    assert.equal(failures.length, 1)
    assert.match(failures[0], /validate_ir\.py/)
  } finally {
    dead.done()
  }
})

test('a bare filename names a shape, not a place, and is skipped', () => {
  const r = repo('x', { 'notes/x.md': '' })
  try {
    assert.deepEqual(pointersIn("a skill's own `SKILL.md` is the contract", r.root), [])
  } finally {
    r.done()
  }
})

test('a directory pointer resolves against the directory', () => {
  const r = repo('## Routes\n\n- **Workspaces** carry their own `references/`.\n', {
    'references/customization.md': '',
  })
  try {
    assert.deepEqual(sweep(r.root).failures, [])
  } finally {
    r.done()
  }
})

test('an item keeps its wrapped continuation lines, so a pointer may land on the second line', () => {
  const router = '## Routes\n\n- **Editing** anything under `skills/` means running\n  `notes/sync.mjs` afterwards.\n'
  const r = repo(router, { 'skills/map/SKILL.md': '', 'notes/sync.mjs': '' })
  try {
    const items = itemsIn(router)
    assert.equal(items.length, 1)
    assert.equal(leadingWord(items[0].trigger), 'editing')
    assert.deepEqual(sweep(r.root).failures, [])
  } finally {
    r.done()
  }
})

test('the committed router passes the sweep', () => {
  const { failures } = sweep()
  assert.deepEqual(failures, [], failures.join('\n'))
})
