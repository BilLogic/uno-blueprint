import { useCanvasScale } from '@/contexts/CanvasScaleContext'
import { useLayoutEffect, useState, type RefObject } from 'react'
import { useAtScenarioLevel, useEditor } from '@/contexts/EditorContext'
import { useCanvasModeValue } from '@/contexts/canvasModeContext'
import { useCellPick } from '@/contexts/cellPickContext'
import { useSupabase } from '@/contexts/SupabaseProvider'
import { useEntityDetail } from '@/contexts/EntityDetailContext'
import { StructureInsert } from './StructureInsert'

type Boundary = { storedPosition: number; y: number; label: string }

/** Scenario-wide lane insertion, measured from the rendered row gaps.
 * Activating a target opens an unwritten draft in the existing lane panel. */
export function BlueprintLaneHandles({
  bodyRef,
  pathId,
  pathIds,
}: {
  bodyRef: RefObject<HTMLDivElement | null>
  pathId?: string
  pathIds?: string[]
}) {
  const mode = useCanvasModeValue()
  const pick = useCellPick()
  const { client, canWrite } = useSupabase()

  if (mode !== 'design' || pick === null || !canWrite || client === null)
    return null
  return (
    <BlueprintLaneHandlesActive
      bodyRef={bodyRef}
      pathId={pathId}
      pathIds={pathIds}
    />
  )
}

/** Mounted only while authoring, so read-mode boards do not subscribe every
 *  lane overlay to the combined navigation context. */
function BlueprintLaneHandlesActive({
  bodyRef,
  pathId,
  pathIds,
}: {
  bodyRef: RefObject<HTMLDivElement | null>
  pathId?: string
  pathIds?: string[]
}) {
  const atScenarioLevel = useAtScenarioLevel()
  const { client } = useSupabase()
  const { selectedScenarioId } = useEditor()
  const [bodyWidth, setBodyWidth] = useState(0)
  const [boundaries, setBoundaries] = useState<Boundary[]>([])
  const cameraScale = useCanvasScale()
  const { openCreate, selection, setSeam } = useEntityDetail()
  const active =
    atScenarioLevel && client !== null && selectedScenarioId !== null

  // Same no-deps measurement discipline as the column handles, for the same
  // reasons — see the long note there. Equality check is load-bearing.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useLayoutEffect(() => {
    if (!active) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- guarded reset
      if (boundaries.length > 0) setBoundaries([])
      return
    }
    const body = bodyRef.current
    if (!body) return
    // Focus mode dims neighbouring scenarios but still renders them; a
    // hundred insert targets across sections nobody can aim at is noise.
    if (body.closest('[data-canvas-focus-dimmed]')) {
      if (boundaries.length > 0) setBoundaries([])
      return
    }

    const rows = Array.from(
      body.querySelectorAll<HTMLElement>('[data-blueprint-row][data-lane-id]'),
    )
    const storedPositions = rows.map((row) => {
      const value = row.dataset.lanePosition
      return value?.trim() ? Number(value) : NaN
    })
    // Invalid DOM metadata must neither reach the write nor defeat equality
    // (NaN !== NaN would keep this measuring effect updating forever).
    if (
      rows.length === 0 ||
      storedPositions.some((position) => !Number.isFinite(position))
    ) {
      if (boundaries.length > 0) setBoundaries([])
      return
    }

    const bodyBox = body.getBoundingClientRect()
    // Client rects are camera-SCALED, but this overlay renders inside the
    // scaled layer in layout px — divide the deltas back down or every
    // boundary drifts by (scale − 1) · y, worst at the bottom lanes (the
    // same un-projection the annotation layer needed).
    const scale = body.offsetWidth > 0 ? bodyBox.width / body.offsetWidth : 1
    const seamRow = body.querySelector<HTMLElement>(
      '[data-structure-seam-track="lane"]',
    )
    const seamY = seamRow
      ? (seamRow.getBoundingClientRect().top - bodyBox.top) / scale
      : null
    const next: Boundary[] = rows.map((row, rowIndex) => ({
      storedPosition: storedPositions[rowIndex],
      label:
        rowIndex === 0
          ? `Add a lane above ${row.dataset.laneName ?? 'the first lane'}`
          : `Add a lane below ${
              rows[rowIndex - 1].dataset.laneName ?? 'the previous lane'
            }`,
      y:
        seamY !== null &&
        Math.abs(
          (row.getBoundingClientRect().top - bodyBox.top) / scale -
            seamY -
            34 / cameraScale,
        ) < 1
          ? seamY
          : (row.getBoundingClientRect().top - bodyBox.top) / scale,
    }))
    const last = rows[rows.length - 1].getBoundingClientRect()
    next.push({
      storedPosition: storedPositions[storedPositions.length - 1] + 1,
      label: `Add a lane below ${
        rows[rows.length - 1].dataset.laneName ?? 'the last lane'
      }`,
      y: (last.bottom - bodyBox.top) / scale,
    })

    const same =
      next.length === boundaries.length &&
      next.every(
        (entry, index) =>
          Math.abs(entry.y - boundaries[index].y) < 0.5 &&
          entry.storedPosition === boundaries[index].storedPosition &&
          entry.label === boundaries[index].label,
      )
    if (!same) setBoundaries(next)
    if (bodyWidth !== body.offsetWidth) setBodyWidth(body.offsetWidth)
  })

  if (!active || boundaries.length === 0) return null

  const draft = selection?.draft
  return (
    <div className="pointer-events-none absolute inset-0 z-50">
      {!draft
        ? boundaries.map((boundary) => (
            <StructureInsert
              key={boundary.storedPosition}
              scale={cameraScale}
              orientation="horizontal"
              label={boundary.label}
              style={{ left: 0, width: bodyWidth, top: boundary.y }}
              onOpenChange={(open) => {
                const targetPath = pathId ?? pathIds?.[0]
                if (!targetPath) return
                const key = `lane:${targetPath}:${boundary.storedPosition}`
                setSeam((current) =>
                  open
                    ? {
                        kind: 'lane',
                        pathId: targetPath,
                        pathIds,
                        atPosition: boundary.storedPosition,
                        size: 34 / cameraScale,
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
                    kind: 'lane',
                    pathId,
                    pathIds,
                    scenarioId: selectedScenarioId!,
                    atPosition: boundary.storedPosition,
                  },
                  opener,
                )
              }
            />
          ))
        : null}
    </div>
  )
}
