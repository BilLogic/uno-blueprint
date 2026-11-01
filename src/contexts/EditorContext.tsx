import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { useDeploymentConfig } from '@/contexts/DeploymentConfigContext'
import { useSupabase } from '@/contexts/SupabaseProvider'
import { useServicePhases } from '@/hooks/useServicePhases'
import { isBundledSampleActive } from '@/lib/bundledSample'
import {
  activateBaseView,
  closeOpenScenarioNav,
  registerOpenScenarioCloseNav,
  selectOpenScenarioDefaultPath,
  unregisterOpenScenarioCloseNav,
} from '@/lib/openScenarioSeam'
import { persistScenarioLayout } from '@/lib/scenarioLayout'
import {
  getSlideViewType,
  isSubslide,
  type EditorView,
  type NavItem,
  type SlideViewType,
} from '@/types/nav'
import { useActiveServiceId } from '@/contexts/activeService'
import { useActiveService } from '@/contexts/ActiveServiceContext'

type EditorContextValue = {
  view: EditorView
  setView: (view: EditorView) => void
  /** Orientation homepage (sidebar Home destination). */
  goLanding: () => void
  /** Birds-eye service overview canvas (animates fit when leaving detail). */
  goHome: () => void
  /** Enter the overview canvas from the homepage without a fit zoom animation. */
  enterCanvas: () => void
  /**
   * When true, the next fit should jump instead of animating. One-shot:
   * set by enterCanvas, cleared by the fit that consumes it (and by any
   * navigation, which is a fresh animation intent).
   */
  skipCanvasFitAnimation: boolean
  /** Called by the canvas once the skip has been applied to a fit. */
  consumeCanvasFitAnimationSkip: () => void

  // ---- Navigation state -------------------------------------------------
  /** Selected phase, or null when nothing is selected (overview/landing). */
  selectedPhaseId: string | null
  /** Selected scenario; null means the whole phase is the camera target. */
  selectedScenarioId: string | null
  /**
   * Phases whose scenario list is open. Explicit and multi-open: expansion
   * is never derived from selection, which is what makes collapsing a phase
   * leave the camera alone.
   */
  expandedPhaseIds: ReadonlySet<string>
  /** Bumped on every navigation click so re-selecting a row recenters. */
  focusNonce: number
  /** Camera target — `selectedScenarioId ?? selectedPhaseId`. */
  cameraTargetId: string | null
  selectPhase: (phaseId: string) => void
  selectScenario: (scenarioId: string) => void
  /**
   * Seed the base view from a `?slice=` deep link: select the slice's
   * scenario and expand its phase so the sidebar behind the tab is coherent
   * and closing the tab lands somewhere. No-op once the user has navigated,
   * and once per boot.
   */
  seedBaseSelection: (scenarioId: string) => void
  togglePhaseExpanded: (phaseId: string) => void
  setPhaseExpanded: (phaseId: string, open: boolean) => void
  /**
   * Open the phase holding `scenarioId` and collapse the phases navigation
   * had opened on the reader's behalf. A phase the reader opened by hand
   * keeps their claim and stays open, so the tree forgets its own trail
   * rather than theirs.
   */
  openPhaseForNavigation: (scenarioId: string) => void
  clearSelection: () => void

  /** Compat wrapper over selectPhase/selectScenario. */
  openDetail: (slideId: string) => void
  slides: NavItem[]
  /** Slides from DB/fallback (same as slides; kept for callers). */
  baseSlides: NavItem[]
  /**
   * The scenario's own layout choice, or `undefined` when it has made none.
   * Distinct from an explicit 'stacked' on purpose: a caller with a default
   * of its own (a phase row's shared view) can only apply it to a scenario
   * that never chose.
   */
  getScenarioDisplayViewType: (slide: NavItem) => SlideViewType | undefined
  setScenarioDisplayViewType: (
    scenarioId: string,
    layout: SlideViewType,
  ) => void
  /**
   * Adopt a layout the URL asked for, without writing the row.
   *
   * A board's address carries `view` only when the reader had diverged from
   * what the scenario remembers, so following the link has to reproduce the
   * divergence — and reproducing it is not the same act as an editor choosing
   * it. `setScenarioDisplayViewType` would persist, which would let anyone
   * with write access re-lay a board out by opening a link someone sent them.
   */
  seedScenarioDisplayViewType: (
    scenarioId: string,
    layout: SlideViewType,
  ) => void
  slidesLoading: boolean
  slidesError: string | null
  /**
   * Compat view of the camera target; falls back to the first slide, and is
   * null when there is no slide to fall back to — a configured deployment
   * whose rows have not arrived, or which has none.
   */
  activeSlideId: string | null
  activeSlide: NavItem | null
}

