import { ExternalLink, FileText, Play } from 'lucide-react'
import { cn } from '@/lib/utils'
import { safeExternalHref } from '@/lib/sliceCells'
import type { FeaturedButton, LinkGlyph } from '@/lib/resourcePresentation'

const GLYPH: Record<LinkGlyph, typeof ExternalLink> = {
  open: ExternalLink,
  watch: Play,
  document: FileText,
}

/**
 * One button per featured link, named by host.
 *
 * Nothing here decides what is featured or what a host is called — both are
 * read off the resources in `resourcePresentation.ts`, which is the seam the
 * tests hold. Buttons are plain anchors — a new tab, `noopener` — so what they
 * do is what every link on the page does.
 */
export function FeaturedButtons({
  buttons,
  className,
}: {
  buttons: readonly FeaturedButton[]
  className?: string
}) {
  const safe = buttons.filter((button) => safeExternalHref(button.url))
  if (safe.length === 0) return null
  return (
    <div className={cn('flex flex-wrap gap-2', className)} data-featured-buttons="">
      {safe.map((button) => {
        const Glyph = GLYPH[button.glyph]
        return (
          <a
            key={button.url}
            href={safeExternalHref(button.url) ?? undefined}
            target="_blank"
            rel="noopener noreferrer"
            title={button.host}
            className={cn(
              'inline-flex h-7 items-center gap-2 rounded-md border border-border bg-background px-2 text-xs font-medium text-foreground',
              'transition-colors duration-(--motion-micro) ease-arrive motion-reduce:transition-none hover:bg-accent focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none',
            )}
          >
            <Glyph className="size-3 shrink-0 text-muted-foreground" aria-hidden />
            {button.label}
          </a>
        )
      })}
    </div>
  )
}
