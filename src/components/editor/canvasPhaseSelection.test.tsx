// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { CanvasPhaseSection } from '@/components/editor/CanvasPhaseSection'
import { sourceOf as read } from '@/lib/sourceTree'

/** Whitespace collapsed, so a selector reads the same however it is wrapped. */
function flat(source: string): string {
  return source.replace(/\s+/g, ' ').replace(/\( /g, '(').replace(/ \)/g, ')')
}

const blueprintCss = flat(read('styles/blueprint.css'))
const SELECTED_FRAME =
  '[data-canvas-phase-section][data-phase-selected] > [data-phase-frame]'

/** The body of the first rule whose selector list is exactly `selector`. */
function ruleBody(selector: string): string {
  const at = blueprintCss.indexOf(`${selector} {`)
  if (at < 0) throw new Error(`no rule for \`${selector}\``)
  const open = blueprintCss.indexOf('{', at)
  return blueprintCss.slice(open + 1, blueprintCss.indexOf('}', open))
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
    const body = ruleBody(SELECTED_FRAME)
    expect(body).toContain('border-color: var(--brand)')
    expect(body).toMatch(
      /box-shadow: 0 0 0 3px color-mix\(in oklab, var\(--brand\) 1[3-9]%, transparent\)/,
    )
  })

  it('arrives on the structural curve, and at once under reduced motion', () => {
    const body = ruleBody(SELECTED_FRAME)
    expect(body).toContain('transition-timing-function: var(--ease-structural)')
    expect(blueprintCss).toMatch(
      /@media \(prefers-reduced-motion: reduce\) \{ \[data-canvas-phase-section\]\[data-phase-selected\] > \[data-phase-frame\] \{ transition: none; \}/,
    )
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
