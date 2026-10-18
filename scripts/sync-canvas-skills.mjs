#!/usr/bin/env node
/**
 * One-way sync of the canvas agent's rulebook from THIS repo's canonical
 * skills/ + references/ trees into the app's vendored copy, with a drift
 * check for CI: `--check` exits 1 when the vendored bytes differ from the
 * source instead of copying.
 *
 * The repo IS the canonical source, so the sync is purely internal — one
 * repo, one copy discipline. The app bundles the vendored copy via ?raw
 * imports and serves it through the read_reference tool; the vendored dir
 * stays flat because read_reference serves files by bare name.
 *
 *   node scripts/sync-canvas-skills.mjs           # copy source → vendored
 *   node scripts/sync-canvas-skills.mjs --check   # CI drift guard (exit 1)
 *
 * IT WALKS BOTH WAYS. The lists below name every source and where its copy
 * goes, and for a long time that was the whole comparison — source to target,
 * never target to source. A file sitting in the vendored tree with no entry
 * here was compared against nothing and reported as a match.
 *
 * That is not a tidiness problem, because two other guards are fenced ON this
 * claim: `check-standalone.mjs` and `check-content-coupling.mjs` both exclude
 * the vendored tree by name, each on the stated ground that this check holds
 * it identical to a source they already read. So the one tree both prose
 * sweeps are told to skip was the one tree nothing looked at, and a file
 * carrying a deployment's name, its cast or its cell ids could sit there
 * behind three green checks. The reverse walk below is what makes the
 * exclusion those two rely on true.
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs'
import { relative, resolve } from 'node:path'
import { sweep } from './sweep.mjs'

/** The tree this script runs in: the working directory — never this file's location; `sweep.mjs` says why. */
const ROOT = process.cwd()
const VENDORED = resolve(ROOT, 'src/lib/agent/skill/references')
const VENDORED_SKILLS = resolve(ROOT, 'src/lib/agent/skill/skills')

// Repo-relative source path per vendored reference. Shared core lives at
// references/; each skill's own materials under skills/<name>/references/.
// The IDE-only references (ingest/translate/review-import playbooks,
// adapter-contract, schemas) are deliberately NOT vendored — the canvas
// adapter translates their binding rules.
const FILES = [
  'references/canvas-adapter.md',
  'references/lane-roles.md',
  'references/lane-vocabulary.md',
  'references/data-model.md',
  'references/audit-playbook.md',
  'skills/map/references/elicitation-protocol.md',
  'skills/map/references/cocreate-playbook.md',
  'skills/whatif/references/whatif-playbook.md',
  'skills/audit/references/check-gap-sweep.md',
  'skills/audit/references/check-jargon-lint.md',
  'skills/audit/references/check-channel-conflict.md',
  'skills/audit/references/check-kpi-alignment.md',
  'skills/audit/references/check-perceived-owner.md',
  'skills/audit/references/check-value-ledger.md',
  'skills/audit/references/check-fee-visibility.md',
  'skills/audit/references/check-obsolete-source.md',
  'skills/slice/references/slice-playbook.md',
  'skills/slice/references/slice-templates.md',
  'skills/init/references/uno.md',
]

// The four-skill architecture: the same SKILL.md files IDE humans get from
// the plugin, vendored for the composer's /slash triggers.
const SKILLS = [
  ['map/SKILL.md', 'map.md'],
  ['slice/SKILL.md', 'slice.md'],
  ['audit/SKILL.md', 'audit.md'],
  ['whatif/SKILL.md', 'whatif.md'],
]

const check = process.argv.includes('--check')

/*
 * THIS TREE'S OWN `src`, OR NOTHING AT ALL.
 *
 * Both sides of this sync are THIS repository's: the canonical trees are here
 * and the vendored copy is in the application this repository keeps. A tree
 * with no `src` of its own is not a tree with an empty vendored copy — it is a
 * deployment reading the application out of the package, where the copy is the
 * package's and already correct.
 *
 * It has to refuse BEFORE the two `mkdirSync` calls below, and that is the
 * whole reason this is here rather than in a message. Those calls CREATE
 * `src/lib/agent/skill/` wherever they are run, so a deployment that ran this
 * would be left with a `src` holding two empty directories — and the first
 * root that exists wins, so from that moment the build's `@/…` alias, both
 * tsconfigs and every walk resolve into it and the application is gone. A
 * refusal costs a deployment one clear line; the sync costs it the build.
 */
if (!existsSync(resolve(ROOT, 'src'))) {
  console.error(
    `no src under ${ROOT}: this sync is between this repository's own trees ` +
      'and the application it keeps, and this tree keeps none. A deployment ' +
      'reads the vendored copy out of the package, where it is already in ' +
      'step with the sources beside it.',
  )
  process.exit(1)
}

mkdirSync(VENDORED, { recursive: true })
mkdirSync(VENDORED_SKILLS, { recursive: true })

let drift = 0
const pairs = [
  ...FILES.map((file) => [
    resolve(ROOT, file),
    resolve(VENDORED, file.split('/').pop()),
    file,
  ]),
  ...SKILLS.map(([from, to]) => [
    resolve(ROOT, 'skills', from),
    resolve(VENDORED_SKILLS, to),
    `skills/${from}`,
  ]),
]
for (const [source, target, label] of pairs) {
  if (!existsSync(source)) {
    console.error(`missing source: ${label}`)
    drift += 1
    continue
  }
  const same =
    existsSync(target) &&
    readFileSync(source, 'utf8') === readFileSync(target, 'utf8')
  if (same) continue
  if (check) {
    console.error(`drift: ${label}`)
    drift += 1
  } else {
    copyFileSync(source, target)
    console.log(`synced: ${label}`)
  }
}

/**
 * Every file under a vendored directory, absolute. The vendored copy is
 * application source, so the `app` sweep lists it — narrowed to the directory
 * and with the empty result allowed through, because a vendored directory
 * that holds nothing yet is exactly the state before the first sync.
 */
function filesUnder(dir) {
  const under = `${relative(ROOT, dir).split('\\').join('/')}/`
  const app = sweep({ subject: 'app', root: ROOT })
  return app.files.filter((path) => path.startsWith(under)).map((path) => app.locate(path))
}

// The walk back. Every file under the two vendored directories has to be
// something a pair above wrote; anything else is a copy of nothing, and the
// two prose sweeps that skip this tree are skipping it on a false claim.
const written = new Set(pairs.map(([, target]) => target))
const orphans = [...filesUnder(VENDORED), ...filesUnder(VENDORED_SKILLS)]
  .filter((path) => !written.has(path))
  .map((path) => relative(ROOT, path).split('\\').join('/'))
for (const orphan of orphans) {
  console.error(
    `orphan: ${orphan} — nothing in this script copies it, so it is held ` +
      'identical to no source. Add the source it belongs to, or delete it.',
  )
  drift += 1
}

if (drift > 0) process.exit(1)
console.log(check ? 'vendored copy matches the source trees' : 'done')
