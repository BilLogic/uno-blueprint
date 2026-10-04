import { test as base, type BrowserContext, type Route } from '@playwright/test'

/**
 * No image leaves the runner for somebody else's host — why is
 * `render-walk/README.md` § No image from a live bucket.
 *
 * Every spec imports `test` from here rather than from `@playwright/test`.
 * The route is installed on the browser context while Playwright builds it,
 * which is before the spec's page exists and so before its first navigation.
 */

/** A valid 1×1 transparent PNG — the answer every remote image gets. */
export const PLACEHOLDER_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
)

/**
 * What the walk does with one request:
 *
 * - `placeholder` — an image bound for another origin, answered here;
 * - `remote` — anything else bound for another origin, let through and its
 *   host recorded;
 * - `same-origin` — the app's own, or an address that reaches no server
 *   (`data:`, `blob:`, one that does not parse), let through untouched.
 *
 * Pure, so it is tested without a browser.
 */
export type RemoteRequestAnswer = 'placeholder' | 'remote' | 'same-origin'

export function answerFor(
  url: URL | null,
  resourceType: string,
  servedOrigin: string,
): RemoteRequestAnswer {
  if (url === null) return 'same-origin'
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return 'same-origin'
  if (url.origin === servedOrigin) return 'same-origin'
  return resourceType === 'image' ? 'placeholder' : 'remote'
}

/** `address` parsed, or null when it is not a URL. */
export function parseRequestUrl(address: string): URL | null {
  try {
    return new URL(address)
  } catch {
    return null
  }
}

/** What the walk saw leave for another origin, for the run's log. */
export class RemoteRequests {
  /** Image requests answered with the placeholder. */
  imagesAnswered = 0
  /** Hosts of other cross-origin requests, which were let through. */
  readonly otherHosts = new Set<string>()

  /** One line for the run's log. */
  summary(): string {
    const hosts = [...this.otherHosts].sort()
    return (
      `render-walk: ${this.imagesAnswered} remote image request` +
      `${this.imagesAnswered === 1 ? '' : 's'} answered locally; ` +
      (hosts.length === 0
        ? 'no other cross-origin hosts'
        : `other cross-origin hosts: ${hosts.join(', ')}`)
    )
  }
}

/**
 * Route every request `context` makes through `answerFor`, tallying into
 * `seen`. Install before the first navigation; a route added later misses
 * whatever the page already asked for.
 */
export async function answerRemoteImages(
  context: BrowserContext,
  servedOrigin: string,
  seen: RemoteRequests,
): Promise<void> {
  await context.route('**/*', async (route: Route) => {
    const request = route.request()
    const url = parseRequestUrl(request.url())
    const answer = answerFor(url, request.resourceType(), servedOrigin)
    if (answer === 'placeholder') {
      seen.imagesAnswered += 1
      await route.fulfill({ status: 200, contentType: 'image/png', body: PLACEHOLDER_PNG })
      return
    }
    if (answer === 'remote' && url !== null) seen.otherHosts.add(url.host)
    await route.continue()
  })
}

/**
 * The walk's `test`: Playwright's, with the route above on every context, and
 * the tally as a fixture a spec can read (`remoteRequests`).
 */
export const test = base.extend<{ remoteRequests: RemoteRequests }>({
  // Playwright reads a fixture's dependencies off its first parameter, so an
  // empty pattern is how a fixture with none is written.
  // eslint-disable-next-line no-empty-pattern
  remoteRequests: async ({}, provide) => {
    await provide(new RemoteRequests())
  },
  context: async ({ context, baseURL, remoteRequests }, provide) => {
    if (!baseURL) throw new Error('render-walk: the config names no baseURL to serve from')
    await answerRemoteImages(context, new URL(baseURL).origin, remoteRequests)
    await provide(context)
  },
})
