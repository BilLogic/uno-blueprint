// @vitest-environment jsdom
/**
 * ADD API KEY…, CLICKED ON THE DESKTOP.
 *
 * The desktop's answer to "show the key settings" is the rail's ⚙ popover:
 * the chat's no-key state and the rail button share one open flag in
 * `lib/agent/settings`. The phone answers the same ask with its drawer
 * (`mobileAddApiKey.test.tsx`); this pins that the desktop half still opens
 * the popover with the key fields in it, and that closing it leaves nothing
 * latched, so the next click opens it again.
 */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

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
vi.mock('@/hooks/useMobileShell', () => ({ isMobileViewport: () => false }))

import { AgentPanel } from '@/components/editor/AgentPanel'
import { AgentSettingsRailButton } from '@/components/editor/agent/AgentSettingsRailButton'
import { PathSelectionProvider } from '@/contexts/PathSelectionContext'
import {
  agentSessionsSnapshot,
  closeAgentSession,
  deleteAgentSession,
} from '@/lib/agent/sessions'
import { setAgentSettingsOpen } from '@/lib/agent/settings'

function forgetEverySession() {
  closeAgentSession()
  agentSessionsSnapshot().forEach((session) => deleteAgentSession(session.id))
}

/** The rail's ⚙ beside the agent's panel, on a fresh session with no key. */
function renderDesktopWithNoKey() {
  render(
    <PathSelectionProvider>
      <AgentSettingsRailButton />
      <AgentPanel />
    </PathSelectionProvider>,
  )
  fireEvent.click(screen.getByRole('button', { name: 'New session' }))
}

beforeEach(() => {
  window.localStorage.clear()
  setAgentSettingsOpen(false)
  forgetEverySession()
})

afterEach(() => {
  cleanup()
  setAgentSettingsOpen(false)
  forgetEverySession()
})

describe('Add API key… on the desktop', () => {
  it('opens the rail popover with the key fields, and opens it again after a close', async () => {
    renderDesktopWithNoKey()
    expect(screen.queryByLabelText('API key')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Add API key…' }))
    expect(await screen.findByLabelText('API key')).toBeDefined()
    expect(screen.getByText('Provider')).toBeDefined()

    await act(async () => {
      fireEvent.keyDown(document.activeElement ?? document.body, {
        key: 'Escape',
      })
    })
    await vi.waitFor(() => expect(screen.queryByLabelText('API key')).toBeNull())

    fireEvent.click(screen.getByRole('button', { name: 'Add API key…' }))
    expect(await screen.findByLabelText('API key')).toBeDefined()
  })
})