/** Options for {@link useEditor}'s `openScenario`. */
export type OpenScenarioOptions = {
  /**
   * Close the mobile navigation drawer after the move, so the camera
   * change is visible. No-op on desktop (no drawer is registered).
   */
  closeNav?: boolean
  /**
   * Also show this path of the scenario, beside the one it opens on — the far
   * end of a link the reader followed. Added to the selection, never instead
   * of it.
   */
  withPath?: string
}

/**
 * Editor navigation plus the scenario-open seam. `openScenario` is composed
 * in {@link useEditor} rather than stored on the provider, so it can reach
 * the path store and the tab store without those providers learning about
 * the editor — the same reason `BoardAddressSync` is a bridge.
 */
export type EditorHandle = EditorContextValue & {
  /**
   * Open a scenario from anywhere: select its phase and the scenario, select
   * its default path, and move the camera the way the sidebar does.
   *
   * @param scenarioId - Scenario to open.
   * @param opts - Optional extras; `{ closeNav: true }` shuts the mobile drawer.
   */
  openScenario: (scenarioId: string, opts?: OpenScenarioOptions) => void
}

const EditorContext = createContext<EditorContextValue | null>(null)

/**
 * Who a phase is open for. One map is the whole expansion state: a phase
 * absent from it is collapsed, and a phase in it carries the reason it is
 * open, so the two facts cannot drift apart across the places that write them.
 */
type PhaseExpansionOwner = 'reader' | 'nav'

const EMPTY_EXPANSION: ReadonlyMap<string, PhaseExpansionOwner> = new Map()

/** @see registerOpenScenarioCloseNav */
export function useEditorNavCloser(close: () => void): void {
  useLayoutEffect(() => {
    registerOpenScenarioCloseNav(close)
    return () => unregisterOpenScenarioCloseNav(close)
  }, [close])
}

/**
 * Compose the scenario-open seam from the editor primitives plus the path
 * store, the tab store and the drawer closer, when those are mounted.
 *
 * @param selectScenario - Narrow scenario selection (phase + camera).
 * @param openPhaseForNavigation - Opens the target's phase, drops the trail.
 * @returns The shared `openScenario` action.
 */
function useOpenScenarioAction(
  selectScenario: (scenarioId: string) => void,
  openPhaseForNavigation: (scenarioId: string) => void,
): (scenarioId: string, opts?: OpenScenarioOptions) => void {
  return useCallback(
    (scenarioId: string, opts?: OpenScenarioOptions) => {
      activateBaseView()
      // Unconditional, and not left to the auto-expand effect: that one runs
      // once per scenario, so re-opening the scenario already selected would
      // leave the phase the reader had since collapsed shut.
      openPhaseForNavigation(scenarioId)
      selectScenario(scenarioId)
      selectOpenScenarioDefaultPath(scenarioId, opts?.withPath)
      if (opts?.closeNav) closeOpenScenarioNav()
    },
    [selectScenario, openPhaseForNavigation],
  )
}

/**
 * Open a phase for `owner`, or collapse it when `owner` is null.
 *
 * @param current - The expansion map.
 * @param phaseId - Phase to write.
 * @param owner - Who it is open for, or null to close it.
 * @returns The same map when nothing changed, so renders stay still.
 */
function withPhaseExpansion(
  current: ReadonlyMap<string, PhaseExpansionOwner>,
  phaseId: string,
  owner: PhaseExpansionOwner | null,
): ReadonlyMap<string, PhaseExpansionOwner> {
  if (owner === null) {
    if (!current.has(phaseId)) return current
    const next = new Map(current)
    next.delete(phaseId)
    return next
  }
  if (current.get(phaseId) === owner) return current
  return new Map(current).set(phaseId, owner)
}

