// @vitest-environment jsdom
/**
 * Every definition in the app opens the same way and looks the same.
 *
 * The card's own seam is the CARD. "One section and two sections are typeset
 * identically" is the assertion that stops the pattern drifting into two
 * shapes — a category half in a small-caps title and an instance half in a
 * plain medium-weight name, inside one card.
 *
 * The board wiring is exercised through the three labels that render a
 * category and an instance — a path badge, a scenario/phase title badge and a
 * stakeholder badge — plus the per-service example the popover grounds each
 * generic definition with.
 *
 * What is rendered and what is read as text, and why:
 *
 *   - the card, the two-section surfaces, `StatusBadge`, the two made-up
 *     words' `Field` labels and the canvas title are RENDERED, because the
 *     claims are about what a reader sees and in what order;
 *   - "no cue and no ⓘ survive" is read as TEXT, because it is a claim about
 *     the whole tree and no single render can observe an absence everywhere.
 */
import type { ReactElement, ReactNode } from 'react'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { sourceOf, strippedSourcesOn } from '@/lib/sourceTree'
import {
  DefinitionCard,
  DefinitionPopover,
} from '@/components/blueprint/DefinitionCard'
import { EntityDefinitionPopover } from '@/components/blueprint/EntityDefinitionPopover'
import { EntityTitleAffordance } from '@/components/blueprint/EntityTitleAffordance'
import { BlueprintDividerRailLabel } from '@/components/blueprint/BlueprintDividerBadge'
import { PanelSectionLabel } from '@/components/blueprint/PanelSectionLabel'
import { Field } from '@/components/blueprint/panelShell'
import { PathLabelBadge } from '@/components/blueprint/PathLabelBadge'
import { ScenarioTitleBadge } from '@/components/blueprint/ScenarioTitleBadge'
import { StakeholderBadge } from '@/components/blueprint/StakeholderBadge'
import { StatusBadge } from '@/components/blueprint/StatusBadge'
import { ENTITY_STATUS_MEANING } from '@/lib/entityStatus'
import {
  STAKEHOLDER_KIND_LABELS,
  STAKEHOLDER_KIND_MEANING,
  type StakeholderKind,
} from '@/hooks/useStakeholders'
import {
  ENTITY_EXAMPLE_PLACEHOLDER,
  ENTITY_KIND_DEFINITIONS,
  PANEL_TERMS,
} from '@/lib/panelTerms'
import { CanvasModeContext } from '@/contexts/canvasModeContext'
import { EntityDetailProvider } from '@/contexts/EntityDetailContext'
import { EntityExamplesContext } from '@/contexts/EntityExamplesContext'

afterEach(cleanup)

/**
 * A render inside the entity panel's provider.
 *
 * `EntityTitleAffordance` reads the panel through `useEntityDetail`, which
 * throws outside the provider — the app mounts it once, on `EditorShell`,
 * above every tree. A test renders the affordance alone, so it brings the
 * provider with it.
 */
function renderWithEntityDetail(ui: ReactNode) {
  return render(<EntityDetailProvider>{ui}</EntityDetailProvider>)
}

/* --------------------------------------------------------- opening one */

/**
 * Hover, as Base UI actually learns it.
 *
 * Base UI's hover interaction is `mouseOnly`: it decides from a pointer type
 * it records on React's `onPointerEnter`, and React synthesises that handler
 * from `pointerover` rather than `pointerenter`. A `mouseOver` alone leaves
 * the pointer type unset and the popover never opens. The working sequence is
 * pointerover → mouseenter → mousemove. jsdom has no `PointerEvent`, so the
 * first is a `MouseEvent` with the property attached.
 */
function hover(element: Element) {
  // The TRIGGER, not whatever text node was queried. A badge sets its name in
  // an inner `<span>`, and `mouseenter` does not bubble.
  const trigger =
    element.closest('[tabindex], [role="button"], button') ?? element
  const pointerOver = new MouseEvent('pointerover', {
    bubbles: true,
    cancelable: true,
  })
  Object.defineProperty(pointerOver, 'pointerType', { value: 'mouse' })
  trigger.dispatchEvent(pointerOver)
  fireEvent.mouseEnter(trigger)
  fireEvent.mouseMove(trigger)
}

/*
  The card is marked with `data-definition-card` rather than a test id, so the
  attribute a stylesheet or a future guard would read is the one this file
  reads.
*/
const sections = (card: HTMLElement) =>
  Array.from(card.querySelectorAll('[data-definition-section]'))

