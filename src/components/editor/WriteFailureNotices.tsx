import { useSyncExternalStore } from 'react'
import { AlertTriangle, X } from 'lucide-react'
import { Alert, AlertAction, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import {
  dismissWriteFailure,
  subscribeToWriteFailures,
  writeFailureSnapshot,
  type WriteFailure,
} from '@/lib/writeFailures'

/** Server snapshot for SSR — nothing has failed before hydration. */
const EMPTY: WriteFailure[] = []

/**
 * Writes that did not land, said out loud.
 *
 * Mounted beside the shell rather than inside it: the failures it reports
 * come from controls that have already closed, and one of them (⌘Z) has no
 * control at all, so it cannot live under any of them. Bottom centre, over
 * the canvas, dismissed by hand — a write that silently failed is not a
 * thing to time out and take away while the user is still looking for what
 * happened.
 *
 * `aria-live="assertive"`, because this is the correction of a belief the
 * user already holds: they watched the spinner clear and moved on.
 */
export function WriteFailureNotices() {
  const failures = useSyncExternalStore(
    subscribeToWriteFailures,
    writeFailureSnapshot,
    () => EMPTY,
  )

  if (failures.length === 0) return null

  return (
    <div
      aria-live="assertive"
      data-write-failures=""
      className="pointer-events-none fixed inset-x-0 bottom-4 z-50 mx-auto flex w-[min(32rem,calc(100vw-2rem))] flex-col gap-2"
    >
      {failures.map((failure) => (
        <Alert
          key={failure.id}
          variant={failure.success ? "default" : "destructive"}
          className="pointer-events-auto shadow-md"
        >
          {failure.success ? null : <AlertTriangle aria-hidden />}
          <AlertDescription className="text-foreground">
            {failure.message}
          </AlertDescription>
          <AlertAction>
            {failure.undo ? <Button type="button" variant="ghost" size="sm" disabled={failure.busy} onClick={() => void failure.undo?.()}>Undo</Button> : null}
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label="Dismiss"
              onClick={() => dismissWriteFailure(failure.id)}
            >
              <X className="size-3.5" aria-hidden />
            </Button>
          </AlertAction>
        </Alert>
      ))}
    </div>
  )
}
