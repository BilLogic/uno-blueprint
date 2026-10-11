import { describe, expect, it } from 'vitest'
import {
  classListHas,
  classListOf,
  classLists,
  classListsIn,
  type ClassListSite,
  uncommentedLeading,
} from '@/lib/classList'
import {
  NARRATIVE_CELL_HEIGHT,
  NARRATIVE_CELL_HEIGHT_COMPACT,
  TOUCHPOINT_ITEM_HEIGHT,
  TOUCHPOINT_ITEM_HEIGHT_COMPACT,
} from '@/lib/blueprintLayout'
import { CANVAS_HEADER_TEXT } from '@/lib/canvasHeaderStyle'
import { sourceFiles } from '@/lib/tokenModel'

/**
 * The blueprint canvas and its panels land on the type ladder, where a type rung
 * owns size and leading and a call site owns weight, tracking and ink.
 *
 * 12px (`xs`) is canvas chrome and panel labels/meta. 13px (`sm`) is
 * panel titles and values. Weight and colour separate those four jobs,
 * because one pixel is not a signal. Slice/presentation, the editor
 * shell, cover/mobile helpers, and the sub-12px contract are other
 * batches.
 */

const SUB_XS = /^(?:[a-z-]+:)*!?text-(?:2xs|3xs|4xs|5xs)$/
const ARBITRARY_TRACKING = /^(?:[a-z-]+:)*tracking-\[/
const WEIGHT = /^font-(normal|medium|semibold)$/
const COLOUR = /^text-(foreground|muted-foreground)/

/**
 * The four panel jobs, written at the call site because there is no
 * semantic type-role layer to write them through. Title and value share
 * `sm`; label and meta share `xs`. The tuples are the hierarchy.
 */
const PANEL_ROLES = {
  title: 'min-w-0 text-sm font-semibold text-foreground',
  sectionLabel: 'text-xs font-medium text-muted-foreground',
  value: 'text-sm font-normal text-foreground',
  meta: 'text-xs font-normal text-muted-foreground',
} as const

/**
 * Whether `file` is in this migration batch.
 *
 * @param file - path relative to `src`
 */
function inScope(file: string): boolean {
  return (
    file.startsWith('components/blueprint/') ||
    file === 'lib/blueprintCellStyle.ts' ||
    file === 'lib/canvasHeaderStyle.ts'
  )
}

/**
 * Class-list sites on the canvas and panel surface.
 *
 * @param sites - the tree-wide census
 */
function scopedSites(sites: readonly ClassListSite[]): ClassListSite[] {
  return sites.filter((site) => inScope(site.file))
}

/**
 * Format a site so a failure names the file, the line, and the classes.
 *
 * @param site - one class list
 */
function describeSite(site: ClassListSite): string {
  return `${site.file}:${site.line}: ${site.classes.join(' ')}`
}

/**
 * The weight and colour utilities a panel role writes.
 *
 * Missing weight is 400 — the working weight need not be spelled. The
 * test still records it so two roles that share a colour cannot hide
 * behind an omitted class.
 *
 * @param classes - one role's class list
 */
function weightAndColour(classes: string): { weight: string; colour: string } {
  const list = classListOf(classes)
  const weight = list.find((token) => WEIGHT.test(token))
  const colour = list.find((token) => COLOUR.test(token))
  expect(weight, `a weight utility on ${classes}`).toBeDefined()
  expect(colour, `a colour utility on ${classes}`).toBeDefined()
  return { weight: weight!, colour: colour! }
}

describe('the census detector names a leftover sub-xs rung', () => {
  it('fails a site that still writes 2xs–5xs', () => {
    const source = `<span className="text-2xs font-medium text-muted-foreground">Label</span>`
    const sites = classListsIn(source, 'components/blueprint/panelShell.tsx')
    expect(
      sites.some((site) => site.classes.some((token) => SUB_XS.test(token))),
    ).toBe(true)
  })

  it('fails a panel title still below sm', () => {
    const source = `<p className="min-w-0 text-xs font-semibold text-foreground">Cell name</p>`
    const sites = classListsIn(source, 'components/blueprint/panelShell.tsx')
    const title = sites.find((site) =>
      classListHas(site.classes, ['min-w-0', 'font-semibold', 'text-foreground']),
    )
    expect(title).toBeDefined()
    expect(title?.classes.includes('text-sm')).toBe(false)
  })
})

describe('authored classes on the canvas and its panels', () => {
  it('name no rung below xs', { timeout: 20_000 }, () => {
    const offenders = scopedSites(classLists()).filter((site) =>
      site.classes.some((token) => SUB_XS.test(token)),
    )
    expect(
      offenders.map(describeSite),
      offenders.map(describeSite).join('\n'),
    ).toEqual([])
  })

  it('seats panel titles on sm, not below', { timeout: 20_000 }, () => {
    const offenders = scopedSites(classLists()).flatMap((site) => {
      if (
        !classListHas(site.classes, [
          'min-w-0',
          'font-semibold',
          'text-foreground',
        ])
      ) {
        return []
      }
      if (site.classes.includes('text-sm')) return []
      return [
        `${site.file}:${site.line}: panel title still ${site.classes.filter((token) => token.startsWith('text-')).join(' ') || 'unsized'}`,
      ]
    })
    expect(offenders, offenders.join('\n')).toEqual([])
  })

  it('writes no arbitrary tracking', { timeout: 20_000 }, () => {
    const offenders = scopedSites(classLists()).filter((site) =>
      site.classes.some((token) => ARBITRARY_TRACKING.test(token)),
    )
    expect(
      offenders.map(describeSite),
      offenders.map(describeSite).join('\n'),
    ).toEqual([])
  })

  it('comments every surviving leading-* with the geometry that needs it', () => {
    const files = sourceFiles()
      .map((file) => file.file)
      .filter(inScope)
    const offenders = files.flatMap(uncommentedLeading)
    expect(offenders, offenders.join('\n')).toEqual([])
  })
})

describe('a panel title, label, value and meta', () => {
  it('are distinguishable by weight and colour alone', () => {
    const title = weightAndColour(PANEL_ROLES.title)
    const label = weightAndColour(PANEL_ROLES.sectionLabel)
    const value = weightAndColour(PANEL_ROLES.value)
    const meta = weightAndColour(PANEL_ROLES.meta)

    expect(title).toEqual({
      weight: 'font-semibold',
      colour: 'text-foreground',
    })
    expect(label).toEqual({
      weight: 'font-medium',
      colour: 'text-muted-foreground',
    })
    expect(value.weight).toBe('font-normal')
    expect(meta.weight).toBe('font-normal')
    expect(value.colour).not.toBe(meta.colour)
    expect(meta.colour).toBe('text-muted-foreground')

    const signatures = [title, label, value, meta].map(
      (role) => `${role.weight} ${role.colour}`,
    )
    expect(new Set(signatures).size).toBe(4)
  })

  it('sits titles and values on sm, labels and meta on xs', { timeout: 20_000 }, () => {
    const sites = scopedSites(classLists())
    const missing = (
      [
        ['title', PANEL_ROLES.title, 'text-sm'],
        ['sectionLabel', PANEL_ROLES.sectionLabel, 'text-xs'],
        ['value', PANEL_ROLES.value, 'text-sm'],
        ['meta', PANEL_ROLES.meta, 'text-xs'],
      ] as const
    ).flatMap(([role, classes, size]) => {
      const hits = sites.filter((site) => classListHas(site.classes, classes))
      if (hits.length === 0) {
        return [`${role}: no site writes ${classes}`]
      }
      return hits.flatMap((site) =>
        site.classes.includes(size)
          ? []
          : [`${site.file}:${site.line}: ${role} still missing ${size}`],
      )
    })
    expect(missing, missing.join('\n')).toEqual([])
  })
})

describe('canvas cell geometry', () => {
  it('keeps the face heights the board already ships', () => {
    expect(NARRATIVE_CELL_HEIGHT).toBe(128)
    expect(NARRATIVE_CELL_HEIGHT_COMPACT).toBe(96)
    expect(TOUCHPOINT_ITEM_HEIGHT).toBe(52)
    expect(TOUCHPOINT_ITEM_HEIGHT_COMPACT).toBe(42)
  })

  it('keeps canvas cell chrome on xs', () => {
    expect(classListOf(CANVAS_HEADER_TEXT)).toContain('text-xs')
    expect(
      classListOf(CANVAS_HEADER_TEXT).some((token) => SUB_XS.test(token)),
    ).toBe(false)
  })
})
