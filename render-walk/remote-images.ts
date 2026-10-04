import { test as base, type BrowserContext, type Route } from '@playwright/test'

/**
 * No image leaves the runner for somebody else's host.
 *
 * A no-database build draws a board exported from a live one, and that
 * board's attachment and frame image URLs still name the bucket they were
 * uploaded to. The walk opens every view of it on every push, so without this
 * file each run downloads every one of those images from the deployment's
 * storage: thousands of requests a day from CI runners, against a few hundred
 * from people reading the board, enough to spend a free plan's storage egress
 * on its own. The walk asserts that a board renders without a console error;
 * it asserts nothing about the pixels of an attachment.
 *
 * So every image request to an origin other than the one the walk serves is
 * answered here, with a 1×1 PNG built into this file. It answers rather than
 * aborts because a failed image load is a console error, and the walk counts
 * those. Anything else bound for another origin goes through untouched, and
 * its host is recorded so the run can say a new outside dependency appeared.
 * Same-origin requests — the app's own assets — are never touched.
 *
 * Every spec imports `test` from here rather than from `@playwright/test`.
 * The route is installed on the browser context while Playwright builds it,
 * which is before the spec's page exists and so before its first navigation.
 * See `render-walk/README.md` § No image from a live bucket.
 */

/** A valid 1×1 transparent PNG — the answer every remote image gets. */
export const PLACEHOLDER_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
)

export type RemoteRequestAnswer = 'placeholder' | 'continue'

/** Whether `url` is an http(s) address on an origin other than `servedOrigin`. */
function isCrossOrigin(url: URL, servedOrigin: string): boolean {
  return (url.protocol === 'http:' || url.protocol === 'https:') && url.origin !== servedOrigin
}

/**
 * What the walk does with one request: answer it with the placeholder, or let
 * it go. Pure, so it is tested without a browser.
 *
 * `served` is the address the walk previews on. A URL that does not parse, or
 * a scheme that is not http(s) — `data:`, `blob:` — never reaches a bucket,
 * so it is let go.
 */
export function answerFor(
  requestUrl: string,
  resourceType: string,
  served: string,
): RemoteRequestAnswer {
  let url: URL
  try {
    url = new URL(requestUrl)
  } catch {
    return 'continue'
  }
  if (!isCrossOrigin(url, new URL(served).origin)) return 'continue'
  return resourceType === 'image' ? 'placeholder' : 'continue'
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
  served: string,
  seen: RemoteRequests,
): Promise<void> {
  const servedOrigin = new URL(served).origin
  await context.route('**/*', async (route: Route) => {
    const request = route.request()
    if (answerFor(request.url(), request.resourceType(), servedOrigin) === 'placeholder') {
      seen.imagesAnswered += 1
      await route.fulfill({ status: 200, contentType: 'image/png', body: PLACEHOLDER_PNG })
      return
    }
    const url = new URL(request.url())
    if (isCrossOrigin(url, servedOrigin)) seen.otherHosts.add(url.host)
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
    await answerRemoteImages(context, baseURL, remoteRequests)
    await provide(context)
  },
})