/**
 * Open a phase on the reader's behalf, without taking a claim they already
 * made: a phase they opened by hand stays theirs, so navigating away later
 * does not close it under them.
 *
 * @param current - The expansion map.
 * @param phaseId - Phase navigation wants open.
 * @returns The updated map.
 */
function withNavExpansion(
  current: ReadonlyMap<string, PhaseExpansionOwner>,
  phaseId: string,
): ReadonlyMap<string, PhaseExpansionOwner> {
  if (current.get(phaseId) === 'reader') return current
  return withPhaseExpansion(current, phaseId, 'nav')
}

/**
 * The explicit selection/expansion pair behind the sidebar and the camera,
 * shared by the app-level provider and the tab-local scope.
 *
 * Invariants, settled by the navigation work that made selection explicit:
 * - No selection action touches expansion, and no expansion action touches
 *   selection. Collapsing a phase therefore never moves the camera.
 * - Auto-expanding the selected scenario's phase runs once per scenario
 *   selection, so a phase the user collapsed afterwards stays collapsed
 *   (the old effect re-fired whenever `slides` changed identity).
 * - A tab-local scope collapses an expansion map the sidebar never draws —
 *   the sidebar renders outside the scope and reads the parent's. That is on
 *   purpose: navigating inside a slice tab must leave the blueprint tab's
 *   tree exactly where the reader left it.
 */
