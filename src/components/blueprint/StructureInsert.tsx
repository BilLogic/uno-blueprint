import { Plus } from 'lucide-react'
import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { registerStructureInsert } from './structureInsertIntent'

/** A focusable gap; the entire opened slot is the action. The plus has no chrome. */
export function StructureInsert({
  orientation,
  scale = 1,
  edge = false,
  beforeEdge = false,
  extent,
  hitSize = 44,
  label,
  style,
  slotStyle,
  onClick,
  onOpenChange,
}: {
  scale?: number
  hitSize?: number
  extent?: number
  edge?: boolean
  beforeEdge?: boolean
  orientation: 'horizontal' | 'vertical'
  label: string
  style?: CSSProperties
  /** The opened preview may extend into the board; detection stays on the header. */
  slotStyle?: CSSProperties
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
  // The empty track is the clock for both painted surfaces. A boolean hover
  // must not reveal a full block while the layout is still making room.
  const progress = extent === undefined
    ? (open ? '1' : '0')
    : extent > 0 ? 'var(--structure-seam-progress, 0)' : '0'
  const trackSize = `calc(${progress} * 28px)`
  const paintedSize = `calc(${progress} * 20px)`
  const gutter = `calc(${progress} * 4px)`
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
              height: beforeEdge ? `calc(${hitSize / scale}px + ${trackSize})` : hitSize / scale,
              // Keep the original upper entry fixed as its painted slot moves
              // the divider down. The growing hit area also contains the block.
              marginTop: beforeEdge ? `calc(-${hitSize / scale}px - ${trackSize})` : edge ? 0 : -hitSize / 2 / scale,
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
        style={{
          ...(orientation === 'vertical'
            ? {
                width:
                  extent === undefined
                    ? (open ? 28 : 0)
                    : `calc(var(--structure-seam-progress, 1) * ${
                        extent / scale
                      }px)`,
                height: '100%',
                ...(edge ? { left: hitSize / 2 / scale } : {}),
              }
            : {
                height:
                  extent === undefined
                    ? (open ? 28 : 0)
                    : `calc(var(--structure-seam-progress, 1) * ${
                        extent / scale
                      }px)`,
                width: '100%',
                ...(beforeEdge ? {bottom:0} : edge ? { top: 0 } : {}),
              }),
          ...slotStyle,
        }}
        className="pointer-events-auto absolute"
      >
        <span
          data-structure-slot-fill=""
          className="pointer-events-none absolute rounded-md bg-wash-primary"
          style={{ inset: gutter, opacity: progress }}
        />
      </span>
      <span
        data-structure-trigger=""
        aria-hidden
        className="pointer-events-none absolute flex items-center justify-center overflow-hidden rounded-md border border-border-primary bg-wash-primary"
        style={{
          width: orientation === 'vertical' ? paintedSize : 'calc(100% - 16px)',
          height: orientation === 'horizontal' ? paintedSize : 'calc(100% - 8px)',
          borderWidth: `calc(${progress} * 1px)`,
          opacity: progress,
          ...(edge
            ? orientation === 'vertical'
              ? { left: `calc(${hitSize / 2 / scale}px + ${gutter})` }
              : beforeEdge ? {bottom:gutter} : { top: gutter }
            : {}),
        }}
      >
        <Plus aria-hidden className="shrink-0 text-primary" style={{
          width: 16,
          height: 16,
          opacity: `clamp(0, calc((${progress} - 0.65) / 0.35), 1)`,
        }} />
      </span>
    </button>
  )
}
