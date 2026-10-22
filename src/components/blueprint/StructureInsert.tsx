import { Plus } from 'lucide-react'
import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { cn } from '@/lib/utils'

/** A focusable gap; the entire opened slot is the action. The plus has no chrome. */
export function StructureInsert({
  orientation,
  label,
  style,
  onClick,
  onOpenChange,
}: {
  orientation: 'horizontal' | 'vertical'
  label: string
  style?: CSSProperties
  onClick: (opener: HTMLButtonElement) => void
  onOpenChange?: (open: boolean) => void
}) {
  const [open, setOpen] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const notify = useRef(onOpenChange)
  useEffect(() => {
    notify.current = onOpenChange
  })
  useEffect(() => {
    notify.current?.(open)
    return () => notify.current?.(false)
  }, [open])
  useEffect(() => () => clearTimeout(timer.current), [])
  const arm = (next: boolean, delay: number) => {
    clearTimeout(timer.current)
    timer.current = setTimeout(() => setOpen(next), delay)
  }
  return (
    <button
      type="button"
      aria-label={label}
      data-structure-seam=""
      data-open={open ? '' : undefined}
      style={{
        ...style,
        ...(open
          ? orientation === 'vertical'
            ? { left: Number(style?.left ?? 0) + 17 }
            : { top: Number(style?.top ?? 0) + 17 }
          : {}),
        ...(orientation === 'vertical'
          ? { width: open ? 44 : 14 }
          : { height: open ? 44 : 14 }),
      }}
      onPointerDown={(event) => {
        event.preventDefault()
        event.stopPropagation()
      }}
      onPointerEnter={(event) => {
        if (event.pointerType !== 'touch') arm(true, 90)
      }}
      onPointerLeave={() => arm(false, 140)}
      onFocus={() => {
        clearTimeout(timer.current)
        setOpen(true)
      }}
      onBlur={() => arm(false, 140)}
      onClick={(event) => {
        event.stopPropagation()
        clearTimeout(timer.current)
        onClick(event.currentTarget)
      }}
      className={cn(
        'pointer-events-auto absolute flex appearance-none items-center justify-center rounded-md border bg-transparent p-0 text-text-primary outline-none transition-[width,height,background-color,border-color] duration-(--motion-micro) ease-arrive motion-reduce:transition-none',
        orientation === 'vertical' ? '-translate-x-1/2' : '-translate-y-1/2',
        open
          ? 'border-dashed border-primary/50 bg-primary/5 hover:border-primary focus-visible:border-solid'
          : 'border-transparent [&>svg]:opacity-0 [@media(hover:none)]:border-primary/20 [@media(hover:none)]:bg-primary/5 [@media(hover:none)]:[&>svg]:opacity-40',
      )}
    >
      <Plus aria-hidden className="pointer-events-none size-4 shrink-0" />
    </button>
  )
}
