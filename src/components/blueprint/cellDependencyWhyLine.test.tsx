// @vitest-environment jsdom
/**
 * A dependency row is one line — the direction, the lane and the step — and
 * everything else about the connection is read on request.
 *
 * What the other cell says, and the note on the edge, used to print under
 * the line, and a list of eight rows read as a wall. They read from a tooltip
 * now, and the failure mode of "put it in a tooltip" is the reason there is a
 * test rather than a class. A tooltip is not an accessible name and this Base
 * UI version's trigger opens on a mouse-like pointer only, so the same words
 * are the row's description (`aria-describedby`) for a screen reader, the
 * popup opens on keyboard focus as well as on hover, and a touch reader —
 * who can neither — taps through to the other cell, whose own panel says it.
 *
 * The row's own words are pinned from the other side too. The edge's `name`
 * column — specified as a badge and only ever written with sentences — is not
 * drawn here any more. It does not reach a row at all now: the read that turns
 * a dependency into a connection drops it, and the last block below walks a
 * stored name the whole way to make sure of it.
 */
import { afterEach, describe, expect, it } from 'vitest'
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { CellDependencySections } from '@/components/blueprint/CellDependencySections'
import { TooltipProvider } from '@/components/ui/tooltip'
import {
  getBlueprintCellConnections,
  type BlueprintCellConnection,
} from '@/lib/blueprintCellConnections'
import type { BlueprintData } from '@/types/blueprint'

const NOTE =
  'A zero-config run has content only because the sample module is generated.'

const connection = (patch: Partial<BlueprintCellConnection> = {}): BlueprintCellConnection => ({
  dependencyId: 'dep-1',
  cellId: 'cell-1',
  laneName: 'Scripts',
  laneRowPosition: 2,
  stepName: 'Generate',
  stepIndex: 3,
  kind: 'connection',
  linkKind: 'enables',
  linkNote: NOTE,
  isTech: false,
  techItems: [],
  contentPreview: 'Generates the sample module into the bundle',
  ...patch,
})

afterEach(cleanup)

/**
 * The app mounts one provider at 200ms in `App.tsx`; this one says 0 so the
 * open is a tick rather than a fifth of a second of `waitFor` budget. The
 * delay is the only thing a provider decides — with or without it, the same
 * trigger opens on the same two interactions.
 */
function draw(patch: Partial<BlueprintCellConnection> = {}) {
  render(
    <TooltipProvider delay={0}>
      <CellDependencySections
        connections={{ incoming: [connection(patch)], outgoing: [] }}
        otherTech={[]}
        onCellSelect={() => {}}
        onTechSelect={() => {}}
      />
    </TooltipProvider>,
  )
}

/** The row itself: one button, named for the cell it points at. */
const row = () => screen.getByRole('button', { name: /Scripts/ })

/** What the row's description says — the words a screen reader is handed. */
const description = () => {
  const id = row().getAttribute('aria-describedby')
  return id ? (document.getElementById(id)?.textContent ?? '') : null
}

/** Popups, wherever the portal put them. */
const popups = () => [
  ...document.querySelectorAll('[data-slot="tooltip-content"]'),
]

const popupSaying = (text: string) =>
  popups().find((node) => node.textContent?.includes(text)) ?? null

/**
 * Hover, as Base UI actually learns it — the sequence `definitionCard.test.tsx`
 * worked out. Its hover interaction is `mouseOnly` and decides from a pointer
 * type recorded on React's `onPointerEnter`, which React synthesises from
 * `pointerover`; a `mouseEnter` alone leaves the type unset and nothing opens.
 * jsdom has no `PointerEvent`, so the first event is a `MouseEvent` with the
 * property attached.
 */
function hover(element: Element) {
  const pointerOver = new MouseEvent('pointerover', {
    bubbles: true,
    cancelable: true,
  })
  Object.defineProperty(pointerOver, 'pointerType', { value: 'mouse' })
  element.dispatchEvent(pointerOver)
  fireEvent.mouseEnter(element)
  fireEvent.mouseMove(element)
}

