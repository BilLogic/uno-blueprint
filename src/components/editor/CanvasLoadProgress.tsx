import { useEffect, useRef, useState } from 'react'
import { Diamond } from 'lucide-react'
import {
  loadProgressLabel,
  loadProgressPercent,
  loadProgressUnitPercent,
  type CanvasLoadStage,
} from '@/lib/canvasLoadProgress'
import { cn } from '@/lib/utils'

/**
 * Determinate canvas-load progress: mark, 2 px track, stage label — centered
 * over the canvas pad while the shaped skeleton holds the geometry. Every tick
 * is a completed query stage; there is no timer fill, so a stalled stage shows
 * a stalled bar, which is the honest signal. Rendered inside the skeleton's
 * own DeferredSkeleton session, so it inherits the 250 ms hold (fast loads
 * never see it) and leaves in the same commit the content fades in.
 *
 * Presentation only (`aria-hidden`): the skeleton wrapper already carries
 * `role="status"` + the sr-only "Loading…", and a second announcement per
 * tick would be noise.
 */
/**
 * Highest percent a surface has shown, by progress key.
 *
 * A bar can outlive the component that draws it: the slice waterfall hands
 * one from its own phases to the embedded canvas, and each phase is a
 * separate mount. The two measure different things — the phases count
 * stages, the canvas counts settled requests — so the handoff could drop
 * the bar from 50% to ~20% as the denominator changed under it. The
 * instance-local creep cannot help, because the instance is exactly what
 * changed.
 *
 * A floor per surface makes the bar monotonic across the whole chain. It is
 * not a lie: every value it holds was truthfully reported by some stage of
 * the same load, and a bar that runs backwards is the less honest of the
 * two readings.
 */
const progressFloors = new Map<string, number>()

export function CanvasLoadProgress({
  stages,
  units,
  className,
  progressKey,
}: {
  stages: CanvasLoadStage[]
  /**
   * Surface identity, shared by every mount of one load (the skeleton's
   * `holdKey`). Makes the bar monotonic across a hand-off; omit for a
   * self-contained surface.
   */
  progressKey?: string
  /**
   * Real work-unit counts (settled requests / issued requests). When given,
   * the bar's width comes from these instead of the coarse stage fraction —
   * stages still name the work via the label.
   */
  units?: { loaded: number; total: number }
  className?: string
}) {
  const measured = units
    ? loadProgressUnitPercent(units.loaded, units.total)
    : loadProgressPercent(stages)
  const floor = progressKey ? (progressFloors.get(progressKey) ?? 0) : 0
  const percent = Math.max(measured, floor)
  if (progressKey) progressFloors.set(progressKey, percent)
  const complete = percent >= 100

  /*
    Displayed width: anchored to the REAL percent (every settled request
    advances the anchor), with a slow creep between anchors so the bar is
    visibly alive while a request is on the wire — capped well short of the
    next anchor, so it can never claim work that has not finished. On
    completion it snaps to 100 (the caller holds the overlay long enough
    for that to be seen before content appears).
  */
  const percentRef = useRef(percent)
  useEffect(() => {
    percentRef.current = percent
  }, [percent])
  // The floor is per LOAD, not per app lifetime: drop it when the bar
  // completes so the next load of the same surface starts from zero.
  useEffect(() => {
    if (!complete || !progressKey) return
    return () => {
      progressFloors.delete(progressKey)
    }
  }, [complete, progressKey])
  const [creep, setCreep] = useState(0)
  useEffect(() => {
    if (complete) return
    const timer = window.setInterval(() => {
      setCreep((current) => {
        const cap = Math.min(percentRef.current + 12, 94)
        const base = Math.max(current, percentRef.current)
        return base < cap ? base + 1 : current
      })
    }, 180)
    return () => window.clearInterval(timer)
  }, [complete])
  // Anchors always win over the creep, completion snaps to full, and the
  // creep's CONTRIBUTION is re-clamped to the current cap at render time —
  // if the real target regresses (the scenario set grew mid-load), a stale
  // high creep cannot overstate progress.
  const display = complete
    ? 100
    : Math.min(Math.max(percent, creep), Math.min(percent + 12, 94))
  return (
    <div
      aria-hidden
      className={cn(
        'pointer-events-none flex flex-col items-center gap-3',
        className,
      )}
    >
      <div className="flex size-10 items-center justify-center rounded-lg border border-muted bg-card/80">
        <Diamond className="size-4 text-muted-foreground" />
      </div>
      <div className="h-0.5 w-40 overflow-hidden rounded-full bg-border">
        <div
          className="h-full rounded-full bg-primary transition-[width] duration-(--motion-camera) ease-out motion-reduce:transition-none"
          style={{ width: `${display}%` }}
        />
      </div>
      <p className="text-xs text-muted-foreground">
        {loadProgressLabel(stages)}
      </p>
    </div>
  )
}