function useNavSelectionState(slides: NavItem[]) {
  const [selectedPhaseId, setSelectedPhaseId] = useState<string | null>(null)
  const [selectedScenarioId, setSelectedScenarioId] = useState<string | null>(
    null,
  )
  const [phaseExpansion, setPhaseExpansion] =
    useState<ReadonlyMap<string, PhaseExpansionOwner>>(EMPTY_EXPANSION)
  const [focusNonce, setFocusNonce] = useState(0)
  const [view, setView] = useState<EditorView>('landing')
  const [skipCanvasFitAnimation, setSkipCanvasFitAnimation] = useState(false)

  // Deep-link seeding must not overwrite a place the user chose for
  // themselves, and must happen at most once per boot.
  const userNavigatedRef = useRef(false)
  const baseSelectionSeededRef = useRef(false)

  const selectPhase = useCallback((phaseId: string) => {
    userNavigatedRef.current = true
    setSelectedPhaseId(phaseId)
    setSelectedScenarioId(null)
    setFocusNonce((nonce) => nonce + 1)
    setSkipCanvasFitAnimation(false)
    setView('detail')
  }, [])

  const selectScenario = useCallback(
    (scenarioId: string) => {
      userNavigatedRef.current = true
      const parentId =
        slides.find((slide) => slide.id === scenarioId)?.parentId ?? null
      setSelectedScenarioId(scenarioId)
      // Keep the phase in sync so the sidebar can mark the ancestor of the
      // selection; the camera still targets the scenario.
      if (parentId !== null) setSelectedPhaseId(parentId)
      setFocusNonce((nonce) => nonce + 1)
      setSkipCanvasFitAnimation(false)
      setView('detail')
    },
    [slides],
  )

  const clearSelection = useCallback(() => {
    setSelectedPhaseId(null)
    setSelectedScenarioId(null)
  }, [])

  // The deep-linked tab covers the base view, so seeding it moves no camera —
  // it only decides where the user lands when the tab closes.
  const seedBaseSelection = useCallback(
    (scenarioId: string) => {
      if (userNavigatedRef.current || baseSelectionSeededRef.current) return
      baseSelectionSeededRef.current = true

      setSelectedScenarioId(scenarioId)
      setView('detail')

      // A scenario whose phase is not known yet (slides still loading) is
      // picked up by the auto-expand effect and the reconcile pass below.
      const parentId =
        slides.find((slide) => slide.id === scenarioId)?.parentId ?? null
      if (parentId === null) return
      setSelectedPhaseId(parentId)
      setPhaseExpansion((current) => withNavExpansion(current, parentId))
    },
    [slides],
  )

  // An expansion the reader asked for by hand is theirs either way round:
  // opening one claims it, and closing one drops the claim with the row.
  const setPhaseExpanded = useCallback((phaseId: string, open: boolean) => {
    setPhaseExpansion((current) =>
      withPhaseExpansion(current, phaseId, open ? 'reader' : null),
    )
  }, [])

  const togglePhaseExpanded = useCallback((phaseId: string) => {
    setPhaseExpansion((current) =>
      withPhaseExpansion(
        current,
        phaseId,
        current.has(phaseId) ? null : 'reader',
      ),
    )
  }, [])

  const openPhaseForNavigation = useCallback(
    (scenarioId: string) => {
      const keepPhaseId =
        slides.find((slide) => slide.id === scenarioId)?.parentId ?? null
      setPhaseExpansion((current) => {
        let next = current
        for (const [phaseId, owner] of current) {
          if (owner === 'nav' && phaseId !== keepPhaseId) {
            next = withPhaseExpansion(next, phaseId, null)
          }
        }
        return keepPhaseId === null ? next : withNavExpansion(next, keepPhaseId)
      })
    },
    [slides],
  )

  // The sidebar reads a set; the owner is bookkeeping nothing renders.
  const expandedPhaseIds = useMemo<ReadonlySet<string>>(
    () => new Set(phaseExpansion.keys()),
    [phaseExpansion],
  )

  // Selecting a scenario opens its phase — once. Keyed on the scenario id
  // rather than an effect dependency so re-renders (including a new
  // `slides` array from a refetch) never re-open a collapsed phase.
  const autoExpandedForRef = useRef<string | null>(null)
  useEffect(() => {
    if (selectedScenarioId === null) {
      autoExpandedForRef.current = null
      return
    }
    if (autoExpandedForRef.current === selectedScenarioId) return
    const parentId = slides.find(
      (slide) => slide.id === selectedScenarioId,
    )?.parentId
    // Slides may not have loaded yet — retry on the next slides change.
    if (!parentId) return
    autoExpandedForRef.current = selectedScenarioId
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot auto-expand keyed on the ref above; a render-phase version would re-open collapsed phases on refetch
    setPhaseExpansion((current) => withNavExpansion(current, parentId))
  }, [selectedScenarioId, slides])

  // Reconcile the selection against the slide list: drop ids that no longer
  // exist, and re-sort an id that was selected (deep link, click during a
  // refetch) before `slides` could say whether it was a phase or a scenario.
  useEffect(() => {
    if (slides.length === 0) return
    const find = (id: string) => slides.find((slide) => slide.id === id)

    // The camera target vanished (deleted elsewhere, or a stale deep link).
    // Dropping only the scenario id would silently retarget the camera at
    // its phase, and dropping only the phase id would fall through to
    // `slides[0]` — either way the user is moved somewhere they never
    // asked for. Go to the overview and show nothing as selected.
    const abandonSelection = () => {
      setSelectedScenarioId(null)
      setSelectedPhaseId(null)
      setView((current) => (current === 'detail' ? 'home' : current))
    }

    if (selectedScenarioId !== null) {
      const scenario = find(selectedScenarioId)
      if (!scenario) {
        abandonSelection()
        return
      }
      const parentId = scenario.parentId ?? null
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reconciles the selection against externally-fetched slides; guarded so it settles in one pass
      if (parentId !== selectedPhaseId) setSelectedPhaseId(parentId)
      return
    }

    if (selectedPhaseId === null) return
    const phase = find(selectedPhaseId)
    if (!phase) {
      abandonSelection()
      return
    }
    if (isSubslide(phase)) {
      setSelectedScenarioId(phase.id)
      setSelectedPhaseId(phase.parentId ?? null)
    }
  }, [slides, selectedPhaseId, selectedScenarioId])

  const cameraTargetId = selectedScenarioId ?? selectedPhaseId
  /*
    There may be no active slide, and saying so is the point.

    These two used to end in `slides[0]!` — a non-null assertion resting on a
    fallback that is now gone. A configured deployment's navigation is its
    rows (see `EditorProvider` below), so `slides` is empty while the first
    fetch is in flight and stays empty for a database that genuinely holds no
    phases. The `!` would have been a crash in both.

    Nullable rather than a placeholder slide: a stand-in has an id and a
    label, and anything holding one draws it. The types carry the absence
    instead, so every reader is made to decide what it does with no board —
    and the compiler, not a code review, is what enumerates them.
  */
  const activeSlideId = cameraTargetId ?? slides[0]?.id ?? null

  const activeSlide = useMemo(
    () =>
      slides.find((slide) => slide.id === activeSlideId) ?? slides[0] ?? null,
    [activeSlideId, slides],
  )

  const openDetail = useCallback(
    (slideId: string) => {
      const slide = slides.find((item) => item.id === slideId)
      if (slide && isSubslide(slide)) selectScenario(slideId)
      else selectPhase(slideId)
    },
    [selectPhase, selectScenario, slides],
  )

  const goLanding = useCallback(() => {
    userNavigatedRef.current = true
    setView('landing')
  }, [])

  const goHome = useCallback(() => {
    userNavigatedRef.current = true
    setSkipCanvasFitAnimation(false)
    setFocusNonce((nonce) => nonce + 1)
    clearSelection()
    setView('home')
  }, [clearSelection])

  const enterCanvas = useCallback(() => {
    userNavigatedRef.current = true
    setSkipCanvasFitAnimation(true)
    setFocusNonce((nonce) => nonce + 1)
    clearSelection()
    setView('home')
  }, [clearSelection])

  const consumeCanvasFitAnimationSkip = useCallback(() => {
    setSkipCanvasFitAnimation(false)
  }, [])

  return {
    view,
    setView,
    goLanding,
    goHome,
    enterCanvas,
    skipCanvasFitAnimation,
    consumeCanvasFitAnimationSkip,
    selectedPhaseId,
    selectedScenarioId,
    expandedPhaseIds,
    focusNonce,
    cameraTargetId,
    selectPhase,
    selectScenario,
    seedBaseSelection,
    togglePhaseExpanded,
    setPhaseExpanded,
    openPhaseForNavigation,
    clearSelection,
    openDetail,
    activeSlideId,
    activeSlide,
  }
}

