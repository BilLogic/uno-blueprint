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

// An agent allowed and no key saved — the one state that offers Add API
// key…. In a real build that is a signed-in session on a configured
// deployment (a no-database build admits the agent only once a key exists,
// which is why the render walk cannot reach it). The trial's flags stand in
// for it here because they keep transcript persistence, which would wait on
// a database, out of the panel; the shell's handling of the ask is the same.
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
import {
  openAgentSettings,
  setAgentSettingsOpen,
} from '@/lib/agent/settings'
import { SAMPLE_PHASES, SAMPLE_SCENARIOS } from '@/data/sampleBlueprint'
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

/** The phone shell — or, with `shell` false, its providers with no shell in them. */
function phoneTree(shell = true) {
  return (
    <QueryClientProvider client={queryClient}>
      <DeploymentConfigProvider>
        <ActiveServiceProvider>
          <ViewStateProvider>
            <PathSelectionProvider>
              <EditorProvider>
                <div style={{ width: PHONE.width, height: PHONE.height }}>
                  {shell ? <MobileShell /> : null}
                </div>
              </EditorProvider>
            </PathSelectionProvider>
          </ViewStateProvider>
        </ActiveServiceProvider>
      </DeploymentConfigProvider>
    </QueryClientProvider>
  )
}

function renderPhone() {
  return render(phoneTree())
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

/** Dismiss the drawer with its own Close control. */
async function dismissTheDrawer() {
  fireEvent.click(within(theDrawer()!).getByRole('button', { name: 'Close' }))
  await letTheClockRun(MOTION_FADE_MS * 2)
}

/** Ask for the key settings from the agent's no-key state. */
async function tapAddApiKey() {
  fireEvent.click(screen.getByRole('button', { name: 'Add API key…' }))
  await letTheClockRun(MOTION_FADE_MS * 2)
}

/** The drawer surface the rail marks as pressed. */
function thePressedSurface(): string | null {
  const rail = within(theDrawer()!).getByRole('navigation', {
    name: 'Sidebar surfaces',
  })
  return (
    within(rail)
      .getAllByRole('button')
      .find((button) => button.getAttribute('aria-pressed') === 'true')
      ?.getAttribute('aria-label') ?? null
  )
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

  it('closing the drawer by navigating restores nothing — the reader went somewhere new', async () => {
    await readerOpensTheAgentWithNoKey()
    await tapAddApiKey()
    expect(theKeySettingsAreShowing()).toBe(true)

    const scenario = SAMPLE_SCENARIOS.find(
      (one) => one.name === 'Map your service',
    )!
    const phase = SAMPLE_PHASES.find((one) => one.id === scenario.phase_id)!
    fireEvent.click(within(theDrawer()!).getByRole('button', { name: 'Blueprints' }))
    await letTheClockRun(MOTION_FADE_MS)
    fireEvent.click(within(theDrawer()!).getByText(phase.name))
    await letTheClockRun(MOTION_FADE_MS)
    fireEvent.click(within(theDrawer()!).getByText(scenario.name))
    await letTheClockRun(MOTION_FADE_MS * 4)

    expect(theDrawer()).toBeNull()
    expect(screen.queryByRole('button', { name: 'Add API key…' })).toBeNull()
  })

  it('dismissing puts the drawer back on the surface it was left on', async () => {
    await readerOpensTheAgentWithNoKey()
    // The reader had last left the drawer on Slices.
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    await letTheClockRun(MOTION_FADE_MS * 2)
    fireEvent.click(screen.getByRole('button', { name: 'Open navigation' }))
    await letTheClockRun(MOTION_FADE_MS)
    fireEvent.click(within(theDrawer()!).getByRole('button', { name: 'Slices' }))
    await letTheClockRun(MOTION_FADE_MS)
    await dismissTheDrawer()
    fireEvent.click(screen.getByRole('button', { name: 'Ask the agent' }))
    await letTheClockRun(MOTION_FADE_MS)

    await tapAddApiKey()
    expect(theKeySettingsAreShowing()).toBe(true)
    await dismissTheDrawer()

    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    await letTheClockRun(MOTION_FADE_MS * 2)
    fireEvent.click(screen.getByRole('button', { name: 'Open navigation' }))
    await letTheClockRun(MOTION_FADE_MS)
    expect(thePressedSurface()).toBe('Slices')
  })

  it('a key saved in the drawer is the agent ready to talk once the drawer is dismissed', async () => {
    await readerOpensTheAgentWithNoKey()
    await tapAddApiKey()

    const drawer = within(theDrawer()!)
    fireEvent.change(drawer.getByLabelText('API key'), {
      target: { value: 'test-key' },
    })
    fireEvent.click(drawer.getByRole('button', { name: 'Save' }))
    await letTheClockRun(MOTION_FADE_MS)
    await dismissTheDrawer()

    const composer = screen.getByRole('textbox', { name: 'Message the agent' })
    expect((composer as HTMLTextAreaElement).disabled).toBe(false)
    expect(screen.queryByRole('button', { name: 'Add API key…' })).toBeNull()
  })

  it('an ask made before the phone shell mounted still opens the settings, and dismissing it restores', async () => {
    // A window narrowed with the desktop popover up: the ask was made with
    // no phone shell listening, and is still unanswered when one mounts. The
    // providers stay up across the swap, as they do in the app, so the shell
    // mounts onto the board rather than the cover.
    const { rerender } = renderPhone()
    fireEvent.click(screen.getByRole('button', { name: 'Open the blueprint' }))
    await letTheClockRun(MOTION_FADE_MS * 4)
    rerender(phoneTree(false))
    openAgentSettings()
    rerender(phoneTree())
    await letTheClockRun(MOTION_FADE_MS * 2)

    expect(theKeySettingsAreShowing()).toBe(true)
    await dismissTheDrawer()
    fireEvent.click(screen.getByRole('button', { name: 'Open navigation' }))
    await letTheClockRun(MOTION_FADE_MS)
    expect(thePressedSurface()).toBe('Blueprints')
  })
})
