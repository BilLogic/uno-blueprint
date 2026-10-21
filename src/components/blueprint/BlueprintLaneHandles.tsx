import { BLUEPRINT_INSERT_HIT_HALF } from '@/lib/blueprintLayout'
import {
  useLayoutEffect,
  useState,
  type RefObject,
} from 'react'
import { Plus } from 'lucide-react'
import { IconTooltip } from '@/components/editor/IconTooltip'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent } from '@/components/ui/popover'
import { useAtScenarioLevel, useEditor } from '@/contexts/EditorContext'
import { useCanvasModeValue } from '@/contexts/canvasModeContext'
import { useCellPick } from '@/contexts/cellPickContext'
import { useSupabase } from '@/contexts/SupabaseProvider'
import { addLane } from '@/lib/authoringRpc'
import { errorMessage } from '@/lib/utils'

type Boundary = { storedPosition: number; y: number }

/**
 * Insert handles between lanes — the missing "add row".
 *
 * Available in Design mode at scenario level, with hit bands measured from
 * rendered rows. Clicking a handle opens the shared portaled popover anchored
 * to that button, so the name field clears the canvas stacking contexts.
 * Enter creates the named lane. Lanes are scenario-wide (every path gets the
 * row), so insertion uses the selected scenario and the row's stored position.
 */
export function BlueprintLaneHandles({
  bodyRef,
}: {
  bodyRef: RefObject<HTMLDivElement | null>
}) {
  const mode = useCanvasModeValue()
  const pick = useCellPick()
  const { client, canWrite } = useSupabase()

  if (mode !== 'design' || pick === null || !canWrite || client === null)
    return null
  return <BlueprintLaneHandlesActive bodyRef={bodyRef} />
}

/** Mounted only while authoring, so read-mode boards do not subscribe every
 *  lane overlay to the combined navigation context. */
function BlueprintLaneHandlesActive({
  bodyRef,
}: {
  bodyRef: RefObject<HTMLDivElement | null>
}) {
  const atScenarioLevel = useAtScenarioLevel()
  const { client } = useSupabase()
  const { selectedScenarioId } = useEditor()
  const [boundaries, setBoundaries] = useState<Boundary[]>([])
  const [naming, setNaming] = useState<
    (Boundary & { anchor: HTMLElement }) | null
  >(null)
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const active =
    atScenarioLevel &&
    client !== null &&
    selectedScenarioId !== null

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
    if (rows.length === 0 || storedPositions.some((position) => !Number.isFinite(position))) {
      if (boundaries.length > 0) setBoundaries([])
      return
    }

    const bodyBox = body.getBoundingClientRect()
    // Client rects are camera-SCALED, but this overlay renders inside the
    // scaled layer in layout px — divide the deltas back down or every
    // boundary drifts by (scale − 1) · y, worst at the bottom lanes (the
    // same un-projection the annotation layer needed).
    const scale = body.offsetWidth > 0 ? bodyBox.width / body.offsetWidth : 1
    const next: Boundary[] = rows.map((row, rowIndex) => ({
      storedPosition: storedPositions[rowIndex],
      y: (row.getBoundingClientRect().top - bodyBox.top) / scale,
    }))
    const last = rows[rows.length - 1].getBoundingClientRect()
    next.push({
      storedPosition: storedPositions[storedPositions.length - 1] + 1,
      y: (last.bottom - bodyBox.top) / scale,
    })

    const same =
      next.length === boundaries.length &&
      next.every(
        (entry, index) =>
          Math.abs(entry.y - boundaries[index].y) < 0.5 &&
          entry.storedPosition === boundaries[index].storedPosition,
      )
    if (!same) setBoundaries(next)
  })

  if (!active || boundaries.length === 0) return null

  const create = async () => {
    if (!client || !selectedScenarioId || !naming || busy) return
    const trimmed = name.trim()
    if (!trimmed) return
    setBusy(true)
    setError(null)
    try {
      await addLane(client, {
        scenarioId: selectedScenarioId,
        name: trimmed,
        atPosition: naming.storedPosition,
      })
      setNaming(null)
      setName('')
    } catch (laneError) {
      setError(errorMessage(laneError))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="pointer-events-none absolute inset-0 z-30" aria-hidden={false}>
      {boundaries.map((boundary) => (
        <div
          key={boundary.storedPosition}
          className="group/lane-insert pointer-events-auto absolute left-0 flex w-full items-center"
          style={{
            top: boundary.y - BLUEPRINT_INSERT_HIT_HALF,
            height: BLUEPRINT_INSERT_HIT_HALF * 2,
          }}
        >
          <IconTooltip label="Insert a lane here">
            <button
              type="button"
              aria-label={`Insert a lane here`}
              onClick={(event) => {
                event.stopPropagation()
                setNaming({ ...boundary, anchor: event.currentTarget })
                setName('')
                setError(null)
              }}
              className="flex w-full items-center gap-1 opacity-0 transition-opacity duration-(--motion-micro) ease-arrive motion-reduce:transition-none group-hover/lane-insert:opacity-100 focus-visible:opacity-100"
            >
              <span className="ml-1 grid size-4 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground shadow-sm">
                <Plus className="size-3" aria-hidden />
              </span>
              <span className="h-px flex-1 bg-primary/60" />
            </button>
          </IconTooltip>
        </div>
      ))}

      <Popover
        open={naming !== null}
        onOpenChange={(open) => {
          if (!open && !busy) setNaming(null)
        }}
      >
        <PopoverContent anchor={naming?.anchor} align="start" side="bottom">
          <Input
            aria-label="Lane name"
            value={name}
            disabled={busy}
            placeholder="Lane name"
            className="h-6 flex-1 text-xs"
            onChange={(event) => setName(event.target.value)}
            onKeyDown={(event) => {
              event.stopPropagation()
              if (event.key === 'Enter') void create()
              if (event.key === 'Escape' && !busy) setNaming(null)
            }}
          />
          {error ? (
            <span role="alert" className="text-xs text-destructive">
              {error}
            </span>
          ) : null}
        </PopoverContent>
      </Popover>
    </div>
  )
}
