import { BLUEPRINT_INSERT_HIT_HALF } from '@/lib/blueprintLayout'
import { useLayoutEffect, useState, type RefObject } from 'react'
import { Plus } from 'lucide-react'
import { IconTooltip } from '@/components/editor/IconTooltip'
import { useAtScenarioLevel } from '@/contexts/EditorContext'
import { useCanvasModeValue } from '@/contexts/canvasModeContext'
import { useCellPick } from '@/contexts/cellPickContext'
import { useSupabase } from '@/contexts/SupabaseProvider'
import { addStep } from '@/lib/authoringRpc'
import { reportWriteFailure } from '@/lib/writeFailures'

type Step = { id: string; name: string }
type Column = { left: number; width: number }

/**
 * Column handles above the grid, in Design mode only.
 *
 * The blueprint has never rendered step names as a header row — steps exist
 * only as column positions for cells — so there was nothing to click to select
 * a column the way a lane label selects a lane. This renders only while Design
 * mode is on, so a reader's view is untouched.
 *
 * **Positions are measured, not computed**, because the compare grid lays out
 * on CSS subgrid with each path in its own column: there is no single constant
 * to reuse. `offsetLeft`/`offsetWidth` rather than `getBoundingClientRect`, so
 * the canvas zoom transform does not have to be tracked.
 *
 * **No dependency array on the measuring effect.** The grid re-renders for
 * reasons this component cannot enumerate — path toggles, lane collapse,
 * walkthrough state — and a stale measurement is a handle floating over the
 * wrong column. Re-measuring every render is a handful of `offsetLeft` reads,
 * and the equality check below stops it from looping.
 */
