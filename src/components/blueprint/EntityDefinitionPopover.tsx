import type { ReactElement, RefObject } from 'react'
import {
  DefinitionPopover,
  type DefinitionSection,
} from '@/components/blueprint/DefinitionCard'
import { useCanvasModeValue } from '@/contexts/canvasModeContext'
import { useEntityExamples } from '@/contexts/EntityExamplesContext'
import {
  ENTITY_EXAMPLE_PLACEHOLDER,
  ENTITY_KIND_DEFINITIONS,
  instanceDescriptionText,
  type EntityKindTerm,
} from '@/lib/panelTerms'

type EntityDefinitionPopoverProps = {
  /** Which kind of thing the label names. Its definition is the first section. */
  kind: EntityKindTerm
  /** This instance's own description, if it has one. The second section's body. */
  description?: string | null
  /** This instance's name. It is the second section's term. */
  name?: string
  /**
   * Whether to print this instance's description under the hairline.
   *
   * Off by default, and that default is the standing prohibition rather than
   * shyness: a menubar title and a slide header already print the description
   * as prose beside the name, and a popover repeating it would be two
   * mechanisms for one fact. It goes on where the label is ALONE on the board —
   * a path badge, a phase frame's label, a compare panel's label — and there
   * the empty case renders the placeholder, because "nobody has written this
   * yet" is a message and it is the one that gets it written.
   */
  showDescription?: boolean
  /**
   * A further note about THIS instance — the parallel-scenario aside is the
   * only one. It is a fact about the same label, so it rides in the same card.
   */
  note?: string | null
  children: ReactElement
  side?: 'top' | 'bottom' | 'left' | 'right'
  /** False for a `<span>` or a `<Badge>` trigger — Base UI warns otherwise. */
  nativeButton?: boolean
  className?: string
  /** Controlled open — for a header whose whole block owns the hover. */
  open?: boolean
  onOpenChange?: (open: boolean) => void
  /** Point the card at this element rather than the trigger. */
  anchor?: RefObject<Element | null> | Element | null
  /** Off when a surrounding block, not the trigger, opens on hover. */
  openOnHover?: boolean
  /** Hover open delay in ms. */
  delay?: number
  keepTriggerFocus?: boolean
}

/** The term an aside wears, so it is a section like every other one. */
const NOTE_TERM = 'Note'

/** The term the deployment's own example wears, under the generic rule. */
const EXAMPLE_TERM = 'Example'

/**
 * What this kind of thing IS, hung off the label that names one of them.
 *
 * It is a `DefinitionCard` and nothing else: this component's only job is to
 * turn a kind, an instance and an aside into SECTIONS.
 *
 * Several facts in one card, which is allowed: the KIND, then THIS INSTANCE,
 * then an aside. The standing prohibition is two mechanisms for one fact, not
 * one mechanism for several — and splitting them would put the definition of
 * "path" somewhere other than on the word "path".
 */
export function EntityDefinitionPopover({
  kind,
  description,
  name,
  showDescription = false,
  note,
  children,
  side = 'top',
  nativeButton = false,
  className,
  open,
  onOpenChange,
  anchor,
  openOnHover,
  keepTriggerFocus,
  delay,
}: EntityDefinitionPopoverProps) {
  const term = ENTITY_KIND_DEFINITIONS[kind]
  const trimmedName = name?.trim()
  const noteText = note?.trim() || null

  // This deployment's own example for this kind, read from the service once and
  // picked by kind. Absent outside a provider — a test, the path menu — where
  // the map is empty.
  const exampleText = useEntityExamples()[kind]?.trim() || null
  const editing = useCanvasModeValue() === 'design'

  const sections: DefinitionSection[] = [
    { term: term.label, body: term.definition },
  ]

  /*
    The instance section needs a NAME, because its term IS the name. A
    caller asking for a description with nothing to head it would get a
    headless section, so it draws nothing instead.
  */
  if (showDescription && trimmedName) {
    sections.push({
      term: trimmedName,
      body: instanceDescriptionText(description),
      unwritten: !description?.trim(),
    })
  }

  /*
    The example grounds the generic rule in something on THIS reader's board.
    A written one shows to everyone; a blank one renders nothing for a reader
    and, only in design mode, the same unwritten placeholder the instance
    section uses — the prompt goes to the deployer who can act on it, never to
    a viewer who cannot.
  */
  if (exampleText) {
    sections.push({ term: EXAMPLE_TERM, body: exampleText })
  } else if (editing) {
    sections.push({
      term: EXAMPLE_TERM,
      body: ENTITY_EXAMPLE_PLACEHOLDER,
      unwritten: true,
    })
  }

  if (noteText) {
    sections.push({ term: NOTE_TERM, body: noteText })
  }

  return (
    <DefinitionPopover
      sections={sections}
      side={side}
      nativeButton={nativeButton}
      className={className}
      open={open}
      onOpenChange={onOpenChange}
      anchor={anchor}
      openOnHover={openOnHover}
      keepTriggerFocus={keepTriggerFocus}
      delay={delay}
    >
      {children}
    </DefinitionPopover>
  )
}
