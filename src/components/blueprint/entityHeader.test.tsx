// @vitest-environment jsdom
/**
 * The identity bar reserves its height, and shows which of four states it is
 * in.
 *
 * The bug this file exists against: `ServiceOverviewHeader` returned `null`
 * while `useServiceSpec` was in flight, so the bar had NO height and the
 * canvas under it jumped when the data landed. The same `return null` also
 * collapsed four `QueryResult` states into one picture — a reader could not
 * tell "still loading" from "this deployment has no service" from "the query
 * failed."
 *
 * The seam is `EntityHeader`, rendered. Height is asserted through the box's
 * resolved geometry against the shared contract value, never by matching a
 * Tailwind class: a class name is not a height, and the whole claim is that
 * two states measure the same.
 *
 * One claim needs more than a render. "A remount with a warm cache never
 * re-skeletons" is a statement about a SECOND mount, so it is driven as
 * mount → unmount → remount through the real bar and the app's own query
 * defaults. It holds because of configuration that already exists —
 * `staleTime: Infinity`, `refetchOnWindowFocus: false`, and the hook
 * reporting `ready` whenever `query.data !== undefined` — so it is pinned
 * here rather than built.
 *
 * The same seam carries the KIND BADGE: a reader could not tell a
 * scenario bar from a phase bar, because both are a bold name over a
 * sentence. What is asserted is what a reader can observe — the word that
 * appears, where it appears relative to the name, what hovering and focusing
 * it disclose, and what clicking it does NOT do — never which component drew
 * it. The two claims meet on height: the badge shares the title's row, and
 * the box above must still measure what the height claim pinned it to.
 *
 * What this file cannot see: jsdom performs no layout, so "a 20px badge fits
 * a 24px row" is not measurable here. The pinned box is measurable, and it is
 * asserted with the badge proven present, which is the part a regression
 * would break.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { setShellBooting } from '@/contexts/shellBootStore'
import type { ReactNode } from 'react'
import {
  ENTITY_TITLE_OUTDENT_CLASS,
  EntityHeader,
} from '@/components/blueprint/EntityHeader'
import { ServiceOverviewHeader } from '@/components/editor/ServiceOverviewHeader'
import {
  BLUEPRINT_MENUBAR_FLAT_CLASS,
  BLUEPRINT_MENUBAR_HEADER_CLASS,
  BLUEPRINT_MENUBAR_IDENTITY_HEIGHT,
  BLUEPRINT_MENUBAR_PADDING_Y,
  BLUEPRINT_MENUBAR_ROW_HEIGHT,
  BLUEPRINT_MENUBAR_SUMMARY_CLASS,
  CELL_DETAIL_PANEL_TOP_CLASS,
} from '@/components/editor/menubarHeaderLayout'
import { TooltipProvider } from '@/components/ui/tooltip'
import { EntityDetailProvider } from '@/contexts/EntityDetailContext'
import { ENTITY_KIND_DEFINITIONS } from '@/lib/panelTerms'
import { QUERY_DEFAULTS } from '@/lib/queryClient'
import { setActiveService } from '@/contexts/activeService'

const supabase = vi.hoisted(() => ({ client: null as unknown, calls: 0 }))

vi.mock('@/contexts/SupabaseProvider', () => ({
  useSupabase: () => ({
    client: supabase.client,
    configured: true,
    session: null,
    isLoading: false,
    canWrite: false,
    isDevAuthoring: false,
    isEditPreview: false,
    canAgent: false,
  }),
}))

// The service is resolved once, at the root, into a store the hook is handed
// from; here that root is stood in for by setting the store directly.
beforeEach(() => setActiveService({ id: 'svc-1', slug: 'example-service', name: 'Rooftop Retrofit' }))
afterEach(() => {
  cleanup()
  setActiveService(null)
})
// The shell's boot latch is a module store, so a test that raises it would
// leave every later render skeletoning. Lowered after each.
afterEach(() => setShellBooting(false))

const block = () =>
  document.querySelector('[data-entity-header]') as HTMLElement | null
const skeleton = () =>
  document.querySelector('[data-entity-header-skeleton]') as HTMLElement | null
const summarySlot = () =>
  document.querySelector('[data-entity-header-summary]') as HTMLElement | null
/** The title slot is the affordance itself — `EntityTitleAffordance`'s root. */
const titleSlot = () =>
  document.querySelector('[data-entity-title]') as HTMLElement | null
