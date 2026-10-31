import { beforeEach, describe, expect, it } from 'vitest'
import {
  getSharedCanvasMode,
  setSharedCanvasMode,
  setSharedCanvasModeAvailable,
} from '@/contexts/canvasModeContext'

/**
 * The permission lives on the store, not on one of its callers.
 *
 * The provider guards its own `setMode`, but the agent tool `set_canvas_mode`
 * reaches `setSharedCanvasMode` directly and is not a write tool — so a guard
 * that lived only in the provider left a view-only session able to park
 * `'design'` in the store and snap every surface into Edit on regaining access.
 */
describe('shared canvas mode', () => {
  beforeEach(() => {
    setSharedCanvasModeAvailable(true)
    setSharedCanvasMode('view')
  })

  it('accepts design when the session may write', () => {
    setSharedCanvasMode('design')
    expect(getSharedCanvasMode()).toBe('design')
  })

  it('refuses design when the session may not write', () => {
    setSharedCanvasModeAvailable(false)
    setSharedCanvasMode('design')
    expect(getSharedCanvasMode()).toBe('view')
  })

  it('clears a parked design mode the moment write access is withdrawn', () => {
    setSharedCanvasMode('design')
    setSharedCanvasModeAvailable(false)
    expect(getSharedCanvasMode()).toBe('view')
  })

  it('does not resurrect design when write access returns', () => {
    setSharedCanvasMode('design')
    setSharedCanvasModeAvailable(false)
    setSharedCanvasModeAvailable(true)
    expect(getSharedCanvasMode()).toBe('view')
  })
})

it('holds leaving Edit while an editor is deciding whether to discard', async () => {
  const { registerPanelTransitionGuard } = await import('@/lib/openPanelStore')
  setSharedCanvasModeAvailable(true)
  setSharedCanvasMode('design')
  let discard: (() => void) | undefined
  const unregister = registerPanelTransitionGuard(action => { discard = action; return false })
  try {
    setSharedCanvasMode('view')
    expect(getSharedCanvasMode()).toBe('design')
    discard!()
    expect(getSharedCanvasMode()).toBe('view')
  } finally { unregister() }
})
