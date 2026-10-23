// @vitest-environment jsdom
/**
 * A failed write says so — and says it where the person is looking.
 *
 * Three halves, in descending order of how much they can see.
 *
 * The rendering half asserts the message a user actually reads, because "the
 * failure reached the console" is precisely the behaviour this replaces.
 *
 * The ⌘Z half drives the whole path: a real key press, a revert that rejects,
 * a notice on screen. That is the case the surface was built for — the undo
 * has no control of its own to report into — so it is the one that gets stood
 * up rather than read.
 *
 * The contract half reads the remaining three paths as source, and this is
 * the compromise: each is an event handler wired into a canvas, a sidebar or
 * a context menu, and standing all of them up would test the harness rather
 * than the honesty. It used to assert the absence of four exact strings, one
 * of which pinned ten spaces of indentation — a reformat would have made it
 * vacuously true. It now asserts a shape instead: every `catch` block in
 * those files reports through `reportWriteFailure`, with whitespace collapsed
 * first so that only the channel is being read, never the layout.
 */
import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { sourceOf } from '@/lib/sourceTree'
import { EditorErrorBoundary } from '@/components/EditorErrorBoundary'
import { WriteFailureNotices } from '@/components/editor/WriteFailureNotices'
import { AuthoringError } from '@/lib/authoringErrors'
import {
  dismissWriteFailure,
  reportWriteFailure,
  resetWriteFailures,
  writeFailureSnapshot,
} from '@/lib/writeFailures'
import { SessionChangesSheet } from '@/components/editor/SessionChangesSheet'
import {
  clearSession,
  recordChange,
  sessionSnapshot,
} from '@/lib/authoringSession'

vi.mock('@/lib/revertChange', () => ({
  executeRevert: vi.fn(async () => {
    throw new AuthoringError('That lane no longer exists.', 'cells: lane_id …')
  }),
}))
vi.mock('@/contexts/SupabaseProvider', () => ({
  useSupabase: () => ({ client: {}, session: null, status: 'ready' }),
}))

afterEach(() => {
  cleanup()
  resetWriteFailures()
  vi.restoreAllMocks()
})

/** The store logs for developers too; the tests do not need the noise. */
const quiet = () => vi.spyOn(console, 'error').mockImplementation(() => {})

describe('WriteFailureNotices', () => {
  it('renders nothing until something fails', () => {
    render(<WriteFailureNotices />)
    expect(document.querySelector('[data-write-failures]')).toBeNull()
  })

  it('shows what did not happen and why', () => {
    quiet()
    render(<WriteFailureNotices />)
    act(() =>
      reportWriteFailure(
        'The cell was not deleted',
        new AuthoringError('That lane no longer exists.', 'cells: lane_id …'),
      ),
    )
    expect(
      screen.getByText('The cell was not deleted. That lane no longer exists.'),
    ).toBeDefined()
  })

  it('never shows an empty reason', () => {
    quiet()
    render(<WriteFailureNotices />)
    act(() => reportWriteFailure('The step was not added', 'not an Error'))
    expect(
      screen.getByText(
        'The step was not added. The details are in the console.',
      ),
    ).toBeDefined()
  })

  it('is dismissed by hand, not by a timer', () => {
    quiet()
    render(<WriteFailureNotices />)
    act(() => reportWriteFailure('The step was not added', new Error('nope')))
    const [failure] = writeFailureSnapshot()
    act(() => dismissWriteFailure(failure.id))
    expect(screen.queryByText(/The step was not added/)).toBeNull()
  })

  it('keeps the newest few rather than burying the canvas', () => {
    quiet()
    for (let i = 0; i < 6; i += 1) {
      reportWriteFailure(`Write ${i} failed`, new Error('nope'))
    }
    render(<WriteFailureNotices />)
    expect(screen.queryByText(/Write 0 failed/)).toBeNull()
    expect(screen.getByText(/Write 5 failed/)).toBeDefined()
  })
})

/**
 * ⌘Z, end to end.
 *
 * The revert rejects, no control is on screen to say so, and the notice is
 * the only thing standing between the user and the belief that their change
 * was taken back. The agent's own undo was hardened to rethrow for exactly
 * this reason; this is the keyboard path saying the same thing to a person.
 */
describe('⌘Z, when the revert fails', () => {
  beforeEach(() => {
    clearSession()
    resetWriteFailures()
  })

  it('puts the failure on screen instead of only in the console', async () => {
    quiet()
    recordChange(
      'add_step',
      { phase_id: 'p1' },
      { fn: 'delete_step', args: { step_id: 's1' } },
    )
    render(
      <>
        <SessionChangesSheet />
        <WriteFailureNotices />
      </>,
    )

    act(() => {
      window.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: 'z',
          metaKey: true,
          bubbles: true,
          cancelable: true,
        }),
      )
    })

    await waitFor(() => {
      expect(
        screen.getByText(/was not taken back\. That lane no longer exists\./),
      ).toBeDefined()
    })
  })

  it('leaves the change in the ledger, so it can be tried again', async () => {
    quiet()
    recordChange(
      'add_step',
      { phase_id: 'p1' },
      { fn: 'delete_step', args: { step_id: 's1' } },
    )
    render(<SessionChangesSheet />)
    act(() => {
      window.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'z', metaKey: true }),
      )
    })
    await waitFor(() => expect(writeFailureSnapshot()).toHaveLength(1))
    expect(sessionSnapshot()).toHaveLength(1)
  })
})

