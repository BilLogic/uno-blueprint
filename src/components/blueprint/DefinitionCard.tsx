import { HOVER_HINT_DELAY } from '@/lib/hoverIntent'
import type { ReactElement, RefObject } from 'react'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { cn } from '@/lib/utils'

/**
 * One part of a definition: the word, and what it means.
 *
 * `term` is a category ("Path", "Staff", "Live") or an instance's own name
 * ("Happy Path", "Blueprint owner"). Both are set the same way, which is the
 * whole point — see `DefinitionCard`.
 */
export type DefinitionSection = {
  term: string
  body: string
  /**
   * True when `body` is the placeholder rather than authored prose. It changes
   * the BODY only; a section never heads itself differently.
   */
  unwritten?: boolean
}

/**
 * A definition, as ONE shape: sections, each a term above a body,
 * identically typeset and hairline-separated.
 *
 * One section is a term and its meaning. Two is a category then an instance —
 * Path over what a path is, then this path's name over its own description.
 *
 * The card heads every section the same way: the term in sentence case over
 * its body. One heading treatment, so the card reads as a pattern rather than
 * as a one-off — the category half and the instance half are typeset
 * identically.
 *
 * The `data-definition-*` attributes are the seam `definitionCard.test.tsx`
 * reads: "every section is typeset the same" is a claim about the rendered
 * sections and cannot be checked any other way.
 */
export function DefinitionCard({ sections }: { sections: DefinitionSection[] }) {
  return (
    <div data-definition-card="" className="flex flex-col">
      {sections.map((section, index) => (
        <div
          key={`${index}-${section.term}`}
          data-definition-section=""
          /* The hairline separates sections; it never heads one. */
          className={cn(
            'flex flex-col gap-1 px-3 py-2',
            index > 0 && 'border-t border-border',
          )}
        >
          {/*
            The TERM, in the case the thing it names is written in everywhere
            else.

            Not the shared `Eyebrow`. An eyebrow labels a REGION of chrome —
            a menu group, a comparison column — where the label is furniture
            and the content beside it is the subject. Here the word IS the
            subject: the reader hovered a badge that says `Frontstage` and the
            card's job is to answer for that word. Setting it in caps with
            letterspacing printed a third spelling of a term the badge, the
            panel and the board all write in sentence case, so the card read
            as a different vocabulary from the one it was explaining.

            Weight separates the term from its sentence, not ink — 500, the
            one emphasis the weight doctrine gives a label. Both are
            `text-foreground`: a muted term would sit quieter than the prose
            underneath it, which is backwards for the thing being defined.
          */}
          <span
            data-definition-term=""
            className="block text-xs font-medium text-foreground"
          >
            {section.term}
          </span>
          <span
            data-definition-body=""
            className={cn(
              'text-xs text-foreground',
              section.unwritten && 'italic opacity-80',
            )}
          >
            {section.body}
          </span>
        </div>
      ))}
    </div>
  )
}

/**
 * The card, hung off the thing it defines.
 *
 * A POPOVER and never a `Tooltip`, and that is a bug fix rather than a
 * preference. Base UI's `Tooltip` is `mouseOnly` with no press to fall back
 * on, so a definition put there is invisible on a phone — and this app has a
 * real phone posture (a full-width bottom sheet). `Popover` takes `openOnHover`
 * for the pointer and keeps its own press for everyone else: one mechanism
 * reaching both readers.
 *
 * The trigger supplies `tabIndex`, so every definition is reachable by
 * keyboard focus. That is what makes the ⓘ removable: the icon was never what
 * made a definition reachable.
 *
 * Uncontrolled and hover-driven by default, which is every caller but the grid
 * headers. Those own the hover themselves — the definition surfaces from a
 * hover ANYWHERE on the header block, not just over the trigger — so they drive
 * `open` and point the card at the block through `anchor` while turning the
 * trigger's own hover off. The touch ⓘ stays the trigger, so a tap and a
 * keyboard press still open the card the ordinary way.
 */
export function DefinitionPopover({
  sections,
  children,
  side = 'top',
  nativeButton = false,
  className,
  open,
  onOpenChange,
  anchor,
  openOnHover = true,
  delay = HOVER_HINT_DELAY,
  keepTriggerFocus = false,
}: {
  sections: DefinitionSection[]
  children: ReactElement
  side?: 'top' | 'bottom' | 'left' | 'right'
  /** False for a `<span>` or a `<Badge>` trigger — Base UI warns otherwise. */
  nativeButton?: boolean
  className?: string
  /** Controlled open state. Omit for the default uncontrolled popover. */
  open?: boolean
  onOpenChange?: (open: boolean) => void
  /**
   * Position the card against this element instead of the trigger — for a
   * definition a surrounding block owns the hover of, so the card centres on
   * the block rather than on a corner ⓘ.
   */
  anchor?: RefObject<Element | null> | Element | null
  /** Whether the trigger opens on its own hover. Off when a block owns it. */
  openOnHover?: boolean
  /** Hover open delay in ms. */
  delay?: number
  /** Focus-controlled headers retain their keyboard position when their card opens. */
  keepTriggerFocus?: boolean
}) {
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger
        render={children}
        nativeButton={nativeButton}
        openOnHover={openOnHover}
        delay={delay}
        closeDelay={80}
      />
      <PopoverContent
        {...(keepTriggerFocus ? { initialFocus: false as const } : {})}
        side={side}
        sideOffset={6}
        anchor={anchor ?? undefined}
        className={cn('w-auto max-w-xs gap-0 p-0 text-left', className)}
      >
        <DefinitionCard sections={sections} />
      </PopoverContent>
    </Popover>
  )
}
