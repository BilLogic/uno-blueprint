#!/usr/bin/env node
/**
 * The command, with one thing swapped: the template comes from this checkout
 * instead of from a release.
 *
 * `create-uno-blueprint` downloads the tarball for the tag that is its own
 * version, and that tag does not exist until the release is cut. So the
 * question a pull request has to answer — does the workspace THIS tree would
 * write install and build — cannot be asked of the command as published. This
 * asks it: `git archive` makes the tarball GitHub would serve for the commit
 * that is checked out, wrapped in the same top-level folder, and `run` is
 * handed it where the download would have been. Everything after that is the
 * shipped path: the same unpacking, the same install by the calling package
 * manager, the same next steps.
 *
 * It is not part of the package. `files` in the manifest beside it lists what
 * is published, and this folder is not in it, so the command's interface is
 * what it was. CI runs it once per package manager; it is as useful by hand.
 *
 * WHAT IS ARCHIVED IS THE COMMIT, not the files on disk: an edit that is not
 * committed is not in the workspace. That is what a release tarball is too.
 *
 * WHICH PACKAGE MANAGER installs is read where the command reads it, from
 * `npm_config_user_agent`. Run through one (`pnpm exec`, `bun run`) that is
 * already set; run by `node` directly, set it to choose, or leave it for npm.
 *
 * Usage, from anywhere inside the checkout:
 *
 *   node packages/create-uno-blueprint/scripts/from-working-tree.mjs [directory] [--no-install]
 *   npm_config_user_agent=pnpm node packages/create-uno-blueprint/scripts/from-working-tree.mjs ../try-it
 */
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { runInProcess } from '../src/run.mjs'

const VERSION = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version

/** The checkout this file is in, whatever folder the command was run from. */
const CHECKOUT = fileURLToPath(new URL('../../..', import.meta.url))

/** The tarball a release of this commit would be: gzipped, under one folder named for the version. */
function archiveOfHead() {
  return execFileSync(
    'git',
    ['archive', '--format=tar.gz', `--prefix=uno-blueprint-${VERSION}/`, 'HEAD'],
    // The template is a few megabytes gzipped; the default buffer is one.
    { cwd: CHECKOUT, maxBuffer: 256 * 1024 * 1024 },
  )
}

// The bin's own call, with the download answered from the checkout.
process.exitCode = await runInProcess({ fetchTarball: async () => archiveOfHead() })
