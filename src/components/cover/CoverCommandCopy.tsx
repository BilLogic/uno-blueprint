import { useCallback, useEffect, useRef, useState } from 'react'
import { Check, Copy } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * A skill invocation, click-to-copy.
 *
 * The skills run in Claude Code, not in this app, so the useful affordance is
 * getting the exact command onto the clipboard — a button that pretended to
 * run something here would be worse than no button. Both labels come from the
 * content module; the component supplies only the composition.
 */
export function CoverCommandCopy({
  command,
  copyLabel,
  copiedLabel,
}: {
  command: string
  copyLabel: string
  copiedLabel: string
}) {
  const [copied, setCopied] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current)
    },
    [],
  )

  const copy = useCallback(() => {
    // Guarded: the clipboard API is absent over plain http and in jsdom.
    const clipboard = navigator.clipboard
    if (!clipboard?.writeText) return
    clipboard
      .writeText(command)
      .then(() => {
        setCopied(true)
        if (timer.current) clearTimeout(timer.current)
        timer.current = setTimeout(() => setCopied(false), 1600)
      })
      // A denied clipboard (permissions, embedded contexts) is not an error
      // worth surfacing on an orientation page — the control simply stays put.
      .catch(() => {})
  }, [command])

  return (
    <button
      type="button"
      onClick={copy}
      aria-label={`${copyLabel} ${command}`}
      className={cn(
        'inline-flex items-center gap-2 rounded-md border border-border bg-muted/40 px-2 py-1',
        'font-mono text-sm text-foreground transition-colors motion-reduce:transition-none duration-(--motion-structural) ease-arrive',
        'hover:bg-muted focus-visible:outline-1 focus-visible:outline-ring',
      )}
    >
      {command}
      {copied ? (
        <Check aria-hidden className="size-3.5 text-muted-foreground" />
      ) : (
        <Copy aria-hidden className="size-3.5 text-muted-foreground" />
      )}
      {/* Announced on success only — the resting control already reads its command. */}
      <span aria-live="polite" className="sr-only">
        {copied ? copiedLabel : ''}
      </span>
    </button>
  )
}