type EditorProviderProps = {
  children: ReactNode
}

export function EditorProvider({ children }: EditorProviderProps) {
  // The service is resolved once, above, and handed down: this read never
  // resolves a slug for itself.
  const activeServiceId = useActiveServiceId()
  const { loading: resolving } = useActiveService()
  const { slides: dbSlides, loading, error, configured } = useServicePhases(activeServiceId)
  const { sample } = useDeploymentConfig()
  const fallbackSlides = sample.nav

  /**
   * The navigation, from ONE source.
   *
   * Rows ARE the navigation when there are rows: as they came back, never
   * topped up and never overwritten. `mergeSlidesWithFallback` used to run
   * here on every connected render, and it pointed the wrong way. Wherever a
   * slide id collided with the sample's it took the SAMPLE's summary — the
   * fallback was tested first, so a deployment's own sentence lost to this
   * template's even when theirs was perfectly good — took the sample's `layout`
   * for any id the sample registers, and appended every sample scenario the
   * database no longer had under a phase it still did. An adopter read this
   * template's prose about this template's service under their own phase names, with
   * nothing on screen saying so; and a scenario they had DELETED came back as
   * a tab whose board, now that `resolveBlueprint` no longer fills holes from
   * the sample, draws nothing at all.
   *
   * Same rule as `lib/resolveBlueprint.ts`, under the same ruling — a
   * connected database is the whole truth: a hole in a deployment's own
   * content is information, and the merge deleted that information.
   *
   * The remaining branch used to be "no rows at all → the sample", and that
   * reached further than it read. A read comes back with no rows in three
   * states, not one: no database configured, a database whose first fetch is
   * still in flight, and a database that genuinely holds no phases. Only the
   * first of the three is the fresh clone the sample exists for. The other
   * two are a connected deployment, and on both of them the sample arrived as
   * theirs — on EVERY page load for the second, in the window before the
   * fetch resolves, which is the common one. The sample arriving through the
   * merge was called a leak; it is the same leak when it comes through timing.
   *
   * So the question is `isBundledSampleActive()` — the same one the board
   * asks, so the two surfaces cannot answer it differently — and not "did
   * this read come back empty". A configured deployment's navigation is its
   * rows, whatever they are, including none of them.
   *
   * The cost is that this array is no longer non-empty. `activeSlideId` and
   * `activeSlide` in `useNavSelectionState` are nullable for that reason, and
   * `slidesLoading` below is what tells a surface whether an empty nav is a
   * fetch in flight or a workspace with no phases in it.
   */
  const slides = useMemo(
    () =>
      dbSlides.length === 0 && isBundledSampleActive()
        ? fallbackSlides
        : dbSlides,
    [dbSlides, fallbackSlides],
  )

  const nav = useNavSelectionState(slides)

  const { client, canWrite } = useSupabase()

  /*
    Per-scenario display override, layered over the stored `layout`.

    `scenarios.layout` is `stacked | merged` and is what a scenario opens as.
    An editor's toggle WRITES it — `persistScenarioLayout`, recorded with its
    inverse — so a scenario left merged opens merged. Anon and view-only
    sessions hold no write on the column, so their choice lives here and
    only for the session.

    An editor's choice lands here first too: the segment moves on the click,
    not on the refetch. Each override remembers what the row said when it was
    made, and it counts only while the row still says that. The moment the
    refetched slide says something else — the write landed, or a revert from
    the session sheet rewrote the row — the row wins, and no stale session
    choice can shadow it. Derived, so nothing has to run after a fetch to
    tidy up.
  */
  const [layoutOverrides, setLayoutOverrides] = useState<
    Record<string, { layout: SlideViewType; over: SlideViewType | undefined }>
  >({})

  const getScenarioDisplayViewType = useCallback(
    (slide: NavItem): SlideViewType | undefined => {
      const override = layoutOverrides[slide.id]
      if (override && override.over === slide.layout) return override.layout
      return slide.layout
    },
    [layoutOverrides],
  )

  const clearLayoutOverride = useCallback((scenarioId: string) => {
    setLayoutOverrides((current) => {
      if (!(scenarioId in current)) return current
      const next = { ...current }
      delete next[scenarioId]
      return next
    })
  }, [])

  const setScenarioDisplayViewType = useCallback(
    (scenarioId: string, layout: SlideViewType) => {
      const slide = slides.find((item) => item.id === scenarioId)
      const previous = slide ? getScenarioDisplayViewType(slide) : undefined
      // No choice reads as stacked on screen, so choosing stacked there is
      // no change and writes nothing.
      if ((previous ?? 'stacked') === layout) return
      setLayoutOverrides((current) => ({
        ...current,
        [scenarioId]: { layout, over: slide?.layout },
      }))
      void persistScenarioLayout(client, canWrite, {
        scenarioId,
        layout,
        previous,
      }).catch((error: unknown) => {
        // The row kept its old value, so the screen goes back to it.
        console.error('[layout] update_scenario_layout failed:', error)
        clearLayoutOverride(scenarioId)
      })
    },
    [slides, client, canWrite, getScenarioDisplayViewType, clearLayoutOverride],
  )

  const seedScenarioDisplayViewType = useCallback(
    (scenarioId: string, layout: SlideViewType) => {
      const slide = slides.find((item) => item.id === scenarioId)
      if (!slide) return
      // Nothing to override when the row already says it — and an override
      // recorded anyway would keep asserting the old layout after an editor
      // changed the row to something else.
      if (getSlideViewType(slide) === layout) {
        clearLayoutOverride(scenarioId)
        return
      }
      setLayoutOverrides((current) => ({
        ...current,
        [scenarioId]: { layout, over: slide.layout },
      }))
    },
    [slides, clearLayoutOverride],
  )

  // In flight while the roster resolves the service, and then while its
  // phases load. A service that never resolves — an empty database, a slug
  // no service carries — is not loading: it is a workspace with nothing in it.
  const slidesLoading =
    configured && (resolving || (activeServiceId !== null && loading)) && dbSlides.length === 0
  const slidesError = configured ? error : null

  const value = useMemo(
    () => ({
      ...nav,
      slides,
      baseSlides: slides,
      getScenarioDisplayViewType,
      setScenarioDisplayViewType,
      seedScenarioDisplayViewType,
      slidesLoading,
      slidesError,
    }),
    [
      nav,
      slides,
      getScenarioDisplayViewType,
      setScenarioDisplayViewType,
      seedScenarioDisplayViewType,
      slidesLoading,
      slidesError,
    ],
  )

  return (
    <EditorContext.Provider value={value}>{children}</EditorContext.Provider>
  )
}

