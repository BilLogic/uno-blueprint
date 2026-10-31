import { afterEach, expect, it, vi } from 'vitest'
import {
  registerPanelTransitionGuard,
  requestPanelTransition,
} from './openPanelStore'
let unregister = () => {}
afterEach(() => unregister())
it('holds the whole ownership transition until the draft decision allows it', () => {
  let discard: (() => void) | undefined
  unregister = registerPanelTransitionGuard((action) => {
    discard = action
    return false
  })
  const openEntity = vi.fn()
  expect(requestPanelTransition(openEntity)).toBe(false)
  expect(openEntity).not.toHaveBeenCalled()
  discard!()
  expect(openEntity).toHaveBeenCalledTimes(1)
})
