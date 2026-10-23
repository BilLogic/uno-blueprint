import { useCanvasScale } from '@/contexts/CanvasScaleContext'
import { COMPARE_STEP_HEADER_HEIGHT } from '@/lib/sideBySideCompareLayout'
import { STEP_COLUMN_GAP } from '@/lib/blueprintLayout'
import { STRUCTURE_SEAM_ID } from '@/lib/structureDraftPreview'
import { useStructureRename } from './useStructureRename'

import { useLayoutEffect, useState, type RefObject } from 'react'
import { useEntityDetail } from '@/contexts/EntityDetailContext'
import { StructureInsert } from './StructureInsert'
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
  pathIds?: string[]
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
  centered: boolean
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
  steps: renderedSteps,
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
  const steps = renderedSteps.filter((step) => step.id !== STRUCTURE_SEAM_ID)
  const scale = useCanvasScale()
  const mode = useCanvasModeValue()
  const atScenarioLevel = useAtScenarioLevel()
  const pick = useCellPick()
  const { client, canWrite } = useSupabase()
  const [columns, setColumns] = useState<Column[]>([])
  const [bodyHeight, setBodyHeight] = useState(0)
  const { openCreate, selection, setSeam } = useEntityDetail()
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
        `:is([data-structure-column], [data-blueprint-cell-anchor], [data-blueprint-empty-slot])[data-step-index="${renderedSteps.findIndex(
          (item) => item.id === step.id,
        )}"]`,
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
  const boundaries: Boundary[] = visibleColumns.map((column) => {
    const renderedIndex = renderedSteps.findIndex(
      (step) => step.id === steps[column.stepIndex]?.id,
    )
    const seamTrack = renderedSteps[renderedIndex - 1]?.id === STRUCTURE_SEAM_ID
    const x = seamTrack
      ? column.left - (column.stepIndex > 0 ? 17 : 34) / scale - STEP_COLUMN_GAP
      : column.left - (column.stepIndex > 0 ? STEP_COLUMN_GAP / 2 : 0)
    return {
      stepIndex: column.stepIndex,
      storedPosition: column.storedPosition,
      x,
      centered: column.stepIndex > 0,
    }
  })
  const last = visibleColumns[visibleColumns.length - 1]
  if (last?.stepIndex === steps.length - 1) {
    boundaries.push({
      stepIndex: steps.length,
      storedPosition: undefined,
      x: last.left + last.width + STEP_COLUMN_GAP,
      centered: false,
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
      {insertable && !draft
        ? boundaries.map((boundary) => {
            const target = steps[boundary.stepIndex] ?? steps[steps.length - 1]
            const targetPath = target.pathId ?? pathId!
            const previous = steps[boundary.stepIndex - 1]
            const label = previous
              ? `Add a step after ${previous.name}`
              : `Add a step before ${steps[0]?.name ?? 'the first step'}`
            return (
              <StructureInsert
                key={`insert-${target.id}-${boundary.storedPosition ?? 'end'}`}
                scale={scale}
                edge={!boundary.centered}
                orientation="vertical"
                label={
                  target.pathName ? `${label} in ${target.pathName}` : label
                }
                style={{
                  left: boundary.x,
                  top: -COMPARE_STEP_HEADER_HEIGHT,
                  height: bodyHeight + COMPARE_STEP_HEADER_HEIGHT,
                }}
                onOpenChange={(open) => {
                  const key = `step:${targetPath}:${
                    boundary.storedPosition ?? 'end'
                  }`
                  setSeam((current) =>
                    open
                      ? {
                          kind: 'step',
                          centered: boundary.centered,
                          pathId: targetPath,
                          pathIds: target.pathIds,
                          atPosition: boundary.storedPosition,
                          size: 34 / scale,
                          key,
                        }
                      : current?.key === key
                      ? null
                      : current,
                  )
                }}
                onClick={(opener) =>
                  openCreate(
                    {
                      kind: 'step',
                      centered: boundary.centered,
                      pathId: targetPath,
                      pathIds: target.pathIds,
                      atPosition: boundary.storedPosition,
                    },
                    opener,
                  )
                }
              />
            )
          })
        : null}

      {selectionHandles && !draft
        ? visibleColumns.map((column) => (
            <StepSelectionName
              key={steps[column.stepIndex].id}
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
              {steps[column.stepIndex]?.name ?? `Step ${column.stepIndex + 1}`}
            </StepSelectionName>
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
    <button
      draggable={false}
      {...props}
      onClick={(event) => rename.click(event, () => props.onClick?.(event))}
      onDoubleClick={rename.begin}
    >
      {children}
    </button>
  )
}
