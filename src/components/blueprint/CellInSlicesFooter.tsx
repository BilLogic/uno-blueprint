import { ChevronRight } from 'lucide-react'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { DeferredSkeleton } from '@/components/ui/deferred-skeleton'
import { Skeleton } from '@/components/ui/skeleton'
import { useViewState } from '@/contexts/viewStateStore'
import { useSlices, type SliceListEntry } from '@/hooks/useSlices'
import { resolveBlueprintCellId } from '@/lib/resolveBlueprintCellId'
import { useActiveServiceId } from '@/contexts/activeService'

function slicesContainingCell(
  slices: readonly SliceListEntry[],
  cellId: string,
): SliceListEntry[] {
  const resolved = resolveBlueprintCellId(cellId)
  return slices.filter((slice) =>
    slice.slides.some((item) =>
      item.cell_ids.some(
        (id) =>
          id === cellId ||
          id === resolved ||
          resolveBlueprintCellId(id) === resolved,
      ),
    ),
  )
}

type CellInSlicesFooterProps = {
  /** Raw selected cell id (integrated overlay ids resolve internally). */
  cellId: string | null
}

/**
 * Collapsible "In slices" footer — derived client-side from the shared
 * useSlices cache (no per-open membership query). On error it falls back to
 * the stale/fallback list, matching TabStrip and SlicesSidebarSection. Rows
 * open the slice tab.
 */
export function CellInSlicesFooter({ cellId }: CellInSlicesFooterProps) {
  const slices = useSlices(useActiveServiceId())
  const { openTab } = useViewState()

  if (!cellId) return null

  /*
    Loading is NOT "no matches".

    These three branches used to collapse into one empty array, so a panel
    opened while `slices` was still in flight returned null and the footer
    appeared afterwards, shoving everything above it. `useSlices` is one
    service-wide query with staleTime Infinity, so this happens exactly once
    per session, on the first cell panel opened — small, and worth not doing.
  */
  if (slices.status === 'loading') {
    return (
      <div className="shrink-0 border-t border-border px-4 py-2">
        <DeferredSkeleton loading skeleton={<Skeleton className="h-4 w-24" />}>
          {null}
        </DeferredSkeleton>
      </div>
    )
  }

  const rows: SliceListEntry[] =
    slices.status === 'ready' ? slices.data : (slices.fallback ?? [])

  const matches = slicesContainingCell(rows, cellId)
  if (matches.length === 0) return null

  return (
    <Collapsible className="shrink-0 border-t border-border px-4 py-2">
      <CollapsibleTrigger className="group/in-slices flex w-full items-center gap-1 text-xs font-medium text-muted-foreground transition-colors duration-(--motion-micro) ease-arrive motion-reduce:transition-none hover:text-foreground">
        <ChevronRight
          className="size-3 transition-transform duration-(--motion-micro) ease-move motion-reduce:transition-none group-aria-expanded/in-slices:rotate-90"
          aria-hidden
        />
        In slices ({matches.length})
      </CollapsibleTrigger>
      <CollapsibleContent>
        <ul className="flex flex-col gap-1 pt-2 pb-1">
          {matches.map((slice) => (
            <li key={slice.id}>
              <button
                type="button"
                className="flex w-full min-w-0 items-center gap-2 rounded-md px-2 py-1 text-left text-xs text-foreground transition-colors duration-(--motion-micro) ease-arrive motion-reduce:transition-none hover:bg-accent hover:text-foreground"
                onClick={() => openTab({ kind: 'slice', sliceId: slice.id })}
              >
                <span aria-hidden>◇</span>
                <span className="min-w-0 flex-1 truncate">{slice.title}</span>
                <span
                  // geometry: packs the count into a fitted badge, not a prose line.
                  className="shrink-0 rounded-full border border-border bg-muted px-2 py-px font-mono text-xs leading-none text-muted-foreground"
                >
                  {slice.kind}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </CollapsibleContent>
    </Collapsible>
  )
}
