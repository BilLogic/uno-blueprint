// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { CompareStepHeaderRow } from './CompareTrackDecorations'
vi.mock('./StepHeaderAffordance', () => ({
  StepHeaderAffordance: (props: { pathId: string; stepId: string }) => (
    <button>
      {props.pathId}:{props.stepId}
    </button>
  ),
}))
afterEach(cleanup)
it('opens the selected path rather than the first key in the track lookup', () => {
  render(
    <CompareStepHeaderRow
      pathId="selected"
      tracks={[
        {
          kind: 'column',
          key: 'review',
          label: 'Review',
          divergent: false,
          stepIdByPath: { other: 'other-step', selected: 'selected-step' },
        },
      ]}
    />,
  )
  expect(screen.getByRole('button').textContent).toBe('selected:selected-step')
})