const term = (section: Element) =>
  section.querySelector('[data-definition-term]') as HTMLElement

const body = (section: Element) =>
  section.querySelector('[data-definition-body]') as HTMLElement

/* -------------------------------------------------- the card is one shape */

describe('the definition card', () => {
  const one = [{ term: 'Path', body: ENTITY_KIND_DEFINITIONS.path.definition }]
  const two = [
    ...one,
    { term: 'Happy Path', body: 'The customer joins on time.' },
  ]

  it('sets a category and an instance identically — one shape, not two', () => {
    render(<DefinitionCard sections={two} />)
    const card = document.querySelector('[data-definition-card]') as HTMLElement
    const [category, instance] = sections(card)
    expect(term(instance).className).toBe(term(category).className)
    expect(body(instance).className).toBe(body(category).className)
  })

  it('sets a one-section card exactly as it sets a two-section one', () => {
    render(<DefinitionCard sections={one} />)
    const alone = sections(
      document.querySelector('[data-definition-card]') as HTMLElement,
    )[0]
    const aloneClasses = [term(alone).className, body(alone).className]
    cleanup()

    render(<DefinitionCard sections={two} />)
    const paired = sections(
      document.querySelector('[data-definition-card]') as HTMLElement,
    )
    for (const section of paired) {
      expect([term(section).className, body(section).className]).toEqual(
        aloneClasses,
      )
    }
  })

  it('separates sections with a hairline and never heads one with it', () => {
    render(<DefinitionCard sections={two} />)
    const [first, second] = sections(
      document.querySelector('[data-definition-card]') as HTMLElement,
    )
    expect(first.className).not.toContain('border-t')
    expect(second.className).toContain('border-t')
  })
})

/* ------------------------------------------------ every definition opens */

describe('a definition opens on hover, and is reachable without a pointer', () => {
  it('opens the card on hover', async () => {
    render(
      <DefinitionPopover sections={[{ term: 'Lane', body: 'One row.' }]}>
        <span>Front stage</span>
      </DefinitionPopover>,
    )
    hover(screen.getByText('Front stage'))
    expect(await screen.findByText('One row.')).toBeDefined()
  })

  it('gives the trigger a tab stop, so focus reaches it', () => {
    render(
      <DefinitionPopover sections={[{ term: 'Lane', body: 'One row.' }]}>
        <span>Front stage</span>
      </DefinitionPopover>,
    )
    const trigger = screen.getByText('Front stage')
    expect(trigger.getAttribute('tabindex')).toBe('0')
    trigger.focus()
    expect(document.activeElement).toBe(trigger)
  })
})

/* --------------------------------------- the three two-section surfaces */

describe('the labels that show a category and an instance', () => {
  const rendered: Array<[string, () => void, string]> = [
    [
      'a path badge',
      () =>
        render(
          <PathLabelBadge
            name="Happy Path"
            summary="The customer joins on time."
            pathKind="happy"
          />,
        ),
      'Happy Path',
    ],
    [
      'a scenario title badge',
      () =>
        render(
          <ScenarioTitleBadge name="Site Visit" summary="The first hour on site." />,
        ),
      'Site Visit',
    ],
    [
      'a stakeholder badge',
      () =>
        render(
          <StakeholderBadge
            name="Site Surveyor"
            kind="staff"
            summary="The surveyor a household meets on every visit."
          />,
        ),
      'Site Surveyor',
    ],
  ]

  it.each(rendered)(
    '%s renders two identically set sections',
    async (_name, mount, label) => {
      mount()
      hover(screen.getByText(label))
      const card = await screen.findByText(label, {
        selector: '[data-definition-term]',
      })
      const parts = sections(
        card.closest('[data-definition-card]') as HTMLElement,
      )
      expect(parts).toHaveLength(2)
      expect(term(parts[1]).className).toBe(term(parts[0]).className)
      expect(body(parts[1]).className).toBe(body(parts[0]).className)
    },
  )
})

/* -------------------------------------------------- the definition popover */

