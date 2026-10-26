// @vitest-environment jsdom
import { useRef } from 'react'
import {
  act,
  cleanup,
  fireEvent,
  render,
  waitFor,
} from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import type { BlueprintData } from '@/types/blueprint'
import { useCanvasStructureReorder } from './useCanvasStructureReorder'

const { write, client, success, revert } = vi.hoisted(() => ({
  success: vi.fn(),
  revert: vi.fn(async () => {}),
  write: vi.fn().mockResolvedValue(undefined),
  client: {},
}))
vi.mock('@/contexts/CanvasScaleContext', () => ({ useCanvasScale: () => 1 }))
vi.mock('@/contexts/canvasModeContext', () => ({
  useCanvasModeValue: () => 'design',
}))
vi.mock('@/contexts/EntityDetailContext', () => ({
  useEntityDetailOptional: () => null,
}))
vi.mock('@/contexts/SupabaseProvider', () => ({
  useSupabase: () => ({ client, canWrite: true }),
}))
vi.mock('@/lib/writeFailures', () => ({
  reportWriteSuccess: success,
  reportWriteFailure: vi.fn(),
}))
vi.mock('@/lib/revertChange', () => ({ executeRevert: revert }))
vi.mock('@/lib/authoringRpc', () => ({
  reorderSteps: write,
  reorderLanes: write,
}))
vi.mock('@/lib/authoringSession', () => ({
  sessionSnapshot: () => [],
  forgetChange: vi.fn(),
}))

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  write.mockClear()
})
it.each([true, false])(
  'drops saved identities only with one stacked path shown: %s',
  (single) => {
    vi.stubGlobal('CSS', { escape: (value: string) => value })
    const blueprint = {
      path: { id: 'path' },
      steps: [
        { id: 'one', name: 'Start', position: 0 },
        {
          id: 'structure-seam',
          name: 'Insertion seam',
          position: 0.5,
          seamSize: 34,
        },
        { id: 'two', name: 'Finish', position: 1 },
      ],
      lanes: [],
    } as unknown as BlueprintData
    function Board() {
      const ref = useRef<HTMLDivElement>(null)
      useCanvasStructureReorder(ref, blueprint, true, single)
      return (
        <div data-structure-board="">
          <div ref={ref}>
            {[0, 2].map((index) => (
              <div
                key={index}
                data-step-index={index}
                data-blueprint-column-header=""
              >
                <button
                  data-structure-reorder="step"
                  data-structure-id={blueprint.steps[index].id}
                >
                  {blueprint.steps[index].name}
                </button>
              </div>
            ))}
          </div>
        </div>
      )
    }
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(
      function (this: HTMLElement) {
        return new DOMRect(
          this.dataset.stepIndex === '2' ? 100 : 0,
          0,
          100,
          100,
        )
      },
    )
    const { getByText } = render(<Board />)
    const pointer = (type: string, x: number) => {
      const event = new MouseEvent(type, {
        bubbles: true,
        button: 0,
        clientX: x,
        clientY: 25,
      })
      Object.defineProperty(event, 'pointerId', { value: 1 })
      return event
    }
    getByText('Start').dispatchEvent(pointer('pointerdown', 25))
    document.dispatchEvent(pointer('pointermove', 125))
    document.dispatchEvent(pointer('pointerup', 125))
    if (single)
      expect(write).toHaveBeenCalledExactlyOnceWith(
        client,
        'path',
        ['two', 'one'],
        ['one', 'two'],
      )
    else expect(write).not.toHaveBeenCalled()
  },
)

it('marks headers busy through readback and binds Undo to its own write receipt', async () => {
  vi.stubGlobal('CSS', { escape: (s: string) => s })
  let resolve!: (value: unknown) => void
  write.mockImplementationOnce(
    () =>
      new Promise((r) => {
        resolve = r
      }),
  )
  const own = {
    id: 'own',
    fn: 'reorder_steps',
    args: {},
    revert: { fn: 'undo_structure_order', args: { snapshot: {} } },
  }
  const model = (ids: string[]) =>
    ({
      path: { id: 'path' },
      steps: ids.map((id, position) => ({ id, name: id, position })),
      lanes: [],
    } as unknown as BlueprintData)
  function Board({ ids }: { ids: string[] }) {
    const ref = useRef<HTMLDivElement>(null)
    useCanvasStructureReorder(ref, model(ids), true, true)
    return (
      <div data-structure-board="">
        <div ref={ref}>
          {ids.map((id) => (
            <button
              key={id}
              data-structure-reorder="step"
              data-structure-id={id}
            >
              {id}
            </button>
          ))}
        </div>
      </div>
    )
  }
  const view = render(<Board ids={['one', 'two', 'three']} />),
    one = view.getByText('one')
  const move = () => fireEvent.keyDown(one, { key: 'ArrowRight', altKey: true })
  move()
  expect(one.getAttribute('aria-disabled')).toBe('true')
  const count = write.mock.calls.length
  move()
  expect(write).toHaveBeenCalledTimes(count)
  await act(async () => resolve(own))
  expect(one.getAttribute('aria-disabled')).toBe('true')
  move()
  expect(write).toHaveBeenCalledTimes(count)
  await waitFor(() =>
    expect(success).toHaveBeenCalledWith(
      'Moved the one step',
      'own',
      expect.any(Function),
    ),
  )
  await success.mock.calls.at(-1)![2]()
  expect(revert).toHaveBeenLastCalledWith(client, own)
  // Another author can win before the refreshed blueprint reaches this view.
  view.rerender(<Board ids={['three', 'one', 'two']} />)
  expect(one.hasAttribute('aria-disabled')).toBe(false)
  move()
  expect(write).toHaveBeenLastCalledWith(
    client,
    'path',
    ['three', 'two', 'one'],
    ['three', 'one', 'two'],
  )
})
