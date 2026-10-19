// @vitest-environment jsdom
import { act, cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import App from './App'
import { ORG_NAME } from './config'
import { coverContent } from './content/coverContent'
import type { CoverContent } from './components/cover/coverModel'
import type { DeploymentConfig } from './deploymentConfig'

/**
 * Smoke render: the whole app mounts against the bundled fallback data with
 * no network and no env vars — the template's zero-config guarantee. If this
 * fails, a clean clone no longer renders.
 */

beforeAll(() => {
  // jsdom lacks the layout/observation APIs the canvas hooks touch.
  window.matchMedia ??= ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as typeof window.matchMedia
  window.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  window.IntersectionObserver ??= class {
    root = null
    rootMargin = ''
    thresholds = []
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords() {
      return []
    }
  } as unknown as typeof window.IntersectionObserver
})

afterEach(cleanup)

it.each(['/oauth/consent', '/oauth/consent/'])('routes %s before mounting the board, without a request or database', path => {
  window.history.replaceState(null, '', path)
  try {
    render(<App />)
    expect(screen.getByRole('heading', { name: 'Connect your agent' })).toBeDefined()
    expect(screen.getByRole('alert').textContent).toContain('Missing authorization request')
    expect(document.querySelector('[data-editor-sidebar]')).toBeNull()
  } finally { window.history.replaceState(null, '', '/') }
})

describe('App (fallback render, zero config)', () => {
  it('mounts and shows the app chrome wordmark', async () => {
    render(<App />)
    expect(await screen.findAllByText(ORG_NAME)).not.toHaveLength(0)
  })
})

/**
 * The editor shell itself, rendered — the one surface nothing stood up before.
 *
 * The shape being held is the aside model: ONE aside, in flow at every width,
 * whose width is the whole of what collapse changes. The cover is the shell's
 * collapsed case, so entry from it is also the cheapest way to see the aside
 * open, the rail mount, and the sidebar's panels arrive.
 *
 * Held through the app rather than by mounting `EditorShell` directly: the
 * shell needs the editor, view-state, Supabase and agent providers, and a test
 * that rebuilds that tree is a test about the harness. `App` already assembles
 * it against the bundled fallback data.
 */
describe('the editor shell', () => {
  const aside = () => document.querySelector('[data-editor-sidebar]')

  it('collapses the whole aside on the cover, and opens it on entry', async () => {
    render(<App />)
    // The cover is full-bleed: the aside is mounted, at zero width, with no
    // rail left over — `data-collapsed` says the aside is gone, not narrowed.
    const collapsed = aside()
    expect(collapsed).not.toBeNull()
    expect(collapsed?.getAttribute('data-collapsed')).toBe('')
    expect((collapsed as HTMLElement).style.width).toBe('0px')

    const enter = await screen.findByRole('button', {
      name: coverContent.primaryCtaLabel,
    })
    await act(async () => {
      enter.click()
    })

    const open = aside()
    expect(open?.getAttribute('data-collapsed')).toBeNull()
    expect((open as HTMLElement).style.width).not.toBe('0px')
    // The rail, and the two panels it selects between. ✦ is not among them:
    // it toggles the chat under whichever panel is open.
    //
    // Asked OF THE RAIL rather than of the document, which is load-bearing
    // and not tidiness. A `*ByRole(…, { name })` query computes an accessible
    // name for every candidate in its container, and each of those calls
    // `getComputedStyle` — the most expensive thing jsdom does. The container
    // here is the whole entered editor: 272 buttons, and half this test's
    // cost. Asked of `screen` the test ran 1.65 s in a full suite and over
    // 5 s once the machine was busy, which is vitest's default `testTimeout`
    // and is what the suite was failing on. Scoped to the rail it is
    // four buttons, the test runs 0.82 s, and the assertion is the stronger
    // one anyway: the panel controls are IN the rail, not loose in the page.
    const rail = document.querySelector('[data-editor-rail]')
    expect(rail).not.toBeNull()
    const inRail = within(rail as HTMLElement)
    expect(inRail.getByRole('button', { name: 'Blueprints' })).toBeDefined()
    expect(inRail.getByRole('button', { name: 'Slices' })).toBeDefined()
  })
})

// The deployment seam, end to end: a host mounts the same App with a config,
// and the wordmark is the host's. Module-level, as a host should pass it — an
// inline literal is a new object every render.
const hostConfig = { brand: { name: 'Acme Service Design' } }

describe('App (mounted by a deployment)', () => {
  it('renders the deployment brand in the app chrome', async () => {
    render(<App config={hostConfig} />)
    expect(await screen.findAllByText(hostConfig.brand.name)).not.toHaveLength(0)
    // Only the wordmark reads the seam today; the cover's own heading still
    // carries the template name until `content` is wired. Asserting its
    // absence here would pin a surface the seam does not yet own.
  })
})

/*
  The cover seam, end to end.

  A deployment that imports this package cannot edit `content/coverContent.ts`
  — it has no copy of it — so without a seam every installation lands on the
  template's own landing page. The config carries a whole `CoverContent`, and
  these two tests are the contract: supplied, the deployment's cover is the
  one that renders and none of the template's copy survives under it; absent,
  the template's cover renders exactly as it does standalone.

  Module-level for the same reason `hostConfig` is: a host passes a stable
  object, not a literal rebuilt every render.
*/
const HOST_COVER_TITLE = 'Acme Service Design'

const hostCover: CoverContent = {
  title: HOST_COVER_TITLE,
  lede: 'One map of the service Acme delivers, from first contact to renewal.',
  primaryCtaLabel: 'Open the map',
  commandCopy: { copyLabel: 'Copy', copiedLabel: 'Copied' },
  states: { noSlices: 'Nothing cut from this workspace yet.' },
  tabs: [
    {
      value: 'what-it-covers',
      label: 'What it covers',
      sections: [
        {
          kind: 'prose',
          id: 'covers-intro',
          heading: 'Where this starts',
          paragraphs: ['Every phase of the service, in one place.'],
        },
      ],
    },
  ],
}

const hostCoverConfig: DeploymentConfig = { cover: hostCover }

describe('App (mounted by a deployment that brings its own cover)', () => {
  it('renders the deployment cover and none of the template copy', async () => {
    render(<App config={hostCoverConfig} />)

    expect(
      await screen.findByRole('button', { name: hostCover.primaryCtaLabel }),
    ).toBeDefined()
    expect(screen.getByText(hostCover.lede)).toBeDefined()
    expect(
      screen.getByRole('tab', { name: hostCover.tabs[0].label }),
    ).toBeDefined()

    // Replaced whole, not merged: the template's own lede, action and tabs
    // are gone rather than showing through where the deployment said less.
    expect(
      screen.queryByRole('button', { name: coverContent.primaryCtaLabel }),
    ).toBeNull()
    expect(screen.queryByText(coverContent.lede)).toBeNull()
    for (const tab of coverContent.tabs) {
      expect(screen.queryByRole('tab', { name: tab.label })).toBeNull()
    }
  })

  it('calls the installation by the cover title, not the template name', async () => {
    render(<App config={hostCoverConfig} />)

    // The heading on the page AND the wordmark in app chrome, which is what
    // makes this more than one element: a deployment that names its cover has
    // named its workspace, and nothing on screen still says the template's.
    expect(
      (await screen.findAllByText(HOST_COVER_TITLE)).length,
    ).toBeGreaterThan(1)
    expect(screen.queryAllByText(ORG_NAME)).toHaveLength(0)
  })
})

describe('App (mounted by a deployment that supplies no cover)', () => {
  it("renders the template's own cover, unchanged", async () => {
    render(<App config={hostConfig} />)

    expect(
      await screen.findByRole('button', { name: coverContent.primaryCtaLabel }),
    ).toBeDefined()
    expect(screen.getByText(coverContent.lede)).toBeDefined()
    for (const tab of coverContent.tabs) {
      expect(screen.getByRole('tab', { name: tab.label })).toBeDefined()
    }
  })
})
