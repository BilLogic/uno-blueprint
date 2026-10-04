import { describe, expect, it } from 'vitest'
import { sourceOf as source } from '@/lib/sourceTree'

/**
 * The canvas stacking order, as far as a file can hold it.
 *
 * This used to pin `"layer === 'forward' ? 'z-0' : 'z-[30]'"` as an exact
 * substring, which made the test the reason the arbitrary spelling survived:
 * `z-30` and `z-[30]` are the same value written two ways, and the guard
 * enforced the minority one. Every z-index in the tree is written as a bare
 * number now, and `tokenDiscipline.test.ts` holds that for the whole tree
 * rather than for the two files this one happens to read.
 *
 * What is asserted here is the relationship — a forward connector sits under
 * the cells, a back connector sits over them, and the two renderers agree with
 * each other — read out of the source rather than matched character for
 * character, so a reformat cannot break it and a reordered declaration cannot
 * hide behind it.
 *
 * These are still structural, not behavioural, and one round of work left them that way on
 * purpose. Painting order is not a fact any assertion in this process can
 * reach: jsdom does not build stacking contexts, and the z bands are Tailwind
 * classes that no stylesheet compiles here, so `getComputedStyle` answers
 * nothing about either. What that round replaced instead were the guards where
 * behaviour WAS reachable — the touch claim and the write-failure paths, both
 * of which now dispatch real events. Regressions in this file are caught by
 * looking at the board.
 */
const legacyArrows = source('components/blueprint/BlueprintDependencyArrows.tsx')
const integratedArrows = source(
  'components/blueprint/IntegratedDependencyArrows.tsx',
)
const phaseSection = source('components/editor/CanvasPhaseSection.tsx')
const phaseLoop = source('components/editor/PhaseOverviewPhaseLoopArrow.tsx')
const viewport = source('components/editor/ZoomPanViewport.tsx')

/** The `layer === 'forward' ? <a> : <b>` z pair a connector renderer picks. */
function connectorBands(file: string): { forward: number; back: number } {
  const match = /layer === 'forward' \? 'z-(\d+)' : 'z-(\d+)'/.exec(file)
  if (!match) throw new Error('no forward/back z ternary in this renderer')
  return { forward: Number(match[1]), back: Number(match[2]) }
}

/** The z band a component's class string puts a thing in. */
function band(file: string, marker: string): number {
  const line = file.split('\n').find((entry) => entry.includes(marker))
  if (!line) throw new Error(`marker not found: ${marker}`)
  const match = /\bz-(\d+)\b/.exec(line)
  if (!match) throw new Error(`no z band on: ${marker}`)
  return Number(match[1])
}

/** Cells sit here — `relative z-1` on every cell block and lane row. */
const CELL_BAND = 1

describe('canvas stacking contract', () => {
  it('keeps forward connectors below cells and back connectors above', () => {
    for (const renderer of [legacyArrows, integratedArrows]) {
      const { forward, back } = connectorBands(renderer)
      expect(forward).toBeLessThan(CELL_BAND)
      expect(back).toBeGreaterThan(CELL_BAND)
    }
  })

  it('gives both arrow renderers the same bands', () => {
    // Two renderers for one relationship: the bug this catches is one of them
    // being retuned and the other left behind.
    expect(connectorBands(legacyArrows)).toEqual(connectorBands(integratedArrows))
  })

  it('keeps phase connectors below badges and annotation tools', () => {
    const connectorBand = band(phaseSection, 'pointer-events-none absolute z-')
    expect(connectorBand).toBe(band(phaseLoop, 'overflow-visible'))
    expect(connectorBand).toBeLessThan(connectorBands(legacyArrows).back)
  })

  it('contains canvas-local layers in one stacking context', () => {
    // Without `isolate` every band above competes with the app chrome rather
    // than with the other things on the board.
    expect(viewport).toMatch(/cn\('relative isolate /)
  })

  it('keeps the error card one gutter above the zoom cluster, same shape and shadow', () => {
    const overview = source('components/editor/ServiceOverviewView.tsx')
    const shell = source('components/blueprint/panelShell.tsx')
    const zoom = source('components/editor/EditorZoomIndicator.tsx')
    expect(overview).toMatch(/absolute bottom-4 z-30/)
    expect(shell).toMatch(/fixed right-4 bottom-16 z-40/)
    expect(shell).toMatch(
      /rounded-lg border border-border bg-card[\s\S]*shadow-md/,
    )
    expect(zoom).toMatch(/rounded-lg/)
    expect(zoom).toMatch(/shadow-md/)
    expect(source('components/blueprint/panelShell.tsx')).toMatch(
      /rounded-lg border border-border bg-popover shadow-md/,
    )
  })
})
