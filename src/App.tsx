/*
 * FIRST, and the position is the whole point: this module turns off zod's
 * `new Function` probe, and zod reads that flag when the first object schema
 * is constructed — which happens while the imports below evaluate, because
 * every agent tool declares its arguments at module scope. ES modules
 * evaluate depth-first in source order, so a later line here would land after
 * the probe had already run and been refused by our own script policy.
 * `validationJit.ts` carries why the flag is free, and why the script policy
 * stays strict rather than granting the eval it refuses.
 */
import '@/lib/validationJit'
import { HOVER_HINT_DELAY } from '@/lib/hoverIntent'
import { QueryClientProvider } from '@tanstack/react-query'
import { EditorErrorBoundary } from '@/components/EditorErrorBoundary'
import { EditorShell } from '@/components/editor/EditorShell'
import { ScenarioPathSelectionReset } from '@/components/editor/ScenarioPathSelectionReset'
import { WriteFailureNotices } from '@/components/editor/WriteFailureNotices'
import { TooltipProvider } from '@/components/ui/tooltip'
import { ActiveServiceProvider } from '@/contexts/ActiveServiceContext'
import { DeploymentConfigProvider } from '@/contexts/DeploymentConfigContext'
import { BoardAddressSync } from '@/components/editor/BoardAddressSync'
import { EditorProvider } from '@/contexts/EditorContext'
import { EntityExamplesProvider } from '@/contexts/EntityExamplesContext'
import { PathSelectionProvider } from '@/contexts/PathSelectionContext'
import { SupabaseProvider } from '@/contexts/SupabaseProvider'
import { TouchpointRegistryProvider } from '@/contexts/TouchpointRegistryProvider'
import { ViewStateProvider } from '@/contexts/ViewStateContext'
import type { DeploymentConfig } from '@/deploymentConfig'
import { queryClient } from '@/lib/queryClient'
import { useStaleChunkReload } from '@/lib/staleChunkReload'
/*
 * Imported for its SIDE EFFECT and nothing else: `theme.ts` reads the stored
 * theme and stamps the class and `color-scheme` on the root while this import
 * graph evaluates — before React renders, in the template's own entry and in a
 * deployment that mounts this component alike. It sits here, at the root a
 * deployment imports, so neither consumer can reach `App` without it. Its
 * header carries why this is a module-scope effect rather than the provider it
 * replaced.
 */
import '@/lib/theme'

/**
 * The app root. Standalone it takes no props and runs on the template
 * defaults; mounted by an external deployment it takes a `DeploymentConfig`
 * that skins the tree from the outermost level down. Both the named export
 * (for a host) and the default export (for `main.tsx`) resolve to this.
 *
 * ── THE ORDER OF THE TREE, AND WHY IT IS THIS ONE ─────────────────────────
 *
 * Written down because it was not obvious, and because two installations had
 * quietly settled on two different orders. Almost none of these providers
 * consume one another — every one of them reads React context from outside
 * this file or from nothing at all — so the tree has very few FORCED edges
 * and a great many arbitrary ones, which is exactly the condition under which
 * an order drifts and nobody notices.
 *
 * The forced edges, all of them:
 *
 *   - `QueryClientProvider` and `SupabaseProvider` above the three reading
 *     providers (active service, entity examples, touchpoint registry).
 *     `useSupabaseQuery` reads both; without either it has no client and no
 *     cache.
 *   - `PathSelectionProvider` above `ScenarioPathSelectionReset`, which throws
 *     outside it, and `EditorProvider` above it too — that read is null-safe,
 *     so out of place it would not throw, it would simply never fire.
 *   - `EditorErrorBoundary` in its `app` scope ABOVE everything, the
 *     deployment seam included. Its class comment carries why.
 *   - The editor's `EditorErrorBoundary` NOT above `WriteFailureNotices`. See
 *     its comment below; this is the one edge in the tree that is a behaviour
 *     rather than a wiring requirement. The app-scoped boundary is above both,
 *     which is not the same edge: a write notice has nothing left to sit
 *     beside once the tree it reported on has gone.
 *
 * Everything else is settled by band, outermost to innermost:
 *
 *   0. THE BOUNDARY, outside the bands because it is about all of them.
 *   1. The DEPLOYMENT SEAM. `DeploymentConfigProvider` is the outermost
 *      provider because every band below may be skinned by it and none of it may be skinned
 *      half way down.
 *   2. INFRASTRUCTURE — the query cache and the database client. Nothing here
 *      renders anything the reader sees. The theme used to be a third
 *      provider in this band and is now a module-scope effect instead, which
 *      is a band above all of these rather than a peer of them: it has
 *      finished before the first of them is constructed.
 *   3. SHARED READS — the active service, then the two session-wide reads
 *      that hang off it. One query each, cached and shared by everything
 *      below, which is the whole reason they are providers rather than hooks
 *      at the call sites.
 *   4. INTERACTION STATE — the editor, the view state, the path selection.
 *      What the reader is looking at and what they have chosen.
 *   5. PRESENTATION — the tooltip delay, then the boundary and the shell.
 *
 * The rule that decides the arbitrary edges is that a band may read the bands
 * outside it and never the ones inside. Read top to bottom, the tree goes from
 * what is true of the whole installation to what is true of this moment on
 * this screen. When something new needs a home, place it in its band; if it
 * belongs to two, it is doing two things.
 */
