import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { useEditor } from '@/contexts/EditorContext'
import { MobileShell } from '@/components/mobile/MobileShell'
import { EntityDetailProvider } from '@/contexts/EntityDetailContext'
import { useMobileShell } from '@/hooks/useMobileShell'
import {
  RAIL_WIDTH,
  SIDEBAR_DEFAULT_WIDTH,
  SIDEBAR_MAX_WIDTH,
  SIDEBAR_MIN_WIDTH,
} from '@/lib/layoutTokens'
import { CoverPage } from '@/components/cover/CoverPage'
import { EditorErrorBoundary } from '@/components/EditorErrorBoundary'
import { useCoverContent } from '@/contexts/DeploymentConfigContext'
import { ServiceOverviewView } from '@/components/editor/ServiceOverviewView'
import {
  FloatingSidebarNavbar,
  SidebarCollapseButton,
} from '@/components/editor/EditorChrome'
import { AgentDock, AgentDockDivider } from '@/components/editor/AgentDock'
import { EditorRail, type SidebarPanel } from '@/components/editor/EditorRail'
import { AgentSettingsRailButton } from '@/components/editor/agent/AgentSettingsRailButton'
import { ThemeToggle } from '@/components/editor/ThemeToggle'
import { StoryboardWalkthroughShell } from '@/components/blueprint/StoryboardWalkthroughShell'
import { CanvasModeProvider } from '@/components/editor/CanvasModeProvider'
import { SlideModeSidebarNav } from '@/components/editor/SlideModeView'
import { SlicePresentation } from '@/components/editor/SlicePresentation'
import { SliceView } from '@/components/editor/SliceView'
import { TabStrip } from '@/components/editor/TabStrip'
import { SidebarProvider } from '@/components/ui/sidebar'
import { useSupabase } from '@/contexts/SupabaseProvider'
import { useCellDeepLink } from '@/hooks/useCellDeepLink'
import { setSidebarCollapsedState } from '@/contexts/sidebarCollapsedContext'
import { setShellBooting } from '@/contexts/shellBootStore'
import { SKELETON_HOLD_MS } from '@/components/ui/deferred-skeleton'
import {
  CANVAS_REVEAL_CELLS,
  CANVAS_REVEAL_DONE,
  CANVAS_REVEAL_LANES,
  CANVAS_REVEAL_PANELS,
} from '@/contexts/canvasRevealContext'
import { EditorSidebarBootSkeleton } from '@/components/editor/EditorLoadingSkeletons'
import {
  isBaseViewCurrent,
  tabKey,
  useViewState,
  warmMounts,
} from '@/contexts/viewStateStore'
import { CanvasActiveProvider } from '@/contexts/canvasActiveContext'
import {
  registerAgentUiBridge,
  registerAgentUiContext,
} from '@/lib/agent/uiBridge'
import {
  toggleAgentOpen,
  useAgentPlacement,
} from '@/lib/agent/placement'
import { registerAgentUiCommand } from '@/lib/agent/uiCommands'
import { suppressCanvasResizeRefit } from '@/lib/canvasChromeResize'
import {
  MOTION_STRUCTURAL_EASE,
  MOTION_STRUCTURAL_MS,
  SHELL_ENTRANCE_STEP_MS,
  prefersReducedMotion,
} from '@/lib/motion'
import {
  describeSelection,
  describeSidebar,
  selectionOf,
} from '@/lib/shellContext'
import { storageKey } from '@/lib/storageNamespace'
import { cn } from '@/lib/utils'

/**
 * Aside = rail + content panel, drag-resizable from the aside's right edge
 * with one persisted width shared by every surface. Dimensions live in
 * `lib/layoutTokens` — one home for every shell width the runtime does
 * math on.
 */
const WIDTH_STORAGE_KEY = storageKey('sidebar-width')

function loadAsideWidth(): number {
  try {
    const raw = window.localStorage.getItem(WIDTH_STORAGE_KEY)
    const value = raw ? Number(raw) : Number.NaN
    return Number.isFinite(value)
      ? Math.min(SIDEBAR_MAX_WIDTH, Math.max(SIDEBAR_MIN_WIDTH, value))
      : SIDEBAR_DEFAULT_WIDTH
  } catch {
    return SIDEBAR_DEFAULT_WIDTH
  }
}

/**
 * The shell gate: one breakpoint decides which app this is. Below `md`
 * (767px) the phone gets the view-only mobile shell — journey reader, touch
 * map, sheets. At or above it, the desktop shell below, untouched. The
 * check is synchronous (`matchMedia` via `useSyncExternalStore`), so a
 * phone never mounts the desktop canvas for even one frame.
 */
