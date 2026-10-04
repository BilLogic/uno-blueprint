// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { CanvasPhaseSection } from '@/components/editor/CanvasPhaseSection'
import { rulesDeclaring } from '@/lib/tokenModel'

/*
 * The ring is the frame's `::after`: the camera flight writes an inline
 * `transition: none` on the frame itself, which would snap a ring drawn there.
 */
const SELECTED_RING =
  '[data-canvas-phase-section][data-phase-selected] > [data-phase-frame]::after'
const REDUCED_MOTION = '@media (prefers-reduced-motion: reduce)'

/** The one value `property` takes on the selected ring, in a given context. */
function selectedRing(property: string, context: readonly string[] = []) {
  const found = rulesDeclaring(property).filter(
    (rule) =>
      rule.file === 'blueprint.css' &&
      rule.selector === SELECTED_RING &&
      rule.context.includes(REDUCED_MOTION) === context.includes(REDUCED_MOTION),
  )
  if (found.length !== 1)
    throw new Error(
      `expected one \`${property}\` on the selected ring, found ${found.length}`,
    )
  return found[0].value
}

beforeAll(() => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  )
})

afterEach(cleanup)

/*
 * A click on a phase frame selects it before the camera has moved anywhere,
 * so the frame has to say so: a brand edge and a soft brand ring, the site's
 * selected state.
 */
describe('the selected phase frame', () => {
  it('marks the selected phase, and only that one', () => {
    const { container } = render(
      <>
        <CanvasPhaseSection title="Onboarding" ordinal={1} phaseId="a" selected>
          <div />
        </CanvasPhaseSection>
        <CanvasPhaseSection title="Renewal" ordinal={2} phaseId="b">
          <div />
        </CanvasPhaseSection>
      </>,
    )

    const [first, second] = container.querySelectorAll<HTMLElement>(
      '[data-canvas-phase-section]',
    )
    expect(first.hasAttribute('data-phase-selected')).toBe(true)
    expect(second.hasAttribute('data-phase-selected')).toBe(false)
  })

  it('draws a brand edge and a soft brand ring', () => {
    expect(selectedRing('border-color')).toBe('var(--brand)')
    expect(selectedRing('box-shadow')).toMatch(
      /^0 0 0 3px color-mix\(in oklab, var\(--brand\) 1[3-9]%, transparent\)$/,
    )
  })

  it('arrives on the arrive curve, and at once under reduced motion', () => {
    expect(selectedRing('transition-timing-function')).toBe(
      'var(--ease-arrive)',
    )
    expect(selectedRing('transition-duration')).toBe('var(--motion-micro)')
    expect(selectedRing('transition', [REDUCED_MOTION])).toBe('none')
  })

  it('keeps keyboard focus on the ring token, apart from the brand', () => {
    const { container } = render(
      <CanvasPhaseSection
        title="Onboarding"
        ordinal={1}
        phaseId="a"
        onNavigate={() => {}}
      >
        <div />
      </CanvasPhaseSection>,
    )
    const section = container.querySelector<HTMLElement>(
      '[data-canvas-phase-section]',
    )
    expect(section?.className).toContain('focus-visible:ring-ring')
    expect(section?.className).not.toMatch(/focus-visible:ring-brand/)
  })
})
