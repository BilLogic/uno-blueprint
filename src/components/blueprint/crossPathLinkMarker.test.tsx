// @vitest-environment jsdom
/**
 * A cell with a link to another path wears a marker for it, and the marker
 * goes there.
 *
 * The marker is drawn by the cell face every arrangement shares, so one face
 * is what these tests render; that both arrangements hand the face its links
 * is the band-level test beside this one. The jump itself is stubbed at the
 * hook — what it does with a target is `useJumpToCell.test.tsx`'s question,
 * and the question here is which target a marker hands it.
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const jump = vi.hoisted(() => ({
  fn: vi.fn(),
  available: true,
}))
vi.mock('@/hooks/useJumpToCell', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/hooks/useJumpToCell')>()),
  useJumpToCell: () => (jump.available ? jump.fn : null),
}))

import { CompareCellBlock } from '@/components/blueprint/CompareCellBlock'
import { TooltipProvider } from '@/components/ui/tooltip'
import { BlueprintCellDetailProvider } from '@/contexts/BlueprintCellDetailContext'
import { ScenarioBoardScopeContext } from '@/contexts/scenarioBoardScopeContext'
import { getBlueprintLaneStyle } from '@/lib/blueprintTheme'
import type { CrossPathLink } from '@/lib/crossPathLinks'
import type { BlueprintRemoteCell } from '@/types/blueprint'

afterEach(() => {
  cleanup()
  jump.fn.mockReset()
  jump.available = true
})

const laneStyle = getBlueprintLaneStyle('Tutor', 'frontstage', 'frontstage_actions')

const REPORT: BlueprintRemoteCell = {
  id: 'cell-report',
  content: 'Writes the weekly report',
  laneName: 'Tutor',
  stepName: 'Writes it up',
  pathId: 'path-report',
  pathName: 'Main route',
  scenarioId: 'scenario-report',
  scenarioName: 'Weekly class report',
  phaseName: 'Week',
}
const CATCH_UP: BlueprintRemoteCell = {
  ...REPORT,
  id: 'cell-catch-up',
  content: 'Books a catch-up',
  pathId: 'path-detour',
  pathName: 'Missed session',
  scenarioId: 'scenario-goals',
  scenarioName: 'Goal setting',
}

const out: CrossPathLink = {
  dependencyId: 'edge-out',
  direction: 'out',
  cellId: 'cell-b',
  other: REPORT,
  placeName: 'Weekly class report',
  label: 'Continues in Weekly class report',
  placeDetail: 'Main route · Weekly class report · Week',
}
const arriving: CrossPathLink = {
  dependencyId: 'edge-in',
  direction: 'in',
  cellId: 'cell-b',
  other: CATCH_UP,
  placeName: 'Missed session',
  label: 'Comes from Missed session',
  placeDetail: 'Missed session · Goal setting · Week',
}

/**
 * One cell face. By default on the board the detail view is scoped to, where
 * cells are live; `live: false` is the overview and the phase rows, where they
 * are inert.
 */
function draw(
  links: readonly CrossPathLink[] | undefined,
  { live = true, inScope = true } = {},
) {
  return render(
    <BlueprintCellDetailProvider enabled={live}>
      <ScenarioBoardScopeContext.Provider value={inScope}>
        <TooltipProvider>
          <CompareCellBlock
            cellId="cell-b"
            stepIndex={1}
            content="Reviews the goal"
            laneStyle={laneStyle}
            variant="default"
            crossPathLinks={links}
          />
        </TooltipProvider>
      </ScenarioBoardScopeContext.Provider>
    </BlueprintCellDetailProvider>,
  )
}

describe('the cross-path marker', () => {
  it('says where a leaving link continues and where an arriving one comes from', () => {
    draw([arriving, out])
    expect(screen.getByRole('button', { name: /Comes from Missed session/ }))
      .toBeTruthy()
    expect(
      screen.getByRole('button', { name: /Continues in Weekly class report/ }),
    ).toBeTruthy()
  })

  it('is a control of its own beside the cell, not inside the cell’s button', () => {
    const { container } = draw([out])
    const marker = container.querySelector('[data-cross-path-link="out"]')!
    expect(marker.tagName).toBe('BUTTON')
    expect(marker.closest('[data-blueprint-cell]')).toBeNull()
    expect(marker.closest('[data-blueprint-cell-shell]')).not.toBeNull()
  })

  it('jumps to the far cell, on its path, in its scenario', () => {
    draw([out])
    fireEvent.click(
      screen.getByRole('button', { name: /Continues in Weekly class report/ }),
    )
    expect(jump.fn).toHaveBeenCalledWith({
      cellId: 'cell-report',
      pathId: 'path-report',
      scenarioId: 'scenario-report',
    })
  })

  it('jumps the other way from an arrival', () => {
    draw([arriving])
    fireEvent.click(screen.getByRole('button', { name: /Comes from/ }))
    expect(jump.fn).toHaveBeenCalledWith({
      cellId: 'cell-catch-up',
      pathId: 'path-detour',
      scenarioId: 'scenario-goals',
    })
  })

  it('is reachable from the keyboard, as a button is', () => {
    draw([out])
    const marker = screen.getByRole('button', { name: /Continues in/ })
    marker.focus()
    expect(document.activeElement).toBe(marker)
    expect(marker.getAttribute('type')).toBe('button')
    expect(marker.className).toContain('focus-visible:ring-2')
  })

  it('wears the role tokens, not raw colour', () => {
    draw([out])
    const marker = screen.getByRole('button', { name: /Continues in/ })
    expect(marker.className).toContain('bg-surface-primary')
    expect(marker.className).toContain('border-border-primary')
    expect(marker.className).toContain('text-on-surface-primary')
    expect(marker.getAttribute('style')).toBeNull()
  })

  it('still names the far end where there is no editor to jump with', () => {
    jump.available = false
    draw([out])
    const marker = screen.getByRole('button', { name: /Continues in/ })
    expect(marker.getAttribute('aria-disabled')).toBe('true')
    fireEvent.click(marker)
    expect(jump.fn).not.toHaveBeenCalled()
  })

  it('says exactly where the far end is to a reader who cannot hover', () => {
    draw([out])
    const marker = screen.getByRole('button', { name: /Continues in/ })
    const described = document.getElementById(
      marker.getAttribute('aria-describedby')!,
    )
    expect(described?.textContent).toBe('Main route · Weekly class report · Week')
  })

  it('is not drawn where cells are inert — the overview and the phase rows', () => {
    const { container } = draw([out], { live: false })
    expect(container.querySelector('[data-cross-path-link]')).toBeNull()
  })

  it('is not drawn on a board that is not the one in scope', () => {
    const { container } = draw([out], { inScope: false })
    expect(container.querySelector('[data-cross-path-link]')).toBeNull()
  })

  it('draws nothing on a cell whose links stay on its path', () => {
    const { container } = draw([])
    expect(container.querySelector('[data-cross-path-links]')).toBeNull()
  })
})
