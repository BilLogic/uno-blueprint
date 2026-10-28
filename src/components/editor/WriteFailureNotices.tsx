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
 * Failures announce assertively because they correct a belief the user
 * already holds. Success uses a polite status and offers the latest Undo.
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
      data-write-failures=""
      /*
        Centre on the canvas column (right of the editor aside), not the
        full viewport — otherwise the toast sits left of the bottom control
        bar, which is itself centred in the main pane.
      */
      className="pointer-events-none fixed bottom-20 z-50 flex w-[min(32rem,calc(100vw-2rem))] max-w-[calc(100vw-2rem)] flex-col gap-2"
      style={{
        left: 'calc((100vw + var(--editor-aside-width, 0px)) / 2)',
        transform: 'translateX(-50%)',
      }}
    >
      {failures.map((failure) => (
        <Alert
          key={failure.id}
          role={failure.success ? 'status' : 'alert'}
          variant={failure.success ? 'default' : 'destructive'}
          className="pointer-events-auto flex items-center gap-3 shadow-md has-data-[slot=alert-action]:pr-2"
        >
          {failure.success ? null : <AlertTriangle aria-hidden />}
          <AlertDescription className="min-w-0 flex-1 text-foreground">
            {failure.message}
          </AlertDescription>
          <AlertAction className="static flex shrink-0 items-center gap-1">
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
