import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ChevronDown, GripHorizontal, X } from 'lucide-react'
import { AgentPanel } from '@/components/editor/AgentPanel'
import { IconTooltip } from '@/components/editor/IconTooltip'
import { AGENT_FLOAT_MIN } from '@/lib/layoutTokens'
import {
  DOCK_MAX_RATIO,
  DOCK_MIN_RATIO,
  
  dockAgent,
  persistAgentPlacement,
  setAgentDrag,
  setAgentPlacement,
  toggleAgentOpen,
  useAgentDrag,
  useAgentPlacement,
} from '@/lib/agent/placement'
import { cn } from '@/lib/utils'

/** The sidebar's box, or null when it is not on screen (collapsed). */
function sidebarRect(): DOMRect | null {
  const el = document.querySelector<HTMLElement>('[data-editor-sidebar]')
  if (!el) return null
  const box = el.getBoundingClientRect()
  return box.width > 0 ? box : null
}

/**
 * Chat chrome shared by both postures — a grab bar, a collapse, a close.
 *
 * The grab bar is the whole placement gesture: drag it out of the sidebar
 * and the chat floats; drag it back over the sidebar and it docks again.
 * One conversation, two homes — dragging never touches session state, so
 * the transcript survives the move (it lives in the loop's module store).
 */
function AgentDockChrome({
  floating,
  dropTarget,
  onDragStart,
  children,
}: {
  floating: boolean
  dropTarget: boolean
  onDragStart: (event: React.PointerEvent<HTMLDivElement>) => void
  children: React.ReactNode
}) {
  return (
    <div
      className={cn(
        'flex min-h-0 flex-1 flex-col overflow-hidden',
        // ONE edge treatment: the token border carries it, the shadow does
        // the lift. A ring on top of the border read as a second outline
        // (and `ring-black/…` was a raw colour literal besides).
        floating && 'rounded-xl border border-border bg-popover shadow-lg',
        dropTarget && 'ring-2 ring-primary/50',
      )}
    >
      <div
        onPointerDown={onDragStart}
        className={cn(
          // pr-2 + a size-6 close box below: the ✕ shares one right edge
          // with the sessions header's `+` (icon-xs, size-6, in a px-2 row).
          'group/agent-grab flex h-6 shrink-0 cursor-grab touch-none items-center gap-1 border-b border-muted pl-2 pr-2 active:cursor-grabbing',
          floating ? 'bg-muted/40' : 'bg-transparent',
        )}
      >
        <GripHorizontal
          className="size-3 shrink-0 text-tertiary-foreground group-hover/agent-grab:text-muted-foreground"
          aria-hidden
        />
        <span className="min-w-0 flex-1 truncate text-xs font-medium text-muted-foreground">
          Agent
        </span>
        <IconTooltip
          label={
            floating
              ? 'Dock to the sidebar (or drag the bar back over it)'
              : 'Hide — drag the bar onto the canvas to float it'
          }
          side="bottom"
        >
          <button
            type="button"
            aria-label={floating ? 'Dock the agent to the sidebar' : 'Hide the agent'}
            onClick={() => (floating ? dockAgent() : toggleAgentOpen(false))}
            className="flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            {floating ? (
              <ChevronDown className="size-3" aria-hidden />
            ) : (
              <X className="size-3" aria-hidden />
            )}
          </button>
        </IconTooltip>
      </div>
      <div className="flex min-h-0 flex-1 flex-col">{children}</div>
    </div>
  )
}

/**
 * The agent, docked under the active sidebar panel or floating over the
 * canvas.
 *
 * Two mount points, and the gate is why that is not two copies. The docked
 * posture has to sit in the sidebar column's flow — it is a percentage of
 * that column's height with a drag divider above it — while the floating
 * posture portals to the body to escape the sidebar's clip and stacking
 * context. Neither can serve the other. The shell therefore renders this
 * gate at both points with mutually exclusive `visible`, and ONLY the
 * visible one mounts `AgentDockWindow`, which is where every hook lives.
 *
 * That split is the whole point: the hooks are window-global (a viewport
 * clamp, a pointer-drag, a resize — all registered on `window`), so
 * running them on a hidden instance registered a second clamp listener and
 * a second drag handler for one window on screen. Keeping the gate hook-free
 * makes "one window" and "one set of listeners" the same statement.
 */
