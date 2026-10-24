// @vitest-environment jsdom
import { useRef } from 'react'
import { cleanup, render } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import type { BlueprintData } from '@/types/blueprint'
import { useCanvasStructureReorder } from './useCanvasStructureReorder'

const { write, client } = vi.hoisted(() => ({
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
      expect(write).toHaveBeenCalledExactlyOnceWith(client, 'path', [
        'two',
        'one',
      ])
    else expect(write).not.toHaveBeenCalled()
  },
)