describe('an entity definition', () => {
  it('is one section when there is only a kind to give', async () => {
    render(
      <EntityDefinitionPopover kind="lane">
        <span>Front stage</span>
      </EntityDefinitionPopover>,
    )
    hover(screen.getByText('Front stage'))
    await screen.findByText(ENTITY_KIND_DEFINITIONS.lane.definition)
    const card = document.querySelector('[data-definition-card]') as HTMLElement
    expect(sections(card)).toHaveLength(1)
    expect(term(sections(card)[0]).textContent).toBe('Lane')
  })

  it('says so when nobody has written the instance description yet', async () => {
    render(
      <EntityDefinitionPopover
        kind="path"
        name="Happy Path"
        description={null}
        showDescription
      >
        <span>Happy Path</span>
      </EntityDefinitionPopover>,
    )
    hover(screen.getByText('Happy Path'))
    const card = (
      await screen.findByText(ENTITY_KIND_DEFINITIONS.path.definition)
    ).closest('[data-definition-card]') as HTMLElement
    const [, instance] = sections(card)
    // The placeholder changes the BODY only. The heading is the heading.
    expect(body(instance).className).toContain('italic')
    expect(term(instance).className).toBe(term(sections(card)[0]).className)
  })
})

/* ------------------------------------------------- the stakeholder card */

describe('the stakeholder card', () => {
  it('shows the kind, that kind meaning, then the name and its summary', async () => {
    render(
      <StakeholderBadge
        name="Site Surveyor"
        kind="staff"
        summary="The surveyor a household meets on every visit."
      />,
    )
    hover(screen.getByText('Site Surveyor'))
    const first = await screen.findByText(STAKEHOLDER_KIND_LABELS.staff, {
      selector: '[data-definition-term]',
    })
    const card = first.closest('[data-definition-card]') as HTMLElement
    const [kind, instance] = sections(card)

    expect(term(kind).textContent).toBe('Staff')
    expect(body(kind).textContent).toBe(STAKEHOLDER_KIND_MEANING.staff)
    expect(term(instance).textContent).toBe('Site Surveyor')
    expect(body(instance).textContent).toBe(
      'The surveyor a household meets on every visit.',
    )
  })

  it('has a meaning for all five kinds, and says a team owns a lane and is never one', () => {
    const kinds: StakeholderKind[] = [
      'recipient',
      'staff',
      'partner',
      'provider',
      'team',
    ]
    for (const kind of kinds) {
      // Long enough to be a definition rather than a restated label — the
      // same floor the entity-kind definitions are held to.
      expect(STAKEHOLDER_KIND_MEANING[kind].length, kind).toBeGreaterThan(40)
    }
    // The one sentence carrying the schema: a team reaches a lane through
    // `owner_team` and is never its `stakeholder_id`, because a team does not
    // stand in the room. If this is ever wrong, the schema is wrong with it.
    expect(STAKEHOLDER_KIND_MEANING.team).toMatch(/owns a lane and is never one/)
  })
})

/* ------------------------------------------------------- the status badge */

describe('StatusBadge', () => {
  it('discloses what the status means, in a card and not a tooltip', async () => {
    render(<StatusBadge status="built" />)
    hover(screen.getByText('Built'))
    expect(await screen.findByText(ENTITY_STATUS_MEANING.built)).toBeDefined()
    expect(document.querySelector('[data-definition-card]')).not.toBeNull()
  })

  it('is reachable by keyboard focus', () => {
    render(<StatusBadge status="live" />)
    const badge = screen.getByText('Live')
    expect(badge.getAttribute('tabindex')).toBe('0')
    badge.focus()
    expect(document.activeElement).toBe(badge)
  })
})

/* ------------------------------- a made-up word is a plain field label */

describe('a made-up word is a plain field label, and still explains itself', () => {
  /*
    The two made-up words — `Touchpoint`, `Storyboard` — are plain `Field`
    labels beside Summary and Status. Stacked among a cell's value badges, an
    outline badge read as a mystery tag rather than a field label. The
    definition does not vanish: it hangs off the label's own hint popover, the
    touch and press affordance every other field label already uses.

    What is asserted is what a reader can reach: the caption is a plain label,
    not a badge, and hovering it still discloses the definition.
  */
  it('Touchpoint is a plain label, not a badge, and hovering it gives the definition', async () => {
    render(
      <Field label="Touchpoint" hint={PANEL_TERMS.touchpoint}>
        <span>a value</span>
      </Field>,
    )
    const label = screen.getByText('Touchpoint')
    expect(label.hasAttribute('data-panel-term-badge')).toBe(false)
    hover(label)
    expect(await screen.findByText(PANEL_TERMS.touchpoint)).not.toBeNull()
  })

  it('an ordinary section label discloses nothing at all', async () => {
    // `Status` names a field holding a status. A sentence saying so helps
    // nobody.
    render(<PanelSectionLabel>Status</PanelSectionLabel>)
    const label = screen.getByText('Status')
    expect(label.hasAttribute('tabindex')).toBe(false)
    hover(label)
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(document.querySelector('[data-definition-card]')).toBeNull()
  })

  it('a divider is an outlined block, and says what its line separates', async () => {
    // The three divider lines are the whole grammar of a service blueprint;
    // a rail that stated them in the register of every other row label hid
    // that.
    render(<BlueprintDividerRailLabel label="Line of interaction" />)
    const block = screen.getByText('Line of interaction')
    expect(block.hasAttribute('data-blueprint-row-header')).toBe(true)
    // Sentence case, as written: a small label is never capitalised by CSS.
    expect(block.className).not.toMatch(/\buppercase\b|\btracking-wide/)
    hover(block)
    expect(
      await screen.findByText(/Above it, what the customer does/),
    ).not.toBeNull()
  })

  it('the term heads its own definition, once, rather than opening the sentence', async () => {
    render(
      <Field label="Storyboard" hint={PANEL_TERMS.storyboard}>
        <span>frames</span>
      </Field>,
    )
    hover(screen.getByText('Storyboard'))
    const shown = await screen.findByText(PANEL_TERMS.storyboard)
    const card = shown.closest('[data-definition-card]')
    expect(card).not.toBeNull()
    expect(
      within(card as HTMLElement).getAllByText('Storyboard', {
        selector: '[data-definition-term]',
      }),
    ).toHaveLength(1)
  })
})