export function App({ config }: { config?: DeploymentConfig | null }) {
  /*
   * Above the tree and rendering nothing: a tab left open across a deploy asks
   * for a chunk the new build no longer ships, and this is what turns that
   * into one reload rather than an error a reader cannot act on. It hangs off
   * the root because the root is what a deployment mounts — `staleChunkReload.ts`
   * carries why the reload is spent only once.
   */
  useStaleChunkReload()
  // The boundary below covers everything, start-up included; the rule and its
  // reasons live in `EditorErrorBoundary`'s class comment.
  return (
    <EditorErrorBoundary scope="app">
      <DeploymentConfigProvider config={config}>
        <QueryClientProvider client={queryClient}>
          <SupabaseProvider>
            {/*
             * Resolves the URL slug to the active service and canonicalises
             * the slug into the address bar. Above everything that reads a
             * service, so no reader below it can see a stale one.
             */}
            <ActiveServiceProvider>
              {/*
               * Above the editor so both the menubar identity headers and the
               * canvas read one cached service query; the definition popovers
               * on the board pick their per-kind example out of it by kind.
               */}
              <EntityExamplesProvider>
                {/*
                 * One unscoped read of `touchpoints.tone` and `.aliases` for
                 * the whole session, published to the module store every
                 * touchpoint face resolves its colour through.
                 */}
                <TouchpointRegistryProvider>
                  <EditorProvider>
                    <ViewStateProvider>
                      <PathSelectionProvider>
                        {/*
                         * A comparison is a statement about the scenario it
                         * was built in, so moving to another one collapses it.
                         * Inside the provider it drives, under the editor
                         * whose navigation it watches.
                         */}
                        <ScenarioPathSelectionReset />
                        {/*
                         * The board reaches the address bar here, beside the
                         * reset, and for the same reason: it joins navigation,
                         * the path selection and the tab state, and none of
                         * those three providers may learn about the other two.
                         */}
                        <BoardAddressSync />
                        <TooltipProvider delay={HOVER_HINT_DELAY} timeout={0}>
                          <EditorErrorBoundary>
                            <EditorShell />
                          </EditorErrorBoundary>
                          {/*
                           * Outside the boundary, on purpose: a write can fail
                           * as the shell falls over, and the notice is what
                           * says so. Inside it, the one message explaining the
                           * blank screen would be caught by the blank screen.
                           */}
                          <WriteFailureNotices />
                        </TooltipProvider>
                      </PathSelectionProvider>
                    </ViewStateProvider>
                  </EditorProvider>
                </TouchpointRegistryProvider>
              </EntityExamplesProvider>
            </ActiveServiceProvider>
          </SupabaseProvider>
        </QueryClientProvider>
      </DeploymentConfigProvider>
    </EditorErrorBoundary>
  )
}

export default App
