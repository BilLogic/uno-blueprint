import { Plus } from 'lucide-react'
import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { cn } from '@/lib/utils'

/** A focusable gap; the entire opened slot is the action. The plus has no chrome. */
export function StructureInsert({
  orientation,
  scale = 1,
  label,
  style,
  onClick,
  onOpenChange,
}: {
  scale?: number
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
  }, [open, scale])
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
        ...(orientation === 'vertical'
          ? { width: (open ? 34 : 12) / scale }
          : { height: (open ? 34 : 12) / scale }),
      }}
      onPointerDown={(event) => {
        event.preventDefault()
        event.stopPropagation()
      }}
      onPointerEnter={(event) => {
        if (event.pointerType !== 'touch') arm(true, 90)
      }}
      onPointerLeave={(event) => {
        if (event.currentTarget.ownerDocument.activeElement !== event.currentTarget) arm(false,140)
      }}
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
        'pointer-events-auto absolute flex appearance-none items-center justify-center rounded-md border bg-transparent p-0 outline-none transition-[width,height,background-color,border-color] duration-(--motion-micro) ease-arrive motion-reduce:transition-none',
        open
          ? 'border-dashed border-border-primary bg-wash-primary hover:border-primary focus-visible:border-solid'
          : 'border-transparent [&_svg]:opacity-0 [@media(hover:none)]:border-primary/20 [@media(hover:none)]:bg-primary/5 [@media(hover:none)]:[&_svg]:opacity-40',
      )}
    >
      <span className="pointer-events-none shrink-0" style={{width:16/scale,height:16/scale}}>
        <Plus aria-hidden className="size-full text-primary" />
      </span>
    </button>
  )
}
