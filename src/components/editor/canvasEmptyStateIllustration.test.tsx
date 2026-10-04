// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CellDetailEmptySurface } from '@/components/blueprint/CellDetailEmptySurface'
import { PanelDrawerShell } from '@/components/blueprint/panelShell'
import { MiniBlueprintIllustration } from '@/components/blueprint/MiniBlueprintIllustration'
import {
  CanvasEmptyState,
  NoPathsEmptyState,
} from '@/components/editor/CanvasEmptyState'

// The focused copy offers the restore button, which reads the selection
// store; a store with a default to restore is all these cases need.
vi.mock('@/hooks/usePathSelection', () => ({
  usePathSelectionContext: () => ({
    defaultPathKeys: ['happy:Default'],
    restoreDefaultPathKeys: () => {},
  }),
}))

// Every empty state carries the mini-blueprint: lane rows, skeleton cells and
// dashed gap cells, drawn from tokens and hidden from assistive tech. The
// canvas draws it large; the panel, phase and cell-details states draw it
// small. The copy beside it is unchanged — the picture never replaces the
// invitation to act.

afterEach(cleanup)

const illustration = (root: ParentNode = document) =>
  root.querySelector<HTMLElement>('[data-mini-blueprint]')

describe('MiniBlueprintIllustration', () => {
  it('is hidden from assistive tech', () => {
    render(<MiniBlueprintIllustration size="lg" />)
    const art = illustration()
    expect(art).not.toBeNull()
    expect(art!.getAttribute('aria-hidden')).toBe('true')
  })

  it('draws lane rows that take their colour from the lane role tokens', () => {
    render(<MiniBlueprintIllustration size="lg" />)
    const lanes = [
      ...document.querySelectorAll<HTMLElement>('[data-blueprint-lane]'),
    ]
    expect(lanes.length).toBeGreaterThanOrEqual(3)
    for (const lane of lanes) {
      const square = lane.querySelector('[data-mini-blueprint-lane-square]')
      expect(square).not.toBeNull()
      expect(square!.className).toContain('var(--background-blueprint-cell')
    }
  })

  it('draws solid cells with one skeleton bar and dashed gap cells with none', () => {
    render(<MiniBlueprintIllustration size="lg" />)
    const solid = document.querySelectorAll<HTMLElement>(
      '[data-mini-blueprint-cell="solid"]',
    )
    const gaps = document.querySelectorAll<HTMLElement>(
      '[data-mini-blueprint-cell="gap"]',
    )
    expect(solid.length).toBeGreaterThan(0)
    expect(gaps.length).toBeGreaterThan(0)
    for (const cell of solid) {
      expect(cell.className).not.toContain('border-dashed')
      expect(cell.querySelectorAll('[data-mini-blueprint-bar]')).toHaveLength(1)
    }
    // Dashed means not yet: a gap is the thing that does not exist, so it
    // holds no content mark.
    for (const cell of gaps) {
      expect(cell.className).toContain('border-dashed')
      expect(cell.querySelectorAll('[data-mini-blueprint-bar]')).toHaveLength(0)
    }
  })

  it('carries no hardcoded colour', () => {
    const { container } = render(<MiniBlueprintIllustration size="lg" />)
    expect(container.innerHTML).not.toMatch(/#[0-9a-f]{3,8}\b|rgb\(|hsl\(|oklch\(/i)
  })

  it('stays still: no animation classes', () => {
    const { container } = render(<MiniBlueprintIllustration size="lg" />)
    expect(container.innerHTML).not.toMatch(/animate-|data-slot="skeleton"/)
  })

  it('is larger at lg than at sm', () => {
    render(
      <>
        <MiniBlueprintIllustration size="lg" />
        <MiniBlueprintIllustration size="sm" />
      </>,
    )
    const [lg, sm] = document.querySelectorAll<HTMLElement>(
      '[data-mini-blueprint]',
    )
    expect(lg.dataset.miniBlueprint).toBe('lg')
    expect(sm.dataset.miniBlueprint).toBe('sm')
    const cellHeight = (root: HTMLElement) =>
      root.querySelector('[data-mini-blueprint-cell]')!.className
    expect(cellHeight(lg)).toContain('h-6')
    expect(cellHeight(sm)).toContain('h-5')
    expect(cellHeight(sm)).toContain('rounded-lg')
  })
})

describe('CanvasEmptyState', () => {
  it('canvas variant draws the large illustration above its copy', () => {
    render(
      <CanvasEmptyState variant="canvas" showRestoreAction={false} />,
    )
    const root = document.querySelector<HTMLElement>(
      '[data-canvas-empty-state="canvas"]',
    )!
    expect(illustration(root)?.dataset.miniBlueprint).toBe('lg')
    expect(screen.getByText('No paths selected')).toBeDefined()
    expect(screen.getByText('Pick one from the paths menu in the header.')).toBeDefined()
  })

  it.each(['panel', 'phase'] as const)(
    '%s variant draws the small illustration',
    (variant) => {
      render(
        <CanvasEmptyState
          variant={variant}
          title="No scenarios in this phase yet"
          summary="Add one."
        />,
      )
      const root = document.querySelector<HTMLElement>(
        `[data-canvas-empty-state="${variant}"]`,
      )!
      expect(illustration(root)?.dataset.miniBlueprint).toBe('sm')
      expect(screen.getByText('No scenarios in this phase yet')).toBeDefined()
    },
  )
})

describe('NoPathsEmptyState', () => {
  // The copy names a control only where that control exists: the header's
  // paths menu is mounted for a focused scenario and never on a phase.
  it('points a focused scenario at the paths menu in the header', () => {
    render(<NoPathsEmptyState focused />)
    expect(screen.getByText('No paths selected')).toBeDefined()
    expect(
      screen.getByText('Pick one from the paths menu in the header.'),
    ).toBeDefined()
    expect(screen.getByRole('button', { name: 'Show the default path' })).toBeDefined()
  })

  it('points a phase canvas, with every path hidden, at the sidebar', () => {
    render(<NoPathsEmptyState focused={false} />)
    expect(screen.getByText('No paths to show')).toBeDefined()
    expect(
      screen.getByText(
        'None of the scenarios here has a path to draw. Open one from the sidebar.',
      ),
    ).toBeDefined()
    expect(screen.queryByText(/paths menu/)).toBeNull()
    expect(screen.queryByRole('button')).toBeNull()
    expect(illustration()?.dataset.miniBlueprint).toBe('lg')
  })
})

describe('CanvasEmptyState after a failed read', () => {
  // A read that never came back is not an empty board, so it draws no
  // picture of one; the copy carries the failure on its own.
  it('draws no illustration when told the board is not known to be empty', () => {
    render(
      <CanvasEmptyState
        title="The phases could not be loaded"
        summary="The sidebar has the error."
        showRestoreAction={false}
        showIllustration={false}
      />,
    )
    expect(illustration()).toBeNull()
    expect(screen.getByText('The phases could not be loaded')).toBeDefined()
  })
})

describe('CellDetailEmptySurface', () => {
  beforeEach(() => {
    // jsdom has no `matchMedia`; the drawer only needs the desktop posture.
    window.matchMedia = ((query: string) => ({
      media: query,
      matches: false,
      addEventListener() {},
      removeEventListener() {},
    })) as unknown as typeof window.matchMedia
  })

  it('draws the small illustration above its copy', () => {
    render(
      <PanelDrawerShell open onCloseRequest={() => {}} onClosed={() => {}}>
        <CellDetailEmptySurface surfaceSwitcher={null} onClose={() => {}} />
      </PanelDrawerShell>,
    )
    expect(illustration()?.dataset.miniBlueprint).toBe('sm')
    expect(
      screen.getByText('No cell selected — click a cell on the board.'),
    ).toBeDefined()
  })
})