/**
 * The remaining immediate-write paths that failed silently, and the `catch` in each.
 *
 * Read as source, for the reason at the top of the file — but read for shape
 * rather than for characters. A path that moves is a failing test rather than
 * a quietly unaudited file: the anchors are asserted present.
 */
const FAILING_PATHS = [
  {
    file: 'components/editor/CanvasCellContextMenu.tsx',
    subject: 'The cell was not deleted',
  },
  {
    file: 'components/editor/SlicesSidebarSection.tsx',
    subject: 'was not duplicated',
  },
] as const

/**
 * Every `catch (…) { … }` body in a file, whitespace collapsed.
 *
 * Brace-matched rather than pattern-matched, because a `catch` body holds
 * braces of its own and a regex that stops at the first `}` reads a tenth of
 * it. Comments are stripped first so that the word `console.error` inside a
 * comment explaining why it is gone does not fail the file.
 */
function catchBodies(source: string): string[] {
  const withoutComments = source
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ')
  const bodies: string[] = []
  const opener = /\bcatch\b[^{]*\{/g
  let match: RegExpExecArray | null
  while ((match = opener.exec(withoutComments)) !== null) {
    let depth = 1
    let index = match.index + match[0].length
    const start = index
    while (index < withoutComments.length && depth > 0) {
      const char = withoutComments[index]
      if (char === '{') depth += 1
      else if (char === '}') depth -= 1
      index += 1
    }
    bodies.push(
      withoutComments
        .slice(start, index - 1)
        .replace(/\s+/g, ' ')
        .trim(),
    )
  }
  return bodies
}

describe('the paths that used to fail in silence', () => {
  for (const { file, subject } of FAILING_PATHS) {
    it(`${file} reports to the user, not the console`, () => {
      const source = sourceOf(file)
      expect(source, `${file} no longer names what did not happen`).toContain(
        subject,
      )

      const bodies = catchBodies(source)
      expect(bodies.length, `no catch block found in ${file}`).toBeGreaterThan(
        0,
      )
      for (const body of bodies) {
        // A `catch` that swallows deliberately is allowed to say nothing —
        // the pointer-capture guards are the standing example. What is not
        // allowed is reporting a failed write to the console and stopping
        // there, which is indistinguishable from success at the user's
        // altitude.
        if (!body.includes('console.error')) continue
        expect(
          body,
          `a catch in ${file} reports to the console alone:\n  ${body}`,
        ).toContain('reportWriteFailure(')
      }
    })
  }
})

/**
 * The notice sits OUTSIDE the error boundary, and that placement is the point.
 *
 * The case is a write that fails as the shell falls over — a delete whose RPC
 * rejects and whose rejection also throws a render below it. Inside the
 * boundary, the one message explaining the blank screen would be swallowed by
 * the blank screen. So this is asserted twice, from both directions: the
 * behaviour (a notice survives a boundary showing its fallback) and the tree
 * that actually ships (`App.tsx` renders the notice after the boundary
 * closes, not within it).
 */
function Boom(): never {
  throw new Error('the shell fell over')
}

describe('the notice outlives the shell', () => {
  it('still renders while the boundary is showing its fallback', () => {
    quiet()
    render(
      <>
        <EditorErrorBoundary>
          <Boom />
        </EditorErrorBoundary>
        <WriteFailureNotices />
      </>,
    )
    act(() => reportWriteFailure('The cell was not deleted', new Error('nope')))

    expect(screen.getByText('Something went wrong')).toBeDefined()
    expect(screen.getByText(/The cell was not deleted/)).toBeDefined()
  })

  it('is mounted outside the boundary in the app tree', () => {
    const app = sourceOf('App.tsx')
    const opened = app.indexOf('<EditorErrorBoundary>')
    const closed = app.indexOf('</EditorErrorBoundary>')
    const notice = app.indexOf('<WriteFailureNotices />')

    expect(
      opened,
      'App.tsx no longer mounts the error boundary',
    ).toBeGreaterThan(-1)
    expect(notice, 'App.tsx no longer mounts the notice').toBeGreaterThan(-1)
    expect(
      notice < opened || notice > closed,
      'WriteFailureNotices moved INSIDE the error boundary — a write that ' +
        'fails as the shell falls over would then have nowhere to say so',
    ).toBe(true)
  })
})

it('dismisses a successful addition when its session entry is undone elsewhere', async () => {
  const { reportWriteSuccess } = await import('./writeFailures')
  const { forgetChange } = await import('./authoringSession')
  clearSession()
  recordChange('rename_step',{step_id:'step',new_name:'Review'},{fn:'rename_step',args:{step_id:'step',new_name:'Start'}})
  const entry=sessionSnapshot().at(-1)!
  render(<WriteFailureNotices />)
  act(()=>reportWriteSuccess('Added Review', entry.id, async()=>{}))
  expect(screen.getByText('Added Review')).toBeTruthy()
  expect(screen.getByRole('button',{name:'Undo'})).toBeTruthy()
  act(()=>forgetChange(entry.id))
  expect(screen.queryByText('Added Review')).toBeNull()
})

it('expires a successful addition without expiring a failed write', async () => {
  vi.useFakeTimers()
  try {
    const {reportWriteSuccess}=await import('./writeFailures')
    quiet()
    reportWriteSuccess('Added Review','entry',async()=>{})
    reportWriteFailure('The edit was not saved',new Error('Try again'))
    act(()=>vi.advanceTimersByTime(8000))
    expect(writeFailureSnapshot().map(notice=>notice.message)).toEqual(['The edit was not saved. Try again'])
  } finally {vi.useRealTimers()}
})
