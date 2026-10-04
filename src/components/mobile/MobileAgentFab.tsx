import { Sparkles } from 'lucide-react'

/**
 * The agent's entry point on the phone: a floating action button, bottom
 * right above the safe-area inset. (A full-width bottom bar was tried and
 * reverted 2026-08-17 — it spent a whole chrome row on one action.) Hidden
 * entirely for read-only tiers — the same rule as everywhere else in the
 * chrome: viewers get no agent affordance. The sheet it opens covers it,
 * so it needs no open/close state of its own.
 */
export function MobileAgentFab({
  canAgent,
  onOpen,
}: {
  canAgent: boolean
  onOpen: () => void
}) {
  if (!canAgent) return null
  return (
    <button
      type="button"
      aria-label="Ask the agent"
      onClick={onOpen}
      className="fixed right-4 bottom-[max(1rem,env(safe-area-inset-bottom))] z-30 flex size-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg active:scale-95 transition-transform ease-spring duration-(--motion-micro) motion-reduce:transition-none"
    >
      <Sparkles className="size-5" aria-hidden />
    </button>
  )
}