export function AgentDock({ visible }: { visible: boolean }) {
  const placement = useAgentPlacement()
  if (!visible || !placement.open) return null
  return <AgentDockWindow />
}

function AgentDockWindow() {
  const placement = useAgentPlacement()
  // Drag state is SHARED (module store), not local: a drag-out flips which
  // mount point is visible mid-gesture, so component state would strand the
  // gesture on the instance that is about to hide.
  const { active: dragging, overSidebar } = useAgentDrag()
  const dragOffset = useRef({ x: 0, y: 0 })
  const [resizeFrom, setResizeFrom] = useState<{
    x: number
    y: number
    width: number
    height: number
  } | null>(null)
  const placementRef = useRef(placement)
  useEffect(() => {
    placementRef.current = placement
  })
  const windowRef = useRef<HTMLDivElement>(null)

  const floating = placement.mode === 'floating'

  const onDragStart = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return
    event.preventDefault()
    const box = windowRef.current?.getBoundingClientRect()
    dragOffset.current = box
      ? { x: event.clientX - box.left, y: event.clientY - box.top }
      : { x: 40, y: 12 }
    setAgentDrag({ active: true, overSidebar: false })
  }

  useEffect(() => {
    if (!dragging) return
    const hitTest = (event: PointerEvent) => {
      const rect = sidebarRect()
      const inside =
        rect !== null &&
        event.clientX >= rect.left &&
        event.clientX <= rect.right &&
        event.clientY >= rect.top &&
        event.clientY <= rect.bottom
      setAgentDrag({ active: true, overSidebar: inside })
      return inside
    }
    const move = (event: PointerEvent) => {
      // Leaving the sidebar mid-drag floats it immediately: the window
      // appears under the pointer and keeps following, which is what a
      // drag-out is supposed to feel like.
      if (!hitTest(event)) {
        setAgentPlacement(
          {
            mode: 'floating',
            open: true,
            float: {
              ...placementRef.current.float,
              x: Math.max(8, event.clientX - dragOffset.current.x),
              y: Math.max(8, event.clientY - dragOffset.current.y),
            },
          },
          // Flushed once on pointerup — see persistAgentPlacement.
          { persist: false },
        )
      }
    }
    const up = (event: PointerEvent) => {
      // Re-run the hit test on the release point itself: a fast drag can
      // deliver its last position with the pointerup and no move in
      // between, and the drop still has to land where the pointer is.
      const inside = hitTest(event)
      setAgentDrag({ active: false, overSidebar: false })
      // Dropped on the sidebar: dock. Anywhere else: it is already
      // floating (the move handler switched it) and stays put.
      if (inside) dockAgent()
      else persistAgentPlacement()
    }
    // A release the page never sees — over the OS taskbar, devtools, another
    // app — would otherwise leave the window glued to the cursor with no
    // button held. Blur and Escape are the escape hatches.
    const abandon = () => {
      setAgentDrag({ active: false, overSidebar: false })
      persistAgentPlacement()
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') abandon()
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
    window.addEventListener('blur', abandon)
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up)
      window.removeEventListener('blur', abandon)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [dragging])

  // Corner resize. State-flagged with effect-owned listeners (the pattern
  // AgentDockDivider already uses) rather than listeners registered inside
  // the pointerdown handler: those leak if the component unmounts mid-drag
  // — closing the chat while resizing left an orphaned handler resurrecting
  // the window on every mouse move.
  useEffect(() => {
    if (!resizeFrom) return
    const move = (event: PointerEvent) => {
      setAgentPlacement(
        {
          float: {
            // x/y come from the store (setAgentPlacement merges over the
            // live float), so a stale captured position cannot be written
            // back on top of a newer one.
            ...placementRef.current.float,
            width: Math.max(
              AGENT_FLOAT_MIN.width,
              resizeFrom.width + event.clientX - resizeFrom.x,
            ),
            height: Math.max(
              AGENT_FLOAT_MIN.height,
              resizeFrom.height + event.clientY - resizeFrom.y,
            ),
          },
        },
        { persist: false },
      )
    }
    const done = () => {
      setResizeFrom(null)
      persistAgentPlacement()
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', done)
    window.addEventListener('pointercancel', done)
    return () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', done)
      window.removeEventListener('pointercancel', done)
    }
  }, [resizeFrom])

  // Keep a floating window inside the viewport when it shrinks.
  useEffect(() => {
    if (!floating) return
    const clampToViewport = () => {
      const box = placementRef.current.float
      const maxX = window.innerWidth - 120
      const maxY = window.innerHeight - 80
      if (box.x > maxX || box.y > maxY) {
        setAgentPlacement({
          float: {
            ...box,
            x: Math.min(box.x, Math.max(8, maxX)),
            y: Math.min(box.y, Math.max(8, maxY)),
          },
        })
      }
    }
    window.addEventListener('resize', clampToViewport)
    return () => window.removeEventListener('resize', clampToViewport)
  }, [floating])

  const body = (
    <AgentDockChrome
      floating={floating}
      dropTarget={dragging && overSidebar && floating}
      onDragStart={onDragStart}
    >
      <AgentPanel />
    </AgentDockChrome>
  )

  if (!floating) {
    return (
      <div
        ref={windowRef}
        className="flex min-h-0 flex-col border-t border-muted"
        style={{ height: `${placement.dockRatio * 100}%` }}
        data-agent-dock="docked"
      >
        {body}
      </div>
    )
  }

  return createPortal(
    <div
      ref={windowRef}
      data-agent-dock="floating"
      className={cn(
        'fixed z-40 flex flex-col',
        dragging && 'select-none',
      )}
      style={{
        left: placement.float.x,
        top: placement.float.y,
        width: placement.float.width,
        height: placement.float.height,
      }}
    >
      {body}
      {/* Resize from the bottom-right, the corner every floating window
          has trained people to reach for. */}
      <div
        onPointerDown={(event) => {
          event.preventDefault()
          setResizeFrom({
            x: event.clientX,
            y: event.clientY,
            width: placement.float.width,
            height: placement.float.height,
          })
        }}
        className="absolute right-0 bottom-0 size-3.5 cursor-nwse-resize touch-none"
        aria-hidden
      />
    </div>,
    document.body,
  )
}

/** Drag divider between the sidebar panel and the docked chat. */
export function AgentDockDivider({ columnRef }: { columnRef: React.RefObject<HTMLDivElement | null> }) {
  const [resizing, setResizing] = useState(false)
  useEffect(() => {
    if (!resizing) return
    const move = (event: PointerEvent) => {
      const box = columnRef.current?.getBoundingClientRect()
      if (!box || box.height === 0) return
      const ratio = (box.bottom - event.clientY) / box.height
      setAgentPlacement({
        dockRatio: Math.min(DOCK_MAX_RATIO, Math.max(DOCK_MIN_RATIO, ratio)),
      })
    }
    const up = () => setResizing(false)
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    return () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
  }, [resizing, columnRef])

  return (
    <div
      role="separator"
      aria-orientation="horizontal"
      aria-label="Resize the agent panel"
      onPointerDown={(event) => {
        event.preventDefault()
        setResizing(true)
      }}
      className={cn(
        'h-1 shrink-0 cursor-row-resize touch-none transition-colors duration-(--motion-micro) ease-arrive motion-reduce:transition-none',
        resizing ? 'bg-border' : 'hover:bg-border/80',
      )}
    />
  )
}
