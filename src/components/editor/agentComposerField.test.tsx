// @vitest-environment jsdom
/**
 * THE COMPOSER'S FIELD AND ITS MIRROR, asserted through the one interface that
 * owns both.
 *
 * `ComposerInkedField` carries the account of what the mirror is and why the
 * five facts behind it are one module's. What this file adds is the
 * assertions: every one of the five, over the two RENDERED nodes, each asked
 * whether it wears the list that belongs to it. Asking the class-building
 * function for the pair instead would pass with the two lists swapped at the
 * render sites, or with the primitive dropping `className` altogether.
 *
 * What a reader MEETS — the menu opening mid-sentence, the near-miss notice,
 * what sends — is in `agentComposerSkills.test.tsx` over the real panel. This
 * file drives the module directly, with the draft held by a harness that
 * completes a token the way accepting from the menu does.
 *
 * THE CARET the module is handed is this harness's to supply, the way a
 * draft is: the field takes a one-shot offset and clears it. Where that
 * offset comes from and what it is worth to assert are the panel's, in
 * `agentComposerSkills.test.tsx` — only the near-miss rewrite produces an
 * offset a jsdom assertion can tell apart from the value setter's own.
 */
import { useState } from 'react'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { ComposerInkedField } from '@/components/editor/agent/ComposerInkedField'
import { COMPOSER_FIELD_METRICS } from '@/components/editor/agent/composerFieldMetrics'
import {
  AGENT_SKILL_COMMANDS,
  completeSkillToken,
  findSkillLookup,
  skillMatchesQuery,
} from '@/lib/agent/skills'

/**
 * The field with a draft it owns, which is the shape every caller has — and
 * the whole shape: no tokens are handed in, because the module reads them out
 * of the draft, so a keystroke is the only thing that can change what is
 * coloured.
 *
 * Tab completes the token under the lookup in place, which is what accepting
 * from the slash menu does. It is here rather than in the module because the
 * menu is the panel's and the rewrite is `skills.ts`'s.
 */
function Harness() {
  const [draft, setDraft] = useState('')
  const [caret, setCaret] = useState<number | null>(null)
  return (
    <ComposerInkedField
      draft={draft}
      onDraftChange={setDraft}
      caret={caret}
      onCaretPlaced={() => setCaret(null)}
      onSelectionChange={() => {}}
      onKeyDown={(event) => {
        if (event.key !== 'Tab') return
        event.preventDefault()
        const lookup = findSkillLookup(draft)
        if (!lookup) return
        const command = AGENT_SKILL_COMMANDS.find(
          (candidate) =>
            candidate.content && skillMatchesQuery(candidate, lookup.query),
        )
        if (!command) return
        const completed = completeSkillToken(draft, lookup, command)
        setDraft(completed.text)
        setCaret(completed.caret)
      }}
      placeholder="Message the agent…"
    />
  )
}

const openField = (): HTMLTextAreaElement => {
  render(<Harness />)
  return screen.getByRole('textbox', {
    name: 'Message the agent',
  }) as HTMLTextAreaElement
}

const type = (field: HTMLElement, value: string) =>
  fireEvent.change(field, { target: { value } })

/**
 * The mirror. It is `aria-hidden`, so it is queried the one way a hidden node
 * can be: by the slot it declares.
 */
const mirror = () =>
  document.querySelector<HTMLElement>('[data-slot="composer-mirror"]')

const classesOn = (node: Element) => node.className.split(' ')

afterEach(cleanup)

