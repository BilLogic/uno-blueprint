// @vitest-environment jsdom
import { afterEach, expect, it } from 'vitest'
import { dispatchTool } from '@/lib/agent/tools/registry'
import { attachAgentPersistence } from '@/lib/agent/persistenceReadiness'
import { attributedTo, clearSession, recordChange } from '@/lib/authoringSession'
import { inMemoryDatabase } from '@/test/inMemoryDatabase'

afterEach(() => {
  attachAgentPersistence(null)
  clearSession()
})

it('canvas dispatch reads the persisted transcript and the session change rows', async () => {
  const sessionId = 'persisted-conversation'
  const db = inMemoryDatabase({
    agent_messages: [
      { session_id: sessionId, seq: 1, payload: { kind: 'assistant', text: 'The handoff needs a named owner.' } },
      { session_id: sessionId, seq: 0, payload: { kind: 'user', text: 'Who takes the handoff?' } },
    ],
  })
  attachAgentPersistence(db.client)
  await attributedTo(sessionId, async () => {
    recordChange('add_step', { path_id: 'handoff-path', name: 'Confirm the handoff' })
  })

  const transcript = await dispatchTool(db.client, sessionId, 'get_session', { session_id: sessionId })
  expect(transcript).toContain('Who takes the handoff?')
  expect(transcript).toContain('The handoff needs a named owner.')
  expect(transcript.indexOf('Who takes')).toBeLessThan(transcript.indexOf('The handoff needs'))
  const history = await dispatchTool(db.client, sessionId, 'get_change_history', {})
  expect(history).toContain('agent (this session)')
  expect(history).toContain('Confirm the handoff')
})