const kindBadge = () =>
  document.querySelector('[data-entity-kind-badge]') as HTMLElement | null
/** The invisible opener filling the title block. The badge must never be this. */
const panelOpener = () =>
  document.querySelector(
    '[data-entity-title-affordance]',
  ) as HTMLButtonElement | null

/**
 * Every render of this bar, inside the provider it now requires.
 *
 * `EntityDetailProvider` is mounted on `EditorShell` in the app, above both
 * trees, and `useEntityDetail` throws outside it — a mounting mistake is meant
 * to be loud. A test renders the bar on its own, so the provider comes with it
 * here rather than being restated at each call site.
 */
function renderWithEntityDetail(ui: ReactNode) {
  return render(<EntityDetailProvider>{ui}</EntityDetailProvider>)
}

/** The box's own height, read back the way a browser would resolve it. */
function measure(): string {
  const element = block()
  if (!element) throw new Error('the bar rendered nothing at all')
  return window.getComputedStyle(element).height
}

describe('EntityHeader height', () => {
  const cases: Array<[string, ReactNode]> = [
    ['loading', <EntityHeader key="l" kind="service" status="loading" />],
    [
      'ready, with a summary',
      <EntityHeader
        key="r1"
        kind="service"
        id="svc-1"
        label="Example service"
        summary="Rooftop solar, end to end."
      />,
    ],
    [
      'ready, no summary',
      <EntityHeader
        key="r2"
        kind="service"
        id="svc-1"
        label="Example service"
      />,
    ],
    ['ready, no service recorded', <EntityHeader key="r3" kind="service" />],
    [
      'error',
      <EntityHeader
        key="e"
        kind="service"
        status="error"
        message="Could not reach the database"
      />,
    ],
  ]

  it('is the same two-line box in every state', () => {
    for (const [name, element] of cases) {
      renderWithEntityDetail(element)
      expect(measure(), name).toBe(BLUEPRINT_MENUBAR_IDENTITY_HEIGHT)
      cleanup()
    }
  })

  it('is unchanged by the kind badge sharing the title row', () => {
    renderWithEntityDetail(
      <EntityHeader
        kind="scenario"
        id="scn-1"
        label="Example service"
        summary="Rooftop solar, end to end."
      />,
    )
    // Asserted, not assumed: without this the height claim above would go on
    // passing if the badge stopped rendering entirely.
    expect(kindBadge()).not.toBeNull()
    expect(measure()).toBe(BLUEPRINT_MENUBAR_IDENTITY_HEIGHT)
  })
})

/* ------------------------------------------- the bar hugs its block */

/**
 * The bar hugs the block: its height is the pinned block plus padding from
 * the spacing scale, never a height of its own.
 *
 * jsdom applies no Tailwind and performs no layout, so nothing here can read
 * a pixel off the canvas. What it can read is the contract the pixels come
 * from: the block's pinned height (an inline length, so measurable), the
 * padding step the classes name, and the shape of the column inside the
 * block. Each assertion names the defect it would have caught; the pixels
 * themselves are checked in the browser preview.
 */
const rem = (length: string) => {
  const match = /^(\d+(?:\.\d+)?)rem$/.exec(length)
  if (!match) throw new Error(`not a rem length: ${length}`)
  return Number(match[1])
}
const classes = (className: string) => className.split(/\s+/).filter(Boolean)
/** Tailwind's spacing step: `py-2` is two of these. */
const SPACING_STEP_REM = 0.25
const MENUBAR_CLASSES = [
  ['header', BLUEPRINT_MENUBAR_HEADER_CLASS],
  ['flat', BLUEPRINT_MENUBAR_FLAT_CLASS],
] as const