export function BlueprintColumnHandles({
  steps,
  bodyRef,
  pathId,
}: {
  steps: Step[]
  bodyRef: RefObject<HTMLDivElement | null>
  /** The path these columns belong to. Absent disables inserting. */
  pathId?: string
}) {
  const mode = useCanvasModeValue()
  const atScenarioLevel = useAtScenarioLevel()
  const pick = useCellPick()
  const { client, canWrite } = useSupabase()
  const [columns, setColumns] = useState<Column[]>([])
  const [bodyHeight, setBodyHeight] = useState(0)
  const [busyAt, setBusyAt] = useState<number | null>(null)
  // Scenario level only: at the overview twenty blueprints render at 6%
  // zoom, and an insert handle there is an unaimed weapon.
  const active = mode === 'design' && pick !== null && atScenarioLevel

  // No dependency array, deliberately.
  //
  // Every dependency-array variant of this measured nothing: the grid remounts
  // this subtree when Design mode toggles (the selection provider changes
  // element type at that position), and with deps the effect's one run landed
  // where the measurement was not yet meaningful. Running on every render and
  // committing only real changes is what actually works here, and it is also
  // what keeps handles aligned when the grid reflows for reasons this
  // component cannot enumerate — path toggles, lane collapse, walkthroughs.
  //
  // The equality check below is load-bearing: without it, a fresh array every
  // run sets state every run, which crashed the subtree in an update loop and
  // read as "the handles don't render at all".
  //
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useLayoutEffect(() => {
    if (!active) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- guarded
      if (columns.length > 0) setColumns([])
      return
    }
    const body = bodyRef.current
    if (!body) return

    const measured = steps.flatMap<Column>((_, stepIndex) => {
      const cell = body.querySelector(
        `[data-blueprint-cell-anchor][data-step-index="${stepIndex}"]`,
      )
      if (!(cell instanceof HTMLElement)) return []

      // Accumulate to the column body: the offsetParent chain may include
      // positioned wrappers between the cell and it.
      let left = 0
      let node: HTMLElement | null = cell
      while (node && node !== body) {
        left += node.offsetLeft
        node = node.offsetParent instanceof HTMLElement ? node.offsetParent : null
      }
      return [{ left, width: cell.offsetWidth }]
    })

    const changed =
      measured.length !== columns.length ||
      measured.some(
        (column, index) =>
          column.left !== columns[index]?.left ||
          column.width !== columns[index]?.width,
      )
    if (changed) setColumns(measured)
    if (body.offsetHeight !== bodyHeight) setBodyHeight(body.offsetHeight)
  })

  /**
   * Where a new column could go: before the first, between each pair, after
   * the last. `at_position` is the index the new step takes, so boundary `i`
   * and position `i` are the same number.
   */
  const boundaries = columns.map((column, index) => {
    const previous = columns[index - 1]
    const x = previous
      ? (previous.left + previous.width + column.left) / 2
      : column.left
    return { at: index, x }
  })
  const last = columns[columns.length - 1]
  if (last) boundaries.push({ at: columns.length, x: last.left + last.width })

  const insertable = canWrite && client !== null && pathId !== undefined

  const insertAt = async (at: number) => {
    if (!client || !pathId || busyAt !== null) return
    setBusyAt(at)
    try {
      // Unnamed on purpose. A blank trailing column is always a valid grid and
      // is named in place on the canvas; a dialog here would be a modal asking
      // for the one thing that is easiest to type where it lands.
      await addStep(client, { pathId, name: '', atPosition: at })
    } catch (error) {
      reportWriteFailure('The step was not added', error)
    } finally {
      setBusyAt(null)
    }
  }

  if (!active || columns.length === 0) return null

  return (
    <div
      className="pointer-events-none absolute inset-x-0 top-0 z-30"
      data-blueprint-column-handles=""
    >
      {insertable
        ? boundaries.map((boundary) => (
            <IconTooltip
              key={`insert-${boundary.at}`}
              label={
                boundary.at === 0
                  ? 'Insert a step before this one'
                  : boundary.at === columns.length
                    ? 'Add a step at the end'
                    : 'Insert a step here'
              }
            >
              <button
                type="button"
                aria-label={`Insert a step at position ${boundary.at + 1}`}
                disabled={busyAt !== null}
                onClick={(event) => {
                  event.stopPropagation()
                  void insertAt(boundary.at)
                }}
                className="group/insert pointer-events-auto absolute z-40 flex justify-center"
                style={{
                  left: boundary.x - BLUEPRINT_INSERT_HIT_HALF,
                  width: BLUEPRINT_INSERT_HIT_HALF * 2,
                  top: -32,
                  height: bodyHeight + 32,
                }}
              >
                {/* The line is the preview: it shows exactly where the column
                    lands, full height, before anything is written. */}
                <span
                  aria-hidden
                  className="absolute inset-y-0 w-px bg-primary opacity-0 transition-opacity duration-(--motion-micro) ease-arrive motion-reduce:transition-none group-hover/insert:opacity-100 group-focus-visible/insert:opacity-100"
                />
                <span
                  aria-hidden
                  className="absolute top-0 grid size-4 place-items-center rounded-full bg-primary text-primary-foreground opacity-0 shadow-sm transition-opacity duration-(--motion-micro) ease-arrive motion-reduce:transition-none group-hover/insert:opacity-100 group-focus-visible/insert:opacity-100"
                >
                  <Plus className="size-2.5" />
                </span>
              </button>
            </IconTooltip>
          ))
        : null}

      {columns.map((column, stepIndex) => (
        <IconTooltip
          key={steps[stepIndex]?.id ?? stepIndex}
          label={`Select the ${steps[stepIndex]?.name ?? 'step'} step`}
        >
          <button
            type="button"
            aria-label={`Select the ${steps[stepIndex]?.name ?? 'step'} step`}
            onClick={(event) => {
              // Scoped to *this* column's blueprint, not the whole canvas: the
              // overview shows every scenario at once, and a handle that
              // selected step 1 across all of them would be selecting cells the
              // user cannot even see.
              const body = bodyRef.current
              if (!body) return
              const cells = Array.from(
                body.querySelectorAll(
                  `[data-blueprint-cell][data-blueprint-cell-interactive][data-step-index="${stepIndex}"]`,
                ),
              )
                .map((cell) => cell.getAttribute('data-blueprint-cell'))
                .filter((id): id is string => id !== null)
              if (cells.length === 0) return
              event.stopPropagation()
              pick.pickMany(cells, event.shiftKey ? 'toggle' : 'add')
            }}
            className="pointer-events-auto absolute truncate rounded-md border border-dashed border-muted bg-card/90 px-2 py-1 text-xs font-medium text-muted-foreground shadow-sm transition-colors duration-(--motion-micro) ease-arrive motion-reduce:transition-none hover:border-primary hover:text-foreground"
            style={{ left: column.left, width: column.width, top: -32 }}
          >
            {steps[stepIndex]?.name ?? `Step ${stepIndex + 1}`}
          </button>
        </IconTooltip>
      ))}
    </div>
  )
}