describe('the field and its mirror wear one agreement', () => {
  it('spreads every metric onto both rendered copies', () => {
    // The shimmer guard. Two copies of one string wrap alike only while they
    // agree on every property that decides a line break, so the agreement is
    // one string and this asks both NODES whether they still wear all of it —
    // which is also the only way to catch the design-system control dropping
    // the `className` it was handed.
    const field = openField()
    type(field, 'Hey can u /ub:audit the intake')
    for (const metric of COMPOSER_FIELD_METRICS.split(' ')) {
      expect(classesOn(field), metric).toContain(metric)
      expect(classesOn(mirror()!), metric).toContain(metric)
    }
  })

  it('dresses each copy in the list that is its own', () => {
    // The two lists are built by one call and spread onto two nodes, and
    // nothing above this line would notice them arriving at the wrong one.
    // They are not interchangeable: the field is the positioned sibling the
    // mirror must NOT paint over and the one whose text goes transparent, and
    // the mirror is the absolutely-placed copy with its overflow hidden and
    // no pointer target. Swap them and the caret is covered by an opaque copy
    // of the draft.
    const field = openField()
    type(field, 'Hey can u /ub:audit the intake')
    expect(classesOn(field)).toEqual(
      expect.arrayContaining([
        'relative',
        'selection:bg-primary/25',
        'text-transparent',
        'caret-foreground',
      ]),
    )
    expect(classesOn(field)).not.toContain('absolute')
    expect(classesOn(field)).not.toContain('overflow-hidden')
    expect(classesOn(mirror()!)).toEqual(
      expect.arrayContaining([
        'pointer-events-none',
        'absolute',
        'inset-0',
        'overflow-hidden',
        'select-none',
      ]),
    )
    expect(classesOn(mirror()!)).not.toContain('text-transparent')
    expect(classesOn(mirror()!)).not.toContain('relative')
  })

  it('resolves the mirror and the field to the same positioned box', () => {
    // The containing-block guard. `absolute inset-0` measures the nearest
    // POSITIONED ancestor, and the mirror wraps like the field only while
    // that ancestor is the box the field sizes. Measured against the input
    // group instead, an add-on in the group narrows the FIELD through the
    // group's own `has-[>[data-align=...]]` rules and leaves the mirror full
    // width: every line from the first wrap down breaks somewhere else and
    // the colour drifts off the caret. The module renders the group itself
    // and takes no children, so there is no add-on a caller can put there.
    const field = openField()
    type(field, 'Hey can u /ub:audit the intake')
    const box = mirror()!.parentElement!
    expect(box).toBe(field.parentElement)
    expect(classesOn(box)).toContain('relative')
    // And that box is not the group: the group is what an add-on would join.
    expect(box.dataset.slot).toBeUndefined()
  })

  it('keeps the group growing as the draft wraps', () => {
    // The input group grows for a DIRECT-child textarea
    // (`has-[>textarea]:h-auto`) and the field is a grandchild of it, so the
    // height is spelled. Without it a wrapping draft is typed into a 28px
    // slot with its first line scrolled out of sight — jsdom lays nothing
    // out, so what is pinned here is the class the browser needs.
    const field = openField()
    const group = field.closest('[data-slot="input-group"]')!
    expect(classesOn(group)).toContain('h-auto')
  })
})

describe('the mirror draws the draft the field is holding', () => {
  it('colours every token that names a skill, wherever it sits', () => {
    const field = openField()
    type(field, 'build from my notes /ub:map then /ub:audit it')
    const drawn = mirror()!
    // The same string, so the caret and the colour agree. The trailing
    // newline is the one a block would otherwise collapse, which would leave
    // the two with different scroll heights at the bottom of a long draft.
    expect(drawn.textContent).toBe(
      'build from my notes /ub:map then /ub:audit it\n',
    )
    expect(within(drawn).getByText('/ub:map').className).toContain(
      'text-text-primary',
    )
    expect(within(drawn).getByText('/ub:audit').className).toContain(
      'text-text-primary',
    )
  })

  it('leaves the field drawing its own text when no token resolves', () => {
    const field = openField()
    // A bare alias resolves nothing, so nothing is coloured and nothing runs.
    type(field, 'then /audit the intake')
    expect(mirror()).toBeNull()
    expect(classesOn(field)).not.toContain('text-transparent')
  })

  it('follows the field when a long message scrolls', () => {
    const field = openField()
    type(field, 'Hey can u /ub:audit the intake')
    field.scrollTop = 40
    field.scrollLeft = 5
    fireEvent.scroll(field)
    expect(mirror()!.scrollTop).toBe(40)
    expect(mirror()!.scrollLeft).toBe(5)
  })

  it('catches up on the keystroke that moved the field without a scroll event', () => {
    // A keystroke at the bottom of a scrolled field moves its scrollTop and
    // fires no scroll event in time to matter, so the sync runs after the
    // write too — before paint, or the colour lags a frame behind the caret
    // on every character typed.
    const field = openField()
    type(field, 'Hey can u /ub:audit the intake')
    field.scrollTop = 24
    type(field, 'Hey can u /ub:audit the intake once more')
    expect(mirror()!.scrollTop).toBe(24)
  })

  it('stands down while an IME is composing', () => {
    const field = openField()
    type(field, 'Hey can u /ub:audit')
    expect(mirror()).toBeTruthy()
    // A preedit string lives in the field, and transparent text would make it
    // invisible for as long as it is being composed.
    fireEvent.compositionStart(field)
    expect(mirror()).toBeNull()
    expect(classesOn(field)).not.toContain('text-transparent')
    fireEvent.compositionEnd(field)
    expect(mirror()).toBeTruthy()
  })

  it('redraws from the draft alone when a completion rewrites it', () => {
    // No tokens cross the interface, so the colour cannot be computed from a
    // string the field is not holding: the completed token is coloured
    // because the draft now contains it and for no other reason.
    const field = openField()
    type(field, 'Hey can u /ub:aud')
    expect(mirror()).toBeNull()
    fireEvent.keyDown(field, { key: 'Tab' })
    expect(field.value).toBe('Hey can u /ub:audit ')
    expect(within(mirror()!).getByText('/ub:audit')).toBeTruthy()
  })
})