/* ------------------------------- the term map, and the generic definitions */

describe('the made-up words and the entity kinds', () => {
  it('the term map holds only the words a reader could not guess', () => {
    expect(Object.keys(PANEL_TERMS).sort()).toEqual(['storyboard', 'touchpoint'])
  })

  it('the six entity-kind definitions are the generic set, carrying no instance example', () => {
    const definitions = Object.fromEntries(
      Object.entries(ENTITY_KIND_DEFINITIONS).map(([kind, term]) => [
        kind,
        term.definition,
      ]),
    )
    expect(definitions).toEqual({
      service:
        'The whole service this blueprint maps, end to end. Everything else on the board is part of it.',
      phase:
        'A chapter of the service, in time order. Each phase holds the scenarios that can happen during it.',
      scenario: 'A specific situation inside a phase, mapped on its own board.',
      path: 'One route through a scenario: the main way, plus variants and exceptions. Paths are alternatives, not stages — nothing carries across them.',
      step: 'One moment in time, read down every lane at once. Steps run left to right.',
      lane: 'A row of the board, for one kind of participant — the customer, frontstage staff, backstage work, the tools. A row reads across every step.',
    })
  })
})

/* ------------------------------------------- nothing announces a definition */

/**
 * Class strings only — a comment recording why the cue went is not the cue.
 *
 * The comments are blanked by the reading, which holds one stripped sample of
 * the application for every rule that wants one, so this rule and the ones
 * beside it cannot be looking at two slightly different texts of one file.
 */
function liveClassMatches(pattern: RegExp): string[] {
  return strippedSourcesOn().flatMap(({ file, code }) =>
    pattern.test(code) ? [file] : [],
  )
}

describe('nothing on the page announces that a word is defined', () => {
  it('the shared underline cue is deleted, with every use site', () => {
    expect(liveClassMatches(/DEFINED_LABEL_CUE/)).toEqual([])
    // And the underline it drew, in case somebody inlines it back.
    expect(liveClassMatches(/decoration-dotted/)).toEqual([])
  })

  it('no help cursor survives it', () => {
    expect(liveClassMatches(/cursor-help/)).toEqual([])
  })

  it('the canvas title draws no icon beside the name', () => {
    renderWithEntityDetail(
      <EntityTitleAffordance kind="scenario" id="s-1" label="Site Visit" />,
    )
    const block = document.querySelector('[data-entity-title]') as HTMLElement
    // The ⓘ existed because a hover-only control is invisible on touch. The
    // opener is the whole block and the definition is a popover, so neither
    // ever needed it.
    expect(block.querySelectorAll('svg')).toHaveLength(0)
  })

  it('and the entity title imports no icon at all', () => {
    const source = sourceOf('components/blueprint/EntityTitleAffordance.tsx')
    expect(source).not.toMatch(/from 'lucide-react'/)
  })

  it('and the grid headers reach for no icon library, touch ⓘ notwithstanding', () => {
    // A mark came BACK to these headers, but only as the touch reader's door
    // to the definition — invisible on a device that can hover, so the resting
    // board a pointer reader sees stays clean. It is a hand-drawn glyph,
    // deliberately, so the "no icon-library sprawl" rule the headers hold
    // still stands: the exception is one touch affordance, not a licence to
    // import a sheet of icons.
    for (const file of ['StepHeaderAffordance', 'LaneHeaderAffordance']) {
      const source = sourceOf(`components/blueprint/${file}.tsx`)
      expect(source).not.toMatch(/from 'lucide-react'/)
    }
  })

  it('and the class the glyph wore is gone, not just unused', () => {
    // Left in place it is an invitation: the next header draws an ⓘ because
    // the constant is sitting there already named for the job.
    expect(liveClassMatches(/CANVAS_HEADER_HINT/)).toEqual([])
  })
})

