import { MiniBlueprintIllustration } from '@/components/blueprint/MiniBlueprintIllustration'
import { Button } from '@/components/ui/button'
import { usePathSelectionContext } from '@/hooks/usePathSelection'
import { cn } from '@/lib/utils'

type CanvasEmptyStateProps = {
  className?: string
  title?: string
  summary?: string
  /**
   * `canvas` — full viewport placeholder (no paths selected).
   * `panel` — inside a scenario compare card.
   * `phase` — inside a phase frame with no matching scenarios.
   */
  variant?: 'canvas' | 'panel' | 'phase'
  /** One-click way out of "no paths selected"; canvas variant only by default. */
  showRestoreAction?: boolean
  /**
   * Draw the mini-blueprint. Off for a failed read: that is not an empty
   * board, and a picture of one would say the board is empty when nobody
   * knows.
   */
  showIllustration?: boolean
}

/**
 * Restores the happy-path default selection, reusing the same derivation
 * `PathSelectionContext` applies on its first sync (no second definition of
 * "the default path"). Hidden until the catalog has something to restore.
 */
function RestoreDefaultPathsButton() {
  const { defaultPathKeys, restoreDefaultPathKeys } = usePathSelectionContext()
  if (defaultPathKeys.length === 0) return null

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className="mt-1 self-start"
      onClick={restoreDefaultPathKeys}
    >
      Show the default path
    </Button>
  )
}

/** Empty-canvas / empty-panel placeholder for path filter states. */
export function CanvasEmptyState({
  className,
  title = 'No paths selected',
  summary = 'Pick one from the paths menu in the header.',
  variant = 'canvas',
  showRestoreAction,
  showIllustration = true,
}: CanvasEmptyStateProps) {
  const isCanvas = variant === 'canvas'
  const isPanel = variant === 'panel'
  const isPhase = variant === 'phase'

  return (
    <div
      className={cn(
        'flex',
        isCanvas && 'min-h-0 flex-1 items-center justify-center px-6',
        isPanel && 'h-full min-h-[220px] w-[640px] items-stretch p-1',
        isPhase && 'min-h-[220px] w-full items-stretch',
        className,
      )}
      data-canvas-empty-state={variant}
    >
      <div
        className={cn(
          'flex flex-col justify-center',
          isCanvas && 'max-w-sm gap-2',
          // Board chrome, not app chrome: the empty state sits on the frozen
          // blueprint palette, so its fallbacks are board tokens rather than
          // hexes (`--secondary` when no panel override is set) and its border
          // hairline is `--border` like every other hairline.
          isPanel &&
            'w-full flex-1 gap-2 rounded-xl border border-dashed border-border bg-[color:var(--background-blueprint-panel-section,var(--secondary))] px-5 py-6',
          isPhase &&
            'w-full flex-1 gap-2 rounded-xl border border-dashed border-border bg-[color:var(--background-blueprint-panel-canvas,var(--secondary))] px-6 py-7',
        )}
      >
        {/* The picture sits above the copy and stays out of its way: large on
            the open canvas, small inside a frame, where the frame is already
            most of the figure. */}
        {showIllustration ? (
          <MiniBlueprintIllustration
            size={isCanvas ? 'lg' : 'sm'}
            className={isCanvas ? 'mb-4' : 'mb-2'}
          />
        ) : null}
        <p className="text-sm font-medium tracking-tight text-foreground">
          {title}
        </p>
        <p
          className={cn(
            'text-xs text-muted-foreground',
            !isCanvas && 'max-w-[18rem]',
          )}
        >
          {summary}
        </p>
        {(showRestoreAction ?? isCanvas) ? <RestoreDefaultPathsButton /> : null}
      </div>
    </div>
  )
}

/**
 * The canvas with nothing drawn because no path is on, worded for where the
 * reader is. Focused, the reader turned every path off, and the header's
 * paths menu is the way back. Unfocused, a phase draws each scenario's
 * default path, so the only way to draw nothing is for no scenario in scope
 * to have a path to show, and the header has no paths menu to point at.
 */
export function NoPathsEmptyState({ focused }: { focused: boolean }) {
  return focused ? (
    <CanvasEmptyState />
  ) : (
    <CanvasEmptyState
      title="No paths to show"
      summary="None of the scenarios here has a path to draw. Open one from the sidebar."
      showRestoreAction={false}
    />
  )
}
