#!/usr/bin/env node
/**
 * Copy the figures from their authored home (docs/assets/) into public/cover/,
 * where this repository serves them. Runs at predev and prebuild;
 * public/cover/ is generated and gitignored, so docs/assets/ stays the single
 * source of truth and the two copies cannot drift.
 *
 * NOT FOR THE COVER PAGE ANY MORE. That page imports its figures through
 * `components/cover/packageCoverFigures.ts`, so the bundler carries them into
 * whatever output is being built and a deployment reading the application out
 * of the package gets them by depending on it. A named path could not do
 * that: it is served by whichever tree holds the file, which is this one.
 *
 * What is left is the bundled sample blueprint, whose storyboard frames name
 * these same drawings. Those are DATABASE VALUES — a `cells.frame` is a
 * string in a row, written by the seed and read back by whatever renders the
 * board — so they can only name a served path, and this is the step that
 * serves it. A deployment's own blueprint carries its own frame paths, served
 * out of its own public directory, which is where that responsibility has
 * always sat.
 *
 * Each figure's dark file (`<name>.dark.svg`) travels with it where one
 * exists; see `coverAssetFiles`.
 *
 * Fails loudly, naming every missing source.
 *
 * Usage: node scripts/sync-cover-assets.mjs [srcDir] [destDir]
 * (the optional dirs exist for the test harness; defaults are the real ones)
 */
import { copyFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs'
import { basename, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/** Every SVG served under `/cover/`, by basename. A test holds this list to
 * the figures the package authors, so the seed's frames and the cover's
 * imports cannot come to name different drawings. */
export const COVER_ASSET_MANIFEST = [
  'blueprint-anatomy.svg',
  'cell-anatomy.svg',
  'data-model-hierarchy.svg',
  'four-ways-in.svg',
  'ub-audit.svg',
  'ub-map.svg',
  'ub-slice.svg',
  'ub-whatif.svg',
  'skill-architecture.svg',
  'slice-concept.svg',
  'slicing-model.svg',
  'when-to-use.svg',
  'why-now.svg',
]

/**
 * A figure's dark file: `why-now.svg` → `why-now.dark.svg`. The same drawing
 * in the dark palette, shown by the cover in the dark theme and by GitHub
 * through `<picture>`. Optional per figure; a figure without one shows its
 * light file in both themes.
 */
export function darkVariantName(name) {
  return name.replace(/\.svg$/, '.dark.svg')
}

/**
 * The file a figure's `src` names, as it sits in `docs/assets/`: the last
 * path segment with any query dropped. A dev server appends `?import`, and a
 * build hashes the URL; only the basename is the authored file's.
 */
export function figureFileName(src) {
  return basename(src.split('?')[0])
}

/**
 * Every file the sync copies: each manifest figure, then its dark file where
 * one exists. A dark file with no light figure in the manifest is an error,
 * because nothing would ever show it.
 */
export function coverAssetFiles(srcDir = join(repoRoot, 'docs', 'assets')) {
  const darkOnDisk = readdirSync(srcDir).filter((name) => name.endsWith('.dark.svg'))
  const orphans = darkOnDisk.filter(
    (dark) => !COVER_ASSET_MANIFEST.some((name) => darkVariantName(name) === dark),
  )
  if (orphans.length > 0) {
    throw new Error(
      `sync-cover-assets: dark file(s) with no light figure in the manifest: ${orphans.join(', ')}`,
    )
  }
  const files = []
  for (const name of COVER_ASSET_MANIFEST) {
    files.push(name)
    if (darkOnDisk.includes(darkVariantName(name))) files.push(darkVariantName(name))
  }
  return files
}

/** The tree this script runs in: the working directory — never this file's location; `sweep.mjs` says why. */
const repoRoot = process.cwd()

export function syncCoverAssets(
  srcDir = join(repoRoot, 'docs', 'assets'),
  destDir = join(repoRoot, 'public', 'cover'),
) {
  const missing = COVER_ASSET_MANIFEST.filter(
    (name) => !existsSync(join(srcDir, name)),
  )
  if (missing.length > 0) {
    throw new Error(
      `sync-cover-assets: missing source figure(s) in ${srcDir}: ${missing.join(', ')}`,
    )
  }

  const files = coverAssetFiles(srcDir)
  mkdirSync(destDir, { recursive: true })
  for (const name of files) {
    copyFileSync(join(srcDir, name), join(destDir, name))
  }
  return files.length
}

const isMain =
  process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)

if (isMain) {
  try {
    const count = syncCoverAssets(process.argv[2], process.argv[3])
    console.log(`sync-cover-assets: copied ${count} figure files to public/cover/`)
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exit(1)
  }
}
