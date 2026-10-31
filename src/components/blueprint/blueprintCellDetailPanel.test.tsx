// @vitest-environment jsdom
/**
 * What the cell panel draws above its tabs.
 *
 * `BlueprintCellDetailPanel` is the largest surface in the panel cluster and
 * it had no rendering test at all — neither here nor in the deployment built
 * on this template, which is how three of the rules below were changed by
 * separate tickets without any of them being checkable by a reader.
 *
 * It pins the rules those tickets turn on, and nothing else about the panel's
 * appearance. A test that asserted the layout wholesale would fail on every
 * ordinary edit and teach the next author to delete it.
 *
 *   - **The panel draws one image: the frame.** The frame is the cell's
 *     featured image. Nothing else leads — not a featured attachment, not a
 *     logo row beside it. A frame that IS a placed touchpoint's registry icon
 *     is drawn at the logo size; no touchpoint gets a size because of its NAME.
 *   - **No url is elected "the design".** A cell carrying a figma.com
 *     resource gets no hover overlay and no vendor-named link. That
 *     affordance was a regex in a renderer deciding one deployment's tool
 *     policy for every deployment; `featuredPresentation` answers the same
 *     question from a flag a person sets.
 *   - **A real placement names itself even off a touchpoint lane.** The field
 *     used to appear only where the lane draws touchpoints, so a document or
 *     a recording attached to a support row had its summary rendered while
 *     the name it belonged to was suppressed — and the role a person could
 *     set on it had no reader anywhere.
 *   - **A new cell's lane badge is the lane badge.** The draft branch drew
 *     its own span and painted it with `backgroundColor: style.lane`, which
 *     is a role key ("actor"), not a colour. The browser dropped the
 *     declaration and the row a new cell was being written into rendered
 *     untinted, where every saved cell's panel names its row in that row's
 *     own colour.
 *
 * The panel's children are stubbed. Each of them reads the database through
 * its own hooks and each has, or deserves, its own test; standing them all up
 * here would mean mocking most of the app to assert two `<img>` elements.
 */
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { DraftCellTarget } from '@/components/blueprint/CellPanelEditor'
import type { BlueprintCellSelection } from '@/types/blueprintCellDetail'
import type {
  BlueprintData,
  CellResource,
  CellTouchpoint,
} from '@/types/blueprint'

/*
  The panel's own context, handed to it directly.

  The provider resolves a selection out of a board, a canvas mode and a query;
  this file is about what the panel does WITH a selection, so the selection is
  the input and the provider is not in the picture.
*/
const detail = {
  selection: null as BlueprintCellSelection | null,
  blueprints: [] as BlueprintData[],
  panelState: { surface: 'details' } as { surface: 'details' | 'differences' } | null,
  draftCell: null as DraftCellTarget | null,
  isOpen: true,
  clearSelection: () => {},
  selectCell: () => {},
  setPanelSurface: () => {},
}

/*
  Only the ONE reader is replaced; every other export stays the real one.

  A bare `vi.mock` factory makes the module a closed set, and anything the
  panel renders that asks the context a different question then throws an
  "export is not defined" — which the panel's error boundary catches and
  turns into a blank panel. From a test's side that is indistinguishable from
  an assertion failing, which is the worst way for a rendering test to be
  wrong: it stays green for the wrong reason, or red for one.
*/
vi.mock('@/contexts/BlueprintCellDetailContext', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('@/contexts/BlueprintCellDetailContext')
  >()),
  useBlueprintCellDetail: () => detail,
}))

// View mode, and no write credential: the editor form never mounts, so the
// panel renders the read-only face these assertions are about.
vi.mock('@/contexts/SupabaseProvider', () => ({
  useSupabase: () => ({ client: null, configured: false, canWrite: false }),
}))
vi.mock('@/contexts/canvasModeContext', () => ({
  useCanvasModeValue: () => 'view',
}))

