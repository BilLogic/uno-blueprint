import { useRef, type FocusEvent } from 'react'

/** A definition opens on keyboard focus; pointer focus leaves the click in control. */
export function useDefinitionFocus(open: () => void, close?: () => void) {
  const pointerFocus = useRef(false)
  return {
    onPointerDown: () => { pointerFocus.current = true },
    onPointerUp: () => { pointerFocus.current = false },
    onPointerCancel: () => { pointerFocus.current = false },
    onFocus: (event: FocusEvent<HTMLElement>) => {
      if (event.target === event.currentTarget && !pointerFocus.current) open()
    },
    onBlur: () => { pointerFocus.current = false; close?.() },
  }
}
