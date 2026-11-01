// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { serveSharedSlice, sharedSliceText, withSharedSliceLink, type SharedSlice } from '@/lib/agent/server/sharedSlice'

const TOKEN = 'ab'.repeat(32)
const SLICE: SharedSlice = {
  title: 'Partner brief', summary: 'What a partner sees', kind: 'custom', actor: 'A partner',
  slides: [{ position: 0, title: null, caption: 'Where it starts', cells: [
    { id: 'c-1', service: 'Partner service', scenario: 'Booking', lane: 'Partner team', step: 'Confirm', content: 'Partner confirms the booking', summary: null },
  ] }],
}

/** A project that answers one RPC, recording what it was asked. */
function project(answer: { status: number; body: unknown }) {
  const asked: { url: string; body: unknown; authorization: string | null }[] = []
  const fetcher: typeof fetch = async (input, init) => {
    asked.push({ url: String(input), body: JSON.parse(String(init?.body)), authorization: new Headers(init?.headers).get('Authorization') })
    return new Response(JSON.stringify(answer.body), { status: answer.status, headers: { 'Content-Type': 'application/json' } })
  }
  return { asked, fetcher }
}

describe('a shared slice', () => {
  it('a share reply gains its link; any other reply is returned as it came', () => {
    const reply = JSON.stringify({ outcome: 'applied', result: { share_id: 's-1', token: TOKEN } })
    expect(JSON.parse(withSharedSliceLink(reply, 'https://example.test/functions/v1/uno-tools/')).result)
      .toEqual({ share_id: 's-1', token: TOKEN, link: `https://example.test/functions/v1/uno-tools/shared/${TOKEN}` })
    const other = JSON.stringify({ outcome: 'applied', result: 'c-1' })
    expect(withSharedSliceLink(other, 'https://example.test')).toBe(other)
    expect(withSharedSliceLink(reply, undefined)).toBe(reply)
    expect(withSharedSliceLink('Slice updated.', 'https://example.test')).toBe('Slice updated.')
  })

  it('the link is read through read_shared_slice with the token and no person', async () => {
    const { asked, fetcher } = project({ status: 200, body: SLICE })
    const response = await serveSharedSlice(new Request(`https://example.test/functions/v1/uno-tools/shared/${TOKEN}?format=json`),
      { url: 'https://example.test', publishableKey: 'sb_publishable_test', resourceUrl: 'https://example.test/functions/v1/uno-tools', fetch: fetcher })
    expect(response!.status).toBe(200)
    expect(response!.headers.get('cache-control')).toBe('no-store')
    expect(await response!.json()).toEqual(SLICE)
    expect(asked).toHaveLength(1)
    expect(asked[0].url).toBe('https://example.test/rest/v1/rpc/read_shared_slice')
    expect(asked[0].body).toEqual({ p_token: TOKEN })
  })

  it('without a format the link reads as plain text', async () => {
    const { fetcher } = project({ status: 200, body: SLICE })
    const response = await serveSharedSlice(new Request(`https://example.test/functions/v1/uno-tools/shared/${TOKEN}`),
      { url: 'https://example.test', publishableKey: 'sb_publishable_test', resourceUrl: 'https://example.test/functions/v1/uno-tools', fetch: fetcher })
    expect(response!.headers.get('content-type')).toContain('text/plain')
    expect(await response!.text()).toBe(sharedSliceText(SLICE))
    expect(sharedSliceText(SLICE)).toContain('- Partner team, Confirm (Partner service): Partner confirms the booking')
  })

  it('a refused link answers 404 with the database sentence', async () => {
    const { fetcher } = project({ status: 404, body: { code: 'PT404', message: 'This link does not open a slice. Ask the person who sent it for a new one.' } })
    const response = await serveSharedSlice(new Request(`https://example.test/functions/v1/uno-tools/shared/${TOKEN}`),
      { url: 'https://example.test', publishableKey: 'sb_publishable_test', resourceUrl: 'https://example.test/functions/v1/uno-tools', fetch: fetcher })
    expect(response!.status).toBe(404)
    expect(await response!.text()).toContain('This link does not open a slice')
  })

  it('any other failure answers a fixed sentence, never the detail', async () => {
    const { fetcher } = project({ status: 500, body: { code: '57014', message: 'canceling statement due to statement timeout' } })
    const response = await serveSharedSlice(new Request(`https://example.test/functions/v1/uno-tools/shared/${TOKEN}`),
      { url: 'https://example.test', publishableKey: 'sb_publishable_test', resourceUrl: 'https://example.test/functions/v1/uno-tools', fetch: fetcher })
    expect(response!.status).toBe(503)
    expect(await response!.text()).not.toContain('statement')
    const unreachable: typeof fetch = async () => { throw new TypeError('fetch failed') }
    const down = await serveSharedSlice(new Request(`https://example.test/functions/v1/uno-tools/shared/${TOKEN}`),
      { url: 'https://example.test', publishableKey: 'k', resourceUrl: 'https://example.test/functions/v1/uno-tools', fetch: unreachable })
    expect(down!.status).toBe(503)
  })

  it('a malformed escape is passed to the database as written, not decoded', async () => {
    const { asked, fetcher } = project({ status: 404, body: { code: 'PT404', message: 'refused' } })
    const response = await serveSharedSlice(new Request('https://example.test/functions/v1/uno-tools/shared/%E0'),
      { url: 'https://example.test', publishableKey: 'k', resourceUrl: 'https://example.test/functions/v1/uno-tools', fetch: fetcher })
    expect(response!.status).toBe(404)
    expect(asked[0].body).toEqual({ p_token: '%E0' })
  })

  it('every other request is left to the tool server', async () => {
    const { asked, fetcher } = project({ status: 200, body: SLICE })
    for (const request of [new Request('https://example.test/functions/v1/uno-tools'),
      new Request(`https://example.test/elsewhere/shared/${TOKEN}`),
      new Request(`https://example.test/functions/v1/uno-tools/shared/${TOKEN}/more`),
      new Request(`https://example.test/functions/v1/uno-tools/shared/${TOKEN}`, { method: 'POST', body: '{}' })]) {
      expect(await serveSharedSlice(request, { url: 'https://example.test', publishableKey: 'k', resourceUrl: 'https://example.test/functions/v1/uno-tools', fetch: fetcher })).toBeNull()
    }
    expect(asked).toEqual([])
  })
})
