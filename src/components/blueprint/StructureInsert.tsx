import { Plus } from 'lucide-react'
import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { cn } from '@/lib/utils'
import { registerStructureInsert } from './structureInsertIntent'

/** A focusable gap; the entire opened slot is the action. The plus has no chrome. */
export function StructureInsert({
  orientation,
  scale = 1,
  edge = false,
  extent,
  hitSize = 44,
  label,
  style,
  onClick,
  onOpenChange,
}: {
  scale?: number
  hitSize?: number
  extent?: number
  edge?: boolean
  orientation: 'horizontal' | 'vertical'
  label: string
  style?: CSSProperties
  onClick: (opener: HTMLButtonElement) => void
  onOpenChange?: (open: boolean) => void
}) {
  const [open, setOpen] = useState(false)
  const button = useRef<HTMLButtonElement>(null)
  const intent = useRef<ReturnType<typeof registerStructureInsert> | null>(null)
  const create = useRef(onClick)
  const notify = useRef(onOpenChange)
  useEffect(() => {
    notify.current = onOpenChange
    create.current = onClick
  })
  useEffect(() => {
    notify.current?.(open)
    return () => notify.current?.(false)
  }, [open, scale])
  useEffect(() => {
    const element = button.current!
    const registered = registerStructureInsert({
      element,
      orientation,
      change: setOpen,
      create: () => create.current(element),
    })
    intent.current = registered
    return () => {
      registered.dispose()
      intent.current = null
    }
  }, [orientation])
  return (
    <button
      ref={button}
      type="button"
      aria-label={label}
      data-structure-seam=""
      data-open={open ? '' : undefined}
      style={{
        ...style,
        ...(orientation === 'vertical'
          ? { width: hitSize / scale, marginLeft: -hitSize / 2 / scale }
          : {
              height: hitSize / scale,
              marginTop: edge ? 0 : -hitSize / 2 / scale,
            }),
      }}
      onPointerDown={(event) => {
        event.preventDefault()
        event.stopPropagation()
      }}
      onPointerEnter={(event) => {
        if (event.pointerType !== 'touch') intent.current?.enter(event)
      }}
      onPointerLeave={(event) => intent.current?.leave(event)}
      onFocus={() => intent.current?.focus()}
      onBlur={() => intent.current?.blur()}
      onClick={(event) => {
        event.stopPropagation()
        onClick(event.currentTarget)
      }}
      className="pointer-events-auto absolute flex appearance-none items-center justify-center border-0 bg-transparent p-0 outline-none"
    >
      <span
        data-structure-slot=""
        aria-hidden
        style={
          orientation === 'vertical'
            ? {
                width:
                  extent === undefined
                    ? (open ? 34 : 0) / scale
                    : `calc(var(--structure-seam-progress, 1) * ${
                        extent / scale
                      }px)`,
                height: '100%',
                ...(edge ? { left: hitSize / 2 / scale } : {}),
              }
            : {
                height:
                  extent === undefined
                    ? (open ? 34 : 0) / scale
                    : `calc(var(--structure-seam-progress, 1) * ${
                        extent / scale
                      }px)`,
                width: '100%',
                ...(edge ? { top: 0 } : {}),
              }
        }
        className={cn(
          'pointer-events-auto absolute rounded-md border border-dashed border-border-primary bg-wash-primary transition-opacity duration-(--motion-micro) ease-arrive motion-reduce:transition-none',
          open || extent ? 'opacity-100' : 'opacity-0',
        )}
      />
      <span
        className={cn(
          'pointer-events-none relative shrink-0',
          !open && 'opacity-0 [@media(hover:none)]:opacity-40',
        )}
        style={{
          width: 16 / scale,
          height: 16 / scale,
          ...(edge
            ? orientation === 'vertical'
              ? { left: 17 / scale }
              : { top: (17 - hitSize / 2) / scale }
            : {}),
        }}
      >
        <Plus aria-hidden className="size-full text-primary" />
      </span>
    </button>
  )
}
