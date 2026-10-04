import type { ReactNode } from 'react'
import { Menu, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

/**
 * The phone's top chrome: menu · title · contextual right slot. The agent is
 * NOT here — it enters through the floating action button (MobileAgentFab), so
 * the bar stays navigation-only.
 *
 * The menu button is stateful — ☰ while the drawer is closed, ✕ while it is
 * open — and tapping it toggles, so the same control opens and closes the
 * drawer; `aria-expanded` and the label follow. The swap animates with a
 * small rotation, stilled under `prefers-reduced-motion`.
 *
 * `rightSlot` is contextual chrome the shell owns: the path selector on the
 * reader, Fit on the map, nothing when neither applies. The ⋯ overflow and
 * the theme toggle are gone — the overflow held only a disabled title,
 * and light/dark now lives at the foot of the drawer's rail, where the
 * desktop keeps its utilities.
 */
export function MobileTopBar({
  title,
  navOpen,
  onToggleNav,
  rightSlot,
}: {
  title: string
  navOpen: boolean
  onToggleNav: () => void
  rightSlot?: ReactNode
}) {
  return (
    // pl-1 keeps the menu icon's hit area flush with the edge glyph-aligned;
    // pr-3 gives the right slot (path control) real breathing room off the bezel.
    <header className="flex h-12 shrink-0 items-center gap-2 border-b border-border pl-1 pr-3">
      <Button
        variant="ghost"
        size="icon-sm"
        className="size-11"
        aria-label={navOpen ? 'Close navigation' : 'Open navigation'}
        aria-expanded={navOpen}
        onClick={onToggleNav}
      >
        <span
          aria-hidden
          className={cn(
            'flex items-center justify-center transition-transform ease-move duration-(--motion-micro) motion-reduce:transition-none',
            navOpen && 'rotate-90',
          )}
        >
          {navOpen ? <X /> : <Menu />}
        </span>
      </Button>
      <h1 className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
        {title}
      </h1>
      {rightSlot}
    </header>
  )
}