export function EditorShell() {
  const mobile = useMobileShell()
  /*
    The entity drawer's provider sits ABOVE both shells.

    It used to be mounted inside `ServiceOverviewView`, which is one tab body.
    Everything else that can carry an entity affordance renders outside it —
    the sidebar's `SlideModeSidebarNav`, the sticky header and phase menubar,
    the breadcrumb, the slice tab — and `useEntityDetail` returned an inert
    value out there, so those affordances were silent no-ops rather than
    errors. Hoisting the provider to the shell is what makes "open the lane
    panel" mean the same thing from the sidebar as from the canvas; the hook
    now throws outside it, so a call site the provider does not reach is a
    crash in development rather than a dead button in production.

    The PANEL stays where it is, in the canvas: the provider is state, the
    panel is a drawer over the board.
  */
  return (
    <EntityDetailProvider>
      {mobile ? <MobileShell /> : <DesktopEditorShell />}
    </EntityDetailProvider>
  )
}

/**
 * The app frame: sidebar, tab strip and whichever view the current tab selects.
 *
 * Owns sidebar collapse and the hover-peek rail. Both are timed against
 * `suppressCanvasResizeRefit`, so the canvas does not refit mid-animation.
 */
function DesktopEditorShell() {
  const {
    view,
    goHome,
    goLanding,
    enterCanvas,
    selectPhase,
    openScenario,
    selectedPhaseId,
    selectedScenarioId,
    slides,
    togglePhaseExpanded,
    setScenarioDisplayViewType,
  } = useEditor()
  const { activeTab, activeKey, activateTab, openTab, closeTab, pendingUrlState } =
    useViewState()
  const { canAgent } = useSupabase()
  // The landing page, from the deployment seam rather than from a content
  // module this shell imports: an installation that mounts this package cannot
  // edit the template's copy, so the cover has to arrive through the config.
  // Standalone this is the template's own, unchanged.
  const cover = useCoverContent()
  // `?cell=` boot deep link — the receiving end of the share link the agent
  // hands back with a cited cell. Mounted here because it needs the editor's
  // navigation and the boot URL state, and both live at this level.
  useCellDeepLink()
  /*
    Collapse, and only ever because the reader asked.

    The sidebar is in flow at every width: collapse and expand push the
    canvas the same way whether the window is wide or narrow, and there is
    no viewport gate that shuts the aside on the reader's behalf. So this is a
    plain boolean — no `auto`/`narrow` bookkeeping to tell a gate's collapse
    from a reader's, because the gate is gone.
  */
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const setCollapsedByUser = useCallback((collapsed: boolean) => {
    // The width ease resizes the canvas container. Chrome moving, not the
    // reader navigating — the camera holds still.
    suppressCanvasResizeRefit()
    setSidebarCollapsed(collapsed)
  }, [])
  const isLanding = view === 'landing'
  const [sessionMountedBase, setSessionMountedBase] = useState(false)
  const viewingBase =
    !isLanding &&
    isBaseViewCurrent({
      activeKey,
      pendingUrl: pendingUrlState !== null,
    })
  if (viewingBase && !sessionMountedBase) {
    setSessionMountedBase(true)
  }

  const activeTabKind = activeTab?.kind ?? null

  // The rail picks a panel. Slice/present tab activation auto-selects ◇,
  // exactly as the old horizontal tabs did (initializer covers remounts
  // while a tab is already active, e.g. returning from a presentation).
  // ✦ is NOT in this state — it toggles the chat, which sits under whichever
  // panel is open, so it never displaces one.
  const [panel, setPanel] = useState<SidebarPanel>(
    activeTabKind !== null ? 'slices' : 'blueprints',
  )
  const agentPlacement = useAgentPlacement()
  const agentDocked = agentPlacement.mode === 'docked' && agentPlacement.open
  const panelColumnRef = useRef<HTMLDivElement>(null)
  const [lastTabKind, setLastTabKind] = useState(activeTabKind)
  if (lastTabKind !== activeTabKind) {
    setLastTabKind(activeTabKind)
    if (activeTabKind !== null) setPanel('slices')
  }

  // Leaving presentation plays the pose/fade while the present view is
  // still the current one, then switches to the slice. The slice may
  // already be warm; the wait is the sidebar expand, not an unmount.
  const [leavingPresent, setLeavingPresent] = useState(false)
  const leaveTimer = useRef<number | null>(null)
  useEffect(
    () => () => {
      if (leaveTimer.current !== null) window.clearTimeout(leaveTimer.current)
    },
    [],
  )

  // Presentation is full-bleed: the whole sidebar collapses (the navbar hides
  // too — Return is the way back), on the same 320 ms width ease as a manual
  // collapse. It never unmounts, which is what keeps entering smooth.
  const presenting = activeTabKind === 'present' && !leavingPresent

  // The cover page is a full-bleed reading surface: it has no phases to
  // navigate to yet, so a sidebar beside it is chrome for a workspace the
  // reader has not entered. It collapses like a presentation — the whole
  // aside, rail included, and no navbar either — down to zero width, which
  // is what the name below tracks: not "just the rail" (there is no rail
  // left to be only), but the aside gone entirely.
  const asideHidden = presenting || sidebarCollapsed || isLanding
  /*
    Collapsed BY THE READER, which is not the same as an aside that is off
    screen.

    NOT `asideHidden`: presentation hides the sidebar too, and hides the navbar
    with it (full-bleed). Telling the bands they are collapsed there would
    strand a presentation with no header and no Return — the band must keep
    drawing itself when nothing else can carry it. The landing view is the same
    argument again.

    ONE binding because it was three copies of one sentence, and one of the
    three was wrong: the agent's shell context asked plain `asideHidden`, so a
    reader mid-presentation was told the sidebar was collapsed and to expand a
    control that was not on screen. Three readers of a fact is fine; three
    spellings of it is how they disagree.
  */
  const collapsedByReader = sidebarCollapsed && !presenting && !isLanding

  /*
    Entering the workspace from the cover, in two separated concerns.

    WIDTH is not animated. The canvas load bar centers itself in the canvas
    frame, and a 320 ms width ease — or a sidebar that pushes the canvas as
    it arrives — would drag that bar across the screen for the whole first
    third of the load, which is the one thing it must never do. The aside
    takes its full width in the same commit the canvas mounts, so the frame
    is fixed from the first painted frame.

    PAINT is a ladder. With the width already reserved, the sidebar's three
    parts fade in over space that is not moving: the loading bar first and
    alone, then the rail, then the phases panel, then the agent dock, each
    one `SHELL_ENTRANCE_STEP_MS` behind the last. The delays are CSS
    (`--shell-entrance-*` below) rather than a chain of timers — one state
    flip, and the stagger is declarative.

    `pending` for exactly one frame: it is what gives the transitions a
    from-state to run from. A boot that lands straight on the canvas (a
    `?cell=` deep link) starts pending too, so the ladder is the same
    whichever door was used.
  */
  const [entrance, setEntrance] = useState<'idle' | 'pending' | 'shown'>(() =>
    isLanding ? 'idle' : 'pending',
  )
  /*
    The sidebar's boot layer fires ONCE per entry, tracked as a small state
    machine rather than a boolean.

    The base canvas remounts whenever a tab stops covering it, and a remount
    restarts its reveal at stage 0 — so keying the layer on the stage alone
    dropped the full boot skeleton over an already populated sidebar every
    time the reader came back from a slice tab. The stage says "this canvas
    is at rung zero"; this says "and the sidebar is skeletoning with it",
    which is true exactly once per entry from the cover.

    `armed` is the state that earns the extra step. On the frame the reader
    leaves the cover, the base canvas has not mounted yet, so the published
    stage is still the previous surface's `done` — a plain latch would read
    that stale value and retire the boot before it began. Armed waits to
    OBSERVE rung zero before it commits to one.

    Declared ahead of the flip below because the flip writes it: a `const`
    binding read above its declaration is a runtime ReferenceError, and this
    one runs during render on the first frame of every entry.
  */
  const [boot, setBoot] = useState<'off' | 'armed' | 'skeletoning'>(() =>
    isLanding ? 'off' : 'armed',
  )
  const [lastLanding, setLastLanding] = useState(isLanding)
  if (lastLanding !== isLanding) {
    setLastLanding(isLanding)
    // Back to the cover resets to idle, so the aside's width EASES closed
    // (nothing is loading behind it); entering re-arms the ladder.
    setEntrance(isLanding ? 'idle' : 'pending')
    setBoot(isLanding ? 'off' : 'armed')
  }
  useEffect(() => {
    if (entrance !== 'pending') return
    const frame = requestAnimationFrame(() => setEntrance('shown'))
    return () => cancelAnimationFrame(frame)
  }, [entrance])

  /*
    The boot skeleton is an OPAQUE LAYER over the whole sidebar, not a
    placeholder inside each section.

    Two things were wrong with per-section skeletons. Only the row lists
    were ever skeletoned, so the rail's icons, the PHASES and SESSIONS
    headers and every control stayed painted and live over a screen that
    was still loading. And each list ran its own swap, so the two halves of
    the sidebar resolved on separate clocks — a top-to-bottom cascade that
    says nothing, since neither list is waiting on the other.

    One layer fixes both. Everything behind it is covered, and it lifts in a
    single fade at stage 1 — the beat the canvas opens its phase lanes — so
    the sidebar and the board resolve together, all at once.

    Mounted one stage past the fade so the layer cannot be pulled while it
    is still fading (the same tie the loading bar hit).
  */
  /*
    Reported by the base canvas through `onRevealStage` — a prop, not a
    module store. `setRevealStage` is a `useState` setter, so it is stable
    across renders and does not defeat `memo(ServiceOverviewView)`.
  */
  const [revealStage, setRevealStage] = useState(CANVAS_REVEAL_DONE)
  if (boot === 'armed' && revealStage < CANVAS_REVEAL_PANELS) setBoot('skeletoning')
  else if (boot === 'skeletoning' && revealStage >= CANVAS_REVEAL_CELLS) {
    setBoot('off')
  }
  /*
    Opaque until the canvas opens its first layer, then fades with it.

    The fade begins at stage 1 and the layer is not unmounted until stage 3 —
    two stages, not one. The beats are 200/160/128 ms and the fade is one
    `--motion-fade`, so unmounting at stage 2 would be a near-exact tie: a
    frame of scheduling jitter either way and the layer vanishes mid-fade
    instead of completing it. That is the same tie the loading bar hit, and
    the cost of the extra stage is an invisible element at opacity 0.
  */
  const sidebarBooting = boot === 'skeletoning' && revealStage < CANVAS_REVEAL_LANES
  const sidebarBootMounted = boot === 'skeletoning'

  useEffect(() => {
    // Entering and leaving presentation both resize the canvas container.
    suppressCanvasResizeRefit()
  }, [presenting])

  // Picking anything in the rail while collapsed also opens the panel —
  // choosing a surface you cannot see is not a choice.
  const revealSidebar = useCallback(() => {
    if (!sidebarCollapsed) return
    setCollapsedByUser(false)
  }, [sidebarCollapsed, setCollapsedByUser])

  // Hand the agent its navigation hands: open_phase / open_scenario tools
  // land on the same callbacks the sidebar rows use.
  useEffect(
    () =>
      registerAgentUiBridge({
        selectPhase: (phaseId) => {
          activateTab(null)
          selectPhase(phaseId)
        },
        selectScenario: (scenarioId) => {
          openScenario(scenarioId)
        },
        openAgentSurface: () => {
          toggleAgentOpen(true)
          setCollapsedByUser(false)
        },
        setSidebarCollapsed: setCollapsedByUser,
      }),
    [activateTab, selectPhase, openScenario, setCollapsedByUser],
  )

  // The read side: what the shell itself knows about what's on screen.
  // Ref-refreshed each render, registered once — the collector always sees
  // the latest without effect churn.
  const phaseSlide = slides.find((slide) => slide.id === selectedPhaseId)
  const scenarioSlide = slides.find((slide) => slide.id === selectedScenarioId)
  const shellContext = [
    `View level: ${view}${view === 'home' ? ' (zoomed-out overview of all phases)' : ''}`,
    // The wire the navigation tools verify a selection against, worded by the
    // module they read it back with.
    describeSelection('phase', selectionOf(phaseSlide, slides)),
    describeSelection('scenario', selectionOf(scenarioSlide, slides)),
    activeTab
      ? `Active tab: ${activeTab.kind} for slice ${activeTab.sliceId}`
      : 'Active tab: base blueprint view (no slice tab)',
    describeSidebar({
      panel,
      collapsed: collapsedByReader,
      // No overlay posture any more: the sidebar is always in flow.
      overlay: false,
      presenting,
    }),
    `Agent chat: ${agentPlacement.open ? `${agentPlacement.mode} (visible)` : 'hidden'}`,
  ].join('\n')
  const shellContextRef = useRef(shellContext)
  useEffect(() => {
    shellContextRef.current = shellContext
  })
  useEffect(
    () => registerAgentUiContext('shell', () => shellContextRef.current),
    [],
  )

  // Agent parity: the shell-level controls (tabs, presentation, phase
  // accordion, compare toggle). Ref-snapshotted so registration is stable
  // while the handlers stay current.
  type ShellCommands = {
    goOverview: () => void
    activateBase: () => void
    openSliceTab: (sliceId: string, present: boolean) => void
    closeSliceTab: (sliceId: string) => void
    exitPresent: () => string
    togglePhase: (phaseId: string) => void
    setScenarioView: (view: 'stacked' | 'merged') => string
  }
  const shellCommandsRef = useRef<ShellCommands>({
    goOverview: () => {},
    activateBase: () => {},
    openSliceTab: () => {},
    closeSliceTab: () => {},
    exitPresent: () => 'Shell not ready yet.',
    togglePhase: () => {},
    setScenarioView: () => 'Shell not ready yet.',
  })
  useEffect(() => {
    const commands = shellCommandsRef
    const unregister = [
      registerAgentUiCommand({
        name: 'go_overview',
        summary: 'Back to the zoomed-out overview of all phases (Home).',
        run: () => {
          commands.current.goOverview()
          return 'On the overview.'
        },
      }),
      registerAgentUiCommand({
        name: 'activate_base_tab',
        summary: 'Return to the base blueprint tab and its zoomed-out overview.',
        run: () => {
          commands.current.activateBase()
          return 'Base blueprint overview is active.'
        },
      }),
      registerAgentUiCommand({
        name: 'open_slice_tab',
        summary: 'Open a slice in a tab. arg: slice id (list_slices).',
        run: (arg) => {
          if (!arg) throw new Error('arg required: slice id')
          commands.current.openSliceTab(arg, false)
          return 'Slice tab opened.'
        },
      }),
      registerAgentUiCommand({
        name: 'present_slice',
        summary: 'Start presenting a slice full-bleed. arg: slice id.',
        run: (arg) => {
          if (!arg) throw new Error('arg required: slice id')
          commands.current.openSliceTab(arg, true)
          return 'Presenting the slice.'
        },
      }),
      registerAgentUiCommand({
        name: 'exit_presentation',
        summary: 'Leave the running presentation back onto its slice tab.',
        run: () => commands.current.exitPresent(),
      }),
      registerAgentUiCommand({
        name: 'close_slice_tab',
        summary: 'Close a slice\'s open tab(s). arg: slice id.',
        run: (arg) => {
          if (!arg) throw new Error('arg required: slice id')
          commands.current.closeSliceTab(arg)
          return 'Tab closed.'
        },
      }),
      registerAgentUiCommand({
        name: 'toggle_phase_expanded',
        summary: "Expand/collapse a phase's accordion in the sidebar. arg: phase id.",
        run: (arg) => {
          if (!arg) throw new Error('arg required: phase id')
          commands.current.togglePhase(arg)
          return 'Toggled the phase accordion.'
        },
      }),
      registerAgentUiCommand({
        name: 'set_scenario_view',
        summary: 'Switch the SELECTED scenario between its two displays. arg: stacked | merged (needs 2+ visible paths). stacked = one full band per path on a shared step axis. merged = the paths combined into ONE blueprint: one lane rail, one step axis, cells the paths agree on drawn once, divergent slots stacking each path\'s version. Entering merged also applies the reading preset — shared steps fold and the difference ledger opens; returning to stacked unfolds. Legacy aliases accepted: side-by-side = stacked, integrated = merged. For an editor this is a recorded write of scenarios.layout — the scenario opens that way next time; for a viewer it lasts the session.',
        run: (arg) =>
          // 'side-by-side'/'integrated' are the pre-v3 tokens. The column no
          // longer holds them, but they are kept as documented aliases so older
          // prompts and transcripts still resolve to a view rather than failing.
          // The editor context decides whether this is a row or a session.
          commands.current.setScenarioView(
            arg === 'merged' || arg === 'integrated' ? 'merged' : 'stacked',
          ),
      }),
    ]
    return () => unregister.forEach((fn) => fn())
  }, [])

  const toggleSidebar = () => {
    setCollapsedByUser(!sidebarCollapsed)
  }

  // Shared drag-resize. During a drag the width transition is off —
  // easing against the pointer reads as lag, not motion.
  const [asideWidth, setAsideWidth] = useState(loadAsideWidth)
  const [resizing, setResizing] = useState(false)
  const startResize = (event: React.PointerEvent<HTMLDivElement>) => {
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    setResizing(true)
    suppressCanvasResizeRefit()
  }
  const moveResize = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!resizing) return
    // The aside is flush with the window's left edge, so the pointer's x IS
    // the aside width.
    const next = Math.min(
      SIDEBAR_MAX_WIDTH,
      Math.max(SIDEBAR_MIN_WIDTH, Math.round(event.clientX)),
    )
    suppressCanvasResizeRefit()
    setAsideWidth((width) => (width === next ? width : next))
  }
  const endResize = () => {
    if (!resizing) return
    setResizing(false)
    setAsideWidth((width) => {
      try {
        window.localStorage.setItem(WIDTH_STORAGE_KEY, String(width))
      } catch {
        // Width memory is a nicety; failing to store is fine.
      }
      return width
    })
  }

  /*
    Publish whether the aside is collapsed BY THE READER to the canvas's own
    chrome, so canvas navbars can answer it themselves — see
    sidebarCollapsedContext for why the navbar is now the fallback rather than
    the default. One fact now: collapsed, host the expand control. The overlay
    inset that used to ride along is gone with the overlay posture — the
    aside is in flow at every width, so no bar surrenders a margin to it.
  */
  useEffect(() => {
    setSidebarCollapsedState({ collapsed: collapsedByReader })
  }, [collapsedByReader])

  /*
    The identity bars above the canvas hold their own skeletons while this
    layer is up, so the bar, the sidebar and the board arrive on one beat.
    Published rather than passed: the bars sit deep inside canvas content,
    the same distance away as the collapsed state above.

    Cleared on unmount. A latch left `true` by a shell that has gone would
    hold every bar that mounts afterwards, and nothing would ever set it
    back — the boot machine only runs while this component does.
  */
  useEffect(() => {
    setShellBooting(sidebarBooting)
  }, [sidebarBooting])
  useEffect(() => () => setShellBooting(false), [])

  /**
   * Return: exit presentation onto that slice's focus tab, creating the tab
   * if it is not already open. The three entry moves play in reverse over
   * the same durations before the switch commits.
   */
  const exitPresentation = useCallback(
    (sliceId: string) => {
      if (leaveTimer.current !== null) return
      const land = () => {
        leaveTimer.current = null
        openTab({ kind: 'slice', sliceId })
        setLeavingPresent(false)
      }
      if (prefersReducedMotion()) {
        land()
        return
      }
      setLeavingPresent(true)
      suppressCanvasResizeRefit()
      leaveTimer.current = window.setTimeout(land, MOTION_STRUCTURAL_MS)
    },
    [openTab],
  )

  // Home (in the tab strip) is the route back to the birds-eye overview
  // canvas — it deactivates any tab, clears the selection and animates the
  // fit, exactly like Escape and the workspace breadcrumb. `goHome` (not
  // `enterCanvas`) so every overview return has the same feel.
  const goOverview = () => {
    activateTab(null)
    goHome()
  }

  // Home (the icon at the top left) routes to the COVER page: the workspace
  // tab beside it already returns to the base canvas, so pointing both at
  // the overview left the cover unreachable once you had entered.
  const goCover = () => {
    activateTab(null)
    goLanding()
  }

  // The workspace tab always means the blueprint's starting view. From the
  // cover it enters without a boot swoop; from any canvas level it uses the
  // same animated overview return as Home, Escape, and the breadcrumb.
  const goWorkspace = () => {
    activateTab(null)
    if (isLanding) enterCanvas()
    else goHome()
  }

  // Latest handlers for the registered shell commands (declared above);
  // assigned below everything they close over, inside an every-render
  // effect (refs are not written during render).
  const shellCommands: ShellCommands = {
    goOverview,
    activateBase: goWorkspace,
    openSliceTab: (sliceId, present) =>
      openTab({ kind: present ? 'present' : 'slice', sliceId }),
    closeSliceTab: (sliceId) => {
      closeTab(tabKey({ kind: 'slice', sliceId }))
      closeTab(tabKey({ kind: 'present', sliceId }))
    },
    exitPresent: () => {
      if (activeTab?.kind !== 'present') return 'Not presenting right now.'
      exitPresentation(activeTab.sliceId)
      return 'Left the presentation onto the slice tab.'
    },
    togglePhase: (phaseId) => togglePhaseExpanded(phaseId),
    setScenarioView: (viewType) => {
      const scenario = slides.find((slide) => slide.id === selectedScenarioId)
      if (!scenario) return 'No scenario is selected — open one first.'
      setScenarioDisplayViewType(scenario.id, viewType)
      return `Scenario view set to ${viewType === 'merged' ? 'Merged' : 'Stacked'}.`
    },
  }
  useEffect(() => {
    shellCommandsRef.current = shellCommands
  })

  const sidebarBody = (
    <div className="flex h-full min-h-0 min-w-0 flex-1 flex-row">
      <EditorRail
        panel={panel}
        agentActive={agentPlacement.open}
        showAgent={canAgent}
        onSelectPanel={(next) => {
          setPanel(next)
          revealSidebar()
        }}
        // ✦ toggles the chat's presence; the panel buttons still pick what
        // sits underneath it, so "chat while looking at the nav" is the
        // default posture rather than a swap away from it.
        onToggleAgent={() => {
          toggleAgentOpen()
          revealSidebar()
        }}
        topSlot={
          <SidebarCollapseButton collapsed={false} onToggle={toggleSidebar} />
        }
        bottomSlot={
          <>
            {/* Theme is a utility toggle, not a surface — it lives in the
                rail's bottom group with the other toggles, not in the
                collapsed navbar, which is already the app's tightest 32px. */}
            <ThemeToggle size="icon-sm" />
            <AgentSettingsRailButton />
          </>
        }
      />
      <div ref={panelColumnRef} className="flex min-h-0 min-w-0 flex-1 flex-col">
        <SidebarProvider
          style={
            {
              '--sidebar-width': `${asideWidth - RAIL_WIDTH}px`,
            } as CSSProperties
          }
          className="flex min-h-0 min-w-0 flex-1 flex-col"
        >
          <SlideModeSidebarNav panel={panel} />
        </SidebarProvider>
        {agentDocked ? <AgentDockDivider columnRef={panelColumnRef} /> : null}
        <AgentDock visible={canAgent && agentDocked} />
      </div>
    </div>
  )

  return (
    // The base surface's mode, hoisted to include the sidebar.
    //
    // It used to wrap only the canvas, which left the sidebar unable to answer
    // "are we editing?" — so its `+` and `⋯` were on in View mode, offering to
    // create and rename things on a surface whose whole premise is that it
    // changes nothing. A slice tab still mounts its own provider inside this
    // one and shadows it, which is what keeps the two surfaces independent.
    <CanvasModeProvider>
      <div
        // h-full rides the html/body/#root 100% chain — unlike svh units it
        // tracks the real laid-out viewport in embedded panes that resolve
        // viewport units against a stale size after a resize.
        className="relative flex h-full flex-col overflow-hidden bg-background"
        data-editor-shell
      >
        {/* Full-width top nav: workspace identity, Home, open tabs. */}
        <TabStrip
          isCover={isLanding}
          onHome={goCover}
          onBase={goWorkspace}
        />

        <div className="relative flex min-h-0 min-w-0 flex-1">
          <aside
            className={cn(
              // In flow at every width: collapse and expand push the
              // canvas the same way whether the window is wide or narrow.
              // There is no overlay posture, no gate, and no floating column —
              // the aside is a plain relative shell column.
              'relative z-20 shrink-0 overflow-hidden bg-sidebar',
              !asideHidden && 'border-r border-border',
            )}
            style={{
              width: asideHidden ? 0 : asideWidth,
              transitionProperty:
                resizing || entrance === 'pending' ? 'none' : 'width',
              transitionDuration: `${MOTION_STRUCTURAL_MS}ms`,
              transitionTimingFunction: MOTION_STRUCTURAL_EASE,
            }}
            data-editor-sidebar=""
            data-collapsed={asideHidden ? '' : undefined}
            aria-label="Workspace navigation"
          >
            {/*
              Fixed-width sidebar body (rail + panel). In flow it is clipped
              by the animating aside, so open/close reads as a wipe rather
              than a mount/unmount.
            */}
            <div
              className={cn(
                'flex h-full min-h-0 flex-row',
                'transition-[opacity,transform] duration-(--motion-fade) ease-arrive motion-reduce:transition-none',
                asideHidden
                  ? 'pointer-events-none -translate-x-2 opacity-0'
                  : 'translate-x-0 opacity-100 delay-(--motion-fade-stagger)',
              )}
              style={{ width: asideWidth }}
              aria-hidden={asideHidden}
            >
              {sidebarBody}
            </div>
            {/*
              The boot layer. `bg-sidebar` over the aside's own background,
              at the aside's full width so the rail is covered too.
            */}
            {sidebarBootMounted && !asideHidden ? (
              <div
                className={cn(
                  'absolute inset-y-0 left-0 z-10 bg-sidebar',
                  'transition-opacity motion-reduce:transition-none duration-(--motion-fade) ease-arrive',
                  !sidebarBooting && 'pointer-events-none opacity-0',
                )}
                style={
                  {
                    width: asideWidth,
                    // The entrance ladder's rungs. Delays are inline so the
                    // TS constants stay the single source — nothing to
                    // drift against a stylesheet.
                    '--shell-entrance-rail': `${SKELETON_HOLD_MS}ms`,
                    '--shell-entrance-panel': `${SKELETON_HOLD_MS + SHELL_ENTRANCE_STEP_MS}ms`,
                    '--shell-entrance-agent': `${SKELETON_HOLD_MS + SHELL_ENTRANCE_STEP_MS * 2}ms`,
                  } as CSSProperties
                }
                data-shell-entrance={entrance}
                data-editor-sidebar-boot=""
                /*
                  Deliberately NOT a live region. The canvas's load bar is
                  already `role="status"` for this same boot, and two status
                  regions active in the same window announce one event twice.
                  The bar is the better owner: it is the thing that actually
                  reports progress.
                */
                aria-hidden
              >
                <EditorSidebarBootSkeleton
                  showAgent={canAgent && agentDocked}
                  dockRatio={agentPlacement.dockRatio}
                />
              </div>
            ) : null}

            {/* Drag the aside's right edge to resize; width is remembered
                per surface. Hidden while collapsed — there is no edge. */}
            {!asideHidden ? (
              <div
                role="separator"
                aria-orientation="vertical"
                aria-label="Resize sidebar"
                onPointerDown={startResize}
                onPointerMove={moveResize}
                onPointerUp={endResize}
                onPointerCancel={endResize}
                className={cn(
                  'absolute inset-y-0 right-0 z-30 w-1.5 cursor-col-resize',
                  'hover:bg-border/80 active:bg-border',
                  resizing && 'bg-border',
                )}
              />
            ) : null}
          </aside>

          {/*
            The floating posture: portalled to the body so the window
            escapes the sidebar's clip. Hidden while presenting — a
            full-bleed slice is not the place for a chat window.
          */}
          <AgentDock
            visible={canAgent && agentPlacement.mode === 'floating' && !presenting}
          />

          {/*
            Collapsed remnant: the floating navbar over the canvas. Hidden
            while presenting (full-bleed; Return is the way back). Its
            toggle is the same single control the rail carries expanded.
          */}
          {collapsedByReader ? (
            <div className="pointer-events-none absolute left-3 top-3 z-30">
              <FloatingSidebarNavbar onExpand={toggleSidebar} />
            </div>
          ) : null}

          <main className="flex min-h-0 min-w-0 flex-1 flex-col">
            <div className="relative min-h-0 min-w-0 flex-1">
              <div className="absolute inset-0" data-editor-content="">
                {isLanding ? (
                  <EditorErrorBoundary resetKey="landing">
                    <CoverPage content={cover} />
                  </EditorErrorBoundary>
                ) : (
                  <WarmMountedViews
                    sessionMountedBase={sessionMountedBase}
                    leavingPresent={leavingPresent}
                    onReturn={exitPresentation}
                    onRevealStage={setRevealStage}
                  />
                )}
              </div>
            </div>
          </main>
        </div>
      </div>
    </CanvasModeProvider>
  )
}

