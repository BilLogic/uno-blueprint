import {
  useCallback,
  useEffect,
  useMemo,
  useId,
  useState,
  type RefObject,
} from 'react'
import {
  ARROW_VIEWPORT_PAD,
  buildArrowPath,
  buildBidirectionalArrowPath,
  clearAnchorSlotPlan,
  clearArrowCorridorPlan,
  findBidirectionalDependencyPairs,
  isWrapDependency,
  planAnchorSlots,
  planArrowConfluences,
  planArrowCorridors,
} from '@/lib/blueprintArrowGeometry'
import {
  getPathArrowColor,
  getPathColorKey,
  getPathDashArrayFromKey,
  pathColorKeyToMarkerSuffix,
} from '@/lib/pathColorTheme'
import { getPathKindArrowColor } from '@/lib/pathKindTheme'
import { cn } from '@/lib/utils'
import type { BlueprintCellDependency } from '@/types/blueprint'
import type { PathKind } from '@/types/database'
import {
  BlueprintArrowMarkerDefs,
  blueprintArrowPathProps,
} from '@/components/blueprint/BlueprintArrowMarkerDefs'

type ArrowLayer = 'forward' | 'wrap'

export type ColoredBlueprintDependency = BlueprintCellDependency & {
  /** The PATH's kind. `kind` is taken: a cell dependency carries its own
   *  (`leads_to` / `enables`), and intersecting the two collapses to `never`. */
  pathKind: PathKind
  opacity?: number
}

type BlueprintDependencyArrowsProps = {
  dependencies: BlueprintCellDependency[] | ColoredBlueprintDependency[]
  contentRef: RefObject<HTMLElement | null>
  scrollContainerRef: RefObject<HTMLElement | null>
  /** forward = in column gaps behind cells; wrap = loop overlay on top */
  layer: ArrowLayer
  /** Used when dependencies do not include pathKind (single-path grids). */
  pathKind?: PathKind
  /** When set with pathKind, arrows use the stable path identity color. */
  pathName?: string
  /**
   * Per-scenario off-switch for the confluence/fan-out merge — on by default.
   * False makes every same-side arrival keep its own head again.
   */
  mergeConfluences?: boolean
}

type ArrowSegment = {
  id: string
  d: string
  colorKey: string
  arrowColor: string
  opacity: number
  showMarker?: boolean
  dualMarker?: boolean
}

/** Identity of a rendered segment list — cheaper than re-rendering to find out. */
function serializeSegments(segments: readonly ArrowSegment[]): string {
  return segments
    .map(
      (segment) =>
        `${segment.id}|${segment.d}|${segment.colorKey}|${segment.arrowColor}|${segment.opacity}|${segment.showMarker ?? ''}|${segment.dualMarker ?? ''}`,
    )
    .join('~')
}

function isColoredDependency(
  dependency: BlueprintCellDependency,
): dependency is ColoredBlueprintDependency {
  return 'pathKind' in dependency
}

/**
 * SVG arrow overlay for a single-path blueprint grid. Each segment carries its
 * path's colour and dash pattern, so arrows stay distinguishable where they
 * cross and in a monochrome print.
 */
