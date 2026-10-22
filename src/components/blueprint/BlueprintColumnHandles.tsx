import { useStructureRename } from './useStructureRename'

import { useLayoutEffect, useState, type RefObject } from 'react'
import { useEntityDetail } from '@/contexts/EntityDetailContext'
import { StructureInsert, StructurePlaceholder } from './StructureInsert'
import { IconTooltip } from '@/components/editor/IconTooltip'
import { useAtScenarioLevel } from '@/contexts/EditorContext'
import { useCanvasModeValue } from '@/contexts/canvasModeContext'
import { useCellPick } from '@/contexts/cellPickContext'
import { useSupabase } from '@/contexts/SupabaseProvider'

type Step = {
  id: string
  name: string
  position: number
  pathId?: string
  pathName?: string
}
type Column = {
  stepIndex: number
  storedPosition: number
  left: number
  width: number
}
type Boundary = {
  stepIndex: number
  storedPosition: number | undefined
  x: number
}

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
  selectionHandles = true,
}: {
  steps: Step[]
  bodyRef: RefObject<HTMLDivElement | null>
  /** The path these columns belong to. Absent disables inserting. */
  pathId?: string
  selectionHandles?: boolean
}) {
  const mode = useCanvasModeValue()
  const atScenarioLevel = useAtScenarioLevel()
  const pick = useCellPick()
  const { client, canWrite } = useSupabase()
  const [columns, setColumns] = useState<Column[]>([])
  const [bodyHeight, setBodyHeight] = useState(0)
  const { openCreate, selection } = useEntityDetail()
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

    const measured = steps.flatMap<Column>((step, stepIndex) => {
      const cell = body.querySelector(
        `:is([data-blueprint-cell-anchor], [data-blueprint-empty-slot])[data-step-index="${stepIndex}"]`,
      )
      if (!(cell instanceof HTMLElement)) return []

      // Accumulate to the column body: the offsetParent chain may include
      // positioned wrappers between the cell and it.
      let left = 0
      let node: HTMLElement | null = cell
      while (node && node !== body) {
        left += node.offsetLeft
        node =
          node.offsetParent instanceof HTMLElement ? node.offsetParent : null
      }
      return [
        {
          stepIndex,
          storedPosition: step.position,
          left,
          width: cell.offsetWidth,
        },
      ]
    })

    const changed =
      measured.length !== columns.length ||
      measured.some(
        (column, index) =>
          column.stepIndex !== columns[index]?.stepIndex ||
          column.storedPosition !== columns[index]?.storedPosition ||
          column.left !== columns[index]?.left ||
          column.width !== columns[index]?.width,
      )
    if (changed) setColumns(measured)
    if (body.offsetHeight !== bodyHeight) setBodyHeight(body.offsetHeight)
  })

  /**
   * Where a new column could go: before the first, between each pair, after
   * the last. The array index is not a stored position: imported paths can
   * start at one or leave gaps. Each measurement retains its original step
   * index and stored position even when another step has no measurable cell.
   */
  // Measurements are state from the previous paint. A deletion can publish
  // fewer steps before the measuring effect runs again.
  const visibleColumns = columns.filter(
    (column) => steps[column.stepIndex] !== undefined,
  )
  const boundaries: Boundary[] = visibleColumns.map((column, index) => {
    const previous = visibleColumns[index - 1]
    const x =
      previous && previous.stepIndex === column.stepIndex - 1
        ? (previous.left + previous.width + column.left) / 2
        : column.left
    return {
      stepIndex: column.stepIndex,
      storedPosition: column.storedPosition,
      x,
    }
  })
  const last = visibleColumns[visibleColumns.length - 1]
  if (last?.stepIndex === steps.length - 1) {
    boundaries.push({
      stepIndex: steps.length,
      storedPosition: undefined,
      x: last.left + last.width,
    })
  }

  const insertable =
    canWrite &&
    client !== null &&
    (pathId !== undefined ||
      steps.some((step) => {
        return Boolean(step.pathId)
      }))

  const draft = selection?.draft
  if (!active || visibleColumns.length === 0) return null

  return (
    <div
      className="pointer-events-none absolute inset-x-0 top-0 z-30"
      data-blueprint-column-handles=""
    >
      {insertable
        ? boundaries.map((boundary) => {
            const target = steps[boundary.stepIndex] ?? steps[steps.length - 1]
            const targetPath = target.pathId ?? pathId!
            const previous = steps[boundary.stepIndex - 1]
            const label = previous
              ? `Add a step after ${previous.name}`
              : `Add a step before ${steps[0]?.name ?? 'the first step'}`
            return (
              <StructureInsert
                key={`insert-${boundary.stepIndex}`}
                orientation="vertical"
                label={
                  target.pathName ? `${label} in ${target.pathName}` : label
                }
                style={{ left: boundary.x, top: 16 }}
                onClick={(opener) =>
                  openCreate(
                    {
                      kind: 'step',
                      pathId: targetPath,
                      atPosition: boundary.storedPosition,
                    },
                    opener,
                  )
                }
              />
            )
          })
        : null}
      {draft?.kind === 'step' &&
      (draft.pathId === pathId ||
        steps.some(
          (step) =>
            step.pathId === (draft?.kind === 'step' ? draft.pathId : undefined),
        )) ? (
        <StructurePlaceholder
          kind="step"
          style={{
            left:
              boundaries.find(
                (boundary) =>
                  boundary.storedPosition === draft.atPosition &&
                  (pathId !== undefined ||
                    (steps[boundary.stepIndex] ?? steps[steps.length - 1])
                      .pathId === draft.pathId),
              )?.x ?? 0,
            top: 0,
            width: visibleColumns[0]?.width,
            height: bodyHeight,
          }}
        />
      ) : null}

      {selectionHandles
        ? visibleColumns.map((column) => (
            <IconTooltip
              key={steps[column.stepIndex]?.id ?? column.stepIndex}
              label={`Select the ${
                steps[column.stepIndex]?.name ?? 'step'
              } step`}
            >
              <StepSelectionName
                id={steps[column.stepIndex].id}
                name={steps[column.stepIndex].name}
                type="button"
                aria-label={`Select the ${
                  steps[column.stepIndex]?.name ?? 'step'
                } step`}
                onClick={(event) => {
                  // Scoped to *this* column's blueprint, not the whole canvas: the
                  // overview shows every scenario at once, and a handle that
                  // selected step 1 across all of them would be selecting cells the
                  // user cannot even see.
                  const body = bodyRef.current
                  if (!body) return
                  const cells = Array.from(
                    body.querySelectorAll(
                      `[data-blueprint-cell][data-blueprint-cell-interactive][data-step-index="${column.stepIndex}"]`,
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
                {steps[column.stepIndex]?.name ??
                  `Step ${column.stepIndex + 1}`}
              </StepSelectionName>
            </IconTooltip>
          ))
        : null}
    </div>
  )
}

function StepSelectionName({
  id,
  name,
  children,
  ...props
}: React.ComponentProps<'button'> & { id: string; name: string }) {
  const rename = useStructureRename('step', id, name)
  return rename.editing ? (
    <div style={props.style} className="pointer-events-auto absolute">
      {rename.editor}
    </div>
  ) : (
    <button {...props} onDoubleClick={rename.begin}>
      {children}
    </button>
  )
}
