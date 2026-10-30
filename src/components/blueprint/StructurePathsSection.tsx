import {
  PathOrderSection,
  type OrderItem,
  type OrderPath,
  type PathOrderSectionRail,
} from './PathOrderSection'
import { useStructureEditPaths } from '@/hooks/useStructureEditPaths'
import { Button } from '@/components/ui/button'
import {
  laneSectionBounds,
  dividerAnchorIndex,
} from './canvasStructureDividerGeometry'
import {
  INTERACTION_LINE_LABEL,
  VISIBILITY_LINE_LABEL,
  INTERNAL_INTERACTION_LINE_LABEL,
} from '@/lib/blueprintLayout'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

/** Saved structures use the create panel's rail, with immediate guarded commits. */
export function StructurePathsSection({
  kind,
  item,
  scenarioId,
  pathId,
  editable,
}: {
  kind: 'step' | 'lane'
  item: OrderItem
  scenarioId: string
  pathId?: string
  editable: boolean
}) {
  const paths = useStructureEditPaths({ kind, item, scenarioId, pathId })
  if (paths.status === 'loading')
    return (
      <p role="status" className="text-sm text-muted-foreground">
        Loading paths…
      </p>
    )
  if (paths.loadError)
    return (
      <p role="alert" className="text-sm text-destructive">
        Paths could not be loaded: {paths.loadError}
      </p>
    )
  return (
    <div
      data-panel-editor=""
      data-busy={paths.busy || undefined}
      className="space-y-2"
    >
      {paths.error ? (
        <p role="alert" className="text-sm text-destructive">
          {paths.error}
        </p>
      ) : null}
      <PathOrderSection
        mode="edit"
        label="Paths"
        membership={kind === 'step'}
        disabled={!editable || paths.busy || Boolean(paths.pending)}
        paths={paths.paths}
        value={paths.value}
        item={item}
        defaultOrder={paths.defaultOrder}
        onChange={paths.onChange}
        onCommit={editable ? paths.commit : undefined}
        onDragStateChange={paths.setPreviewing}
        sectionForOrder={
          kind === 'lane'
            ? (path, order) => laneOrderSection(path, order, item.id)
            : undefined
        }
      />
      <Dialog
        open={Boolean(paths.pending)}
        onOpenChange={(open) => {
          if (!open && !paths.busy) paths.cancel()
        }}
      >
        <DialogContent
          data-panel-dialog=""
          className="sm:max-w-md"
          showCloseButton={!paths.busy}
        >
          <DialogHeader>
            <DialogTitle>Remove step from this path?</DialogTitle>
            <DialogDescription>
              Removing {item.name} from {paths.pending?.path.name} removes{' '}
              {paths.pending?.cells.length} saved{' '}
              {paths.pending?.cells.length === 1 ? 'cell' : 'cells'} and their
              linked resources and arrows. Undo can restore them while this step
              and path are unchanged. Evidence is kept.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              disabled={paths.busy}
              onClick={paths.cancel}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={paths.busy}
              onClick={paths.confirm}
            >
              Remove from path
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

/** Keep the saved lane rail inside the same fixed section as its canvas header. */
function laneOrderSection(
  path: OrderPath,
  order: string[],
  id: string,
): PathOrderSectionRail | null {
  const roles = path.items.map((row) => row.role)
  const index = path.items.findIndex((row) => row.id === id)
  const section = laneSectionBounds(roles).find(
    (range) => index >= range.start && index <= range.end,
  )
  if (!section) return null
  const ids = new Set(
    path.items.slice(section.start, section.end + 1).map((row) => row.id),
  )
  const positions = order.flatMap((row, at) => (ids.has(row) ? [at] : []))
  if (positions.length !== ids.size) return null
  const labelAfter = (at: number) => {
    for (const [kind, label] of [
      ['interaction', INTERACTION_LINE_LABEL],
      ['visibility', VISIBILITY_LINE_LABEL],
      ['internal-interaction', INTERNAL_INTERACTION_LINE_LABEL],
    ] as const) {
      if (dividerAnchorIndex(kind, roles) === at) return label
    }
    return null
  }
  return {
    start: Math.min(...positions),
    end: Math.max(...positions),
    lineAbove: section.start > 0 ? labelAfter(section.start - 1) : null,
    lineBelow:
      section.end < path.items.length - 1 ? labelAfter(section.end) : null,
  }
}
