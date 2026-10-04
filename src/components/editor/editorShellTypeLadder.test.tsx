// @vitest-environment jsdom
/**
 * The editor shell on the new ladder: 12px (`xs`) is chrome, 13px (`sm`)
 * is UI text.
 *
 * Slice/presentation, the blueprint canvas, the cover/mobile remainder and
 * `PANEL_TEXT` are other batches. This file only names the shell.
 */
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AgentSettingsFields } from '@/components/editor/AgentSettingsFields'
import { CreateBlueprintDialog } from '@/components/editor/CreateBlueprintDialog'
import { DeploymentConfigProvider } from '@/contexts/DeploymentConfigContext'
import {
  classListHas,
  classLists,
  classListsIn,
} from '@/lib/classList'
import { sourceOf } from '@/lib/sourceTree'

/**
 * Slice and presentation files live under `components/editor/` but belong
 * to the slice and presentation batch, held by
 * `slicePresentationTypeLadder.test.tsx`, not to this one.
 */
const SLICE_PRESENTATION = new Set([
  'SlicePresentation.tsx',
  'SlideArtboard.tsx',
  'SlideStickyHeader.tsx',
  'SlideModeView.tsx',
  'SlideNav.tsx',
  'SliceView.tsx',
  'SliceSlideEditor.tsx',
  'SliceSlideComposer.tsx',
  'SlicesSidebarSection.tsx',
  'SliceHeaderBand.tsx',
  'SliceEditSession.tsx',
  'SlideImagesField.tsx',
])

/**
 * Menu primitives the shell's menus inherit. Items are UI text, so they
 * re-seat with the shell; labels and shortcuts stay chrome at `xs`.
 */
const MENU_PRIMITIVES = new Set([
  'components/ui/dropdown-menu.tsx',
  'components/ui/context-menu.tsx',
  'components/ui/menubar.tsx',
])