/**
 * One warm view in the stacked host. Hidden layers stay laid out so the
 * camera survives; they are inert and do not own the agent.
 *
 * @param current - this layer is the view the reader is looking at
 * @param resetKey - error-boundary identity for this tree
 */
function FrozenViewLayer({
  current,
  resetKey,
  children,
}: {
  current: boolean
  resetKey: string
  children: ReactNode
}) {
  return (
    <div
      className="absolute inset-0"
      aria-hidden={!current}
      inert={!current}
      style={{
        visibility: current ? 'visible' : 'hidden',
        pointerEvents: current ? 'auto' : 'none',
        zIndex: current ? 1 : 0,
      }}
    >
      <EditorErrorBoundary resetKey={resetKey}>
        <CanvasActiveProvider active={current}>{children}</CanvasActiveProvider>
      </EditorErrorBoundary>
    </div>
  )
}

/**
 * Mounts the warm set: the base canvas (if this session already opened it,
 * or if it is the current view) plus warm slice/present views. Hidden trees
 * stay laid out so the camera does not die, but they do not own the agent
 * or the reveal publisher.
 *
 * @param sessionMountedBase - this session has already built the base canvas
 * @param leavingPresent - play the 320ms leave pose on the current present view
 * @param onReturn - land on the slice after the present leave wait
 * @param onRevealStage - publish the current base canvas ladder to the shell
 */