describe('the bar hugs its block', () => {
  it('holds no height of its own, so only the block and the padding size it', () => {
    // The defect: a hand-written `h-[3.25rem]` that had to be kept in step
    // with the block by hand. `h-auto` is allowed, and needed: the phase bar
    // is a `Menubar`, whose own base class is a fixed `h-8`.
    for (const [name, className] of MENUBAR_CLASSES) {
      const heights = classes(className).filter((token) => /^h-/.test(token))
      expect(heights, name).toEqual(['h-auto'])
    }
  })

  it('takes its vertical padding from the spacing scale, one step on both classes', () => {
    for (const [name, className] of MENUBAR_CLASSES) {
      const padding = classes(className).filter((token) =>
        /^(p|py|pt|pb)-/.test(token),
      )
      // One symmetric step and nothing arbitrary: `pt`/`pb` or `py-[…]` would
      // let the two edges drift apart again.
      expect(padding, name).toEqual(['py-2'])
    }
    expect(rem(BLUEPRINT_MENUBAR_PADDING_Y)).toBe(2 * SPACING_STEP_REM)
  })

  it('measures the block plus the padding above and below: 40px + 2 × 8px', () => {
    expect(rem(BLUEPRINT_MENUBAR_IDENTITY_HEIGHT) * 16).toBe(40)
    expect(rem(BLUEPRINT_MENUBAR_ROW_HEIGHT) * 16).toBe(56)
  })

  it('is the same height with a summary, without one, and while loading', () => {
    // The padding is constant, so the block is where a summary landing late
    // would show: it must measure the same in all three.
    for (const element of [
      <EntityHeader key="s" kind="scenario" id="scn-1" label="Name" summary="A sentence." />,
      <EntityHeader key="n" kind="scenario" id="scn-1" label="Name" />,
      <EntityHeader key="l" kind="scenario" status="loading" />,
    ]) {
      renderWithEntityDetail(
        <div className={BLUEPRINT_MENUBAR_HEADER_CLASS}>{element}</div>,
      )
      expect(measure()).toBe(BLUEPRINT_MENUBAR_IDENTITY_HEIGHT)
      cleanup()
    }
  })

  it('the header row is a flex row, so the block centres in it', () => {
    // The service bar renders this class on a plain div; `items-center`
    // without `flex` left its block on the row's top edge.
    expect(classes(BLUEPRINT_MENUBAR_HEADER_CLASS)).toContain('flex')
  })

  it('the drawer’s fallback top clears the same bar and its border', () => {
    expect(CELL_DETAIL_PANEL_TOP_CLASS).toContain(
      `calc(${BLUEPRINT_MENUBAR_ROW_HEIGHT}+1px+1rem)`,
    )
  })

  it('the service bar renders its block inside a padded row with no height', () => {
    renderWithEntityDetail(
      <QueryClientProvider client={new QueryClient()}>
        <ServiceOverviewHeader />
      </QueryClientProvider>,
    )
    const row = block()?.parentElement
    expect(row?.closest('[data-editor-navbar]')).not.toBeNull()
    const tokens = classes(row?.className ?? '')
    expect(tokens).toContain('py-2')
    expect(tokens.filter((token) => /^h-/.test(token))).toEqual(['h-auto'])
  })
})

/**
 * Even room above the title and below the summary.
 *
 * The block's edges sit on the bar's padding, so the room is even exactly
 * when the title's line is on the block's top edge and the summary's line on
 * its bottom edge. The title affordance carries a `py-1` for its hover
 * highlight, which put 4px more above the name than below the summary.
 */
describe('the room above the title equals the room below the summary', () => {
  it('cancels the affordance’s vertical padding by exactly its own step', () => {
    renderWithEntityDetail(
      <EntityHeader kind="scenario" id="scn-1" label="Name" summary="A sentence." />,
    )
    const padding = classes(titleSlot()!.className).find((token) =>
      /^py-/.test(token),
    )
    expect(padding).toBeDefined()
    const identity = document.querySelector(
      '[data-entity-header-identity]',
    ) as HTMLElement
    expect(classes(identity.className)).toContain(
      `-my-${padding!.slice('py-'.length)}`,
    )
  })

  it('fills the pinned block, title on its top edge and summary on its bottom', () => {
    renderWithEntityDetail(
      <EntityHeader kind="scenario" id="scn-1" label="Name" summary="A sentence." />,
    )
    const column = summarySlot()!.parentElement!
    expect(classes(column.className)).toEqual(
      expect.arrayContaining(['flex-col', 'h-full']),
    )
    expect(classes(summarySlot()!.className)).toContain('mt-auto')
  })

  it('draws the skeleton to the same two edges', () => {
    renderWithEntityDetail(<EntityHeader kind="service" status="loading" />)
    const column = skeleton()!
    expect(classes(column.className)).toContain('h-full')
    expect(classes(column.parentElement!.className)).toContain('h-full')
    const [, summaryRow] = [...column.children] as HTMLElement[]
    expect(classes(summaryRow.className)).toContain('mt-auto')
  })
})

