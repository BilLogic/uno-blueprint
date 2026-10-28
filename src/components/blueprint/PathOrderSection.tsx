import { useState, useRef, useId } from 'react'
import { Reorder, useDragControls, useReducedMotion } from 'framer-motion'
import { Check, ChevronDown, GripVertical } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Collapsible, CollapsibleContent } from '@/components/ui/collapsible'
import { cn } from '@/lib/utils'
import { EASE_POINTS, MOTION_MICRO_MS } from '@/lib/motion'

export type OrderItem = {
  id: string
  name: string
  position?: number
  /** Semantic lane role when this rail is a lane create draft. */
  role?: string | null
}
export type OrderPath = { id: string; name: string; items: OrderItem[] }
export type PathOrder = { pathId: string; order: string[]; moved: string[] }

/** Bounding lines + visible slice for a section-scoped lane create rail. */
export type PathOrderSectionRail = {
  start: number
  end: number
  lineAbove: string | null
  lineBelow: string | null
}

/** One controlled path membership and order editor, shared by structure panels. */
export function PathOrderSection({
  paths,
  value,
  onChange,
  item,
  defaultOrder,
  unavailable = {},
  label = 'Add to paths',
  required = false,
  /**
   * When set (lane create), the rail shows only this section of `order`, with
   * the bounding division lines labelled — not the whole path stack.
   */
  sectionForOrder,
}: {
  paths: OrderPath[]
  value: PathOrder[]
  onChange: (value: PathOrder[]) => void
  item: OrderItem
  defaultOrder: (path: OrderPath) => string[]
  unavailable?: Record<string, string>
  label?: string
  required?: boolean
  sectionForOrder?: (
    path: OrderPath,
    order: string[],
  ) => PathOrderSectionRail | null
}) {
  const requirementId=useId()
  const unticked = useRef(new Map<string, PathOrder>())
  const dragging = useRef<string | undefined>(undefined)
  const [open, setOpen] = useState<string | null | undefined>(undefined)
  const changeOrder = (pathId: string, order: string[], moved?: string) =>
    onChange(
      value.map((entry) => {
        if (entry.pathId !== pathId) return entry
        const base = paths
          .find((path) => path.id === pathId)!
          .items.map((row) => row.id)
        const current = order.filter((id) => id !== item.id)
        return {
          ...entry,
          order,
          moved: [
            ...new Set([
              ...entry.moved,
              ...(moved && moved !== item.id ? [moved] : []),
            ]),
          ].filter((id) => current.indexOf(id) !== base.indexOf(id)),
        }
      }),
    )
  const toggle = (path: OrderPath) => {
    const selected = value.some((entry) => entry.pathId === path.id)
    if (selected && value.length === 1) return
    if (selected)
      unticked.current.set(
        path.id,
        value.find((entry) => entry.pathId === path.id)!,
      )
    onChange(
      selected
        ? value.filter((entry) => entry.pathId !== path.id)
        : [
            ...value,
            unticked.current.get(path.id) ?? {
              pathId: path.id,
              order: defaultOrder(path),
              moved: [],
            },
          ],
    )
    setOpen(selected ? null : path.id)
  }
  return (
    <section
      className="space-y-2"
      aria-label={required ? label : paths.length === 1 ? 'Order' : label}
    >
      <div role="group" data-required={required || undefined} aria-describedby={required ? requirementId : undefined} aria-label={label}>
      {required ? <span id={requirementId} className="sr-only">Choose at least one path. Required.</span> : null}
      <div className="flex justify-between text-sm font-medium text-muted-foreground">
        <span>{required ? label : paths.length === 1 ? 'Order' : label}{required ? <span aria-hidden className="ml-1 text-destructive">*</span> : null}</span>
        {paths.length > 1 ? (
          <span>
            {value.length} of {paths.length}
          </span>
        ) : null}
      </div>
      {paths.map((path) => {
        const entry = value.find((entry) => entry.pathId === path.id)
        const expanded = Boolean(
          entry &&
            (paths.length === 1 ||
              (open === undefined
                ? value[0]?.pathId === path.id
                : open === path.id)),
        )
        const reason = unavailable[path.id]
        return (
          <Collapsible
            key={path.id}
            open={expanded}
            className="border-b border-muted"
          >
            {paths.length > 1 ? (
              <div className="flex items-center gap-2 py-2 text-sm">
                <label className="group/check relative grid size-4 shrink-0 place-items-center">
                  <input
                    type="checkbox"
                    className="peer absolute inset-0 z-1 size-4 cursor-pointer opacity-0 disabled:cursor-default"
                    aria-label={`Add to ${path.name}`}
                    aria-checked={Boolean(entry)}
                    required={required && Boolean(entry) && value.length === 1}
                    checked={Boolean(entry)}
                    disabled={Boolean(reason)}
                    onChange={() => toggle(path)}
                  />
                  <span
                    aria-hidden
                    className={cn(
                      'pointer-events-none grid size-4 place-items-center rounded-sm border border-input group-hover/check:border-control-hover peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-disabled:opacity-50',
                      entry &&
                        'border-primary bg-primary text-primary-foreground',
                    )}
                  >
                    {entry ? <Check className="size-3" /> : null}
                  </span>
                </label>
                <button
                  type="button"
                  className="flex min-w-0 flex-1 items-center gap-2 text-left"
                  aria-expanded={expanded}
                  aria-controls={`path-order-${path.id}`}
                  disabled={Boolean(reason)}
                  onClick={() => {
                    if (!entry) toggle(path)
                    else setOpen(expanded ? null : path.id)
                  }}
                >
                  <span className="truncate">{path.name}</span>
                  <span className="ml-auto text-muted-foreground">
                    {reason ||
                      (!expanded && entry?.moved.length
                        ? `${entry.moved.length} moved`
                        : '')}
                  </span>
                  {entry ? (
                    <ChevronDown
                      aria-hidden
                      className={cn(
                        'size-3 transition-transform ease-arrive duration-(--motion-micro) motion-reduce:transition-none',
                        expanded && 'rotate-180',
                      )}
                    />
                  ) : null}
                </button>
              </div>
            ) : null}
            <CollapsibleContent className="duration-(--motion-fade) ease-arrive">
              {entry ? (
                <div id={`path-order-${path.id}`} className="px-1 pb-3">
                  {(() => {
                    const rail =
                      sectionForOrder?.(path, entry.order) ?? null
                    const visible = rail
                      ? entry.order.slice(rail.start, rail.end + 1)
                      : entry.order
                    return (
                      <>
                        {rail?.lineAbove ? (
                          <p className="mb-2 pl-6 text-[10px] uppercase tracking-wide text-muted-foreground">
                            {rail.lineAbove}
                          </p>
                        ) : null}
                        <Reorder.Group
                          axis="y"
                          values={visible}
                          onReorder={(nextVisible) => {
                            if (!rail) {
                              changeOrder(
                                path.id,
                                nextVisible,
                                dragging.current,
                              )
                              return
                            }
                            const next = [...entry.order]
                            next.splice(
                              rail.start,
                              rail.end - rail.start + 1,
                              ...nextVisible,
                            )
                            changeOrder(path.id, next, dragging.current)
                          }}
                          className="relative ml-1 space-y-1 before:absolute before:bottom-3 before:left-2 before:top-3 before:w-px before:bg-border"
                        >
                          {visible.map((id, index) => (
                            <RailRow
                              key={id}
                              id={id}
                              name={
                                id === item.id
                                  ? item.name
                                  : path.items.find((row) => row.id === id)
                                      ?.name ?? ''
                              }
                              pathName={path.name}
                              current={id === item.id}
                              moved={entry.moved.includes(id)}
                              onDrag={() => {
                                dragging.current = id
                              }}
                              onDragEnd={() => {
                                dragging.current = undefined
                              }}
                              onMove={(direction) => {
                                const target = index + direction
                                if (target < 0 || target >= visible.length)
                                  return
                                const nextVisible = [...visible]
                                nextVisible.splice(index, 1)
                                nextVisible.splice(target, 0, id)
                                if (!rail) {
                                  changeOrder(path.id, nextVisible, id)
                                  return
                                }
                                const next = [...entry.order]
                                next.splice(
                                  rail.start,
                                  rail.end - rail.start + 1,
                                  ...nextVisible,
                                )
                                changeOrder(path.id, next, id)
                              }}
                            />
                          ))}
                        </Reorder.Group>
                        {rail?.lineBelow ? (
                          <p className="mt-2 pl-6 text-[10px] uppercase tracking-wide text-muted-foreground">
                            {rail.lineBelow}
                          </p>
                        ) : null}
                      </>
                    )
                  })()}
                  {entry.moved.length ? (
                    <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
                      <span>{entry.moved.length} moved</span>
                      <Button
                        size="sm"
                        variant="ghost"
                        type="button"
                        onClick={() => {
                          const order = path.items.map((row) => row.id)
                          order.splice(
                            Math.min(
                              entry.order.indexOf(item.id),
                              order.length,
                            ),
                            0,
                            item.id,
                          )
                          changeOrder(path.id, order)
                        }}
                      >
                        Reset order
                      </Button>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </CollapsibleContent>
          </Collapsible>
        )
      })}
      </div>
    </section>
  )
}
function RailRow({
  id,
  name,
  pathName,
  current,
  moved,
  onMove,
  onDrag,
  onDragEnd,
}: {
  id: string
  name: string
  pathName: string
  current: boolean
  moved: boolean
  onMove: (direction: number) => void
  onDrag: () => void
  onDragEnd?: () => void
}) {
  const controls = useDragControls()
  const reduced = useReducedMotion()
  return (
    <Reorder.Item
      data-order-row=""
      style={{ outline: 'none' }}
      value={id}
      draggable={false}
      dragListener={false}
      dragControls={controls}
      onDragStart={onDrag}
      onDragEnd={onDragEnd}
      transition={{
        duration: reduced ? 0 : MOTION_MICRO_MS / 1000,
        ease: EASE_POINTS.move,
      }}
      className="group/order relative flex cursor-grab touch-none items-center gap-2 rounded-md active:cursor-grabbing"
      onPointerDown={(event) => controls.start(event)}
    >
      <button
        type="button"
        aria-label={`Move ${name} in ${pathName}`}
        className={cn(
          'relative grid size-4 shrink-0 place-items-center outline-none',
          'text-muted-foreground',
        )}
        onKeyDown={(event) => {
          if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return
          event.preventDefault()
          onMove(event.key === 'ArrowUp' ? -1 : 1)
        }}
      >
        <span
          className={cn(
            'size-2.5 rounded-full border border-current bg-background group-hover/order:hidden group-focus-within/order:hidden [@media(hover:none)]:hidden',
            current && 'border-primary bg-primary',
          )}
        />
        <span className="hidden group-hover/order:block group-focus-within/order:block [@media(hover:none)]:block">
          <span className={current ? 'text-primary' : undefined}>
            <GripVertical className="size-3.5" aria-hidden />
          </span>
        </span>
      </button>
      <span
        data-order-card=""
        className={cn(
          'min-w-0 flex-1 rounded-md px-2 py-2 text-sm',
          current && 'border border-border-primary bg-wash-primary',
          !current && !moved && 'text-muted-foreground',
        )}
      >
        <span>{name}</span>
        {moved ? (
          <span className="ml-2 text-xs text-muted-foreground">Moved</span>
        ) : null}
      </span>
    </Reorder.Item>
  )
}