const SUB_XS = /^(?:[a-z-]+:)*text-(?:2xs|3xs|4xs|5xs)$/
const ARBITRARY_TRACKING = /^(?:[a-z-]+:)*tracking-\[/

/**
 * Is this file in the editor-shell batch?
 *
 * @param file - path relative to `src`, as `classLists()` reports it
 */
function isEditorShell(file: string): boolean {
  if (MENU_PRIMITIVES.has(file)) return true
  if (!file.startsWith('components/editor/')) return false
  const base = file.slice('components/editor/'.length)
  // `agent/` is the panel's own folder — shell chrome that happens to sit one
  // level down, so the batch reads it as it read the panel file it came out
  // of. Any other subfolder is still somebody else's batch.
  if (base.includes('/')) return base.startsWith('agent/')
  return !SLICE_PRESENTATION.has(base)
}

const shellSites = () => classLists().filter((site) => isEditorShell(site.file))

/**
 * Real strings the tree writes today for UI text that must land on `sm`.
 *
 * Each needle is a class list fragment lifted from the file, not invented
 * here. The size token is asserted separately so a reordering still matches.
 */
const UI_TEXT_AT_SM: ReadonlyArray<{
  file: string
  /** Classes that identify the site, size excluded. */
  has: readonly string[]
  because: string
}> = [
  {
    file: 'components/editor/AgentProviderFields.tsx',
    has: ['w-14', 'shrink-0', 'text-muted-foreground'],
    because: 'settings row labels',
  },
  {
    file: 'components/editor/AgentSettingsFields.tsx',
    has: ['font-medium', 'text-foreground'],
    because: 'settings section headings',
  },
  {
    file: 'components/editor/DevPortal.tsx',
    has: ['w-14', 'shrink-0', 'text-muted-foreground'],
    because: 'settings row labels',
  },
  {
    file: 'components/editor/CreateBlueprintDialog.tsx',
    has: ['font-medium', 'text-foreground'],
    because: 'dialog field labels',
  },
  {
    file: 'components/editor/CreatePhaseDialog.tsx',
    has: ['font-medium', 'text-foreground'],
    because: 'dialog field labels',
  },
  {
    file: 'components/editor/StructureRowMenu.tsx',
    has: ['text-sm'],
    because: 'context menu content is UI text',
  },
  {
    file: 'components/editor/CanvasCellContextMenu.tsx',
    has: ['bg-popover', 'shadow-md'],
    because: 'canvas cell menu items',
  },
  {
    file: 'components/editor/PathSelectorMenu.tsx',
    has: ['text-left', 'transition-colors'],
    because: 'path menu items',
  },
]

describe('the editor shell names no rung below xs', () => {
  it('fails a site that still writes 2xs–5xs', () => {
    const source = `<span className="text-2xs font-medium text-muted-foreground">Agent</span>`
    const sites = classListsIn(source, 'components/editor/AgentDock.tsx')
    expect(
      sites.some((site) => site.classes.some((token) => SUB_XS.test(token))),
    ).toBe(true)
  })

  it('holds the authored shell', { timeout: 20_000 }, () => {
    const offenders = shellSites()
      .filter((site) => site.classes.some((token) => SUB_XS.test(token)))
      .map(
        (site) =>
          `${site.file}:${site.line}: ${site.classes.filter((token) => SUB_XS.test(token)).join(' ')}`,
      )
    expect(offenders, offenders.join('\n')).toEqual([])
  })
})

describe('menu items, settings rows and field labels sit on sm', () => {
  it('seats each named UI-text site on sm, not xs', () => {
    const sites = shellSites()
    const missing = UI_TEXT_AT_SM.flatMap((entry) => {
      const hits = sites.filter(
        (site) =>
          site.file === entry.file && classListHas(site.classes, entry.has),
      )
      if (hits.length === 0) {
        return [`${entry.file}: no site with ${entry.has.join(' ')} (${entry.because})`]
      }
      return hits.flatMap((site) => {
        if (site.classes.includes('text-sm')) return []
        return [
          `${site.file}:${site.line}: ${entry.because} still ${site.classes.filter((token) => token.startsWith('text-')).join(' ') || 'unsized'}`,
        ]
      })
    })
    expect(missing, missing.join('\n')).toEqual([])
  })

  it('writes menu rows at sm in the three menu primitives', () => {
    // Real item class lists from the primitives, size included so a
    // leftover `text-xs` on a row fails even if a comment still says sm.
    const needles = [
      {
        file: 'components/ui/dropdown-menu.tsx',
        marker: 'group/dropdown-menu-item',
      },
      {
        file: 'components/ui/context-menu.tsx',
        marker: 'group/context-menu-item',
      },
      {
        file: 'components/ui/menubar.tsx',
        marker: 'group/menubar-item',
      },
    ]
    const sites = shellSites()
    const offenders = needles.flatMap((entry) => {
      const hits = sites.filter(
        (site) =>
          site.file === entry.file && site.classes.includes(entry.marker),
      )
      return hits.flatMap((site) =>
        site.classes.includes('text-sm') && !site.classes.includes('text-xs')
          ? []
          : [
              `${site.file}:${site.line}: menu row ${site.classes.filter((token) => token.startsWith('text-')).join(' ')}`,
            ],
      )
    })
    expect(offenders, offenders.join('\n')).toEqual([])
  })
})

describe('the shell writes no arbitrary tracking', () => {
  it('fails a tracking-[…] site', () => {
    const source = `<span className="text-xs tracking-[0.08em]">Path</span>`
    expect(
      classListsIn(source).some((site) =>
        site.classes.some((token) => ARBITRARY_TRACKING.test(token)),
      ),
    ).toBe(true)
  })

  it('holds the authored shell', { timeout: 20_000 }, () => {
    const offenders = shellSites()
      .filter((site) =>
        site.classes.some((token) => ARBITRARY_TRACKING.test(token)),
      )
      .map(
        (site) =>
          `${site.file}:${site.line}: ${site.classes.filter((token) => ARBITRARY_TRACKING.test(token)).join(' ')}`,
      )
    expect(offenders, offenders.join('\n')).toEqual([])
  })
})

describe('surviving leading-* names the geometry that needs it', () => {
  it('comments every leading utility in the shell', () => {
    const files = [
      ...new Set(shellSites().map((site) => site.file)),
    ]
    const offenders: string[] = []
    for (const file of files) {
      const lines = sourceOf(file).split('\n')
      lines.forEach((line, index) => {
        if (!/\bleading-/.test(line)) return
        if (/^\s*(\/\/|\*)/.test(line) && !/\bleading-[a-z0-9[\]/-]+/.test(line))
          return
        // A comment mentioning geometry, on this line or in the three
        // lines above, is the override the rung does not supply.
        const window = lines.slice(Math.max(0, index - 3), index + 1).join('\n')
        if (/geometry/i.test(window)) return
        offenders.push(`${file}:${index + 1}: ${line.trim()}`)
      })
    }
    expect(offenders, offenders.join('\n')).toEqual([])
  })
})

describe('the agent panel reseats chrome below UI text', () => {
  it('keeps the Sessions eyebrow on xs and the row title on sm', () => {
    const view = 'components/editor/agent/AgentSessionsView.tsx'
    const sites = classListsIn(sourceOf(view), view)

    // The eyebrow's rung is not in this file any more, and that is the point:
    // it is `Eyebrow`, spelled once, after twenty-odd call sites had written
    // it by hand at two different letterspacings. Neither is its ink: the
    // panel used to dial its own, and now the primitive names one rung for
    // every caller. So what this file may still say about an eyebrow is
    // layout, and nothing about how it reads.
    const eyebrow = sites.find((site) => classListHas(site.classes, ['truncate', 'pl-1']))
    expect(eyebrow, 'Sessions eyebrow').toBeDefined()
    for (const spelled of eyebrow?.classes ?? []) {
      expect(
        spelled,
        `the Sessions eyebrow re-spells ${spelled}, which belongs to Eyebrow`,
      ).not.toMatch(/^(text-(xs|sm|base)|uppercase|tracking-|font-|text-\w+-?foreground)/)
    }

    const primitive = classListsIn(
      sourceOf('components/blueprint/Eyebrow.tsx'),
      'components/blueprint/Eyebrow.tsx',
    )
    const register = primitive.find((site) =>
      classListHas(site.classes, ['text-xs', 'text-muted-foreground']),
    )
    expect(register, 'the eyebrow register').toBeDefined()
    expect(register?.classes).not.toContain('uppercase')
    expect(register?.classes).not.toContain('text-sm')

    const rowFile = 'components/editor/agent/SessionRow.tsx'
    const rowTitle = classListsIn(sourceOf(rowFile), rowFile).find((site) =>
      classListHas(site.classes, [
        'truncate',
        'group-hover/session:text-sidebar-accent-foreground',
      ]),
    )
    expect(rowTitle, 'session row title').toBeDefined()
    expect(rowTitle?.classes).toContain('text-sm')
  })
})

const mockSupabase = {
  client: null as unknown,
  session: null,
  canAgent: false,
  configured: false,
  devSimulation: { on: false, tier: 'regular' },
}
vi.mock('@/contexts/SupabaseProvider', () => ({
  useSupabase: () => mockSupabase,
}))
vi.mock('@/hooks/useServicePhases', () => ({
  useServicePhases: () => ({
    phases: [],
    slides: [],
    loading: false,
    error: null,
    configured: false,
  }),
}))
vi.mock('@/hooks/useSupabaseQuery', () => ({
  useSupabaseQuery: () => ({ status: 'ready', data: [] }),
}))

afterEach(cleanup)

describe('the settings popover reseats labels above hints', () => {
  it('renders settings row labels at sm and the unconfigured hint at xs', () => {
    mockSupabase.configured = false
    const { container } = render(<AgentSettingsFields />)
    const provider = screen.getByText('Provider')
    expect(provider.className.split(/\s+/)).toContain('text-sm')
    const hint = container.querySelector('p.text-xs.text-muted-foreground')
    expect(hint?.textContent).toMatch(/No database configured/)
    expect(hint?.classList.contains('text-xs')).toBe(true)
    expect(hint?.classList.contains('text-sm')).toBe(false)
  })
})

describe('a create dialog reseats field labels above hints', () => {
  it('renders the Name label at sm and a helper at xs', () => {
    render(
      <DeploymentConfigProvider>
        <CreateBlueprintDialog open onOpenChange={() => undefined} />
      </DeploymentConfigProvider>,
    )
    const name = screen.getByText('Name')
    expect(name.className.split(/\s+/)).toContain('text-sm')
    const helper = screen.getByText(/No phases found/)
    expect(helper.className.split(/\s+/)).toContain('text-xs')
    expect(helper.className.split(/\s+/)).not.toContain('text-sm')
  })
})