/*
  The panel's children, stubbed.

  Every one of them opens its own query. What is under test is the block the
  panel itself renders above the tab row, so the children are named
  placeholders — present enough that the panel's own tree is intact, inert
  enough that no database is needed.
*/
vi.mock('@/components/blueprint/CellContentSection', () => ({
  CellContentSection: () => <div data-stub="cell-content-section" />,
}))
vi.mock('@/components/blueprint/CellOverviewSpec', () => ({
  CellOverviewSpec: () => <div data-stub="cell-overview-spec" />,
}))
vi.mock('@/components/blueprint/CellDependencySections', () => ({
  CellDependencySections: () => <div data-stub="cell-dependency-sections" />,
}))
vi.mock('@/components/blueprint/CellDependencyEditor', () => ({
  CellDependencyEditor: () => <div data-stub="cell-dependency-editor" />,
}))
vi.mock('@/components/blueprint/CellEvidenceTab', () => ({
  CellEvidenceTab: () => <div data-stub="cell-evidence-tab" />,
}))
vi.mock('@/components/blueprint/CellResourcesTab', () => ({
  CellResourcesTab: () => <div data-stub="cell-resources-tab" />,
}))
vi.mock('@/components/blueprint/CellInSlicesFooter', () => ({
  CellInSlicesFooter: () => <div data-stub="cell-in-slices-footer" />,
}))
vi.mock('@/components/blueprint/CompareDifferencesSurface', () => ({
  CompareDifferencesSurface: () => <div data-stub="compare-differences" />,
}))
vi.mock('@/components/blueprint/StoryboardStepDetailStack', () => ({
  StoryboardStepDetailStack: () => <div data-stub="storyboard-stack" />,
}))
// The new-cell form. Only the draft branch mounts it, and what is asserted
// there is the badge the panel draws above it.
vi.mock('@/components/blueprint/CellPanelEditor', () => ({
  CellPanelEditor: () => <div data-stub="cell-panel-editor" />,
}))

import { BlueprintCellDetailPanel } from '@/components/blueprint/BlueprintCellDetailPanel'

/** A bucket attachment: an authored picture, named by the uuid it was stored under. */
const AUTHORED_FRAME =
  'https://example.supabase.co/storage/v1/object/public/cell-attachments/cells/c-1/6fc4f2fc.png'

/** A stock logo, named by the convention the bundled assets follow. */
const STOCK_LOGO = '/touchpoint-logos/intake-portal-logo.png'

/**
 * A registry icon whose url says nothing about being one.
 *
 * `touchpoints.icon_url` is free text. An icon served from a content network
 * under a hashed name is the case the filename convention cannot answer, and
 * the case a deployment reaches the first time it stops committing its logos.
 */
const OFF_CONVENTION_ICON = 'https://cdn.example.com/brand/assets/8842.svg'

function placement(over: Partial<CellTouchpoint> = {}): CellTouchpoint {
  return {
    id: 'ct-1',
    touchpointId: 'tp-1',
    name: 'Intake portal',
    kind: 'app',
    iconUrl: null,
    summary: null,
    role: null,
    ...over,
  }
}

function selectionFor(options: {
  touchpointName: string
  /** The stock logo the touchpoint's registry row carries. */
  iconUrl?: string | null
  frame?: string | null
  resources?: CellResource[]
  /** Overrides for the one placement, e.g. `id: null` for a board with no rows. */
  placementOver?: Partial<CellTouchpoint>
  /** The lane, which decides whether the row draws touchpoints at all. */
  laneName?: string
  summary?: string | null
}): BlueprintCellSelection {
  return {
    scenarioName: 'Discovery',
    phaseName: 'Intake',
    // Resolves to a touchpoint role through the legacy name map, which is what
    // makes the touchpoint field render on a lane that draws touchpoints.
    laneName: options.laneName ?? 'Front Stage Touchpoints',
    stepId: 'step-1',
    stepName: 'Hears about the service',
    stepIndex: 0,
    techItem: options.touchpointName,
    paths: [
      {
        cellId: 'cell-1',
        pathId: 'path-1',
        pathName: 'Happy path',
        pathKind: 'happy',
        content: options.touchpointName,
        summary:
          options.summary === undefined
            ? 'What the reader meets at this moment.'
            : options.summary,
        frame: options.frame ?? null,
        touchpoints: [
          placement({
            name: options.touchpointName,
            iconUrl: options.iconUrl ?? null,
            ...options.placementOver,
          }),
        ],
        resources: options.resources ?? [],
      },
    ],
  }
}

/** Every `<img>` the panel drew, in document order. */
function pictures(): HTMLImageElement[] {
  return Array.from(document.querySelectorAll('img'))
}

function pictureFor(src: string): HTMLImageElement {
  const found = pictures().find((image) => image.getAttribute('src') === src)
  expect(found, `no <img> drawn for ${src}`).toBeTruthy()
  return found!
}

beforeEach(() => {
  // jsdom ships no `matchMedia`, and the desktop posture is the one under
  // test — the same stand-in `panelDrawerShell.test.tsx` uses.
  window.matchMedia = ((query: string) => ({
    media: query,
    matches: false,
    addEventListener() {},
    removeEventListener() {},
  })) as unknown as typeof window.matchMedia
  detail.selection = null
  detail.panelState = { surface: 'details' }
})

