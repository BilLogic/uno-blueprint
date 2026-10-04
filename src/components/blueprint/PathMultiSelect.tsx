import { PathSummaryTooltip } from '@/components/blueprint/PathSummaryTooltip'
import { PathKindColorKey } from '@/components/blueprint/PathKindColorKey'
import { StatusBadge } from '@/components/blueprint/StatusBadge'
import type { EntityStatus } from '@/lib/entityStatus'
import { filterToolbarButtonClass } from '@/lib/filterToolbarButton'
import { cn } from '@/lib/utils'
import type { PathKind } from '@/types/database'

export type PathOption = {
  /**
   * The path's identity key, not a row id: `${kind}:${name}`, never a uuid.
   * Selection is keyed on it, so one option can stand for paths that share a
   * name and a kind. Anything that writes to a path row wants `pathIds`
   * instead.
   */
  id: string
  name: string
  summary: string | null
  kind: PathKind
  /** How far along this route is. Absent on an option built without one. */
  status?: EntityStatus | null
  /**
   * The real path uuids folded into this option, in the order they were
   * collected. Present only on options built by `collectOverviewPathOptions`;
   * absent where a single concrete path is handed straight to the picker.
   */
  pathIds?: string[]
}

const MAX_PATHS_PER_COLUMN = 2

/**
 * The picker's columns, left to right. `other` is not a design decision: it
 * catches a kind this build does not know — a row written against a newer
 * schema — so such a path is still drawn rather than quietly dropped.
 */
const PATH_COLUMNS = ['primary', 'secondary', 'other'] as const
type PathColumn = (typeof PATH_COLUMNS)[number]
/** The columns a kind can be assigned; `other` is reached only at runtime. */
type AssignedPathColumn = Exclude<PathColumn, 'other'>

/**
 * ONE COLUMN PER KIND.
 *
 * This was two `Set`s of kinds that `groupPathsIntoColumns` filtered the same
 * list against, treating the results as disjoint. They were not: `variant`
 * was a member of both, so a variant path was drawn twice, once per column.
 * Nothing could have caught that. A `Set` absorbs a repeated member rather
 * than failing, and two independent membership tests have no overlap for a
 * compiler to look at.
 *
 * A total map has both properties the pair of sets lacked. Every kind is
 * assigned, because `Record<PathKind, …>` is exhaustive; and each is assigned
 * once, because a repeated key is a syntax the type system rejects. Putting a
 * kind in two columns is no longer wrong — it is unwriteable.
 */
export const PATH_COLUMN_BY_KIND: Record<PathKind, AssignedPathColumn> = {
  happy: 'primary',
  // The ordinary alternate route reads beside the happy path rather than among
  // the edge cases: a variant is a customer legitimately doing something else,
  // not the service going wrong.
  variant: 'primary',
  exception: 'secondary',
}

/**
 * The picker shows a path's name as authored. It used to strip a scenario-name
 * prefix so "<Scenario> Alternate Path" read as "Alternate Path" — a rule that
 * only held for one organisation's naming habit and silently truncated any
 * path legitimately starting with those words.
 */
export function formatPathPickerLabel(name: string): string {
  return name
}

function chunkPaths<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = []
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size))
  }
  return chunks
}

/**
 * Partitions the picker's paths into columns: happy and variant paths stack in
 * the left column(s), exception paths in the right. Every path lands in
 * exactly one column, because each is assigned a column once, by its kind —
 * rather than offered to each column's membership test in turn.
 */
export function groupPathsIntoColumns(paths: PathOption[]): PathOption[][] {
  const byColumn: Record<PathColumn, PathOption[]> = {
    primary: [],
    secondary: [],
    other: [],
  }

  for (const path of paths) {
    byColumn[PATH_COLUMN_BY_KIND[path.kind] ?? 'other'].push(path)
  }

  // `chunkPaths` never yields an empty chunk, so a column no path landed in
  // contributes nothing here and needs no filtering out.
  return PATH_COLUMNS.flatMap((column) =>
    chunkPaths(byColumn[column], MAX_PATHS_PER_COLUMN),
  )
}

type PathMultiSelectProps = {
  paths: PathOption[]
  selectedPathIds: string[]
  onToggle: (pathId: string) => void
  className?: string
  layout?: 'horizontal' | 'vertical' | 'bar' | 'notion' | 'toolbar'
  label?: string
  hideLabel?: boolean
}

function PathNotionToggle({
  path,
  checked,
  onToggle,
}: {
  path: PathOption
  checked: boolean
  onToggle: (pathId: string) => void
}) {
  const pathLabel = formatPathPickerLabel(path.name)

  return (
    <button
      type="button"
      onClick={() => onToggle(path.id)}
      className={cn(
        'inline-flex items-center gap-2 rounded-full px-2 py-1 text-sm transition-colors duration-(--motion-micro) ease-arrive motion-reduce:transition-none',
        checked
          ? 'bg-accent font-medium text-foreground'
          : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground',
      )}
      aria-pressed={checked}
      aria-label={pathLabel}
    >
      <PathKindColorKey type={path.kind} name={path.name} />
      <PathSummaryTooltip
        summary={path.summary}
        pathName={path.name}
        side="top"
      >
        <span>{pathLabel}</span>
      </PathSummaryTooltip>
      <StatusBadge status={path.status} definition={false} />
    </button>
  )
}

