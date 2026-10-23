import { sessionSnapshot, subscribeToSession } from '@/lib/authoringSession'

/**
 * Writes that did not land, on their way to the person who asked for them.
 *
 * The app had no answer for a failed write whose control is gone by the time
 * the answer arrives. A cell delete closes its own menu on success, so there
 * is nothing left near the action to render an error into; the ⌘Z revert has
 * no control at all. Both of those reached the console and stopped there,
 * which reads exactly like success: the spinner clears, the cell is still
 * there, and nothing is said.
 *
 * This is that one surface, and it is deliberately the only one — a write
 * path that still has its own form or dialog on screen keeps reporting there
 * (the local-error pattern in `CreatePhaseDialog` and friends), because an
 * error next to the control that caused it is better than an error in the
 * corner. Reach for this when the control is gone.
 *
 * Module-level rather than React state, because the reporting call sites are
 * plain async functions, event handlers and `catch` blocks with no component
 * around them. Subscribers read through `useSyncExternalStore`.
 */

export type WriteFailure = {
  id: string
  /** One sentence, already phrased for a person. */
  message: string
  at: number
  success?: boolean
  undo?: () => Promise<void>
  busy?: boolean
}

/**
 * How many are kept on screen. A failing session usually fails the same way
 * repeatedly, and a stack that grows without limit buries the canvas under
 * the report of its own trouble.
 */
const MAX_VISIBLE = 3

let failures: WriteFailure[] = []
let listeners: Array<() => void> = []
let counter = 0

function emit() {
  for (const listener of listeners) listener()
}

export function subscribeToWriteFailures(listener: () => void): () => void {
  listeners = [...listeners, listener]
  return () => {
    listeners = listeners.filter((entry) => entry !== listener)
  }
}

/** Stable snapshot — `useSyncExternalStore` compares by identity. */
export function writeFailureSnapshot(): WriteFailure[] {
  return failures
}

/**
 * Say that a write failed.
 *
 * `subject` names what did not happen at the user's altitude ("The cell was
 * not deleted"), and the error supplies why. `AuthoringError` has already
 * translated the database's own text into something worth showing; anything
 * else contributes its message, and a non-`Error` contributes nothing rather
 * than `[object Object]`.
 *
 * The console still gets the whole thing. This surface replaces the console
 * as the user's channel, not as the developer's.
 */
export function reportWriteFailure(subject: string, error: unknown): void {
  console.error(`[authoring] ${subject}:`, error)

  const detail = error instanceof Error ? error.message.trim() : ''
  const message = detail
    ? `${subject}. ${detail}`
    : `${subject}. The details are in the console.`

  counter += 1
  failures = [
    ...failures.slice(-(MAX_VISIBLE - 1)),
    { id: `w${counter}`, message, at: Date.now() },
  ]
  emit()
}

export function dismissWriteFailure(id: string): void {
  noticeCleanup.get(id)?.()
  noticeCleanup.delete(id)
  const next = failures.filter((entry) => entry.id !== id)
  if (next.length === failures.length) return
  failures = next
  emit()
}

/** Test seam — no product code clears the whole list. */
export function resetWriteFailures(): void {
  for (const cleanup of noticeCleanup.values()) cleanup()
  noticeCleanup.clear()
  failures = []
  emit()
}

/** Success notices share the shell surface and live only as long as their undo. */
export function reportWriteSuccess(
  message: string,
  entryId: string,
  undo: () => Promise<void>,
): void {
  const id = `w${++counter}`
  const timer = setTimeout(() => dismissWriteFailure(id), 8000)
  const unsubscribe = subscribeToSession(() => {
    if (!sessionSnapshot().some((entry) => entry.id === entryId))
      dismissWriteFailure(id)
  })
  noticeCleanup.set(id, () => {
    clearTimeout(timer)
    unsubscribe()
  })
  failures = [
    ...failures.slice(-(MAX_VISIBLE - 1)),
    {
      id,
      message,
      at: Date.now(),
      success: true,
      undo: async () => {
        const notice = failures.find((entry) => entry.id === id)
        if (!notice || notice.busy) return
        failures = failures.map((entry) =>
          entry.id === id ? { ...entry, busy: true } : entry,
        )
        emit()
        try {
          await undo()
          dismissWriteFailure(id)
        } catch (error) {
          reportWriteFailure('The addition was not undone', error)
        } finally {
          failures = failures.map((entry) =>
            entry.id === id ? { ...entry, busy: false } : entry,
          )
          emit()
        }
      },
    },
  ]
  emit()
}
const noticeCleanup = new Map<string, () => void>()