function WarmMountedViews({
  sessionMountedBase,
  leavingPresent,
  onReturn,
  onRevealStage,
}: {
  sessionMountedBase: boolean
  leavingPresent: boolean
  onReturn: (sliceId: string) => void
  onRevealStage: (stage: number) => void
}) {
  const { tabs, activeKey, sliceActivationRecency, pendingUrlState } =
    useViewState()

  const mounts = warmMounts({
    tabs,
    activeKey,
    sessionMountedBase,
    sliceActivationRecency,
  })
  const currentIsBase = isBaseViewCurrent({
    activeKey,
    pendingUrl: pendingUrlState !== null,
  })
  const showBase = mounts.baseWarm || currentIsBase

  return (
    <>
      {showBase ? (
        <FrozenViewLayer current={currentIsBase} resetKey="blueprint">
          <StoryboardWalkthroughShell>
            <div
              className="absolute inset-0 flex min-h-0 flex-col"
              data-editor-view
            >
              <ServiceOverviewView
                onRevealStage={currentIsBase ? onRevealStage : undefined}
              />
            </div>
          </StoryboardWalkthroughShell>
        </FrozenViewLayer>
      ) : null}
      {tabs.map((tab) => {
        const key = tabKey(tab)
        const warm =
          tab.kind === 'slice'
            ? mounts.sliceKeys.includes(key)
            : mounts.presentKeys.includes(key)
        if (!warm) return null
        const current = activeKey === key
        return (
          <FrozenViewLayer key={key} current={current} resetKey={key}>
            {tab.kind === 'slice' ? (
              <SliceView sliceId={tab.sliceId} />
            ) : (
              <SlicePresentation
                sliceId={tab.sliceId}
                leaving={leavingPresent && current}
                onReturn={() => onReturn(tab.sliceId)}
              />
            )}
          </FrozenViewLayer>
        )
      })}
    </>
  )
}
