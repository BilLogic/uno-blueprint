import { Pencil, Trash2 } from 'lucide-react'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from '@/components/ui/context-menu'
import { ChangeCount } from '@/components/editor/agent/ChangeCount'
import { useAgentChangeCount } from '@/components/editor/agent/useAgentChangeCount'
import { type AgentSession } from '@/lib/agent/sessions'
import { cn } from '@/lib/utils'

export function SessionRow({
  session,
  onOpen,
  onRename,
  onDelete,
}: {
  session: AgentSession
  onOpen: () => void
  onRename: () => void
  onDelete: () => void
}) {
  const changeCount = useAgentChangeCount(session.id)
  const row = (
    <button
      type="button"
      onClick={onOpen}
      className={cn(
        // pl-6 = the NavSection title's own text indent (pl-1 + size-4
        // chevron slot + gap-1), so rows left-align with TODAY / EARLIER.
        'group/session flex w-full min-w-0 items-center gap-2 rounded-md py-2 pl-6 pr-2 text-left transition-colors duration-(--motion-micro) ease-arrive motion-reduce:transition-none',
        'hover:bg-sidebar-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring',
      )}
    >
      {/* No per-row glyph: a column of identical ✦ marks says nothing the
          SESSIONS header hasn't already said. */}
      <span className="min-w-0 flex-1 truncate text-sm text-foreground group-hover/session:text-sidebar-accent-foreground">
        {session.title}
      </span>
      {changeCount > 0 ? (
        <ChangeCount
          count={changeCount}
          className="text-tertiary-foreground"
        />
      ) : null}
    </button>
  )

  return (
    <ContextMenu>
      <ContextMenuTrigger className="block w-full">{row}</ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem onClick={onRename}>
          <Pencil className="size-3.5" />
          Rename…
        </ContextMenuItem>
        <ContextMenuItem variant="destructive" onClick={onDelete}>
          <Trash2 className="size-3.5" />
          Delete session…
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  )
}
