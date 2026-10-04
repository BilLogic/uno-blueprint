import { BLUEPRINT_INSERT_HIT_HALF } from '@/lib/blueprintLayout'
import {
  useLayoutEffect,
  useRef,
  useState,
  type RefObject,
} from 'react'
import { Plus } from 'lucide-react'
import { IconTooltip } from '@/components/editor/IconTooltip'
import { Input } from '@/components/ui/input'
import { useAtScenarioLevel, useEditor } from '@/contexts/EditorContext'
import { useCanvasModeValue } from '@/contexts/canvasModeContext'
import { useCellPick } from '@/contexts/cellPickContext'
import { useSupabase } from '@/contexts/SupabaseProvider'
import { addLane } from '@/lib/authoringRpc'
import { errorMessage } from '@/lib/utils'

type Boundary = { at: number; y: number }

/**
 * Insert handles between lanes — the missing "add row".
 *
 * Mirrors `BlueprintColumnHandles` in every convention that matters: Edit
 * mode at scenario level only, measured off the rendered rows rather than
 * recomputed from data, hit bands wider than the hairline they reveal.
 *
 * One difference is forced by the operation itself: `add_lane` requires a
 * name. A blank *column* names itself in place on the grid, but a lane's
 * name is its rail label — a nameless lane is an invisible row. So the
 * click opens a small inline name field at the insert point, and Enter
 * creates. Lanes are also scenario-wide (every path gets the row), which is
 * why this asks the editor for the selected scenario rather than a path.
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
  const [bodyWidth, setBodyWidth] = useState(0)
  const [naming, setNaming] = useState<Boundary | null>(null)
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

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
    if (rows.length === 0) return

    const bodyBox = body.getBoundingClientRect()
    // Client rects are camera-SCALED, but this overlay renders inside the
    // scaled layer in layout px — divide the deltas back down or every
    // boundary drifts by (scale − 1) · y, worst at the bottom lanes (the
    // same un-projection the annotation layer needed).
    const scale = body.offsetWidth > 0 ? bodyBox.width / body.offsetWidth : 1
    const next: Boundary[] = rows.map((row, index) => ({
      at: index,
      y: (row.getBoundingClientRect().top - bodyBox.top) / scale,
    }))
    const last = rows[rows.length - 1].getBoundingClientRect()
    next.push({ at: rows.length, y: (last.bottom - bodyBox.top) / scale })

    const width = body.offsetWidth
    const same =
      next.length === boundaries.length &&
      next.every(
        (entry, index) =>
          Math.abs(entry.y - boundaries[index].y) < 0.5 &&
          entry.at === boundaries[index].at,
      )
    if (!same) setBoundaries(next)
    if (Math.abs(width - bodyWidth) > 0.5) setBodyWidth(width)
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
        atPosition: naming.at,
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
          key={boundary.at}
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
              onClick={() => {
                setNaming(boundary)
                setName('')
                setError(null)
                requestAnimationFrame(() => inputRef.current?.focus())
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

      {naming ? (
        <div
          className="pointer-events-auto absolute left-6 z-40 flex items-center gap-2 rounded-md border border-border bg-popover p-2 shadow-md"
          style={{ top: naming.y - 16, width: Math.min(260, bodyWidth - 48) }}
        >
          <Input
            ref={inputRef}
            value={name}
            placeholder="Lane name"
            className="h-6 flex-1 text-xs"
            onChange={(event) => setName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') void create()
              if (event.key === 'Escape') setNaming(null)
            }}
            onBlur={() => {
              // A click elsewhere abandons quietly; Enter is the commit.
              if (!busy) setNaming(null)
            }}
          />
          {error ? (
            <span className="max-w-40 truncate text-xs text-destructive">
              {error}
            </span>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
