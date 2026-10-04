import { expect } from '@playwright/test'
import { test } from './remote-images'

/**
 * The route in `remote-images.ts`, watched working.
 *
 * The bundled sample board may hold no remote image at all — this
 * repository's does not — so a walk over it would pass whether the route
 * answered anything or was never installed. This case puts remote images on
 * the served page itself and holds the three claims the route makes: a remote
 * image arrives as the placeholder without a request reaching the network, a
 * same-origin image arrives as itself, and neither leaves a console error.
 *
 * The remote hosts are `.invalid`, a name that never resolves, so a request
 * that slipped past the route would fail to load, and fail this case, rather
 * than reach anybody's server.
 */
test('a remote image is answered in the runner and a same-origin one loads as itself', async ({
  page,
  remoteRequests,
}) => {
  const problems: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error') problems.push(`console.error: ${message.text()}`)
  })
  page.on('pageerror', (error) => problems.push(`pageerror: ${error.message}`))

  // A request the route let through to a `.invalid` host cannot resolve, so
  // it ends here rather than at a server.
  const failed: string[] = []
  page.on('requestfailed', (request) => {
    if (new URL(request.url()).hostname.endsWith('.invalid')) failed.push(request.url())
  })

  // Served from the walk's own origin, so the same-origin image below is the
  // app's own asset and the remote ones are cross-origin to it.
  await page.goto('./')
  // The app's own icon, by the address its document gives it — under a
  // served path as much as at the root, and whatever a deployment named it.
  const ownImage = await page
    .locator('link[rel~="icon"]:not([type="image/svg+xml"])')
    .first()
    .getAttribute('href')
  expect(ownImage, 'the app links a raster icon to load as a same-origin image').toBeTruthy()
  const answeredBefore = remoteRequests.imagesAnswered
  await page.setContent(`
    <img id="bucket" src="https://storage.example.invalid/object/public/attachments/a.png">
    <img id="frame" src="https://cdn.example.invalid/frame.jpg">
    <img id="own" src="${new URL(ownImage as string, page.url()).href}">
  `)

  const loaded = (id: string) =>
    page.locator(`#${id}`).evaluate((node) => {
      const img = node as unknown as { complete: boolean; naturalWidth: number }
      return img.complete && img.naturalWidth
    })

  await expect.poll(() => loaded('bucket'), { message: 'the bucket image arrived' }).toBe(1)
  await expect.poll(() => loaded('frame'), { message: 'the frame image arrived' }).toBe(1)
  // The app's icon is larger than the placeholder, so a width above one is
  // the real file rather than the stand-in.
  await expect
    .poll(() => loaded('own'), { message: 'the same-origin image loaded as itself' })
    .toBeGreaterThan(1)

  expect(
    remoteRequests.imagesAnswered - answeredBefore,
    'both remote images were answered locally',
  ).toBe(2)
  expect(failed, 'requests that went to the network and failed').toEqual([])
  expect(problems, 'browser errors').toEqual([])
  console.log(remoteRequests.summary())
})
