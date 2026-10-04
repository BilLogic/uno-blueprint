import { Home, PanelLeft, Play } from 'lucide-react'
import { DevTierOverrideBadge } from '@/components/editor/DevPortal'
import { IconTooltip } from '@/components/editor/IconTooltip'
import { PathSelectorMenu } from '@/components/editor/PathSelectorMenu'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useWorkspaceTitle } from '@/contexts/DeploymentConfigContext'
import { useSupabase } from '@/contexts/SupabaseProvider'
import { useSidebarCollapsedState } from '@/contexts/sidebarCollapsedContext'
import { cn } from '@/lib/utils'

type SidebarCollapseButtonProps = {
  collapsed: boolean
  onToggle: () => void
  className?: string
  size?: 'icon-sm' | 'icon-xs'
}

/** Collapse/expand the sidebar. The chevron rotates on the shared structural ease. */
export function SidebarCollapseButton({
  collapsed,
  onToggle,
  className,
  size = 'icon-xs',
}: SidebarCollapseButtonProps) {
  return (
    <IconTooltip
      label={collapsed ? 'Expand the sidebar' : 'Collapse the sidebar'}
      side="right"
    >
      <Button
        type="button"
        variant="ghost"
        size={size}
        className={cn(
          'shrink-0 text-muted-foreground hover:text-foreground',
          className,
        )}
        onClick={onToggle}
        aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
      >
        <PanelLeft
          className={cn(
            'size-3.5 transition-transform motion-reduce:transition-none duration-(--motion-structural) ease-arrive',
            !collapsed && 'rotate-180',
          )}
        />
      </Button>
    </IconTooltip>
  )
}

type HomeNavButtonProps = {
  isActive?: boolean
  onClick: () => void
  className?: string
  size?: 'icon-sm' | 'icon-xs'
}

/** Route back to the cover page from the tab strip. */
export function HomeNavButton({
  isActive = false,
  onClick,
  className,
  size = 'icon-xs',
}: HomeNavButtonProps) {
  return (
    <IconTooltip label="Back to the cover page" side="bottom">
      <Button
        type="button"
        variant="ghost"
        size={size}
        className={cn(
          'shrink-0 text-muted-foreground hover:text-foreground',
          isActive && 'bg-sidebar-accent text-sidebar-accent-foreground',
          className,
        )}
        onClick={onClick}
        aria-label="Home"
        aria-current={isActive ? 'page' : undefined}
      >
        <Home className="size-3.5" />
      </Button>
    </IconTooltip>
  )
}

export function WorkspaceBadges() {
  const { configured, isDevAuthoring, isEditPreview } = useSupabase()
  return (
    <>
      {/* Which of the two worlds this is: the template's bundled sample, or a
          deployment's own database. Connecting one hides the sample for good,
          gaps and all — too large a difference to leave to the code. */}
      {!configured ? (
        <Badge
          variant="default"
          title="No database connected — every board here is the template's bundled sample. Connect one and it is replaced by your own rows, including where they are empty."
        >
          sample data
        </Badge>
      ) : null}
      {/* Writing with the local authoring key is a privileged state that
          looks exactly like the read-only app otherwise. Say so. */}
      {isDevAuthoring ? (
        <Badge
          variant="warning"
          title="Local authoring key in use — writes go to the live database"
        >
          authoring
        </Badge>
      ) : null}
      {/* The opposite state, and it must not look like the one above: the Edit
          surfaces are visible so they can be worked on, and every write will
          be refused. Amber says "careful, this is live"; slate says "nothing
          you do here lands". */}
      {isEditPreview ? (
        <Badge
          variant="secondary"
          className="bg-muted text-muted-foreground"
          title="Edit UI preview — no authoring key, so writes will be refused"
        >
          edit preview
        </Badge>
      ) : null}
      {/* Third state, and the only simulated one: the developer portal's
          tier override. */}
      <DevTierOverrideBadge />
    </>
  )
}

/**
 * The collapsed sidebar's remnant: a floating navbar over the canvas
 * (Figma's collapsed-file control). Clicking its toggle expands the sidebar
 * back into flow — no hover-peek: one control, one behavior.
 *
 * While collapsed this IS the navbar: whatever band would have
 * rendered under it hands over its identity and primary action and draws
 * nothing itself, so there is one header on screen instead of two
 * stacked ones. It widens to fit rather than the title truncating
 * to nothing — it is the only place that context lives at this width.
 */
export function FloatingSidebarNavbar({ onExpand }: { onExpand: () => void }) {
  const { summary } = useSidebarCollapsedState()
  // The same wordmark the tab strip carries, from the same seam.
  const editorTitle = useWorkspaceTitle()
  // On a scenario the collapsed bar carries the path selector as a trailing
  // control, so paths can be switched without expanding the sidebar. A
  // phase hands over an empty list and this stays hidden — the same control,
  // mounted only where it applies.
  const paths = summary?.paths
  return (
    // `pl-1 pr-3` is the mirror of what it was: the icon button carries its
    // own padding, so the tight side is whichever end the toggle is on.
    <div
      className="pointer-events-auto flex max-w-[min(36rem,calc(100vw-6rem))] items-center gap-2 rounded-lg border border-border bg-background/95 py-1 pl-1 pr-3 shadow-md backdrop-blur-sm"
      data-editor-sidebar-navbar
    >
      {/* First, not last. This is the control that brings the sidebar back,
          and the sidebar comes back at the left edge — a toggle at the far
          right sat as far from the thing it summons as this strip allows. */}
      <SidebarCollapseButton collapsed onToggle={onExpand} size="icon-sm" />
      <p className="shrink-0 truncate text-sm font-medium text-foreground">
        {editorTitle}
      </p>
      {summary ? (
        <>
          <span className="shrink-0 text-border" aria-hidden>
            /
          </span>
          <p className="min-w-0 truncate text-xs text-muted-foreground">
            {summary.glyph ? (
              <span aria-hidden>{summary.glyph} </span>
            ) : null}
            {summary.title}
          </p>
          {summary.action ? (
            <Button
              type="button"
              size="sm"
              className="ml-1 h-6 shrink-0 px-2 text-xs"
              onClick={summary.action.onClick}
            >
              <Play className="size-3" aria-hidden />
              {summary.action.label}
            </Button>
          ) : null}
        </>
      ) : null}
      {/* The path selector, mounted only when a scenario handed its paths
          over. `PathSelectorMenu` itself returns nothing for an empty list, so
          the gate here keeps it off the DOM entirely on a phase rather than
          mounting a control that renders nothing. */}
      {paths && paths.length > 0 ? (
        <PathSelectorMenu options={paths} />
      ) : null}
    </div>
  )
}