describe('the summary truncates', () => {
  it('is bound to its column, not sized to its sentence', () => {
    renderWithEntityDetail(
      <EntityHeader
        kind="service"
        id="svc-1"
        label="Example service"
        summary={'A long summary. '.repeat(40)}
      />,
    )
    const summary = summarySlot()!
    // The column is `items-start`, where a child sizes to its content; only a
    // width bound lets `truncate` clip and show its ellipsis.
    expect(summary.parentElement?.className).toMatch(/\bitems-start\b/)
    expect(classes(summary.className)).toEqual(
      expect.arrayContaining(['truncate', 'max-w-full']),
    )
    expect(summary.getAttribute('title')).toBe('A long summary. '.repeat(40))
  })

  it('keeps the bound in the shared class, where every bar reads it', () => {
    expect(classes(BLUEPRINT_MENUBAR_SUMMARY_CLASS)).toEqual(
      expect.arrayContaining(['truncate', 'max-w-full']),
    )
  })
})

describe('the title lines up with the summary', () => {
  it('outdents the affordance by exactly its own inline padding', () => {
    renderWithEntityDetail(
      <EntityHeader
        kind="scenario"
        id="scn-1"
        label="Example service"
        summary="Rooftop solar, end to end."
      />,
    )
    const tokens = classes(titleSlot()!.className)
    // The hover highlight's padding stays; the margin cancels it on the left,
    // so the name's text edge is the summary's text edge.
    const padding = tokens.find((token) => /^px-/.test(token))
    expect(padding).toBeDefined()
    expect(tokens).toContain(ENTITY_TITLE_OUTDENT_CLASS)
    expect(ENTITY_TITLE_OUTDENT_CLASS).toBe(`-ml-${padding!.slice('px-'.length)}`)
    // The summary carries no inset of its own for the outdent to disagree with.
    expect(
      classes(summarySlot()!.className).some((token) => /^(p|px|pl|ps|m|mx|ml|ms)-/.test(token)),
    ).toBe(false)
  })

  it('keeps a long name to the one line the block pins', () => {
    renderWithEntityDetail(
      <EntityHeader kind="scenario" id="scn-1" label={'Long name '.repeat(20)} />,
    )
    expect(classes(panelOpener()!.className)).toContain('truncate')
  })

  it('draws the skeleton on the same left edge as the content', () => {
    renderWithEntityDetail(<EntityHeader kind="service" status="loading" />)
    const rows = [...skeleton()!.children] as HTMLElement[]
    expect(rows).toHaveLength(2)
    for (const row of rows) {
      expect(
        classes(row.className).some((token) => /^(p|px|pl|ps)-/.test(token)),
        row.outerHTML,
      ).toBe(false)
    }
  })
})

describe('EntityHeader states', () => {
  it('loading paints a skeleton, and no title', () => {
    renderWithEntityDetail(<EntityHeader kind="service" status="loading" />)
    expect(skeleton()).not.toBeNull()
    expect(titleSlot()).toBeNull()
  })

  it('the skeleton is not announced to a screen reader', () => {
    renderWithEntityDetail(<EntityHeader kind="service" status="loading" />)
    expect(skeleton()?.getAttribute('aria-hidden')).toBe('true')
  })

  it('ready with a service shows the name and the summary', () => {
    renderWithEntityDetail(
      <EntityHeader
        kind="service"
        id="svc-1"
        label="Example service"
        summary="Rooftop solar, end to end."
      />,
    )
    expect(screen.getByText('Example service')).toBeDefined()
    expect(summarySlot()?.textContent).toBe('Rooftop solar, end to end.')
    expect(skeleton()).toBeNull()
  })

  it('ready with no service leaves the bar present, not absent', () => {
    renderWithEntityDetail(<EntityHeader kind="service" />)
    expect(block()).not.toBeNull()
    expect(titleSlot()).toBeNull()
    expect(summarySlot()).toBeNull()
    expect(skeleton()).toBeNull()
  })

  it('error leaves the bar present and reads as a failure, not as empty', () => {
    renderWithEntityDetail(
      <EntityHeader
        kind="service"
        status="error"
        message="Could not reach the database"
      />,
    )
    expect(block()).not.toBeNull()
    expect(summarySlot()?.textContent).toBe('Could not reach the database')
  })

  it('the failure never reaches the title slot', () => {
    renderWithEntityDetail(
      <EntityHeader
        kind="service"
        status="error"
        message="Could not reach the database"
      />,
    )
    // The title is an interactive affordance — it opens the entity panel.
    // Error text there offers a control that leads nowhere.
    expect(titleSlot()).toBeNull()
    expect(screen.queryByLabelText(/^View details:/)).toBeNull()
  })

  it('an error message wins the summary slot from a stale summary', () => {
    renderWithEntityDetail(
      <EntityHeader
        kind="service"
        id="svc-1"
        label="Example service"
        summary="Rooftop solar, end to end."
        status="error"
        message="Could not reach the database"
      />,
    )
    expect(summarySlot()?.textContent).toBe('Could not reach the database')
  })
})

