import { useState, useRef, useEffect, type MouseEvent, type SyntheticEvent } from 'react'
import { useCanvasModeValue } from '@/contexts/canvasModeContext'
import { StructureRenameEditor } from './StructureRenameEditor'

/** Header and panel renames use the same structural operation and session inverse. */
export function useStructureRename(
  kind: 'lane' | 'step',
  id: string,
  name: string,
) {
  const mode = useCanvasModeValue()
  const clickTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
  useEffect(() => () => clearTimeout(clickTimer.current), [])
  const [container, setContainer] = useState<HTMLElement | null>(null)
  const [opener, setOpener] = useState<HTMLElement | null>(null)
  const begin = (event: SyntheticEvent<HTMLElement>) => {
    clearTimeout(clickTimer.current)
    if (mode !== 'design') return
    event.stopPropagation()
    setContainer(event.currentTarget.parentElement)
    setOpener(
      event.currentTarget.querySelector<HTMLElement>('button') ??
        event.currentTarget,
    )
  }
  const cancel = () => {
    setOpener(null)
    requestAnimationFrame(() => {
      const target = opener?.isConnected
        ? opener
        : container?.querySelector<HTMLElement>('button')
      target?.focus()
    })
  }
  return {
    begin,
    click: (event: MouseEvent<HTMLElement>, open: () => void) => {
      event.stopPropagation()
      clearTimeout(clickTimer.current)
      if (event.metaKey || event.ctrlKey || event.detail === 0 || mode !== 'design') open()
      else if (event.detail === 1) clickTimer.current = setTimeout(open, 300)
    },
    editing: opener !== null,
    editor:
      opener === null ? null : (
        <StructureRenameEditor
          kind={kind}
          id={id}
          name={name}
          onDone={cancel}
        />
      ),
  }
}
