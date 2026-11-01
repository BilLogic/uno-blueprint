import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

/**
 * A slice shared as a link: the link a share returns, and the page the link
 * opens. The page is served by the tool server to anyone holding the link,
 * with no sign-in; what it can show is what `read_shared_slice` returns, which
 * is the slice and the cells it cites, read at request time.
 */

export type SharedSlice = {
  title: string
  summary: string | null
  kind: string
  actor: string | null
  slides: {
    position: number
    title: string | null
    caption: string | null
    cells: { id: string; service: string; scenario: string; lane: string; step: string; content: string; summary: string | null }[]
  }[]
}

const SHARED_PATH = /\/shared\/([^/]+)\/?$/

/** The link for one token, under the tool server's own URL. */
export function sharedSliceLink(toolServerUrl: string, token: string): string {
  return `${toolServerUrl.replace(/\/+$/, '')}/shared/${token}`
}

/** The tool server's URL as the canvas knows it, from the project it talks to. */
export function browserToolServerUrl(): string | undefined {
  const project = (import.meta as { env?: Record<string, string | undefined> }).env?.VITE_SUPABASE_URL
  return project ? `${project.replace(/\/+$/, '')}/functions/v1/uno-tools` : undefined
}

/**
 * Add the link to a write reply whose result carries a share token, so the
 * person who shared reads a link rather than a bare token. Any other reply is
 * returned as it came.
 */
export function withSharedSliceLink(reply: string, toolServerUrl: string | undefined): string {
  if (!toolServerUrl) return reply
  let parsed: unknown
  try { parsed = JSON.parse(reply) } catch { return reply }
  const result = (parsed as { result?: unknown } | null)?.result
  if (!result || typeof result !== 'object' || typeof (result as { token?: unknown }).token !== 'string') return reply
  const token = (result as { token: string }).token
  return JSON.stringify({ ...(parsed as object), result: { ...result, link: sharedSliceLink(toolServerUrl, token) } })
}

/** The slice as plain text, for a reader opening the link in a browser. */
export function sharedSliceText(slice: SharedSlice): string {
  const lines = [slice.title]
  if (slice.summary) lines.push('', slice.summary)
  if (slice.actor) lines.push('', `For: ${slice.actor}`)
  slice.slides.forEach((slide, index) => {
    lines.push('', `${index + 1}. ${slide.title ?? slide.cells[0]?.step ?? 'Slide'}`)
    if (slide.caption) lines.push(`   ${slide.caption}`)
    for (const cell of slide.cells) {
      lines.push(`   - ${cell.lane}, ${cell.step} (${cell.service}): ${cell.content}`)
      if (cell.summary) lines.push(`     ${cell.summary}`)
    }
  })
  return `${lines.join('\n')}\n`
}

/**
 * Answer a GET for `…/shared/<token>`, or return null for any other request.
 * The read goes out under the publishable key alone: the link is the reader's
 * only credential, and the database decides what it opens.
 */
export async function serveSharedSlice(request: Request, options: {
  url: string
  publishableKey: string
  fetch?: typeof fetch
}): Promise<Response | null> {
  if (request.method !== 'GET') return null
  const requestUrl = new URL(request.url)
  const match = SHARED_PATH.exec(requestUrl.pathname)
  if (!match) return null
  const client = createClient<Database>(options.url, options.publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: options.fetch },
  })
  const { data, error } = await client.rpc('read_shared_slice', { p_token: decodeURIComponent(match[1]) })
  const headers = { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer', 'X-Robots-Tag': 'noindex' }
  if (error || !data) {
    return new Response(`${error?.message ?? 'This link does not open a slice. Ask the person who sent it for a new one.'}\n`,
      { status: 404, headers: { ...headers, 'Content-Type': 'text/plain; charset=utf-8' } })
  }
  const slice = data as unknown as SharedSlice
  if (requestUrl.searchParams.get('format') === 'json') {
    return new Response(JSON.stringify(slice), { headers: { ...headers, 'Content-Type': 'application/json' } })
  }
  return new Response(sharedSliceText(slice), { headers: { ...headers, 'Content-Type': 'text/plain; charset=utf-8' } })
}
