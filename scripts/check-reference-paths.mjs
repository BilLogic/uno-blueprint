#!/usr/bin/env node
/**
 * Every path a deployment imports from this repo still exists here.
 *
 * The deployment this template was generalised from installs it as a git-URL
 * dependency pinned to a tag, and imports twenty-two of its documents BY
 * FIXED PATH, at build time, through Vite's `?raw`:
 *
 *   import laneRoles from '<this package>/references/lane-roles.md?raw'
 *
 * Those paths are a published interface — see
 * docs/adr/0004-reference-paths-are-a-published-interface.md. Moving one is a
 * version bump plus a matching import change over there, never a silent move.
 * Nothing on this side noticed until this check: `check:manifest` diffs
 * `identifiers.json`, so a reviewer CAN see a rename, but a diff is a
 * question, not a failure; `check:doc-paths` holds this repo's own documents
 * to paths inside this tree, the same assertion pointed the other way.
 * Neither knows which of these files somebody else opens by name. A move
 * landed green here and was discovered at the consumer's build, which is
 * late — and the predecessor of the package pin, a file-sync between the two
 * repos, was deleted for exactly this class of failure: it inverted, and
 * reverted a rename across eighteen files.
 *
 *   node scripts/check-reference-paths.mjs
 *
 * A path has to be BOTH in the commit and present on disk. The listing alone is
 * the commit, which still holds the old name after a bare `mv`; present alone is
 * a file a git-URL install would never ship, because the consumer installs a git
 * tree, not a working directory.
 *
 * THE SUBJECT IS THE PUBLISHED INTERFACE — the `commit` subject of `sweep.mjs`,
 * narrowed to the roots this interface lives under.
 * That module holds the listing and the reason it is what a commit would carry
 * rather than the index alone (#180, #181, in its header): a reference file
 * written and checked before `git add` is one the next commit ships, and reading
 * the index alone would have failed it here. What a git install would NOT ship
 * is what this check still refuses — a path the listing does not name at all.
 *
 * Renaming one of these is not forbidden — it is a release. Move the file,
 * update this list, bump the version, and land the matching import change in
 * the consumer before the tag it pins moves. Deleting a line here because the
 * check went red, without that consumer change, converts a break in this
 * repo now into a break in the consumer at its next upgrade.
 */

import { sweep } from './sweep.mjs'
import { whenRun } from './verdict.mjs'


/**
 * The paths the deployment imports from this repo, verbatim, minus the
 * package-name prefix its specifiers carry. Eighteen references, the four
 * `SKILL.md` bodies, and the two files of the browser render walk — which a
 * deployment RUNS by path rather than importing, with the same consequence
 * for a move.
 *
 * Where the list comes from — re-derive it in a checkout of the deployment,
 * substituting this package's name:
 *
 *   grep -rhoE "<this package>/(references|skills)/[A-Za-z0-9._/-]+" \
 *     . --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=docs \
 *     | sed 's/?raw//' | sort -u
 *
 * Its agent's read tool names most of them, and its skill loader the four
 * skills, which it reads out of `node_modules/`. A change on the consumer's side — a new import, or one it
 * stops making — must update this list in the same pull request: a list that
 * has drifted from the consumer's imports guards paths nobody reads and
 * misses the ones they do.
 */
export const CONSUMER_IMPORTS = [
  // Read by the canvas agent's `get_reference` tool.
  'references/audit-playbook.md',
  'references/canvas-adapter.md',
  'references/data-model.md',
  'references/lane-roles.md',
  'references/lane-vocabulary.md',

  // The four skill bodies the deployment's agent loads as its procedures.
  'skills/audit/SKILL.md',
  'skills/map/SKILL.md',
  'skills/slice/SKILL.md',
  'skills/whatif/SKILL.md',

  // The audit roster: one document per check, each opened by name.
  'skills/audit/references/check-channel-conflict.md',
  'skills/audit/references/check-fee-visibility.md',
  'skills/audit/references/check-gap-sweep.md',
  'skills/audit/references/check-jargon-lint.md',
  'skills/audit/references/check-kpi-alignment.md',
  'skills/audit/references/check-obsolete-source.md',
  'skills/audit/references/check-perceived-owner.md',
  'skills/audit/references/check-value-ledger.md',

  // The playbooks the three other skills reach for.
  'skills/map/references/cocreate-playbook.md',
  'skills/map/references/elicitation-protocol.md',
  'skills/slice/references/slice-playbook.md',
  'skills/slice/references/slice-templates.md',
  'skills/whatif/references/whatif-playbook.md',

  // The browser render walk. Not imported — RUN, by path: a deployment enrols
  // by running this runner out of its own `node_modules` and walking its own
  // sample board with the config and the specs that travel beside it
  // (`render-walk/README.md`). The runner is the path a deployment NAMES, and
  // the other files are the config and specs it stages and hands to Playwright,
  // so all of them are the interface. Same promise as the documents above, and the same
  // failure without it: a move lands green here and surfaces at the
  // deployment's next pin as a command that is not there, or a run that
  // collects no tests.
  'render-walk/run.mjs',
  'render-walk/playwright.config.ts',
  'render-walk/sample-board.spec.ts',
  'render-walk/annotation-drag.spec.ts',
  'render-walk/mobile-cover.spec.ts',
  'render-walk/mobile-agent-jump.spec.ts',
  'render-walk/served-from-a-path.spec.ts',
  // The route every spec takes its `test` from, and the case that watches it.
  'render-walk/remote-images.ts',
  'render-walk/remote-images.spec.ts',

  // The composition documents. Not imported either — READ, out of this
  // package's installed tree, by the deployment's own copy of
  // `check-harness-claims.mjs`: they are what claims the files this package
  // ships, so a deployment holds no claim for a module it does not own. The
  // folder is a published path for exactly that reason, and a document that
  // moves or vanishes without a deployment's config moving with it turns that
  // check red one pin later, over a surface nobody touched.
  //
  // They reach a deployment because `package.json` states no `files` allowlist
  // and an install therefore carries the whole tree. Adding one later without
  // these paths in it would leave every consumer's claims check reading a
  // folder that is not there — a break with no local signal, which is the
  // reason this is written beside the list rather than left to be rediscovered.
  'docs/guidelines/composition/agent-session.md',
  'docs/guidelines/composition/canvas.md',
  'docs/guidelines/composition/compare.md',
  'docs/guidelines/composition/cover-page.md',
  'docs/guidelines/composition/dialogs-sheets-and-forms.md',
  'docs/guidelines/composition/entity-panels.md',
  'docs/guidelines/composition/mobile-shell.md',
  'docs/guidelines/composition/overview.md',
  'docs/guidelines/composition/sidebar.md',
  'docs/guidelines/composition/slice-view.md',
]

