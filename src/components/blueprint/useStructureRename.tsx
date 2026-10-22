import { useState, type SyntheticEvent } from 'react'
import { useCanvasModeValue } from '@/contexts/canvasModeContext'
import { StructureRenameEditor } from './StructureRenameEditor'

/** Header and panel renames use the same structural operation and session inverse. */
export function useStructureRename(
  kind: 'lane' | 'step',
  id: string,
  name: string,
) {
  const mode = useCanvasModeValue()
  const [container, setContainer] = useState<HTMLElement | null>(null)
  const [opener, setOpener] = useState<HTMLElement | null>(null)
  const begin = (event: SyntheticEvent<HTMLElement>) => {
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
