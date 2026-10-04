// @vitest-environment jsdom
/**
 * ADD API KEY…, TAPPED ON A PHONE.
 *
 * The agent's no-key state offers one way forward, and it asks for "the key
 * settings" without knowing which layout is on screen. On the desktop that is
 * the rail's ⚙ popover; on a phone there is no rail, and the key fields live
 * on the nav drawer's Settings surface. So the phone shell answers the same
 * ask, and gets its own agent sheet out of the way to do it: two modal sheets
 * stacked is a drawer behind a scrim.
 *
 * Mounted on the real `MobileShell` over the real `AgentPanel`, at the phone
 * width the rest of the mobile suite uses. The canvas is stood in for — jsdom
 * lays nothing out, and what is read here is chrome.
 */
import { QueryClientProvider } from '@tanstack/react-query'
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const PHONE = { width: 375, height: 812 }

// The sample trial with no key saved: the agent is allowed and has nothing to
// talk to yet — the one state that offers Add API key….
vi.mock('@/contexts/SupabaseProvider', () => ({
  useSupabase: () => ({
    client: null,
    session: null,
    configured: false,
    canWrite: false,
    canAgent: true,
    canAgentWrite: false,
    isSampleTrial: true,
    devSimulation: { on: false, tier: 'regular' },
  }),
}))

vi.mock('@/components/editor/ServiceOverviewView', async () => {
  const { createElement } = await import('react')
  return {
    ServiceOverviewView: () =>
      createElement('div', { 'data-testid': 'phone-canvas' }),
  }
})

import { MobileShell } from '@/components/mobile/MobileShell'
import { ActiveServiceProvider } from '@/contexts/ActiveServiceContext'
import { DeploymentConfigProvider } from '@/contexts/DeploymentConfigContext'
import { EditorProvider } from '@/contexts/EditorContext'
import { PathSelectionProvider } from '@/contexts/PathSelectionContext'
import { ViewStateProvider } from '@/contexts/ViewStateContext'
import {
  agentSessionsSnapshot,
  closeAgentSession,
  deleteAgentSession,
} from '@/lib/agent/sessions'
import { setAgentSettingsOpen } from '@/lib/agent/settings'
import { MOTION_FADE_MS } from '@/lib/motion'
import { queryClient } from '@/lib/queryClient'

/** jsdom has no ResizeObserver, and the sheets observe themselves. */
class StillResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

/** A phone in both the answers a module can ask for: width and media query. */
function phoneScreen() {
  for (const [name, value] of [
    ['innerWidth', PHONE.width],
    ['innerHeight', PHONE.height],
  ] as const)
    Object.defineProperty(window, name, {
      configurable: true,
      writable: true,
      value,
    })
  window.matchMedia = ((query: string) => ({
    matches: query.includes('max-width: 767px'),
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia
}

function renderPhone() {
  return render(
    <QueryClientProvider client={queryClient}>
      <DeploymentConfigProvider>
        <ActiveServiceProvider>
          <ViewStateProvider>
            <PathSelectionProvider>
              <EditorProvider>
                <div style={{ width: PHONE.width, height: PHONE.height }}>
                  <MobileShell />
                </div>
              </EditorProvider>
            </PathSelectionProvider>
          </ViewStateProvider>
        </ActiveServiceProvider>
      </DeploymentConfigProvider>
    </QueryClientProvider>,
  )
}

/** Turn the faked clock in small steps, so effects scheduled mid-way run too. */
async function letTheClockRun(ms: number) {
  for (let left = ms; left > 0; left -= 25) {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(Math.min(25, left))
    })
  }
}

/** Off the cover, into the ✦ sheet, onto a fresh session's no-key state. */
async function readerOpensTheAgentWithNoKey() {
  renderPhone()
  fireEvent.click(screen.getByRole('button', { name: 'Open the blueprint' }))
  await letTheClockRun(MOTION_FADE_MS * 4)
  fireEvent.click(screen.getByRole('button', { name: 'Ask the agent' }))
  await letTheClockRun(MOTION_FADE_MS)
  fireEvent.click(screen.getByRole('button', { name: 'New session' }))
  await letTheClockRun(MOTION_FADE_MS)
}

/** Sessions live in a module, so one case's conversation would open the next. */
function forgetEverySession() {
  closeAgentSession()
  agentSessionsSnapshot().forEach((session) => deleteAgentSession(session.id))
}

/** The drawer, when it is open. */
function theDrawer(): HTMLElement | null {
  return screen.queryByLabelText('Blueprint contents')
}

/** The drawer is open on Settings, with the provider, model and key fields. */
function theKeySettingsAreShowing(): boolean {
  const drawer = theDrawer()
  if (!drawer) return false
  const inDrawer = within(drawer)
  return (
    inDrawer.getByRole('button', { name: 'Settings' }).getAttribute(
      'aria-pressed',
    ) === 'true' &&
    inDrawer.queryByText('Provider') !== null &&
    inDrawer.queryByText('Model') !== null &&
    inDrawer.queryByLabelText('API key') !== null
  )
}

beforeEach(() => {
  vi.useFakeTimers({
    toFake: [
      'setTimeout',
      'clearTimeout',
      'setInterval',
      'clearInterval',
      'Date',
      'performance',
    ],
  })
  phoneScreen()
  globalThis.ResizeObserver =
    StillResizeObserver as unknown as typeof ResizeObserver
  window.localStorage.clear()
  queryClient.clear()
  setAgentSettingsOpen(false)
  forgetEverySession()
})

afterEach(() => {
  cleanup()
  window.localStorage.clear()
  setAgentSettingsOpen(false)
  forgetEverySession()
  vi.useRealTimers()
})

describe('Add API key… on a phone', () => {
  it('opens the drawer on its Settings surface, with the agent sheet out of the way', async () => {
    await readerOpensTheAgentWithNoKey()

    fireEvent.click(screen.getByRole('button', { name: 'Add API key…' }))
    await letTheClockRun(MOTION_FADE_MS * 2)

    expect(theKeySettingsAreShowing()).toBe(true)
    // The agent sheet stepped aside rather than stacking a second scrim over
    // the drawer.
    expect(screen.queryByRole('button', { name: 'Add API key…' })).toBeNull()
  })

  it('closing the settings returns to the agent, and the next tap opens them again', async () => {
    await readerOpensTheAgentWithNoKey()

    fireEvent.click(screen.getByRole('button', { name: 'Add API key…' }))
    await letTheClockRun(MOTION_FADE_MS * 2)
    expect(theKeySettingsAreShowing()).toBe(true)

    fireEvent.click(
      within(theDrawer()!).getByRole('button', { name: 'Close' }),
    )
    await letTheClockRun(MOTION_FADE_MS * 2)
    expect(theDrawer()).toBeNull()

    // Back where the reader was: the agent, still asking for a key — and the
    // ask is not latched, so it opens the settings a second time.
    fireEvent.click(screen.getByRole('button', { name: 'Add API key…' }))
    await letTheClockRun(MOTION_FADE_MS * 2)
    expect(theKeySettingsAreShowing()).toBe(true)
  })
})
