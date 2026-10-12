#!/usr/bin/env node
/**
 * Rewrite the vendored shadcn stylesheet from the installed package.
 *
 *   npm run vendor:shadcn-css
 *
 * The other half of `scripts/check-vendored-css.mjs`, whose header says why
 * the file is a copy. Run it after bumping `shadcn`; the check fails until
 * someone does.
 */
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { VENDORED, installedUpstream, vendor } from './check-vendored-css.mjs'

const upstream = installedUpstream()
if (!upstream) {
  console.error('shadcn/tailwind.css does not resolve here: install the devDependencies first.')
  process.exitCode = 1
} else {
  writeFileSync(join(process.cwd(), VENDORED), vendor(upstream.text, upstream.version))
  console.log(`${VENDORED} rewritten from shadcn@${upstream.version}.`)
}
