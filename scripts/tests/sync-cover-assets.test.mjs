import {
  cpSync,
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import {
  COVER_ASSET_MANIFEST,
  coverAssetFiles,
  darkVariantName,
  syncCoverAssets,
} from '../sync-cover-assets.mjs'

// Pins the asset pipeline (plan §6 U2): every manifest figure copied from
// docs/assets/ into the destination, and a loud, named failure on a missing
// source — a cover page with a broken figure should never build.

const ASSETS_DIR = fileURLToPath(new URL('../../docs/assets', import.meta.url))

const tempDirs = []
const tempDir = (prefix) => {
  const dir = mkdtempSync(join(tmpdir(), prefix))
  tempDirs.push(dir)
  return dir
}

afterEach(() => {
  while (tempDirs.length > 0) rmSync(tempDirs.pop(), { recursive: true, force: true })
})

describe('sync-cover-assets', () => {
  it('copies all thirteen manifest figures, and each dark file that exists, into the destination', () => {
    const dest = tempDir('cover-dest-')
    const count = syncCoverAssets(ASSETS_DIR, dest)
    const copied = readdirSync(dest).sort()
    expect(copied.filter((name) => !name.endsWith('.dark.svg'))).toEqual(
      [...COVER_ASSET_MANIFEST].sort(),
    )
    expect(copied).toEqual([...coverAssetFiles(ASSETS_DIR)].sort())
    expect(count).toBe(copied.length)
    // The two figures redrawn first carry their dark files.
    expect(copied).toContain('why-now.dark.svg')
    expect(copied).toContain('when-to-use.dark.svg')
  })

  it('names a dark file that has no light figure, and copies nothing', () => {
    const src = tempDir('cover-src-')
    cpSync(ASSETS_DIR, src, { recursive: true })
    writeFileSync(join(src, 'stray.dark.svg'), '<svg/>')

    const dest = tempDir('cover-dest-')
    expect(() => syncCoverAssets(src, dest)).toThrowError(/stray\.dark\.svg/)
    expect(readdirSync(dest)).toEqual([])
  })

  it('fails naming the missing source, and copies nothing', () => {
    const src = tempDir('cover-src-')
    cpSync(ASSETS_DIR, src, { recursive: true })
    unlinkSync(join(src, 'slicing-model.svg'))

    const dest = tempDir('cover-dest-')
    expect(() => syncCoverAssets(src, dest)).toThrowError(/slicing-model\.svg/)
    expect(readdirSync(dest)).toEqual([])
  })
})

describe('sync-cover-assets manifest scope', () => {
  it('carries every figure the cover page now references, the late three included', () => {
    for (const landed of [
      'when-to-use.svg',
      'slice-concept.svg',
      'slicing-model.svg',
    ]) {
      expect(COVER_ASSET_MANIFEST).toContain(landed)
    }
    const dest = tempDir('cover-dest-')
    expect(() => syncCoverAssets(ASSETS_DIR, dest)).not.toThrow()
  })
})

/** Everything in a figure except its `<style>` block, which holds the palette. */
const withoutPalette = (code) => code.replace(/<style>[\s\S]*?<\/style>/, '<style/>')

describe('dark files', () => {
  const pairs = COVER_ASSET_MANIFEST.filter((name) =>
    existsSync(join(ASSETS_DIR, darkVariantName(name))),
  )

  it('exist for the figures redrawn so far', () => {
    expect(pairs).toEqual(expect.arrayContaining(['when-to-use.svg', 'why-now.svg']))
  })

  it('differ from their light file only in the palette', () => {
    // The dark file is the light file with its `<style>` block swapped, so a
    // change to the drawing is made in both or this fails.
    for (const name of pairs) {
      const light = readFileSync(join(ASSETS_DIR, name), 'utf8')
      const dark = readFileSync(join(ASSETS_DIR, darkVariantName(name)), 'utf8')
      expect(withoutPalette(dark), name).toBe(withoutPalette(light))
      expect(dark, name).not.toBe(light)
    }
  })

  it('are offered to GitHub wherever the README or the guide shows the light file', () => {
    // An `<img>` there cannot see GitHub's theme; a `<picture>` with a
    // `prefers-color-scheme: dark` source can.
    const REPO = fileURLToPath(new URL('../..', import.meta.url))
    const guide = join(REPO, 'docs', 'guide')
    const docs = [
      join(REPO, 'README.md'),
      ...readdirSync(guide)
        .filter((name) => name.endsWith('.md'))
        .map((name) => join(guide, name)),
    ]
    let embeds = 0
    for (const doc of docs) {
      const text = readFileSync(doc, 'utf8')
      for (const name of pairs) {
        if (!text.includes(`assets/${name}`)) continue
        embeds += 1
        const source = new RegExp(
          `<source media="\\(prefers-color-scheme: dark\\)" srcset="[^"]*assets/${darkVariantName(name).replace(/\./g, '\\.')}"`,
        )
        expect(text, `${doc} shows ${name}`).toMatch(source)
        expect(text, `${doc} shows ${name} as a markdown image`).not.toMatch(
          new RegExp(`!\\[[^\\]]*\\]\\([^)]*assets/${name.replace(/\./g, '\\.')}\\)`),
        )
      }
    }
    expect(embeds).toBeGreaterThan(0)
  })
})