afterEach(cleanup)

async function open(selection: BlueprintCellSelection) {
  detail.selection = selection
  render(<BlueprintCellDetailPanel />)
  // The drawer opens on a later frame than the first render.
  await screen.findByLabelText('Close cell details')
}

describe('the pictures a cell panel draws', () => {
  it('draws a stock logo at the one logo size, unframed', async () => {
    await open(
      selectionFor({ touchpointName: 'Intake portal', iconUrl: STOCK_LOGO, frame: STOCK_LOGO }),
    )

    expect(pictures()).toHaveLength(1)
    const logo = pictureFor(STOCK_LOGO)
    expect(logo.className).toContain('size-32')
    // Not in a 4:3 frame — a logo is drawn at its own size.
    expect(logo.closest('[class*="aspect-"]')).toBeNull()
  })

  // The registry row decides, not the url: an icon hosted off-convention is
  // still drawn as the logo when it is the frame.
  it('draws the registry icon as the logo whatever its url looks like', async () => {
    await open(
      selectionFor({
        touchpointName: 'Intake portal',
        iconUrl: OFF_CONVENTION_ICON,
        frame: OFF_CONVENTION_ICON,
      }),
    )

    const logo = pictureFor(OFF_CONVENTION_ICON)
    expect(logo.className).toContain('size-32')
    expect(logo.closest('[class*="aspect-"]')).toBeNull()
  })

  it('draws an authored attachment as a picture, whatever the touchpoint is called', async () => {
    // No `icon_url`, so nothing here is a logo: the cell's own frame draws in
    // the 4:3 frame every other authored picture draws in. A touchpoint's
    // NAME buys no size — there is no table of names left to consult.
    for (const name of ['Intake portal', 'Field visit', 'Duty phone']) {
      cleanup()
      detail.selection = null
      await open(selectionFor({ touchpointName: name, frame: AUTHORED_FRAME }))

      const picture = pictureFor(AUTHORED_FRAME)
      expect(picture.closest('[class*="aspect-"]'), name).toBeTruthy()
      expect(picture.className, name).not.toContain('size-32')
    }
  })
})

describe('the panel draws one image, the frame', () => {
  it('draws a frame that is not the logo, and no logo row beside it', async () => {
    await open(
      selectionFor({ touchpointName: 'Intake portal', iconUrl: STOCK_LOGO, frame: AUTHORED_FRAME }),
    )
    expect(pictures().map((image) => image.getAttribute('src'))).toEqual([AUTHORED_FRAME])
  })

  it('draws nothing for a cell with no frame, logo or not', async () => {
    await open(selectionFor({ touchpointName: 'Intake portal', iconUrl: STOCK_LOGO }))
    expect(pictures()).toHaveLength(0)
  })

  it('leads with no featured attachment and no placement screenshot', async () => {
    await open(
      selectionFor({
        touchpointName: 'Intake portal',
        frame: AUTHORED_FRAME,
        resources: [
          {
            id: 'r-shot',
            kind: 'attachment',
            name: 'Screen',
            url: 'https://example.supabase.co/storage/v1/object/public/cell-attachments/cells/c-1/other.png',
            placementId: 'ct-1',
            featured: true,
          },
        ],
      }),
    )
    expect(pictures().map((image) => image.getAttribute('src'))).toEqual([AUTHORED_FRAME])
  })
})

describe('the panel elects no url as "the design"', () => {
  it('offers no vendor-named overlay over a picture', async () => {
    await open(
      selectionFor({
        touchpointName: 'Intake portal',
        frame: AUTHORED_FRAME,
        resources: [
          {
            id: 'r-1',
            kind: 'link',
            name: 'Intake portal',
            url: 'https://www.figma.com/design/W0/intake-portal',
            placementId: 'ct-1',
            featured: false,
          },
        ],
      }),
    )

    expect(screen.queryByLabelText('View in Figma')).toBeNull()
    expect(screen.queryByText('View in Figma')).toBeNull()
    // The frame is drawn plainly: no anchor wraps it.
    expect(pictureFor(AUTHORED_FRAME).closest('a')).toBeNull()
  })
})

