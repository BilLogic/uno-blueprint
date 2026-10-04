// @vitest-environment jsdom
import { useEffect, type ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, render, waitFor } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { TooltipProvider } from '@/components/ui/tooltip'
import { ServiceOverviewView } from '@/components/editor/ServiceOverviewView'
import { ActiveServiceProvider } from '@/contexts/ActiveServiceContext'
import { DeploymentConfigProvider } from '@/contexts/DeploymentConfigContext'
import { EditorProvider, useEditor } from '@/contexts/EditorContext'
import { EntityDetailProvider } from '@/contexts/EntityDetailContext'
import { EntityExamplesProvider } from '@/contexts/EntityExamplesContext'
import { PathSelectionProvider } from '@/contexts/PathSelectionContext'
import { TouchpointRegistryProvider } from '@/contexts/TouchpointRegistryProvider'
import { ViewStateProvider } from '@/contexts/ViewStateContext'
import type { NavItem } from '@/types/nav'

/* Two phases, the first with one scenario inside it. */
const LOADED_NAV: NavItem[] = [
  { id: 'phase-intake', index: 1, label: 'Intake' },
  { id: 'phase-delivery', index: 2, label: 'Delivery' },
  { id: 'scenario-walk-in', index: 1, label: 'Walk-in', parentId: 'phase-intake' },
]

vi.mock('@/contexts/SupabaseProvider', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/contexts/SupabaseProvider')>()),
  useSupabase: () => ({ client: null, configured: false, canWrite: false }),
}))

/*
  The board's navigation, replaced at the one seam the provider reads it
  from. Everything else in the tree below is the real thing, the editor's
  selection included: that selection is the only thing the mark may read.
*/
const LOADED_PHASES = {
  phases: [],
  slides: LOADED_NAV,
  loading: false,
  error: null,
  configured: true,
}

vi.mock('@/hooks/useServicePhases', () => ({
  useServicePhases: () => LOADED_PHASES,
}))

beforeAll(() => {
  // jsdom lacks the layout/observation APIs the canvas hooks touch, and the
  // board mounts them before it draws a phase row.
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

/** The application's own provider tree, as `App` nests it. */
function Board({ children }: { children: ReactNode }) {
  return (
    <DeploymentConfigProvider config={null}>
      <QueryClientProvider
        client={
          new QueryClient({
            defaultOptions: { queries: { retry: false, gcTime: 0 } },
          })
        }
      >
        <ActiveServiceProvider>
          <EntityExamplesProvider>
            <TouchpointRegistryProvider>
              <EditorProvider>
                <ViewStateProvider>
                  <PathSelectionProvider>
                    <TooltipProvider delay={200}>
                      <EntityDetailProvider>{children}</EntityDetailProvider>
                    </TooltipProvider>
                  </PathSelectionProvider>
                </ViewStateProvider>
              </EditorProvider>
            </TouchpointRegistryProvider>
          </EntityExamplesProvider>
        </ActiveServiceProvider>
      </QueryClientProvider>
    </DeploymentConfigProvider>
  )
}

/** The editor's own navigation, reached from inside the real provider. */
let editor: ReturnType<typeof useEditor> | null = null
function EditorHandle() {
  const handle = useEditor()
  useEffect(() => {
    editor = handle
  }, [handle])
  return null
}

const selectedPhaseIds = () =>
  [...document.querySelectorAll<HTMLElement>('[data-phase-selected]')].map(
    (section) => section.dataset.phaseId,
  )

/*
 * The overview derives "this phase is selected" from the editor's selection
 * and nothing else, so it moves and clears with every other canvas selection.
 */
describe('the overview marks the selected phase', () => {
  it('marks the active phase, and steps aside for a scenario inside it', async () => {
    render(
      <Board>
        <EditorHandle />
        <ServiceOverviewView />
      </Board>,
    )
    await waitFor(() =>
      expect(
        document.querySelectorAll('[data-canvas-phase-section]'),
      ).toHaveLength(2),
    )
    expect(selectedPhaseIds()).toEqual([])

    act(() => editor!.openDetail('phase-intake'))
    await waitFor(() => expect(selectedPhaseIds()).toEqual(['phase-intake']))

    act(() => editor!.openDetail('phase-delivery'))
    await waitFor(() => expect(selectedPhaseIds()).toEqual(['phase-delivery']))

    // A scenario focused inside a phase is the selection; the phase is not.
    act(() => editor!.openDetail('scenario-walk-in'))
    await waitFor(() => {
      expect(
        document
          .querySelector('[data-phase-id="phase-intake"]')
          ?.hasAttribute('data-canvas-focus-active'),
      ).toBe(true)
      expect(selectedPhaseIds()).toEqual([])
    })

    act(() => editor!.goHome())
    await waitFor(() => expect(selectedPhaseIds()).toEqual([]))
  })
})
