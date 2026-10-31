import { useCanvasScale } from '@/contexts/CanvasScaleContext'
import { COMPARE_STEP_HEADER_HEIGHT } from '@/lib/sideBySideCompareLayout'
import { STEP_COLUMN_GAP } from '@/lib/blueprintLayout'
import { STRUCTURE_SEAM_ID } from '@/lib/structureDraftPreview'

import { useEffect, useLayoutEffect, useState, type RefObject } from 'react'
import { useEntityDetail } from '@/contexts/EntityDetailContext'
import { StructureInsert, STRUCTURE_INSERT_SIZE } from './StructureInsert'
import { useAtScenarioLevel } from '@/contexts/EditorContext'
import { useCanvasModeValue } from '@/contexts/canvasModeContext'
import { useCellPick } from '@/contexts/cellPickContext'
import { useSupabase } from '@/contexts/SupabaseProvider'

type Step = {
  id: string
  name: string
  position: number
  seamSize?: number
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
  hitSize: number
}

/**
 * Insertion targets between columns, in Edit mode only.
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
}: {
  steps: Step[]
  bodyRef: RefObject<HTMLDivElement | null>
  /** The path these columns belong to. Absent disables inserting. */
  pathId?: string
}) {
  const steps = renderedSteps.filter((step) => step.id !== STRUCTURE_SEAM_ID)
  const scale = useCanvasScale()
  const mode = useCanvasModeValue()
  const atScenarioLevel = useAtScenarioLevel()
  const pick = useCellPick()
  const { client, canWrite } = useSupabase()
  const [, refreshMeasurements] = useState(0)
  useEffect(() => {
    const body = bodyRef.current
    if (!body || typeof ResizeObserver === 'undefined') return
    const refresh = () => {
      if (!document.documentElement.hasAttribute('data-structure-motion'))
        refreshMeasurements(value => value + 1)
    }
    const observer = new ResizeObserver(refresh)
    observer.observe(body)
    document.addEventListener('structure-motion-end', refresh)
    return () => {
      observer.disconnect()
      document.removeEventListener('structure-motion-end', refresh)
    }
  }, [bodyRef])
  const [columns, setColumns] = useState<Column[]>([])
  const [bodyHeight, setBodyHeight] = useState(0)
  const [header, setHeader] = useState<{top:number; lastId?:string}>({top: -COMPARE_STEP_HEADER_HEIGHT})
  const [seamWidth, setSeamWidth] = useState(0)
  const { openCreate, selection, seam, setSeam } = useEntityDetail()
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

    const currentSeamWidth = (body.querySelector<HTMLElement>('[data-structure-seam-track="step"]')?.getBoundingClientRect().width ?? 0) / scale
    if (Math.abs(currentSeamWidth-seamWidth)>0.1) setSeamWidth(currentSeamWidth)

    const headers = Array.from(body.closest('[data-structure-board]')?.querySelectorAll<HTMLElement>('[data-blueprint-column-header]') ?? [])
    const owners = headers.map(node => node.querySelector<HTMLElement>('[data-structure-id]')?.dataset.structureId)
    const firstHeader = headers[0]
    const top = firstHeader ? (firstHeader.getBoundingClientRect().top - body.getBoundingClientRect().top) / scale : -COMPARE_STEP_HEADER_HEIGHT
    const lastId = owners.at(-1)
    if (Math.abs(top - header.top) > 0.5 || lastId !== header.lastId) setHeader({top, lastId})

    const paths = Array.from(body.closest('[data-structure-board]')?.querySelectorAll<HTMLElement>('[data-structure-path][data-structure-step-ids]') ?? [])
    const measured = steps.flatMap<Column>((step, stepIndex) => {
      // A shared column has one header and one insertion trigger, owned by its first displayed path.
      if (owners.some(Boolean) && !owners.includes(step.id)) return []
      const owner = paths.find(path => path.dataset.structureStepIds?.split(' ').includes(step.id))
      if (owner && owner !== body) return []
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
    const previousTrack = renderedSteps[renderedIndex - 1]
    const seamTrack = previousTrack?.id === STRUCTURE_SEAM_ID
    const x = seamTrack
      ? column.left - seamWidth / (column.stepIndex > 0 ? 2 : 1) - STEP_COLUMN_GAP
      : column.left - (column.stepIndex > 0 ? STEP_COLUMN_GAP / 2 : 0)
    return {
      hitSize: Math.min(44,(column.width + STEP_COLUMN_GAP)*scale/2),
      stepIndex: column.stepIndex,
      storedPosition: column.storedPosition,
      x,
      centered: column.stepIndex > 0,
    }
  })
  const last = visibleColumns[visibleColumns.length - 1]
  if (last?.stepIndex === steps.length - 1 && (!header.lastId || steps[last.stepIndex]?.id === header.lastId)) {
    boundaries.push({
      hitSize: Math.min(44,(last.width + STEP_COLUMN_GAP)*scale/2),
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
                hitSize={boundary.hitSize}
                scale={scale}
                extent={seam?.key === `step:${targetPath}:${boundary.storedPosition ?? 'end'}` ? seam.size * scale : 0}
                indicatorOffset={boundary.centered ? 0 : -STEP_COLUMN_GAP / 2}
                edge={!boundary.centered}
                orientation="vertical"
                label={
                  target.pathName ? `${label} in ${target.pathName}` : label
                }
                style={{
                  left: seam?.key === `step:${targetPath}:${boundary.storedPosition ?? 'end'}` && boundary.centered
                    ? `calc(${boundary.x - seamWidth / 2}px + var(--structure-seam-progress, 1) * ${seam.size / 2}px)`
                    : boundary.x,
                  top: header.top,
                  height: COMPARE_STEP_HEADER_HEIGHT,
                }}
                slotStyle={{ top: -header.top, height: bodyHeight }}
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
                          size: STRUCTURE_INSERT_SIZE,
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

    </div>
  )
}