describe('the touchpoint a cell was opened on', () => {
  it('names it in a labelled field', async () => {
    await open(selectionFor({ touchpointName: 'Intake portal' }))

    expect(screen.getByText('Touchpoint')).toBeTruthy()
    expect(screen.getAllByText('Intake portal').length).toBeGreaterThan(0)
  })

  /*
    The widening. `Support Actions` draws no touchpoints, so `isTechLane` is
    false there — but the cell carries a real `cell_touchpoints` row, and the
    row is what the summary being rendered belongs to. Naming it is what gives
    the role a reader.
  */
  it('names a real placement on a lane that draws no touchpoints', async () => {
    await open(
      selectionFor({
        touchpointName: 'Brand guidelines',
        laneName: 'Support Actions',
        placementOver: { role: 'core', summary: 'The version the crew works from.' },
      }),
    )

    expect(screen.getByText('Touchpoint')).toBeTruthy()
    expect(screen.getAllByText('Brand guidelines').length).toBeGreaterThan(0)
  })

  /*
    And the boundary of it. A cell with no placement ROW — a board served from
    the bundled sample content, which has nowhere to record one — is a
    sentence, not a tool, and calling its own words a touchpoint name is the
    label join a placement row exists to end.
  */
  it('names nothing where there is no placement row and no touchpoint lane', async () => {
    await open(
      selectionFor({
        touchpointName: 'Books an appointment',
        laneName: 'Support Actions',
        placementOver: { id: null, touchpointId: null },
      }),
    )

    expect(screen.queryByText('Touchpoint')).toBeNull()
  })

  it('renders no role badge where nobody set one', async () => {
    await open(
      selectionFor({
        touchpointName: 'Intake portal',
        placementOver: { role: null },
      }),
    )

    // Absence is the honest rendering of "not judged": no badge, no dash, no
    // "Unmarked" — a grey badge on every placement would put a judgement on
    // screen that nobody made.
    expect(document.querySelector('[data-touchpoint-role]')).toBeNull()
    expect(screen.queryByText(/at this step/)).toBeNull()
  })
})

describe('the summary a cell panel shows', () => {
  it('labels it, like every other field on the panel', async () => {
    await open(
      selectionFor({
        touchpointName: 'Intake portal',
        placementOver: { summary: 'Where a report is filed.' },
      }),
    )

    expect(screen.getByText('Summary')).toBeTruthy()
    expect(screen.getByText('Where a report is filed.')).toBeTruthy()
  })

  it('says nothing where the summary would repeat the title', async () => {
    // A cell with no authored summary falls back to its own content, and
    // printing the title again under a "Summary" label is one fact wearing
    // two hats.
    await open(
      selectionFor({
        touchpointName: 'Intake portal',
        summary: null,
        placementOver: { summary: null },
      }),
    )

    expect(screen.queryByText('Summary')).toBeNull()
  })
})

describe('the new-cell form', () => {
  const DRAFT: DraftCellTarget = {
    pathId: 'path-1',
    laneId: 'lane-1',
    stepId: 'step-1',
    laneName: 'Customer',
    // The role the board read off the lane below — the draft and the lane
    // record agree, so the badge's tint is the lane's and nothing else's.
    laneRole: 'customer_actions',
    stepName: 'Hears about the service',
    stepIndex: 0,
    scenarioName: 'Discovery',
    phaseName: 'Intake',
  }

  beforeEach(() => {
    detail.draftCell = DRAFT
    detail.blueprints = [
      {
        path: {
          id: 'path-1',
          name: 'Happy path',
          summary: null,
          note: null,
          kind: 'happy',
          status: 'live',
        },
        lanes: [
          { id: 'lane-1', name: 'Customer', role: 'customer_actions', position: 0 },
        ],
        steps: [],
        cells: [],
        dependencies: [],
      },
    ]
  })

  afterEach(() => {
    detail.draftCell = null
    detail.blueprints = []
  })

  it('does not open the generic cell form for an empty storyboard slot', () => {
    detail.draftCell = { ...DRAFT, laneName: 'Journey figures', laneRole: 'storyboard' }
    detail.blueprints[0].lanes[0] = {
      id: 'lane-1', name: 'Journey figures', role: 'storyboard', position: 0,
    }
    render(<BlueprintCellDetailPanel />)

    expect(document.querySelector('[data-stub="cell-panel-editor"]')).toBeNull()
    expect(screen.queryByText('New cell')).toBeNull()
  })

  it("names the row it is written into with that row's own badge", async () => {
    render(<BlueprintCellDetailPanel />)
    await screen.findByText('New cell')

    // The lane badge is tinted by the stylesheet through the role it
    // carries. A hand-rolled span carrying the role as an inline colour
    // carries no role at all: the browser drops the declaration and the badge
    // is left untinted.
    const badge = screen.getByText('Customer').closest('[data-blueprint-lane]')
    expect(badge, 'no lane badge above the new-cell form').not.toBeNull()
    expect(badge!.getAttribute('data-blueprint-lane')).toBe('actor')
  })
})