describe('a definition hangs off a badge, never off a label', () => {
  it('the canvas title carries the panel, not a definition', () => {
    // The title and the kind badge beside it must not both carry the same
    // definition. The badge is the one that keeps it. The title opens the
    // entity PANEL, so it IS interactive — but no definition popover hangs
    // off it: no `aria-haspopup`, which is what marks a definition trigger
    // elsewhere in this file.
    renderWithEntityDetail(
      <EntityTitleAffordance kind="scenario" id="s-1" label="Site Visit" />,
    )
    const title = screen.getByRole('button', { name: 'View details: Site Visit' })
    expect(title.hasAttribute('aria-haspopup')).toBe(false)
  })

  it('and its source no longer reaches for the definition popover', () => {
    const source = sourceOf('components/blueprint/EntityTitleAffordance.tsx')
    expect(source).not.toMatch(/EntityDefinitionPopover/)
  })
})

/* --------------------------------------- the deployment's own example */

/** Design mode, injected the way a test reaches the shared canvas mode. */
function designMode(children: ReactElement) {
  return (
    <CanvasModeContext.Provider
      value={{ mode: 'design', setMode: () => {}, available: true }}
    >
      {children}
    </CanvasModeContext.Provider>
  )
}

describe('the example grounds the generic definition in this deployment', () => {
  it('shows the authored example under the kind, set like every other section', async () => {
    render(
      <EntityExamplesContext.Provider
        value={{ lane: 'The installer row on this board' }}
      >
        <EntityDefinitionPopover kind="lane">
          <span>Front stage</span>
        </EntityDefinitionPopover>
      </EntityExamplesContext.Provider>,
    )
    hover(screen.getByText('Front stage'))
    const card = (
      await screen.findByText('The installer row on this board')
    ).closest('[data-definition-card]') as HTMLElement
    const [kind, example] = sections(card)
    expect(sections(card)).toHaveLength(2)
    expect(term(example).textContent).toBe('Example')
    expect(term(example).className).toBe(term(kind).className)
    expect(body(example).className).toBe(body(kind).className)
  })

  it('is picked by kind — a phase popover shows the phase example, not another', async () => {
    render(
      <EntityExamplesContext.Provider
        value={{ phase: 'Site survey', lane: 'The installer row' }}
      >
        <EntityDefinitionPopover kind="phase">
          <span>A phase</span>
        </EntityDefinitionPopover>
      </EntityExamplesContext.Provider>,
    )
    hover(screen.getByText('A phase'))
    await screen.findByText('Site survey')
    expect(screen.queryByText('The installer row')).toBeNull()
  })

  it('renders nothing for a reader when the example is blank', async () => {
    render(
      <EntityExamplesContext.Provider value={{}}>
        <EntityDefinitionPopover kind="lane">
          <span>Front stage</span>
        </EntityDefinitionPopover>
      </EntityExamplesContext.Provider>,
    )
    hover(screen.getByText('Front stage'))
    const card = (
      await screen.findByText(ENTITY_KIND_DEFINITIONS.lane.definition)
    ).closest('[data-definition-card]') as HTMLElement
    expect(sections(card)).toHaveLength(1)
    expect(
      screen.queryByText('Example', { selector: '[data-definition-term]' }),
    ).toBeNull()
  })

  it('shows the unwritten placeholder to an editor when the example is blank', async () => {
    render(
      designMode(
        <EntityDefinitionPopover kind="lane">
          <span>Front stage</span>
        </EntityDefinitionPopover>,
      ),
    )
    hover(screen.getByText('Front stage'))
    const card = (
      await screen.findByText(ENTITY_EXAMPLE_PLACEHOLDER)
    ).closest('[data-definition-card]') as HTMLElement
    const [kind, example] = sections(card)
    expect(term(example).textContent).toBe('Example')
    expect(body(example).className).toContain('italic')
    expect(term(example).className).toBe(term(kind).className)
  })
})