export function useEditor(): EditorHandle {
  const context = useContext(EditorContext)
  if (!context) {
    throw new Error('useEditor must be used within EditorProvider')
  }
  const openScenario = useOpenScenarioAction(
    context.selectScenario,
    context.openPhaseForNavigation,
  )
  return useMemo(
    () => ({ ...context, openScenario }),
    [context, openScenario],
  )
}

const NO_NAVIGATION = () => {}

/**
 * `openScenario`, or null outside an EditorProvider.
 *
 * For a control drawn on a board that can also mount with no editor above it
 * — a cell's cross-path marker renders in tests and on surfaces that have no
 * navigation to perform — so it can offer the jump where there is somewhere
 * to jump, and stay inert where there is not.
 */
export function useOpenScenarioOptional():
  | ((scenarioId: string, opts?: OpenScenarioOptions) => void)
  | null {
  const context = useContext(EditorContext)
  const openScenario = useOpenScenarioAction(
    context?.selectScenario ?? NO_NAVIGATION,
    context?.openPhaseForNavigation ?? NO_NAVIGATION,
  )
  return context ? openScenario : null
}

/**
 * The base view's selected scenario, or null outside an EditorProvider.
 *
 * For consumers that REACT to navigation without owning it — today the path
 * selection, which collapses a multi-path comparison back to the default when
 * the reader moves to a different scenario. Null-safe because that consumer
 * also mounts in tests and on surfaces with no editor above them, where "no
 * navigation is happening" is the correct reading.
 */
