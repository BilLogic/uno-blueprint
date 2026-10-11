// @vitest-environment jsdom
/**
 * Slice and presentation surfaces on the type ladder.
 *
 * Editing chrome sits on `xs`. Stage text sits on `sm` or above and is
 * never muted-only. Sub-12px rungs on these files lift onto that floor.
 * The class-list reader is the seam — a quoted-string search misses a
 * token split across `cn()` arguments.
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  classListHas,
  classLists,
  classListsIn,
  uncommentedLeading,
} from '@/lib/classList'
import { sourceFiles } from '@/lib/tokenModel'
import type { SliceBlueprint } from '@/hooks/useSliceBlueprint'
import type { BlueprintData } from '@/types/blueprint'
import type { Slice, Slide } from '@/types/database'

/**
 * Files this batch owns. The editor-shell guard names the same set so
 * neither ticket opens the other's tree.
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
 * Display surfaces whose floor is `sm`. Editing chrome (the composer, the
 * slide sheet, the sidebar) stays on `xs` and is not in this set.
 */
const STAGE_FILES = new Set([
  'components/editor/SlicePresentation.tsx',
  'components/editor/SliceHeaderBand.tsx',
  'components/editor/SlideArtboard.tsx',
])

const SUB_XS = /^(?:[a-z-]+:)*text-(?:2xs|3xs|4xs|5xs)$/
const BELOW_SM = /^(?:[a-z-]+:)*text-(?:xs|2xs|3xs|4xs|5xs)$/
const TYPE_RUNG =
  /^(?:[a-z-]+:)*text-(?:xs|sm|base|lg|xl|2xl|3xl|4xl|5xl|2xs|3xs|4xs|5xs)$/
const RESTING_INK = /^text-(?:foreground|contrast)(?:\/|$)/
const MUTED = /^text-muted-foreground(?:\/|$)/

/**
 * Whether `file` is in this migration batch.
 *
 * @param file - path relative to `src`, as `classLists()` reports it
 */
function inScope(file: string): boolean {
  if (!file.startsWith('components/editor/')) return false
  const base = file.slice('components/editor/'.length)
  return SLICE_PRESENTATION.has(base)
}

/**
 * Whether `file` is a presentation-stage surface.
 *
 * @param file - path relative to `src`
 */
function isStage(file: string): boolean {
  return STAGE_FILES.has(file)
}

/**
 * Format a site so a failure names the file, the line, and the classes.
 *
 * @param site - one class list
 */
function describeSite(site: { file: string; line: number; classes: string[] }): string {
  return `${site.file}:${site.line}: ${site.classes.join(' ')}`
}

const scopedSites = () => classLists().filter((site) => inScope(site.file))