/** Room for the open, which is a state update and a portal rather than a paint. */
const OPEN_BUDGET = { timeout: 3000 }

describe('a dependency row, at rest and on request', () => {
  it('is one line at rest: the lane and the step, and nothing else', () => {
    draw()
    expect(row().textContent).toBe('Scripts · Step 4')
    expect(popups()).toHaveLength(0)
  })

  it('describes itself with the other cell s words and the edge s note', () => {
    // This Base UI tooltip wires no `aria-describedby` back to its trigger,
    // so the popup is a picture; the description is what a screen reader is
    // handed.
    draw()
    expect(description()).toContain('Generates the sample module into the bundle')
    expect(description()).toContain(NOTE)
  })

  it('opens under a pointer that comes to rest on the row', async () => {
    draw()
    hover(row())
    await waitFor(
      () => expect(popupSaying('Generates the sample module')).not.toBeNull(),
      OPEN_BUDGET,
    )
    expect(popupSaying(NOTE)).not.toBeNull()
  })

  it('opens on keyboard focus, not on hover alone', async () => {
    // The reader who tabs to the row never hovers anything. A tooltip that
    // only answers a mouse would hand this reader the row and keep the rest.
    draw()
    row().focus()
    await waitFor(
      () => expect(popupSaying(NOTE)).not.toBeNull(),
      OPEN_BUDGET,
    )
  })

  it('opens nothing, and describes nothing, when there is nothing more to say', async () => {
    draw({ linkNote: null, contentPreview: '' })
    expect(row().getAttribute('aria-describedby')).toBeNull()
    hover(row())
    row().focus()
    await waitFor(() => expect(document.activeElement).toBe(row()))
    expect(popups()).toHaveLength(0)
  })
})

/**
 * A board carrying one edge with BOTH prose columns filled, so the name has a
 * real value and a real row to fail to appear on. Started from the stored row
 * rather than from a connection object, because the connection object is where
 * the name is dropped — pinning it from the far side would pin the drop with
 * the thing it drops.
 */
const board = {
  path: { id: 'path-1', name: 'a path' },
  lanes: [{ id: 'lane-1', name: 'Scripts', position: 2 }],
  steps: [
    { id: 'step-0', name: 'Run', position: 0 },
    { id: 'step-1', name: 'Generate', position: 1 },
  ],
  cells: [
    {
      id: 'cell-0',
      lane_id: 'lane-1',
      step_id: 'step-0',
      content: 'Runs with no configuration',
      frame: null,
      summary: null,
    },
    {
      id: 'cell-1',
      lane_id: 'lane-1',
      step_id: 'step-1',
      content: 'Generates the sample module into the bundle',
      frame: null,
      summary: null,
    },
  ],
  dependencies: [
    {
      id: 'dep-1',
      source_cell_id: 'cell-1',
      target_cell_id: 'cell-0',
      kind: 'enables',
      name: 'Email',
      note: NOTE,
    },
  ],
} as unknown as BlueprintData

describe('a dependency row s name', () => {
  it('does not survive the read that turns an edge into a row', () => {
    // `cell_dependencies.name` was specified as the word on the arrow and was
    // only ever written with sentences about why the edge exists — which is
    // what the note is for. Two fields making one claim is worse than one, so
    // the mapping carries the note and leaves the badge in the database.
    const { incoming } = getBlueprintCellConnections(board, 'cell-0')
    expect(incoming).toHaveLength(1)
    expect(incoming[0].linkNote).toBe(NOTE)
    expect(JSON.stringify(incoming[0])).not.toContain('Email')
  })

  it('is nowhere on the row the edge became', () => {
    render(
      <TooltipProvider delay={0}>
        <CellDependencySections
          connections={getBlueprintCellConnections(board, 'cell-0')}
          otherTech={[]}
          onCellSelect={() => {}}
          onTechSelect={() => {}}
        />
      </TooltipProvider>,
    )
    expect(screen.queryByText('Email')).toBeNull()
    expect(document.body.textContent).not.toContain('Email')
  })
})
