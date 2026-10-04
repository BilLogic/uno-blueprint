// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { CellDetailEmptySurface } from '@/components/blueprint/CellDetailEmptySurface'
import { PanelDrawerShell } from '@/components/blueprint/panelShell'
import { MiniBlueprintIllustration } from '@/components/blueprint/MiniBlueprintIllustration'
import { CanvasEmptyState } from '@/components/editor/CanvasEmptyState'

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