/**
 * The roots this interface covers. A path outside them is a mistake.
 *
 * `render-walk/` is the third because a deployment reaches it by published
 * path exactly as it reaches a reference or a skill body — the difference is
 * that Playwright opens it rather than Vite, which changes nothing about what
 * moving it costs.
 *
 * The composition folder is the fourth, and is the one root under `docs/`. It
 * is here for the same reason and not for its own: a deployment's claims check
 * reads these documents out of the installed package to learn what the package
 * already claims, so the folder is an address somebody else resolves. The rest
 * of `docs/` is prose this package writes for its own readers, and stays out.
 */
const INTERFACE_ROOTS = [
  'references/',
  'skills/',
  'render-walk/',
  'docs/guidelines/composition/',
]

/** The roots as the refusal says them, so the sentence cannot drift off the list. */
const ROOTS_PHRASE = `${INTERFACE_ROOTS.slice(0, -1).join(', ')} or ${INTERFACE_ROOTS.at(-1)}`

/**
 * The interface as the commit carries it: the sweep over the interface roots,
 * whose `files` answer "is this path in the commit" and whose `read`
 * answers "is the file there" — null for a path the tree does not have.
 */
export function interfaceSweep(root = process.cwd()) {
  return sweep({
    subject: 'commit',
    root,
    where: (path) => INTERFACE_ROOTS.some((interfaceRoot) => path.startsWith(interfaceRoot)),
    what: `file under ${ROOTS_PHRASE} that a commit would carry`,
  })
}

/**
 * The imported paths that are not there, each with what is wrong with it.
 *
 * A PURE JUDGEMENT over handed-in sets: `tracked` is the Set of paths the
 * commit carries and `onDisk` answers whether a repo-relative path is there.
 * Neither is looked up here, so the rule can be driven from a fixture — which
 * is how the three shapes below are held apart without a repository in each.
 */
export function absences(paths, tracked, onDisk) {
  const out = []
  for (const path of paths) {
    if (!INTERFACE_ROOTS.some((root) => path.startsWith(root))) {
      out.push({ path, reason: `not under ${ROOTS_PHRASE}` })
      continue
    }
    if (!onDisk(path)) {
      out.push({ path, reason: 'no file at this path' })
      continue
    }
    if (!tracked.has(path)) {
      out.push({ path, reason: 'untracked — a git install would not ship it' })
    }
  }
  return out
}

/**
 * The verdict: every path the deployment imports by fixed name, resolved.
 *
 * Pure — it sweeps, decides, and hands back what it found. Nothing here prints
 * or exits.
 */
export function judge() {
  const walk = interfaceSweep()
  const missing = absences(
    CONSUMER_IMPORTS,
    new Set(walk.files),
    (path) => walk.read(path) !== null,
  )

  return {
    what: 'a path the deployment imports by fixed name',
    count: CONSUMER_IMPORTS.length,
    opening:
      missing.length > 0
        ? `${missing.length} path${missing.length === 1 ? '' : 's'} the deployment imports by fixed name that this tree no longer has:\n`
        : undefined,
    findings: missing.map(({ path, reason }) => `  ${path} — ${reason}`),
    closing:
      '\nThese paths are a published interface:' +
      '\ndocs/adr/0004-reference-paths-are-a-published-interface.md.' +
      '\nEither put the file back at the path the consumer imports, or make the move a' +
      '\nrelease — update CONSUMER_IMPORTS in scripts/check-reference-paths.mjs, bump the' +
      '\nversion, and land the matching import change in the consumer before the tag it' +
      '\npins moves.' +
      '\n\n  npm run check:reference-paths\n',
    line: `check-reference-paths: all ${CONSUMER_IMPORTS.length} paths the deployment imports still exist.`,
  }
}

whenRun(import.meta.url, judge)
