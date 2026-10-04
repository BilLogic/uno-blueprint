import {
  blueprintLaneAttrs,
  type BlueprintLaneRole,
} from '@/lib/blueprintCellStyle'
import { cn } from '@/lib/utils'

type CellKind = 'solid' | 'gap'

/**
 * Three lanes, four steps. The lanes are real roles so each row wears the
 * colour the board gives that role; the gaps are spread so no row and no
 * column is all gap, which keeps the picture reading as "a blueprint with
 * pieces still to come" rather than as a broken grid.
 */
const ROWS: ReadonlyArray<{
  role: BlueprintLaneRole
  cells: readonly CellKind[]
}> = [
  { role: 'actor', cells: ['solid', 'solid', 'gap', 'solid'] },
  { role: 'frontstage-action', cells: ['solid', 'gap', 'solid', 'solid'] },
  { role: 'backstage-action', cells: ['solid', 'solid', 'solid', 'gap'] },
]

/** Skeleton bars vary a little in length, as cell titles do. */
const BAR_WIDTHS = ['w-3/5', 'w-2/5', 'w-1/2'] as const

const SIZES = {
  lg: {
    rows: 'gap-2',
    row: 'gap-3',
    head: 'w-20 gap-2',
    square: 'size-3',
    label: 'h-2 w-12',
    cells: 'gap-2',
    cell: 'h-6 w-14 rounded-lg px-2',
    bar: 'h-1',
  },
  sm: {
    rows: 'gap-1',
    row: 'gap-2',
    head: 'w-12 gap-1',
    // Never under 12px: the radius rung would round a smaller square into
    // a dot, and a dot is a path's mark on this board, not a lane's.
    square: 'size-3',
    label: 'h-1 w-8',
    cells: 'gap-1',
    cell: 'h-5 w-10 rounded-lg px-2',
    bar: 'h-1',
  },
} as const

/**
 * The mini-blueprint: the shorthand for a blueprint the cover figures use,
 * drawn here from theme tokens so it follows the theme instead of being a
 * printed plate. Each row is a lane — a lane-colour square and a label bar —
 * then cells holding one skeleton bar each. A cell is an outline, not a fill,
 * as on the cover figures: the line is the lane's ring token, the step the
 * board draws a cell's ring in, so it follows light and dark and a
 * deployment's own lane palette. A cell's skeleton bar is translucent ink,
 * as the figures' bars are: with no fill behind it, a lane-coloured bar would
 * sit on the page at under 2:1. A gap dashes in the same lane line, because
 * dashed means not yet and the lane says where it is missing; it holds no
 * bar, since nothing is there to label.
 *
 * Decoration only: hidden from assistive tech, and still, so it never pulls
 * the eye from the copy beside it that says what to do next.
 */
export function MiniBlueprintIllustration({
  size,
  className,
}: {
  /** `lg` on the open canvas; `sm` inside a panel, phase frame or drawer. */
  size: 'lg' | 'sm'
  className?: string
}) {
  const s = SIZES[size]

  return (
    <div
      aria-hidden="true"
      data-mini-blueprint={size}
      className={cn('flex shrink-0 flex-col', s.rows, className)}
    >
      {ROWS.map((row, r) => (
        <div
          key={row.role}
          {...blueprintLaneAttrs(row.role)}
          className={cn('flex items-center', s.row)}
        >
          <div className={cn('flex shrink-0 items-center', s.head)}>
            <span
              data-mini-blueprint-lane-square=""
              className={cn(
                'shrink-0 rounded-sm bg-[color:var(--ring-blueprint-cell)]',
                s.square,
              )}
            />
            <span
              className={cn(
                'rounded-full bg-[color:var(--border-strong)]',
                s.label,
              )}
            />
          </div>
          <div className={cn('flex', s.cells)}>
            {row.cells.map((kind, i) =>
              kind === 'solid' ? (
                <span
                  key={i}
                  data-mini-blueprint-cell="solid"
                  className={cn(
                    'flex items-center border border-[color:var(--ring-blueprint-cell)] bg-transparent',
                    s.cell,
                  )}
                >
                  <span
                    data-mini-blueprint-bar=""
                    className={cn(
                      'rounded-full bg-foreground/15',
                      s.bar,
                      BAR_WIDTHS[(r + i) % BAR_WIDTHS.length],
                    )}
                  />
                </span>
              ) : (
                <span
                  key={i}
                  data-mini-blueprint-cell="gap"
                  className={cn(
                    'border border-dashed border-[color:var(--ring-blueprint-cell)]',
                    s.cell,
                  )}
                />
              ),
            )}
          </div>
        </div>
      ))}
    </div>
  )
}