/* ------------------------------------------------------- the kind badge */

/**
 * Base UI's hover, as jsdom can deliver it.
 *
 * THREE events, and each is load-bearing. `useHoverReferenceInteraction` runs
 * `mouseOnly`, and it learns the pointer type from React's `onPointerEnter` —
 * which React synthesises from `pointerover`, not from `pointerenter`. So the
 * pointer event has to land FIRST, or the native `mouseenter` listener reads
 * an empty pointer type and returns without opening. The move is what the
 * `move` path arms a one-shot `mousemove` listener for.
 */
function hover(element: HTMLElement) {
  fireEvent.pointerOver(element, { pointerType: 'mouse' })
  fireEvent.mouseEnter(element)
  fireEvent.mouseMove(element)
}

/**
 * Room for the popover's own 200ms open delay.
 *
 * `waitFor` allows 1000ms by default, which is five times the delay and still
 * close enough to it to lose a race on a loaded machine — this suite runs
 * beside 124 other files. The delay is the thing being waited on, so the
 * budget is stated against it rather than left at a default that happens to
 * be larger.
 */
const OPEN_DELAY_BUDGET = { timeout: 3000 }

/** The definition card for one kind, wherever the portal put it. */
const definitionFor = (kind: 'phase' | 'scenario') =>
  screen.queryByText(ENTITY_KIND_DEFINITIONS[kind].definition)

/** The tooltip popup carrying exactly this text, wherever the portal put it. */
const tooltipSaying = (text: string) =>
  [...document.querySelectorAll('[data-slot="tooltip-content"]')].find(
    (node) => node.textContent?.trim() === text,
  ) ?? null

describe('the bar arrives with the shell around it', () => {
  /*
    The bug: the service query is the fastest thing on the screen, so
    the bar painted its name, its kind and its whole summary over a sidebar
    still showing boot skeletons and a canvas still saying "Loading
    blueprints…". Three surfaces, three beats, and the one that finished first
    was the one nobody was waiting on.

    What is asserted is the beat, not the mechanism: given an answered query,
    whether a name is on screen depends on the shell's layer.
  */
  const ready = (
    <EntityHeader
      kind="service"
      id="svc-1"
      label="Home Retrofit"
      summary="We insulate homes."
      status="ready"
    />
  )

  it('holds an answered query behind the shell’s boot layer', () => {
    setShellBooting(true)
    renderWithEntityDetail(ready)
    expect(skeleton()).not.toBeNull()
    expect(screen.queryByText('Home Retrofit')).toBeNull()
  })

  it('and shows it the moment that layer lifts', () => {
    setShellBooting(true)
    renderWithEntityDetail(ready)
    act(() => setShellBooting(false))
    expect(skeleton()).toBeNull()
    expect(screen.getByText('Home Retrofit')).not.toBeNull()
  })

  it('keeps skeletoning when the layer lifts first and the query has not answered', () => {
    // The other order. Whichever wait is longer is the one the reader sees.
    setShellBooting(true)
    renderWithEntityDetail(<EntityHeader kind="service" status="loading" />)
    act(() => setShellBooting(false))
    expect(skeleton()).not.toBeNull()
  })

  it('waits on the query alone where no shell publishes a layer', () => {
    // The mobile shell, and this file's every other render. A bar with
    // nothing to wait for must not wait forever.
    renderWithEntityDetail(ready)
    expect(skeleton()).toBeNull()
    expect(screen.getByText('Home Retrofit')).not.toBeNull()
  })

  it('holds the phase bar on the same beat as the service bar', () => {
    setShellBooting(true)
    renderWithEntityDetail(
      <EntityHeader kind="phase" id="p-1" label="Warm-Up" status="ready" />,
    )
    expect(skeleton()).not.toBeNull()
  })
})