export function BlueprintDependencyArrows({
  dependencies,
  contentRef,
  scrollContainerRef,
  layer,
  pathKind = 'happy',
  pathName,
  mergeConfluences = true,
}: BlueprintDependencyArrowsProps) {
  const [segments, setSegments] = useState<ArrowSegment[]>([])
  const [size, setSize] = useState({ width: 0, height: 0 })
  const markerId = useId().replace(/:/g, '')

  const defaultColorKey = pathName
    ? getPathColorKey({ kind: pathKind, name: pathName })
    : pathKind
  const defaultArrowColor = pathName
    ? getPathArrowColor({ kind: pathKind, name: pathName })
    : getPathKindArrowColor(pathKind)

  const updateArrows = useCallback(() => {
    const content = contentRef.current
    // `enables` is panel-only by design: a precondition causes nothing, so
    // drawing it as an arrow would claim a handoff that never happens.
    const arrowDependencies = dependencies.filter((t) => (t.kind ?? 'leads_to') === 'leads_to')
    if (!content || arrowDependencies.length === 0) {
      setSegments([])
      return
    }

    const next: ArrowSegment[] = []
    const { pairs, remaining: unpaired } =
      findBidirectionalDependencyPairs(arrowDependencies)

    // Allocate anchor slots over the endpoints `buildArrowPath` will draw, so
    // a contested cell side fans its arrows instead of stacking them. Both
    // overlay layers plan the same full set, so the slots agree across them.
    planAnchorSlots(content, unpaired)

    // Confluence + fan-out: ≥2 same-side arrivals (or departures) merge into
    // one trunk with a single head — the generic mechanism that replaced the
    // overhead-rail bus. The trunk rides the z-0 forward layer, so it is drawn
    // only in the forward layer; the wrap layer drops the consumed forward deps
    // through its own filter. `disabled` is the per-scenario off-switch.
    const merge = planArrowConfluences(content, unpaired, {
      disabled: !mergeConfluences,
    })

    // Co-traveller offsets over the runs this layer actually routes (the merged
    // trunk is not a corridor run): two arrows sharing one detour corridor fan
    // onto adjacent lanes instead of overdrawing one line.
    planArrowCorridors(
      content,
      unpaired.filter((dependency) => !merge.consumed.has(dependency.id)),
    )
    const dependencyOpacity = (id: string): number => {
      const dependency = unpaired.find((entry) => entry.id === id)
      return dependency && isColoredDependency(dependency)
        ? (dependency.opacity ?? 1)
        : 1
    }

    if (layer === 'forward') {
      for (const segment of merge.segments) {
        const opacity = segment.memberDependencyIds.length
          ? Math.max(...segment.memberDependencyIds.map(dependencyOpacity))
          : 1
        next.push({
          id: segment.id,
          d: segment.d,
          colorKey: defaultColorKey,
          arrowColor: defaultArrowColor,
          opacity,
          showMarker: segment.showMarker,
        })
      }
    }

    for (const pair of pairs) {
      const cellAEl = content.querySelector<HTMLElement>(
        `[data-blueprint-cell="${pair.cellAId}"]`,
      )
      const cellBEl = content.querySelector<HTMLElement>(
        `[data-blueprint-cell="${pair.cellBId}"]`,
      )
      if (!cellAEl || !cellBEl) continue

      const wrap = isWrapDependency(cellAEl, cellBEl)
      if (layer === 'forward' && wrap) continue
      if (layer === 'wrap' && !wrap) continue

      const d = buildBidirectionalArrowPath(cellAEl, cellBEl, content)
      if (!d) continue

      next.push({
        id: `${pair.first.id}-${pair.second.id}`,
        d,
        colorKey: defaultColorKey,
        arrowColor: defaultArrowColor,
        opacity: isColoredDependency(pair.first)
          ? (pair.first.opacity ?? 1)
          : 1,
        dualMarker: true,
      })
    }

    for (const dependency of unpaired) {
      // A dependency a trunk already gathered must not also draw on its own.
      if (merge.consumed.has(dependency.id)) continue

      const sourceEl = content.querySelector<HTMLElement>(
        `[data-blueprint-cell="${dependency.source_cell_id}"]`,
      )
      const targetEl = content.querySelector<HTMLElement>(
        `[data-blueprint-cell="${dependency.target_cell_id}"]`,
      )
      if (!sourceEl || !targetEl) continue

      const wrap = isWrapDependency(sourceEl, targetEl)
      if (layer === 'forward' && wrap) continue
      if (layer === 'wrap' && !wrap) continue

      const d = buildArrowPath(
        sourceEl,
        targetEl,
        content,
        dependency.source_cell_id,
        dependency.target_cell_id,
        dependency.id,
      )
      if (!d) continue

      next.push({
        id: dependency.id,
        d,
        colorKey: defaultColorKey,
        arrowColor: defaultArrowColor,
        opacity: isColoredDependency(dependency) ? (dependency.opacity ?? 1) : 1,
      })
    }

    clearAnchorSlotPlan()
    clearArrowCorridorPlan()

    // Equality-guarded: a ResizeObserver burst during camera-fit relayout
    // fires many notifications for identical geometry; fresh object
    // identities on each would re-render (and re-observe) in a loop. Same
    // hardening as IntegratedDependencyArrows.
    const nextKey = serializeSegments(next)
    setSegments((prev) =>
      serializeSegments(prev) === nextKey ? prev : next,
    )
    const width = Math.max(content.scrollWidth, content.offsetWidth, 1)
    const height = Math.max(content.scrollHeight, content.offsetHeight, 1)
    setSize((prev) =>
      prev.width === width && prev.height === height
        ? prev
        : { width, height },
    )
  }, [
    contentRef,
    defaultArrowColor,
    defaultColorKey,
    layer,
    mergeConfluences,
    dependencies,
  ])

  useEffect(() => {
    updateArrows()
    const content = contentRef.current
    if (!content) return

    const scrollParent = scrollContainerRef.current ?? content

    // ONE rAF coalescer for every geometry-invalidating signal, the
    // ResizeObserver included — resize notifications arrive in bursts
    // during layout, and a synchronous DOM sweep per notification is
    // exactly the storm the integrated twin already guards against.
    let raf = 0
    const scheduleUpdate = () => {
      cancelAnimationFrame(raf)
      if (!document.documentElement.hasAttribute('data-structure-motion')) raf = requestAnimationFrame(updateArrows)
    }

    const observer = new ResizeObserver(scheduleUpdate)
    observer.observe(content)
    if (scrollParent !== content) {
      observer.observe(scrollParent)
    }

    scrollParent.addEventListener('scroll', scheduleUpdate, { passive: true })
    window.addEventListener('resize', scheduleUpdate)
    document.addEventListener('structure-motion-end', scheduleUpdate)

    return () => {
      cancelAnimationFrame(raf)
      observer.disconnect()
      scrollParent.removeEventListener('scroll', scheduleUpdate)
      window.removeEventListener('resize', scheduleUpdate)
      document.removeEventListener('structure-motion-end', scheduleUpdate)
    }
  }, [contentRef, scrollContainerRef, updateArrows])

  const svgStyle = useMemo(
    () => ({
      left: -ARROW_VIEWPORT_PAD,
      top: -ARROW_VIEWPORT_PAD,
      width:
        size.width > 0 ? size.width + ARROW_VIEWPORT_PAD * 2 : '100%',
      height:
        size.height > 0 ? size.height + ARROW_VIEWPORT_PAD * 2 : '100%',
    }),
    [size.height, size.width],
  )

  const { markerIds, markerColors } = useMemo(() => {
    const keys = new Set<string>([defaultColorKey])
    for (const segment of segments) {
      keys.add(segment.colorKey)
    }

    const ids: Record<string, string> = {}
    const colors: Record<string, string> = {}
    for (const key of keys) {
      const suffix = pathColorKeyToMarkerSuffix(key)
      ids[key] = `${markerId}-arrow-${suffix}`
      colors[key] =
        key === defaultColorKey
          ? defaultArrowColor
          : segments.find((segment) => segment.colorKey === key)?.arrowColor ??
            defaultArrowColor
    }

    return { markerIds: ids, markerColors: colors }
  }, [defaultArrowColor, defaultColorKey, markerId, segments])

  if (segments.length === 0) return null

  return (
    <svg
      data-blueprint-arrows=""
      className={cn(
        'pointer-events-none absolute overflow-visible',
        // The same hierarchy `IntegratedDependencyArrows` states: z-0, UNDER
        // the z-1 cells, so an ordinary run that crosses a cell tucks behind
        // it rather than striking through its face. The wrap layer stays above
        // because it rides the empty corridors outside the rows.
        layer === 'forward' ? 'z-0' : 'z-30',
      )}
      style={svgStyle}
      overflow="visible"
      shapeRendering="geometricPrecision"
      aria-hidden
    >
      <defs>
        <BlueprintArrowMarkerDefs
          markerIds={markerIds}
          markerColors={markerColors}
        />
      </defs>
      <g transform={`translate(${ARROW_VIEWPORT_PAD} ${ARROW_VIEWPORT_PAD})`}>
        {segments.map((segment) => (
          <g key={segment.id} opacity={segment.opacity}>
            <path
              d={segment.d}
              {...blueprintArrowPathProps(segment.arrowColor, getPathDashArrayFromKey(segment.colorKey))}
              {...(segment.showMarker === false
                ? {}
                : segment.dualMarker
                  ? {
                      markerStart: `url(#${markerIds[segment.colorKey]}-start)`,
                      markerEnd: `url(#${markerIds[segment.colorKey]})`,
                    }
                  : { markerEnd: `url(#${markerIds[segment.colorKey]})` })}
            />
          </g>
        ))}
      </g>
    </svg>
  )
}