describe('authored classes on the slice and presentation surfaces', () => {
  it('fails a site that still writes 2xs', () => {
    const source = `<span className="font-mono text-2xs font-medium">Slide 1 of 4</span>`
    const sites = classListsIn(source, 'components/editor/SlicePresentation.tsx')
    expect(
      sites.some((site) => site.classes.some((token) => SUB_XS.test(token))),
    ).toBe(true)
  })

  it('names no rung below xs', { timeout: 20_000 }, () => {
    const offenders = scopedSites().filter((site) =>
      site.classes.some((token) => SUB_XS.test(token)),
    )
    expect(
      offenders.map(describeSite),
      offenders.map(describeSite).join('\n'),
    ).toEqual([])
  })

  it('puts no stage text below sm, and none of it is muted-only', {
    timeout: 20_000,
  }, () => {
    const stage = scopedSites().filter((site) => isStage(site.file))
    const belowSm = stage.filter((site) =>
      site.classes.some((token) => BELOW_SM.test(token)),
    )
    expect(
      belowSm.map(describeSite),
      belowSm.map(describeSite).join('\n'),
    ).toEqual([])

    const mutedOnly = stage.filter((site) => {
      if (!site.classes.some((token) => TYPE_RUNG.test(token))) return false
      const muted = site.classes.some((token) => MUTED.test(token))
      const ink = site.classes.some((token) => RESTING_INK.test(token))
      return muted && !ink
    })
    expect(
      mutedOnly.map(describeSite),
      mutedOnly.map(describeSite).join('\n'),
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

describe('stage headings, captions, the cells list and nav sit on sm', () => {
  it('seats the named stage sites on sm or above, in full ink', () => {
    const stage = scopedSites().filter((site) => isStage(site.file))
    const missing = STAGE_TEXT.flatMap((entry) => {
      const hits = stage.filter(
        (site) =>
          site.file === entry.file && classListHas(site.classes, entry.has),
      )
      if (hits.length === 0) {
        return [`${entry.file}: no site with ${entry.has.join(' ')} (${entry.because})`]
      }
      return hits.flatMap((site) => {
        const size = site.classes.find((token) => TYPE_RUNG.test(token))
        const tooSmall = !size || BELOW_SM.test(size)
        const muted = site.classes.some((token) => MUTED.test(token))
        // Inherited foreground from the stage root is full ink; muted is not.
        if (!tooSmall && !muted) return []
        return [
          `${site.file}:${site.line}: ${entry.because} still ${site.classes.filter((token) => token.startsWith('text-')).join(' ') || 'unsized'}`,
        ]
      })
    })
    expect(missing, missing.join('\n')).toEqual([])
  })
})

/**
 * Real class-list fragments lifted from the stage, size excluded so a
 * reordering still matches. Each site must land on `sm` or above, with
 * resting `text-foreground` (or `text-contrast` on an inverted control),
 * and without `text-muted-foreground`.
 */
const STAGE_TEXT: ReadonlyArray<{
  file: string
  has: readonly string[]
  because: string
}> = [
  {
    file: 'components/editor/SlicePresentation.tsx',
    has: ['font-mono', 'tabular-nums', 'font-medium'],
    because: 'slide counter',
  },
  {
    file: 'components/editor/SlicePresentation.tsx',
    has: ['max-w-2xl'],
    because: 'slide caption',
  },
  {
    file: 'components/editor/SlicePresentation.tsx',
    has: ['text-left', 'text-foreground'],
    because: 'cells-list rows',
  },
  {
    file: 'components/editor/SlicePresentation.tsx',
    has: ['font-medium', 'border-border', 'bg-card'],
    because: 'cells button',
  },
  {
    file: 'components/editor/SlicePresentation.tsx',
    has: ['max-w-48', 'font-medium'],
    because: 'filmstrip slide titles',
  },
  {
    file: 'components/editor/SlicePresentation.tsx',
    has: ['size-10', 'font-mono', 'tabular-nums'],
    because: 'filmstrip cell numbers',
  },
  {
    file: 'components/editor/SliceHeaderBand.tsx',
    has: ['truncate', 'font-semibold'],
    because: 'sticky header title',
  },
]

const SLICE_ID = 'slice-ladder'
const LONG_CAPTION =
  'The guest arrives, is greeted by name, and walks the lobby while the desk confirms the room, prints the keys, and hands over a map of the floor — a long caption that must wrap on the stage rather than clip at the new sizes.'

const slice: Slice = {
  id: SLICE_ID,
  title: 'Arrival readout',
  kind: 'journey',
  actor: null,
  created_at: '2026-01-01T00:00:00Z',
  created_by: null,
  summary: 'A slide with a long caption and several cited cells.',
  locale: 'en',
  authorship: 'human',
  position: 0,
  service_id: 'svc-1',
  updated_at: '2026-01-01T00:00:00Z',
}

const cited = [
  { id: 'cell-a', content: 'Greet the guest' },
  { id: 'cell-b', content: 'Confirm the booking' },
  { id: 'cell-c', content: 'Print the keys' },
  { id: 'cell-d', content: 'Hand over the map' },
  { id: 'cell-e', content: 'Walk to the lift' },
] as const

const slide: Slide = {
  id: 'slide-1',
  title: 'The lobby',
  cell_ids: cited.map((cell) => cell.id),
  cell_keys: [],
  created_at: '2026-01-01T00:00:00Z',
  created_by: null,
  caption: LONG_CAPTION,
  position: 0,
  shows_all_images: true,
  slice_id: SLICE_ID,
  updated_at: '2026-01-01T00:00:00Z',
}

const blueprint = {
  path: {
    id: 'p-1',
    name: 'Happy',
    summary: null,
    note: null,
    kind: 'happy',
    status: 'live',
  },
  lanes: [{ id: 'l-1', name: 'Lane', role: null, position: 0 }],
  steps: cited.map((_, index) => ({
    id: `st-${index + 1}`,
    name: `Step ${index + 1}`,
    position: index + 1,
  })),
  cells: cited.map((cell, index) => ({
    id: cell.id,
    lane_id: 'l-1',
    step_id: `st-${index + 1}`,
    content: cell.content,
    frame: null,
    summary: null,
  })),
  dependencies: [],
} as BlueprintData

const sliceBlueprint: SliceBlueprint = {
  result: { status: 'ready', data: { slice, items: [slide] }, source: 'fallback' },
  detail: { slice, items: [slide] },
  items: [slide],
  cellIds: cited.map((cell) => cell.id),
  scenarioResult: { status: 'ready', data: 'scenario-1', source: 'fallback' },
  scenarioId: 'scenario-1',
  blueprint,
  blueprintsLoading: false,
}

vi.mock('@/contexts/viewStateStore', () => ({
  useViewState: () => ({
    openTab: () => {},
    reportPresentSlide: () => {},
    restoredSlide: null,
    consumeRestoredSlide: () => {},
  }),
}))

vi.mock('@/hooks/useSliceBlueprint', () => ({
  useSliceBlueprint: () => sliceBlueprint,
}))

afterEach(cleanup)

describe('a long caption and several cited cells fit the stage', () => {
  it('renders the caption and every cells-list row without clipping at the new sizes', async () => {
    const { SlicePresentation } = await import('@/components/editor/SlicePresentation')
    const { container } = render(
      <SlicePresentation sliceId={SLICE_ID} onReturn={() => {}} />,
    )

    const caption = screen.getByText(LONG_CAPTION)
    expect(caption.className).toMatch(/\btext-sm\b/)
    expect(caption.className).toMatch(/\btext-foreground\b/)
    expect(caption.className).not.toMatch(/text-muted-foreground/)
    expect(caption.className).not.toMatch(/\b(truncate|overflow-hidden|leading-relaxed)\b/)

    const button = screen.getByRole('button', { name: `${cited.length} cells` })
    expect(button.className).toMatch(/\btext-sm\b/)
    expect(button.className).toMatch(/\bfont-medium\b/)
    expect(button.className).not.toMatch(/text-muted-foreground/)
    fireEvent.click(button)
    await screen.findByRole('button', { name: `Open ${cited[0].content} in the slice` })

    const rows = cited.map((cell) =>
      screen.getByRole('button', { name: `Open ${cell.content} in the slice` }),
    )
    expect(rows).toHaveLength(cited.length)
    for (const row of rows) {
      expect(row.className).toMatch(/\btext-sm\b/)
      expect(row.className).toMatch(/\btext-foreground\b/)
      expect(row.className).not.toMatch(/text-muted-foreground/)
      expect(row.className).not.toMatch(/\b(truncate|overflow-hidden)\b/)
    }

    const counter = screen.getByText(/Slide 1 of 1/)
    expect(counter.className).toMatch(/\btext-sm\b/)
    expect(counter.className).toMatch(/\btext-foreground\b/)

    expect(container.querySelector('[data-presentation-stage]')).not.toBeNull()
  })
})