describe('the kind badge', () => {
  const navbarKinds = ['service', 'phase', 'scenario'] as const

  it('names the kind on each of the three navbar surfaces', () => {
    for (const kind of navbarKinds) {
      renderWithEntityDetail(
        <EntityHeader kind={kind} id={`${kind}-1`} label="Example service" />,
      )
      expect(kindBadge()?.textContent, kind).toBe(
        ENTITY_KIND_DEFINITIONS[kind].label,
      )
      cleanup()
    }
  })

  it('sits after the title, not before it', () => {
    renderWithEntityDetail(
      <EntityHeader kind="scenario" id="scn-1" label="Example service" />,
    )
    const position = titleSlot()!.compareDocumentPosition(kindBadge()!)
    // The badge FOLLOWS the title in document order, which is what "to the
    // right of it" means to a screen reader and to anyone reading the DOM.
    expect(position & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('has no name to hang off while the bar has no name', () => {
    renderWithEntityDetail(<EntityHeader kind="scenario" status="loading" />)
    expect(kindBadge()).toBeNull()
    cleanup()
    renderWithEntityDetail(
      <EntityHeader kind="scenario" status="error" message="No." />,
    )
    expect(kindBadge()).toBeNull()
  })

  it('discloses that kind’s definition on hover', async () => {
    renderWithEntityDetail(
      <EntityHeader kind="scenario" id="scn-1" label="Example service" />,
    )
    hover(kindBadge()!)
    // The scenario definition, verbatim from the one map that holds it —
    // a copy here would be a second place for it to drift.
    await waitFor(
      () => expect(definitionFor('scenario')).not.toBeNull(),
      OPEN_DELAY_BUDGET,
    )
  })

  it('discloses the phase definition on the phase bar, not the scenario one', async () => {
    renderWithEntityDetail(
      <EntityHeader kind="phase" id="ph-1" label="Onboarding" />,
    )
    hover(kindBadge()!)
    await waitFor(
      () => expect(definitionFor('phase')).not.toBeNull(),
      OPEN_DELAY_BUDGET,
    )
    expect(definitionFor('scenario')).toBeNull()
  })

  it('does not open the entity panel', () => {
    renderWithEntityDetail(
      <EntityHeader kind="scenario" id="scn-1" label="Example service" />,
    )
    fireEvent.click(kindBadge()!)
    // `aria-pressed` on the opener is the panel's own read-back. The badge is
    // the definition trigger and nothing else.
    expect(panelOpener()?.getAttribute('aria-pressed')).toBe('false')
    expect(titleSlot()?.hasAttribute('data-open')).toBe(false)
  })

  it('leaves the title block still opening the panel', () => {
    renderWithEntityDetail(
      <EntityHeader kind="scenario" id="scn-1" label="Example service" />,
    )
    // The control for the claim above: the panel does open, from the block —
    // otherwise "the badge does not open it" would pass on a dead bar.
    fireEvent.click(panelOpener()!)
    expect(panelOpener()?.getAttribute('aria-pressed')).toBe('true')
  })

  it('announces the kind together with the name', () => {
    renderWithEntityDetail(
      <EntityHeader kind="scenario" id="scn-1" label="Example service" />,
    )
    // Kind first, so the visible word starts the accessible name rather than
    // being buried inside a different one.
    expect(screen.getByLabelText('Scenario: Example service')).toBe(kindBadge())
  })

  it('is reachable, and openable, by keyboard alone', async () => {
    renderWithEntityDetail(
      <EntityHeader kind="scenario" id="scn-1" label="Example service" />,
    )
    const badge = kindBadge()!
    expect(badge.tabIndex).toBe(0)
    badge.focus()
    expect(document.activeElement).toBe(badge)
    fireEvent.keyDown(badge, { key: 'Enter' })
    fireEvent.keyUp(badge, { key: 'Enter' })
    await waitFor(
      () => expect(definitionFor('scenario')).not.toBeNull(),
      OPEN_DELAY_BUDGET,
    )
  })
})

/* ----------------------------------------------- the title is the opener */

/**
 * The z-order dead-click, from the reader's side.
 *
 * The name used to paint above its own invisible opener, so a click on the
 * word — the natural target — was swallowed and never reached the button.
 * The fix makes the title TEXT the opener, so the assertions here click the
 * visible word rather than a block hidden behind it.
 */
describe('the title text is the opener', () => {
  it('opens the entity panel when the title text itself is clicked', () => {
    renderWithEntityDetail(
      <EntityHeader kind="scenario" id="scn-1" label="Example service" />,
    )
    // The visible word, found by its text — not `panelOpener()`, which is the
    // control we are proving the word reaches.
    fireEvent.click(screen.getByText('Example service'))
    expect(panelOpener()?.getAttribute('aria-pressed')).toBe('true')
    expect(titleSlot()?.hasAttribute('data-open')).toBe(true)
  })

  it('toggles the panel shut on a second click of the text', () => {
    renderWithEntityDetail(
      <EntityHeader kind="scenario" id="scn-1" label="Example service" />,
    )
    fireEvent.click(screen.getByText('Example service'))
    fireEvent.click(screen.getByText('Example service'))
    expect(panelOpener()?.getAttribute('aria-pressed')).toBe('false')
    expect(titleSlot()?.hasAttribute('data-open')).toBe(false)
  })

  it('names the action on hover', async () => {
    renderWithEntityDetail(
      <TooltipProvider>
        <EntityHeader kind="scenario" id="scn-1" label="Example service" />
      </TooltipProvider>,
    )
    hover(panelOpener()!)
    await waitFor(
      () => expect(tooltipSaying('View details')).not.toBeNull(),
      OPEN_DELAY_BUDGET,
    )
  })

  it('is a focusable button, so the keyboard can operate it', () => {
    renderWithEntityDetail(
      <EntityHeader kind="scenario" id="scn-1" label="Example service" />,
    )
    const opener = panelOpener()!
    // A native button carries Enter/Space activation by contract; the claim a
    // test can make in jsdom is that the opener IS one and takes focus.
    expect(opener.tagName).toBe('BUTTON')
    opener.focus()
    expect(document.activeElement).toBe(opener)
  })
})

/* ------------------------------------------- the bar, over a warm cache */

type Result = { data: unknown; error: { message: string } | null }

/**
 * Just enough PostgREST for `useServiceSpec`: one `services` row ending in
 * `maybeSingle()`, and a `phases` select awaited on the builder itself.
 */
function fakeSupabase() {
  const rows: Record<string, unknown[]> = {
    services: [
      {
        id: 'svc-1',
        name: 'Example service',
        summary: 'Rooftop solar, end to end.',
        business_models: null,
      },
    ],
    phases: [{ id: 'phase-1', scenarios: [{ id: 'scenario-1' }] }],
  }

  return {
    from(table: string) {
      supabase.calls += 1
      const result: Result = { data: rows[table] ?? [], error: null }
      const api: Record<string, unknown> = {
        maybeSingle: () =>
          Promise.resolve({
            data: (result.data as unknown[])[0] ?? null,
            error: null,
          }),
        then: (resolve: (value: Result) => unknown) =>
          Promise.resolve(result).then(resolve),
      }
      for (const verb of ['select', 'order', 'limit', 'eq', 'abortSignal']) {
        api[verb] = () => api
      }
      return api
    },
  }
}

function mountBar(client: QueryClient) {
  return renderWithEntityDetail(
    <QueryClientProvider client={client}>
      <ServiceOverviewHeader />
    </QueryClientProvider>,
  )
}

describe('the service bar over a warm cache', () => {
  it('remounts straight into content, with no second skeleton', async () => {
    supabase.client = fakeSupabase()
    supabase.calls = 0
    // The app's own read policy, not a restatement of it: the claim IS that
    // policy, so a client with different defaults would prove nothing.
    const client = new QueryClient({
      defaultOptions: { queries: QUERY_DEFAULTS },
    })

    const first = mountBar(client)
    expect(await screen.findByText('Example service')).toBeDefined()
    const reads = supabase.calls
    first.unmount()

    mountBar(client)
    // Synchronous: this is the first painted frame of the second mount.
    expect(screen.getByText('Example service')).toBeDefined()
    expect(skeleton()).toBeNull()
    expect(supabase.calls).toBe(reads)
  })
})