/** Single-path toggle in the compact filter toolbar — swatch, label, pressed state. */
export function PathToolbarButton({
  path,
  checked,
  onToggle,
}: {
  path: PathOption
  checked: boolean
  onToggle: (pathId: string) => void
}) {
  const pathLabel = formatPathPickerLabel(path.name)

  return (
    <button
      type="button"
      onClick={() => onToggle(path.id)}
      className={filterToolbarButtonClass(checked)}
      aria-pressed={checked}
      aria-label={pathLabel}
    >
      <PathKindColorKey type={path.kind} name={path.name} />
      <PathSummaryTooltip
        summary={path.summary}
        pathName={path.name}
        side="top"
      >
        <span>{pathLabel}</span>
      </PathSummaryTooltip>
      <StatusBadge status={path.status} definition={false} />
    </button>
  )
}

function PathCheckbox({
  path,
  checked,
  onToggle,
  compact,
  dense,
}: {
  path: PathOption
  checked: boolean
  onToggle: (pathId: string) => void
  compact: boolean
  dense?: boolean
}) {
  const pathLabel = formatPathPickerLabel(path.name)
  const inputId = `path-filter-${path.id}`

  const stopEvent = (e: React.SyntheticEvent) => {
    e.stopPropagation()
  }

  return (
    <label
      htmlFor={inputId}
      className={cn(
        'inline-flex cursor-pointer items-center rounded-md transition-colors duration-(--motion-micro) ease-arrive motion-reduce:transition-none',
        dense ? 'gap-1 px-0 py-0 text-xs' : 'gap-2 text-sm',
        compact && !dense ? 'px-1 py-1' : !dense ? 'px-1 py-1' : undefined,
        checked && 'font-medium text-foreground',
        !checked && 'text-foreground',
      )}
      onPointerDown={stopEvent}
      onClick={stopEvent}
    >
      <input
        id={inputId}
        type="checkbox"
        className={cn(
          'shrink-0 rounded-md border-input accent-foreground',
          dense ? 'size-3' : 'size-4',
        )}
        checked={checked}
        onChange={() => onToggle(path.id)}
        onPointerDown={stopEvent}
        onClick={stopEvent}
        aria-label={pathLabel}
      />
      <PathKindColorKey type={path.kind} name={path.name} />
      <PathSummaryTooltip
        summary={path.summary}
        pathName={path.name}
        side="top"
      >
        <span className="min-w-0 cursor-default text-left">{pathLabel}</span>
      </PathSummaryTooltip>
      <StatusBadge status={path.status} definition={false} />
    </label>
  )
}

/** Checkbox list of a scenario's paths, used to filter what the grid draws. */
export function PathMultiSelect({
  paths,
  selectedPathIds,
  onToggle,
  className,
  layout = 'horizontal',
  label = 'Paths to view',
  hideLabel = false,
}: PathMultiSelectProps) {
  const isVertical = layout === 'vertical'
  const isBar = layout === 'bar'
  const isNotion = layout === 'notion'
  const isToolbar = layout === 'toolbar'
  // Vertical (filter popover) and badge layouts stay one column; only the
  // horizontal picker splits the kinds into side-by-side columns, by
  // `PATH_COLUMN_BY_KIND`.
  const columns =
    isVertical || isBar || isNotion || isToolbar
      ? [paths]
      : groupPathsIntoColumns(paths)

  return (
    <div
      className={cn('shrink-0', className)}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      {!hideLabel && (
        <p
          className={cn(
            'text-sm font-medium text-foreground',
            isVertical && 'mb-2',
            (isBar || isNotion || isToolbar) && 'sr-only',
          )}
        >
          {label}
        </p>
      )}
      <div
        className={cn(
          'flex items-start gap-x-4',
          isVertical ? 'flex-col gap-y-2' : 'flex-row',
          layout === 'horizontal' &&
            'mt-1 gap-y-2 rounded-lg border border-border bg-background px-3 py-2',
          isBar && 'flex-row items-center gap-x-3 gap-y-0',
          isNotion && 'flex-row flex-wrap gap-2',
          isToolbar && 'flex-row flex-wrap items-center gap-2',
        )}
      >
        {columns.map((column, columnIndex) => (
          <div
            key={column.map((path) => path.id).join('-')}
            className={cn(
              'flex min-w-0 flex-col gap-2',
              (isBar || isNotion || isToolbar) &&
                'flex-row flex-wrap items-center gap-2',
            )}
            aria-label={
              columnIndex === 0 ? undefined : `Path column ${columnIndex + 1}`
            }
          >
            {column.map((path) =>
              isToolbar ? (
                <PathToolbarButton
                  key={path.id}
                  path={path}
                  checked={selectedPathIds.includes(path.id)}
                  onToggle={onToggle}
                />
              ) : isNotion ? (
                <PathNotionToggle
                  key={path.id}
                  path={path}
                  checked={selectedPathIds.includes(path.id)}
                  onToggle={onToggle}
                />
              ) : (
                <PathCheckbox
                  key={path.id}
                  path={path}
                  checked={selectedPathIds.includes(path.id)}
                  onToggle={onToggle}
                  compact={!isVertical}
                  dense={isBar}
                />
              ),
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
