import { useCanvasScale } from '@/contexts/CanvasScaleContext'
import { useEffect, useLayoutEffect, useState, type RefObject } from 'react'
import { useAtScenarioLevel, useEditor } from '@/contexts/EditorContext'
import { useCanvasModeValue } from '@/contexts/canvasModeContext'
import { useCellPick } from '@/contexts/cellPickContext'
import { useSupabase } from '@/contexts/SupabaseProvider'
import { useEntityDetail } from '@/contexts/EntityDetailContext'
import { StructureInsert } from './StructureInsert'
import { COMPARE_LABEL_WIDTH } from '@/lib/sideBySideCompareLayout'

type Boundary = {
  storedPosition: number
  y: number
  label: string
  centered: boolean
  hitSize: number
}

/** Lane insertion for the rendered paths, measured from their row gaps.
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
  const [content, setContent] = useState({left: 0, width: 0})
  const [boundaries, setBoundaries] = useState<Boundary[]>([])
  const cameraScale = useCanvasScale()
  const { openCreate, selection, seam, setSeam } = useEntityDetail()
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
    const seamHeight = seamRow ? seamRow.getBoundingClientRect().height / scale : 0
    const seamY = seamRow
      ? (seamRow.getBoundingClientRect().top - bodyBox.top) / scale
      : null
    const next: Boundary[] = rows.map((row, rowIndex) => {
      const centered =
        rowIndex > 0 &&
        !Array.from(
          body.querySelectorAll<HTMLElement>('[data-blueprint-divider]'),
        ).some((divider) => {
          const box = divider.getBoundingClientRect()
          const previous = rows[rowIndex - 1].getBoundingClientRect()
          return (
            box.top >= previous.bottom - 1 &&
            box.bottom <= row.getBoundingClientRect().top + 1
          )
        })
      return {
        hitSize: Math.min(44, row.getBoundingClientRect().height / 2),
        centered,
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
              seamHeight,
          ) < 1
            ? seamY
            : (row.getBoundingClientRect().top - bodyBox.top) / scale,
      }
    })
    const last = rows[rows.length - 1].getBoundingClientRect()
    next.push({
      hitSize: Math.min(44, last.height / 2),
      centered: false,
      storedPosition: storedPositions[storedPositions.length - 1] + 1,
      label: `Add a lane below ${
        rows[rows.length - 1].dataset.laneName ?? 'the last lane'
      }`,
      y:
        seamY !== null &&
        Math.abs(seamY - (last.bottom - bodyBox.top) / scale) < 1
          ? seamY
          : (last.bottom - bodyBox.top) / scale,
    })

    const same =
      next.length === boundaries.length &&
      next.every(
        (entry, index) =>
          Math.abs(entry.y - boundaries[index].y) < 0.5 &&
          entry.storedPosition === boundaries[index].storedPosition &&
          entry.label === boundaries[index].label &&
          entry.centered === boundaries[index].centered &&
          entry.hitSize === boundaries[index].hitSize,
      )
    if (!same) setBoundaries(next)
    const left = (Math.min(...rows.map(row => row.getBoundingClientRect().left)) - bodyBox.left) / scale
    const right = (Math.max(...rows.map(row => row.getBoundingClientRect().right)) - bodyBox.left) / scale
    if (Math.abs(content.left - left) > 0.5 || Math.abs(content.width - (right - left)) > 0.5)
      setContent({left, width: right - left})
  })

  if (!active || boundaries.length === 0) return null

  const draft = selection?.draft
  return (
    <div className="pointer-events-none absolute inset-0 z-40">
      {!draft
        ? boundaries.map((boundary) => (
            <StructureInsert
              key={boundary.storedPosition}
              hitSize={boundary.hitSize}
              scale={cameraScale}
              extent={seam?.key === `lane:${pathId ?? pathIds?.[0]}:${boundary.storedPosition}` ? seam.size * cameraScale : 0}
              edge={!boundary.centered}
              orientation="horizontal"
              label={boundary.label}
              style={{
                left: 0,
                width: COMPARE_LABEL_WIDTH,
                top: seam?.key === `lane:${pathId ?? pathIds?.[0]}:${boundary.storedPosition}` && boundary.centered
                  ? `calc(${boundary.y}px + var(--structure-seam-progress, 1) * ${seam.size / 2}px)`
                  : boundary.y,
              }}
              slotStyle={{left: content.left, width: content.width}}
              onOpenChange={(open) => {
                const targetPath = pathId ?? pathIds?.[0]
                if (!targetPath) return
                const key = `lane:${targetPath}:${boundary.storedPosition}`
                setSeam((current) =>
                  open
                    ? {
                        kind: 'lane',
                        centered: boundary.centered,
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
                    centered: boundary.centered,
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
