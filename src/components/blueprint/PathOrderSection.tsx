import { useState, useRef, useId, useLayoutEffect, type ReactNode, type RefObject } from 'react'
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

// The database refusal remains authoritative. This hint explains how to
// enable the disabled action without duplicating the server's refusal text.
const LAST_PATH_HINT = 'Add another path before taking this step off this one.'
const POLICIES = {
  create: {
    currentOrder: (order: string[], id: string) =>
      order.filter((row) => row !== id),
    marksMoved: (id: string, itemId: string) => id !== itemId,
    remembersUnticked: true,
    autoExpandSingle: true,
    alwaysShowPath: false,
    lastPathReason: undefined,
    actionLabel: (name: string, _selected: boolean) => `Add to ${name}`,
  },
  edit: {
    currentOrder: (order: string[], _id: string) => order,
    marksMoved: (_id: string, _itemId: string) => true,
    remembersUnticked: false,
    autoExpandSingle: false,
    alwaysShowPath: true,
    lastPathReason: LAST_PATH_HINT,
    actionLabel: (name: string, selected: boolean) =>
      `${selected ? 'Take off' : 'Add to'} ${name}`,
  },
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
  mode = 'create',
  membership = true,
  disabled = false,
  onCommit,
  onDragStateChange,
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
  mode?: 'create' | 'edit'
  membership?: boolean
  disabled?: boolean
  onCommit?: (value: PathOrder[]) => void
  onDragStateChange?: (dragging: boolean) => void
}) {
  const policy = POLICIES[mode]
  const heading =
    required || policy.alwaysShowPath || paths.length !== 1 ? label : 'Order'
  const requirementId = useId()
  const latest = useRef(value)
  useLayoutEffect(() => {
    latest.current = value
  }, [value])
  const unticked = useRef(new Map<string, PathOrder>())
  const dragging = useRef<string | undefined>(undefined)
  const [open, setOpen] = useState<string | null | undefined>(undefined)
  const changeOrder = (
    pathId: string,
    order: string[],
    moved?: string,
    commit = false,
  ) => {
    if (disabled) return
    const next = value.map((entry) => {
      if (entry.pathId !== pathId) return entry
      const base = paths
        .find((path) => path.id === pathId)!
        .items.map((row) => row.id)
      const current = policy.currentOrder(order, item.id)
      return {
        ...entry,
        order,
        moved: [
          ...new Set([
            ...entry.moved,
            ...(moved && policy.marksMoved(moved, item.id) ? [moved] : []),
          ]),
        ].filter((id) => current.indexOf(id) !== base.indexOf(id)),
      }
    })
    latest.current = next
    onChange(next)
    if (commit) onCommit?.(next)
  }
  const toggle = (path: OrderPath) => {
    if (disabled || !membership || dragging.current) return
    const selected = value.some((entry) => entry.pathId === path.id)
    if (selected && value.length === 1) return
    if (selected && policy.remembersUnticked)
      unticked.current.set(
        path.id,
        value.find((entry) => entry.pathId === path.id)!,
      )
    const next = selected
      ? value.filter((entry) => entry.pathId !== path.id)
      : [
          ...value,
          (policy.remembersUnticked
            ? unticked.current.get(path.id)
            : undefined) ?? {
            pathId: path.id,
            order: defaultOrder(path),
            moved: [],
          },
        ]
    latest.current = next
    onChange(next)
    onCommit?.(next)
    setOpen(selected ? null : path.id)
  }
  return (
    <section className="space-y-2" aria-label={heading}>
      <div
        role="group"
        data-required={required || undefined}
        aria-describedby={required ? requirementId : undefined}
        aria-label={label}
      >
        {required ? (
          <span id={requirementId} className="sr-only">
            Choose at least one path. Required.
          </span>
        ) : null}
        <div className="flex justify-between text-sm font-medium text-muted-foreground">
          <span>
            {heading}
            {required ? (
              <span aria-hidden className="ml-1 text-destructive">
                *
              </span>
            ) : null}
          </span>
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
              ((policy.autoExpandSingle && paths.length === 1) ||
                (open === undefined
                  ? value[0]?.pathId === path.id
                  : open === path.id)),
          )
          const reason = unavailable[path.id]
          const lastPathReason =
            membership && entry && value.length === 1
              ? policy.lastPathReason
              : undefined
          return (
            <Collapsible
              key={path.id}
              open={expanded}
              className="border-b border-muted"
            >
              {paths.length > 1 || policy.alwaysShowPath ? (
                <div className="flex items-center gap-2 py-2 text-sm">
                  {membership ? (
                    <label className="group/check relative grid size-4 shrink-0 place-items-center">
                      <input
                        type="checkbox"
                        className="peer absolute inset-0 z-1 size-4 cursor-pointer opacity-0 disabled:cursor-default"
                        aria-label={policy.actionLabel(
                          path.name,
                          Boolean(entry),
                        )}
                        aria-checked={Boolean(entry)}
                        required={
                          required && Boolean(entry) && value.length === 1
                        }
                        checked={Boolean(entry)}
                        disabled={disabled || Boolean(reason || lastPathReason)}
                        aria-describedby={
                          lastPathReason
                            ? `${requirementId}-${path.id}`
                            : undefined
                        }
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
                      {lastPathReason ? (
                        <span
                          id={`${requirementId}-${path.id}`}
                          className="sr-only"
                        >
                          {lastPathReason}
                        </span>
                      ) : null}
                    </label>
                  ) : null}
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
                        (lastPathReason ? 'Required' : '') ||
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
                      const rail = sectionForOrder?.(path, entry.order) ?? null
                      const visible = rail
                        ? entry.order.slice(rail.start, rail.end + 1)
                        : entry.order
                      return (
                        <>
                          <RailDivider
                            label={rail ? rail.lineAbove ?? 'Top of the board' : 'Beginning'}
                          />
                          <OrderRail
                            pathId={path.id}
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
                          >
                            {(bounds) => visible.map((id, index) => (
                              <RailRow
                                key={id}
                                bounds={bounds}
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
                                  onDragStateChange?.(true)
                                }}
                                disabled={disabled}
                                onDragEnd={() => {
                                  dragging.current = undefined
                                  onCommit?.(latest.current)
                                  onDragStateChange?.(false)
                                }}
                                onMove={(direction) => {
                                  if (dragging.current) return
                                  const target = index + direction
                                  if (target < 0 || target >= visible.length)
                                    return
                                  const nextVisible = [...visible]
                                  nextVisible.splice(index, 1)
                                  nextVisible.splice(target, 0, id)
                                  if (!rail) {
                                    changeOrder(path.id, nextVisible, id, true)
                                    return
                                  }
                                  const next = [...entry.order]
                                  next.splice(
                                    rail.start,
                                    rail.end - rail.start + 1,
                                    ...nextVisible,
                                  )
                                  changeOrder(path.id, next, id, true)
                                }}
                              />
                            ))}
                          </OrderRail>
                          <RailDivider
                            label={rail ? rail.lineBelow ?? 'Bottom of the board' : 'End'}
                          />
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
                          disabled={disabled}
                          onClick={() => {
                            const order = path.items.map((row) => row.id)
                            if (!order.includes(item.id))
                              order.splice(
                                Math.min(
                                  entry.order.indexOf(item.id),
                                  order.length,
                                ),
                                0,
                                item.id,
                              )
                            changeOrder(path.id, order, undefined, true)
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
/**
 * Read-only band boundary — a caption between rules, matching the board’s
 * divider grammar rather than a sortable row label.
 *
 * @param label - Line of interaction / visibility / internal interaction.
 */
function RailDivider({ label }: { label: string }) {
  return (
    <div
      role="separator"
      aria-label={label}
      className="flex items-center gap-2 py-2 pl-1 text-muted-foreground"
    >
      <span aria-hidden className="h-px min-w-2 flex-1 bg-border" />
      {/* Normal weight keeps the bound read-only beside sortable row labels. */}
      <span className="shrink-0 text-xs font-normal">{label}</span>
      <span aria-hidden className="h-px min-w-2 flex-1 bg-border" />
    </div>
  )
}

/** The flat rail ends before its read-only boundary labels. */
function OrderRail({
  pathId,
  values,
  onReorder,
  children,
}: {
  pathId: string
  values: string[]
  onReorder: (order: string[]) => void
  children: (bounds: RefObject<HTMLUListElement | null>) => ReactNode
}) {
  const bounds = useRef<HTMLUListElement>(null)
  return (
    <Reorder.Group
      ref={bounds}
      data-path-order={pathId}
      axis="y"
      values={values}
      onReorder={onReorder}
      className="relative ml-1 space-y-1 before:absolute before:bottom-3 before:left-2 before:top-3 before:w-px before:bg-border"
    >
      {children(bounds)}
    </Reorder.Group>
  )
}

function RailRow({
  bounds,
  id,
  name,
  pathName,
  current,
  moved,
  onMove,
  onDrag,
  onDragEnd,
  disabled,
}: {
  bounds: RefObject<HTMLUListElement | null>
  id: string
  name: string
  pathName: string
  current: boolean
  moved: boolean
  onMove: (direction: number) => void
  onDrag: () => void
  onDragEnd?: () => void
  disabled: boolean
}) {
  const controls = useDragControls()
  const reduced = useReducedMotion()
  return (
    <Reorder.Item
      data-order-row=""
      data-order-current={current ? '' : undefined}
      style={{ outline: 'none' }}
      value={id}
      draggable={false}
      dragListener={false}
      dragConstraints={bounds}
      dragElastic={0}
      dragMomentum={false}
      dragControls={controls}
      onDragStart={onDrag}
      onDragEnd={onDragEnd}
      transition={{
        duration: reduced ? 0 : MOTION_MICRO_MS / 1000,
        ease: EASE_POINTS.move,
      }}
      className={cn(
        'group/order relative flex touch-none items-center gap-2 rounded-md py-2',
        !disabled && 'cursor-grab active:cursor-grabbing',
      )}
      onPointerDown={(event) => {
        if (!disabled) controls.start(event)
      }}
    >
      <button
        type="button"
        aria-label={`Move ${name} in ${pathName}`}
        disabled={disabled}
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
            'size-2 rounded-full border bg-background group-hover/order:hidden group-focus-within/order:hidden [@media(hover:none)]:hidden',
            current ? 'border-foreground' : 'border-current',
          )}
        />
        <span className="hidden group-hover/order:block group-focus-within/order:block [@media(hover:none)]:block">
          <GripVertical className="size-3.5" aria-hidden />
        </span>
      </button>
      <span
        data-order-card=""
        className={cn(
          'min-w-0 flex-1 text-sm',
          current ? 'font-medium text-foreground' : 'text-muted-foreground',
        )}
      >
        <span>{name}</span>
        {moved ? (
          <span className="ml-2 text-xs font-normal text-muted-foreground">
            Moved
          </span>
        ) : null}
      </span>
    </Reorder.Item>
  )
}
