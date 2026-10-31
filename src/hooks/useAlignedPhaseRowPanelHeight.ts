import { useLayoutEffect, useState, type RefObject } from 'react'
import { getComparePanelScrollPaddingY } from '@/lib/sideBySideCompareLayout'
import { resolveScenarioPanelHeight } from '@/lib/phaseRowPanelHeight'

export type AlignedPhaseRowHeights = {
  /** The shared height every panel in the row takes. */
  rowPanelHeight: number | undefined
  /** What an excluded panel takes — never less than it had at overview. */
  excludedPanelHeight: number | undefined
}

/**
 * The one height a phase row's panels share, MEASURED rather than predicted.
 *
 * The estimate is a placeholder, not a floor. It exists to size panels in
 * the commit before anything has been measured; the moment a measurement
 * lands it replaces the estimate outright, in BOTH directions. Held as a
 * floor — `Math.max(estimate, measured)` — a prediction that runs hot can
 * never be corrected, because the max only ever rounds up: the surplus
 * paints as dead gray under every board and no amount of measuring removes
 * it. The estimates are threaded with the panel's real scroll chrome now,
 * so the placeholder is close; but nothing here depends on it being right
 * any more, which is the point. A future drift costs one wrong pre-paint
 * frame instead of permanent gray.
 *
 * An EXCLUDED panel is measured into its own bucket rather than skipped.
 * Skipping it is what the row height needs; but the panel still has to be
 * given a height, and the only number left for it would be the row's — which
 * was computed without it, and is therefore short exactly when it is the
 * tallest thing in the row. See `resolveScenarioPanelHeight`.
 *
 * Both effects are LAYOUT effects. Measuring in a passive effect would let a
 * frame paint at the estimate first, which is the pop this design exists to
 * avoid.
 */
export function useAlignedPhaseRowPanelHeight(
  rowRef: RefObject<HTMLDivElement | null>,
  /** Row height predicted from everything except an excluded scenario. */
  estimatedRowHeight: number | undefined,
  /** The excluded scenario's own predicted height, if one is excluded. */
  estimatedExcludedHeight: number | undefined,
  alignPanelHeights: boolean,
  measureKey: string,
): AlignedPhaseRowHeights {
  const [measured, setMeasured] = useState({ row: 0, excluded: 0 })

  useLayoutEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- layout-measurement flow: drops back to the estimate for the one commit before the measuring effect below runs
    setMeasured({ row: 0, excluded: 0 })
  }, [measureKey])

  useLayoutEffect(() => {
    if (!alignPanelHeights) return

    const row = rowRef.current
    if (!row) return
    const scrollPad = getComparePanelScrollPaddingY({ lockHeight: true })

    const measureRow = () => {
      if (document.documentElement.hasAttribute('data-structure-motion')) return
      let rowMax = 0
      let excludedMax = 0
      row
        .querySelectorAll<HTMLElement>('[data-blueprint-panel-content]')
        .forEach((node) => {
          // Layout height only — `scrollHeight` also counts arrow overlays
          // and path frames bleeding past the board, which shows up as gray
          // surplus.
          const height = node.offsetHeight + scrollPad
          /*
            Only a focused scenario showing more than its default path
            selection is marked (see `excludeFromRowHeight`): that comparison
            would otherwise reach every dimmed neighbour through the shared
            max, padding untouched panels with the taller board's slack.

            Read from `[data-row-height-excluded]`, never from
            `[data-canvas-focus-active]` — that attribute is set on the phase
            SECTION as well as on the panel, so a `closest()` for it matched
            every panel in a focused row and this loop measured nothing at
            all, leaving the whole row pinned to its estimate.
          */
          if (node.closest('[data-row-height-excluded]')) {
            excludedMax = Math.max(excludedMax, height)
          } else {
            rowMax = Math.max(rowMax, height)
          }
        })
      setMeasured((current) =>
        current.row === rowMax && current.excluded === excludedMax
          ? current
          : { row: rowMax, excluded: excludedMax },
      )
    }

    measureRow()
    document.addEventListener('structure-motion-end', measureRow)
    const observer = new ResizeObserver(measureRow)
    row
      .querySelectorAll<HTMLElement>('[data-blueprint-panel-content]')
      .forEach((node) => observer.observe(node))

    return () => {
      observer.disconnect()
      document.removeEventListener('structure-motion-end', measureRow)
    }
  }, [alignPanelHeights, measureKey, rowRef])

  if (!alignPanelHeights) {
    return { rowPanelHeight: undefined, excludedPanelHeight: undefined }
  }

  /*
    A row whose only panel is the excluded one has no siblings to protect, so
    its measurement is the row height. Without this the row falls back to an
    estimate that deliberately leaves out the only thing in it.
  */
  const rowPanelHeight =
    measured.row > 0
      ? measured.row
      : measured.excluded > 0
        ? measured.excluded
        : estimatedRowHeight

  const excludedHeight =
    measured.excluded > 0 ? measured.excluded : estimatedExcludedHeight

  return {
    rowPanelHeight,
    excludedPanelHeight: resolveScenarioPanelHeight({
      rowPanelHeight,
      ownHeightFloor: excludedHeight,
      isExcludedFromRow: true,
    }),
  }
}
