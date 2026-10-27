import { PathOrderSection, type OrderItem } from './PathOrderSection'
import { useStructureEditPaths } from '@/hooks/useStructureEditPaths'
import { Button } from '@/components/ui/button'
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