export function useSelectedScenarioIdOptional(): string | null {
  const context = useContext(EditorContext)
  return context?.selectedScenarioId ?? null
}

/**
 * True while the canvas is focused on one scenario — the only place the
 * grid's structural affordances (insert handles, empty-cell `+`) belong.
 * At the overview, twenty blueprints render at 6% zoom; an insert handle
 * there is an unaimed weapon. Null-safe for surfaces outside the editor
 * provider (a slice tab), which are never at scenario level.
 */
export function useAtScenarioLevel(): boolean {
  const context = useContext(EditorContext)
  return context?.view === 'detail' && context.selectedScenarioId !== null
}

type EditorDetailScopeProps = {
  /** Slide (scenario) the scope opens focused on. */
  slideId: string
  children: ReactNode
}

/**
 * Local editor-state override for tabs that embed the normal blueprint view
 * (slice focus tabs). Slides and loading state come from the app-level
 * EditorProvider; view and navigation state are tab-local so navigating
 * inside a slice tab never disturbs the blueprint tab, and the tab opens in
 * detail view on the given slide.
 *
 * Invariant: every view-writing method of EditorContext must be overridden
 * here — anything left to the parent would silently retarget the base
 * blueprint view underneath the tab. That includes the expansion actions:
 * the sidebar renders outside the scope and reads the parent's state.
 */
export function EditorDetailScope({ slideId, children }: EditorDetailScopeProps) {
  const parent = useEditor()
  const nav = useNavSelectionState(parent.slides)
  const { openDetail } = nav

  // Re-anchor when the scope is re-pointed at a different slide (and on
  // mount, since the shared state starts unselected on the landing view).
  const [lastSlideId, setLastSlideId] = useState<string | null>(null)
  if (lastSlideId !== slideId) {
    setLastSlideId(slideId)
    openDetail(slideId)
  }

  // Landing navigation from inside a slice tab is not a supported
  // affordance (the scope cannot reach the tab store to leave the tab, and
  // the parent's goLanding would switch the base view underneath it), so
  // the override is a deliberate no-op.
  const goLanding = useCallback(() => {}, [])

  const value = useMemo(
    () => ({
      ...parent,
      ...nav,
      goLanding,
    }),
    [parent, nav, goLanding],
  )

  return (
    <EditorContext.Provider value={value}>{children}</EditorContext.Provider>
  )
}
