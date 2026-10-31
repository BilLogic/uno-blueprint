// @vitest-environment jsdom
/**
 * A picked storyboard cell draws its ring and its pick-order badge outside
 * its own box: the outline sits at a 1px offset, the badge 8px past the
 * corner. The cell face already bounds its pictures — the button carries
 * the strip's max height and its own `overflow-hidden` — so a wrapper that
 * clips again adds nothing but a cut through that chrome.
 *
 * jsdom lays nothing out, so what is asserted is the cause: no element
 * between the block's shell and the cell button clips.
 */
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { CompareCellBlock } from '@/components/blueprint/CompareCellBlock'
import { getBlueprintLaneStyle } from '@/lib/blueprintTheme'
import { STORYBOARD_ROLE } from '@/lib/laneRoles'

afterEach(cleanup)

const laneStyle = getBlueprintLaneStyle(
  'Journey figures',
  'frontstage',
  STORYBOARD_ROLE,
)

describe('a storyboard cell keeps its outer chrome', () => {
  it('clips nothing between the shell and the cell button', () => {
    const { container } = render(
      <CompareCellBlock
        cellId="storyboard-step-1"
        stepIndex={0}
        laneStyle={laneStyle}
        variant="storyboard"
        storyboardPictures={[{ frame: 'front.png', label: 'Front stage' }]}
      />,
    )
    const cell = screen.getByRole('button', { name: 'Step storyboard' })

    const clipping: string[] = []
    for (
      let node = cell.parentElement;
      node && node !== container;
      node = node.parentElement
    ) {
      if (/\boverflow-(?:hidden|clip)\b/.test(node.className))
        clipping.push(node.className)
    }
    expect(clipping).toEqual([])
    // The face itself still bounds the pictures.
    expect(cell.className).toMatch(/\boverflow-hidden\b/)
  })
})
