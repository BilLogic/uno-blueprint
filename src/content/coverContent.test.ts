import { existsSync } from 'node:fs'
import { basename, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { PATTERNS } from '../../scripts/check-standalone.mjs'
import {
  COVER_ASSET_MANIFEST,
  darkVariantName,
} from '../../scripts/sync-cover-assets.mjs'
import {
  coverFigures,
  coverTabSections,
  type CoverFigure,
} from '@/components/cover/coverModel'
import { packageCoverFigures } from '@/components/cover/packageCoverFigures'
import { coverContent } from '@/content/coverContent'

// Pins the template skin's content contract (plan §6 U3): generalized copy
// only, every rendered figure accounted for in the sync manifest and on
// disk, descriptive alt text everywhere, and the defs tables carrying the
// terms their figures actually show.

const ASSETS_DIR = fileURLToPath(new URL('../../docs/assets', import.meta.url))

/** Deployment vocabulary that must never reach the template skin: the names
 * the standalone guard holds for the whole tree, and the deployment's cast. */
const FORBIDDEN = [...PATTERNS.map(({ test }) => test), /\btutors?\b/i]

function allStrings(value: unknown, out: string[] = []): string[] {
  if (typeof value === 'string') out.push(value)
  else if (Array.isArray(value)) for (const v of value) allStrings(v, out)
  else if (value && typeof value === 'object') {
    for (const v of Object.values(value)) allStrings(v, out)
  }
  return out
}

describe('coverContent', () => {
  it('ships the four tabs in order', () => {
    expect(coverContent.tabs.map((tab) => tab.label)).toEqual([
      'Overview',
      'Blueprints',
      'Slices',
      'Skills',
    ])
  })

  it('contains no deployment-specific vocabulary anywhere', () => {
    for (const text of allStrings(coverContent)) {
      for (const pattern of FORBIDDEN) {
        expect(text).not.toMatch(pattern)
      }
    }
  })

  it('every tab has sections, and the page offers exactly one action', () => {
    for (const tab of coverContent.tabs) {
      expect(coverTabSections(tab).length).toBeGreaterThan(0)
    }
    expect(coverContent.primaryCtaLabel).toBe('Open the blueprint')
  })

  it('carries the degraded-state and command-copy strings', () => {
    expect(coverContent.states.noSlices).toContain('/ub:slice')
    expect(coverContent.commandCopy.copiedLabel).toBe('Copied')
    expect(coverContent.commandCopy.copyLabel).toBe('Copy')
  })

  it('every image has non-empty alt text describing what it shows', () => {
    const images = coverFigures(coverContent)
    expect(images.length).toBeGreaterThan(0)
    for (const image of images) {
      expect(image.alt.trim().length).toBeGreaterThan(10)
      // Alt describes the image, not the file.
      expect(image.alt).not.toMatch(/\.(svg|png|jpe?g)/i)
    }
  })

  it('every wide figure carries its viewBox dimensions', () => {
    // Portrait images are fixed-size by CSS (badge/framed), not by their own
    // dimensions, so this is scoped to the `figure` slot, not every image.
    const figures = coverContent.tabs
      .flatMap((tab) => coverTabSections(tab))
      .flatMap((section) => ('figure' in section && section.figure ? [section.figure] : []))
    expect(figures.length).toBeGreaterThan(0)
    for (const figure of figures) {
      expect(figure.width).toBeGreaterThan(0)
      expect(figure.height).toBeGreaterThan(0)
    }
  })

  it('draws every figure from the ones the package brings with it', () => {
    // Not a path this page names — a module it imports. A named path is
    // served by whatever tree holds the file, which is this one and not a
    // deployment's; an import is resolved by the bundler, emitted into
    // whatever output is being built, and fails the build when it is missing
    // instead of falling through to a page of HTML.
    const supplied = new Set(
      Object.values(packageCoverFigures).map((figure) => figure.src),
    )
    for (const image of coverFigures(coverContent)) {
      expect(supplied, `not one of the package's figures: ${image.src}`).toContain(
        image.src,
      )
    }
  })

  it('resolves each of the package’s figures to a file it authored', () => {
    for (const figure of Object.values(packageCoverFigures)) {
      const name = basename(figure.src.split('?')[0])
      expect(existsSync(join(ASSETS_DIR, name)), `missing ${name}`).toBe(true)
    }
  })

  it('pairs each dark file with its own light file, and carries every one drawn', () => {
    const figures = Object.values(packageCoverFigures) as CoverFigure[]
    for (const figure of figures) {
      const light = basename(figure.src.split('?')[0])
      const onDisk = existsSync(join(ASSETS_DIR, darkVariantName(light)))
      if (!figure.srcDark) {
        // A dark file nobody imports would never be shown.
        expect(onDisk, `${light} has a dark file the cover does not use`).toBe(false)
        continue
      }
      expect(basename(figure.srcDark.split('?')[0])).toBe(darkVariantName(light))
      expect(onDisk).toBe(true)
    }
  })

  it('and the sample blueprint’s frames name those same files', () => {
    // The sample's storyboard frames are database values, so they name a
    // served path and cannot be imports; the copy that serves them is what
    // the manifest is for. One home, two consumers, and this is what keeps
    // them naming the same drawings.
    const authored = Object.values(packageCoverFigures)
      .map((figure) => basename(figure.src.split('?')[0]))
      .sort()
    expect(authored).toEqual([...COVER_ASSET_MANIFEST].sort())
    for (const name of COVER_ASSET_MANIFEST) {
      expect(existsSync(join(ASSETS_DIR, name)), `missing ${name}`).toBe(true)
    }
  })

  it('places each figure on the section its drawing belongs to', () => {
    const sections = coverContent.tabs.flatMap((tab) => coverTabSections(tab))
    const figureOf = (id: string) => {
      const section = sections.find((candidate) => candidate.id === id)
      if (!section) return undefined
      return 'figure' in section ? section.figure?.src : undefined
    }

    // The figures are authored truth; these three slots were the last empty
    // ones and the copy around them reads off the drawings.
    expect(figureOf('overview-when')).toBe(packageCoverFigures.whenToUse.src)
    // The definition and the presenting behaviour are one opening section
    // now, and "From path to presentation" belongs to it.
    expect(figureOf('slices-intro')).toBe(packageCoverFigures.sliceConcept.src)
    expect(figureOf('slices-types')).toBe(packageCoverFigures.slicingModel.src)
  })

  it("the Overview defs list carries the four categories the figure shows", () => {
    const section = coverContent.tabs
      .flatMap((tab) => coverTabSections(tab))
      .find((candidate) => candidate.id === 'overview-when')
    expect(section?.kind).toBe('defs')
    if (section?.kind !== 'defs') return
    expect(section.items.map((item) => item.term)).toEqual([
      'Onboarding',
      'Stakeholder alignment',
      'Decision evaluation',
      'Context management',
    ])
    // Each definition expands on the figure's title rather than repeating it.
    for (const item of section.items) {
      expect(item.definition.length).toBeGreaterThan(60)
    }
  })

  it('every defs list has a header row for its two columns', () => {
    for (const tab of coverContent.tabs) {
      for (const section of coverTabSections(tab)) {
        if (section.kind !== 'defs') continue
        expect(section.columns.term.length).toBeGreaterThan(0)
        expect(section.columns.definition.length).toBeGreaterThan(0)
      }
    }
  })

  it('gives every tab a guide link into the repo docs, labelled the same way', () => {
    for (const tab of coverContent.tabs) {
      expect(tab.link?.docPath).toMatch(/^docs\/guide\/.+\.md$/)
      expect(tab.link?.label).toBe('Learn more →')
    }
  })
})
