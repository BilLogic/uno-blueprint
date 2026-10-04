import { Component, Fragment, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import {
  Breadcrumb,
  BreadcrumbEllipsis,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb'
import { Button } from '@/components/ui/button'
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer'
import { IconTooltip } from '@/components/editor/IconTooltip'
import {
  DefinitionPopover,
  type DefinitionSection,
} from '@/components/blueprint/DefinitionCard'
import {
  CELL_DETAIL_PANEL_BOTTOM_CLASS,
  CELL_DETAIL_PANEL_TOP_CLASS,
} from '@/components/editor/menubarHeaderLayout'
import { Badge } from '@/components/ui/badge'
import { useMobileShell } from '@/hooks/useMobileShell'
import { useShellBooting } from '@/contexts/shellBootStore'
import {
  PANEL_SHEET_SNAP_POINTS,
  rememberedSheetSnap,
  rememberSheetSnap,
} from '@/lib/panelSheetSnap'
import {
  blueprintLaneAttrs,
  blueprintToneAttrs,
  type BlueprintLaneRole,
  type TouchpointTone,
} from '@/lib/blueprintCellStyle'
import { panelEditorBusy } from '@/lib/panelEditorBusy'
import { cn } from '@/lib/utils'

/**
 * The chrome every entity detail panel is made of — drawer, error boundary,
 * field label, footer host.
 *
 * All of it was written for the CELL panel and lived inside it. Four levels of
 * the blueprint tree own spec fields and only one had a surface; the rest are
 * being built now, and copying a 90-line drawer four times is how two of them
 * end up with different close behaviour. Lifted, not duplicated.
 *
 * `data-cell-detail-panel` keeps its name. It is a DOM contract in twenty
 * places — every entry/exit animation in animations.css, the pan-exempt
 * selector in ServiceOverviewView, MarqueeSelection, SliceView, print.css —
 * and renaming it buys a better word at the price of touching the motion
 * system. Read it as "an entity detail drawer"; the shell is the only thing
 * that writes it.
 */

/**
 * One footer host id per panel. `CELL_PANEL_FOOTER_ID` is a global DOM id that
 * a form portals its Save/Cancel row into, and two panels sharing one id would
 * put the lane panel's buttons under the cell panel's fields. Only one panel is
 * open at a time today; the ids make that a design choice rather than the only
 * thing standing between us and a collision.
 */
export const CELL_PANEL_FOOTER_ID = 'cell-panel-editor-footer'

/**
 * How long a closed panel's content stays rendered so the exit has something
 * to draw. Must be ≥ the exit transition in animations.css, which runs on
 * `--motion-micro` (150ms) for the inspector posture.
 *
 * A timer, and not only the drawer's own completion callback, because
 * `onOpenChangeComplete(false)` was measured NOT to fire for this drawer: the
 * exit transition ran to its end — opacity 0, transform at
 * `--closed-transform` — and the popup stayed in the DOM indefinitely. The
 * same file already documents base-ui's transition flags misfiring here (its
 * `starting` flag never fires for a root that mounts open, which is why the
 * entry is stated through `@starting-style` instead). The callback stays
 * wired; whichever arrives first wins.
 */
export const PANEL_EXIT_MS = 200

/**
 * A panel heading, in one place: the identity block's name, the header's
 * heading when a surface shows one rather than reading it out, and the
 * differences surface's word for itself beside the switcher. Four writers of
 * one string is how one heading ends up a weight off the other three.
 */
/**
 * The multi-line field treatment, in one place.
 *
 * A bare `<textarea>` with the cell panel's border, padding and focus ring —
 * NOT `input-group.tsx`, which the inventory reserves for the composer, where
 * the group owns the border and the single focus ring. The cell editor had
 * three copies of this string and `PanelTextareaField` a fourth, and a
 * four-way copy of a focus ring is how one field ends up focusing differently
 * from the field above it.
 */
export const PANEL_HEADING_CLASS =
  'min-w-0 text-sm font-semibold text-foreground'
export const PANEL_TEXTAREA_CLASS =
  'w-full resize-y rounded-md border border-input bg-transparent px-2 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50'
export const LANE_PANEL_FOOTER_ID = 'lane-panel-editor-footer'
export const PHASE_PANEL_FOOTER_ID = 'phase-panel-editor-footer'
export const SCENARIO_PANEL_FOOTER_ID = 'scenario-panel-editor-footer'
export const STEP_PANEL_FOOTER_ID = 'step-panel-editor-footer'

/**
 * A render error in the drawer must cost the drawer, not the app.
 *
 * The panel is the one surface that renders arbitrary authored content —
 * pictures, links, touchpoints, prose — outside the canvas's providers, which
 * makes it the most likely place for a render throw. Without a boundary that
 * throw unmounted the entire editor to a white page, which is how a broken
 * touchpoint icon read as "loading is broken". React error boundaries are still
 * class-only.
 */
export class DetailPanelErrorBoundary extends Component<
  { children: ReactNode; message: string; logPrefix: string },
  { failed: boolean }
> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  componentDidCatch(error: unknown) {
    console.error(`[${this.props.logPrefix}] panel render failed:`, error)
  }
  render() {
    if (this.state.failed) {
      // Spatial clearance, not a z fight: `bottom-16` is the zoom cluster
      // (`h-8` at `bottom-4`) plus one gutter, so the two never overlap.
      return (
        <div className="fixed right-4 bottom-16 z-40 rounded-lg border border-border bg-card px-3 py-2 text-xs text-muted-foreground shadow-md">
          {this.props.message}
        </div>
      )
    }
    return this.props.children
  }
}

/**
 * The one drawer shell every panel renders through. Each render branch
 * (details, draft, placeholder, differences) returns this at the same tree
 * position, so React reconciles them as the SAME drawer — a surface switch is
 * a content swap inside the open drawer, never a close-reopen.
 */
export function PanelDrawerShell({
  open,
  expanded = false,
  onCloseRequest,
  onClosed,
  children,
}: {
  open: boolean
  /** Desktop-only widen. A bottom sheet is already the width of the phone. */
  expanded?: boolean
  onCloseRequest: () => void
  onClosed: () => void
  children: ReactNode
}) {
  // Same drawer, two postures: the desktop right-pinned card, or — below
  // md — a bottom sheet the width of the phone. One component, mirroring
  // the AgentDock docked/floating precedent; the reconciliation guarantee
  // above (same tree position) holds in both postures.
  const mobile = useMobileShell()
  // The shell's boot layer. A panel opened by a deep link otherwise
  // lands before the sidebar, the bar and the canvas it sits over. This is a
  // hold on WHEN, never a second opinion on WHETHER: `open` keeps its single
  // owner upstream, and a drawer that has not opened yet has nothing to
  // close, so no `onClosed` ever fires for a hold.
  const shellBooting = useShellBooting()
  /*
    PER SESSION, NOT PER CELL. A reader who dragged one cell tall is usually
    reading the next one the same way, so the stop persists across opens. Per
    CELL memory was the alternative and it is worse: two cells side by side
    would open at different heights for reasons the reader cannot see.

    Module state, not storage: "session" here means this visit. A reload is a
    fresh read of the board, and `MobilePathSelector`'s localStorage idiom is
    for a CHOICE the reader made about content (which path), not for a posture
    they nudged.
  */
  const [snapPoint, setSnapPoint] = useState<number | string>(
    () => rememberedSheetSnap(),
  )
  return (
    <Drawer
      // Keyed on posture: a resize across the breakpoint while open would
      // otherwise reinterpret an in-flight swipe's x-offset against the
      // other posture's axis. A flip remounts the drawer clean instead.
      key={mobile ? 'mobile' : 'desktop'}
      // Sheet only. A desktop inspector is a pinned card with room for its
      // whole content; there is nothing to snap between.
      snapPoints={mobile ? PANEL_SHEET_SNAP_POINTS : undefined}
      snapPoint={mobile ? snapPoint : undefined}
      onSnapPointChange={(next) => {
        if (next == null) return
        setSnapPoint(next)
        rememberSheetSnap(next)
      }}
      open={open && !shellBooting}
      onOpenChange={(next) => {
        // Only close *requests* (✕, Escape, swipe) arrive here, and with
        // `open` derived from panel state they can only fire while the panel
        // is open — the delayed-callback-wipes-new-selection class of bug
        // died with the second owner.
        if (!next && !panelEditorBusy()) onCloseRequest()
      }}
      onOpenChangeComplete={(next) => {
        if (!next) onClosed()
      }}
      modal={false}
      disablePointerDismissal
      swipeDirection={mobile ? 'down' : 'right'}
      // A bottom sheet says how to dismiss itself with a grab handle; the
      // desktop inspector has its own ✕ and does not read as draggable.
      showSwipeHandle={mobile}
    >
      <DrawerContent
        data-cell-detail-panel=""
        // The posture the MOTION keys off (animations.css): a sheet rises
        // from the bottom edge, an inspector lifts in beside the cell it
        // came from. Two vocabularies, one component.
        data-cell-detail-posture={mobile ? 'sheet' : 'inspector'}
        className={cn(
          mobile
            ? // NO `!h-auto`, NO `max-h`. Under snap points the primitive sets
              // `--drawer-content-height: 100dvh` and moves the sheet with
              // `--drawer-snap-point-offset`; the visible height IS the offset.
              // A height cap here would clamp the tallest snap to 70svh and the
              // full point would stop short of full, with the drag still
              // travelling the whole way.
              '!inset-x-0 !bottom-0 !top-auto !m-0 w-auto border-t border-border bg-popover shadow-md after:hidden [--drawer-inset:0px]'
            : cn(
                CELL_DETAIL_PANEL_TOP_CLASS,
                CELL_DETAIL_PANEL_BOTTOM_CLASS,
                '!right-4 !left-auto !m-0 !h-auto !max-h-none rounded-lg border border-border bg-popover shadow-md after:hidden [--drawer-inset:1rem] md:!right-8 md:[--drawer-inset:2rem]',
                expanded
                  ? 'w-(--width-cell-panel-expanded)'
                  : 'w-(--width-cell-panel)',
              ),
        )}
        onPointerDown={(event) => event.stopPropagation()}
        onClick={(event) => event.stopPropagation()}
      >
        {children}
      </DrawerContent>
    </Drawer>
  )
}

/**
 * Where a panel's Save and Cancel land: a host pinned to the drawer's bottom
 * edge, below the scroll region and any tabs. The form portals its buttons
 * here so they read as controls for the whole panel — one Save for everything
 * on it — instead of a row buried mid-scroll.
 *
 * `empty:hidden` keeps the border off a panel with nothing to save (view mode).
 */
export function PanelFooterHost({ id }: { id: string }) {
  return (
    <div
      id={id}
      className="shrink-0 border-t border-muted px-4 py-3 empty:hidden"
    />
  )
}

/** Label with its explanation folded into a hover tooltip, not inline text. */
export function Field({
  label,
  hint,
  required = false,
  children,
}: {
  label: string
  hint?: string
  /** Draws the asterisk — the only signal a field cannot be left empty. */
  required?: boolean
  children: ReactNode
}) {
  const labelText = (
    <span
      className={cn(
        'w-fit',
        'text-xs font-medium text-muted-foreground',
        // Only where there is something behind it — and now the focus ring
        // alone. The help cursor and the dotted rule went with every other
        // announcement that a word is defined.
        hint &&
          'rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring/50',
      )}
    >
      {label}
      {required ? <span className="ml-1 text-destructive">*</span> : null}
    </span>
  )
  return (
    <div className="flex flex-col gap-1">
      {hint ? (
        /* The definition CARD, not a bare sentence and not a tooltip. A
           tooltip never opens on touch, and this hint carries `PANEL_TERMS`
           entries — definitions — on a shell that has a phone posture. The
           field's own label is the section's term, which is why the hint
           itself no longer has to open by naming the field. */
        <DefinitionPopover
          sections={[{ term: label, body: hint }]}
          side="left"
        >
          {labelText}
        </DefinitionPopover>
      ) : (
        labelText
      )}
      {children}
    </div>
  )
}

/**
 * One crumb in a panel's trail: a name, or a name collapsed to an ellipsis.
 *
 * Collapsing is what the cell's trail needed and the entity panels did not.
 * Four names — phase, scenario, path, step — do not fit the panel's width,
 * and the step is the crumb the reader came for, so the scenario folds to a ⋯
 * that carries its name to a screen reader and to the hover. A plain string
 * is a crumb that does not fold, which is every crumb the other five panels
 * pass.
 */
export type PanelCrumb = string | { label: string; collapsed?: boolean }

/**
 * The ✕ every panel closes with.
 *
 * Five surfaces wrote this block — the cell panel, its draft, empty and
 * differences surfaces, and the shared header — and five copies of a close
 * button is how one of them ends up a size larger, or stops saying what it
 * closes. The tooltip and the label are separate words because one surface
 * already parts them: the draft's ✕ reads "Discard this new cell" on hover
 * and announces "Discard new cell".
 */
export function PanelCloseButton({
  label,
  ariaLabel = label,
  onClose,
}: {
  /** What the hover says, e.g. "Close lane properties". */
  label: string
  /** What a screen reader announces, when that is not the hover's words. */
  ariaLabel?: string
  onClose: () => void
}) {
  return (
    <IconTooltip label={label} side="left">
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        className="shrink-0 text-muted-foreground hover:text-foreground"
        aria-label={ariaLabel}
        onClick={onClose}
      >
        <X />
      </Button>
    </IconTooltip>
  )
}

/**
 * The header every entity panel wears: where the thing sits, then ✕.
 *
 * The crumbs are ancestors and the last one is the thing itself, matching the
 * cell panel's breadcrumb exactly — same sizes, same separators, same
 * truncation — because two headers that are nearly the same read as a bug in
 * one of them. The cell surfaces wear this one now: the drawer header's
 * class list, the crumb loop and the close button each have one definition
 * here rather than a copy per surface.
 *
 * No expand toggle of its own. Widening the drawer trades canvas width for
 * panel width and pays off when the panel holds a dependency table or a
 * difference ledger; a lane's owner, KPIs and tools do not get easier to read
 * at 1.5× the width. The cell panel has one, and passes it as an action.
 */
type PanelHeaderChrome = {
  onClose: () => void
  /** Says what closes, e.g. "Close lane properties". */
  closeLabel: string
  /** What the ✕ announces, when that is not the hover's words. */
  closeAriaLabel?: string
  /**
   * Controls that sit beside ✕ — today the cell panel's widen toggle.
   *
   * A panel that HAS an action row keeps it even when the row is empty: the
   * widen toggle is desktop-only and passes `null` on a phone, which is why
   * the row is drawn for a passed `null` and not for a prop nobody passed.
   */
  actions?: ReactNode
  /**
   * The bordered band the differences surface wears instead of the plain
   * header. Not derived from `lead`, which happens to have the same one
   * caller today: the band is about the surface being a sibling of the whole
   * panel — a rule under it, the ledger below — and a panel could grow a
   * switcher without the rule, or the rule without a switcher.
   */
  banded?: boolean
  /** Screen-reader title for the dialog, or the visible one when shown. */
  title: string
  description: string
}

/**
 * The header's left is a block — the title, the description and the trail —
 * or a node standing in the header row itself. Never both: a lead that
 * silently dropped the crumbs beside it is a prop that reads as supported
 * and is not, so the two shapes are two types.
 */
type PanelHeaderProps =
  | (PanelHeaderChrome & {
      lead?: never
      /**
       * Ancestors first, the entity itself last. Empty labels are dropped,
       * and a trail with nothing left in it draws nothing — an empty
       * breadcrumb landmark is a landmark a reader lands on for no reason.
       */
      crumbs?: PanelCrumb[]
      /** Draws the title as the heading instead of reading it out. */
      titleShown?: boolean
      /** Draws the description under the heading — the draft's placement line. */
      descriptionShown?: boolean
    })
  | (PanelHeaderChrome & {
      /**
       * What stands in the header row itself, rather than in the block the
       * crumbs and the title share — the differences surface's Details │
       * Differences switcher, which is chrome for the whole panel. Its title
       * and description are read out, never drawn, so neither flag applies.
       */
      lead: ReactNode
      crumbs?: never
      titleShown?: never
      descriptionShown?: never
    })

export function PanelHeader({
  crumbs,
  lead,
  onClose,
  closeLabel,
  closeAriaLabel,
  actions,
  banded = false,
  title,
  titleShown = false,
  description,
  descriptionShown = false,
}: PanelHeaderProps) {
  const shown = (crumbs ?? [])
    .map((crumb) =>
      typeof crumb === 'string' ? { label: crumb, collapsed: false } : crumb,
    )
    .filter((crumb) => crumb.label.trim().length > 0)
  const last = shown.length - 1
  return (
    <DrawerHeader
      className={cn(
        'flex-row items-center justify-between gap-2 text-left',
        banded ? 'border-b border-muted px-4 py-2' : 'pb-3',
      )}
    >
      {lead ? (
        <>
          <DrawerTitle className="sr-only">{title}</DrawerTitle>
          <DrawerDescription className="sr-only">
            {description}
          </DrawerDescription>
          {lead}
        </>
      ) : (
        <div className="min-w-0 flex-1">
          <DrawerTitle
            className={titleShown ? PANEL_HEADING_CLASS : 'sr-only'}
          >
            {title}
          </DrawerTitle>
          <DrawerDescription
            className={
              descriptionShown ? 'text-xs text-muted-foreground' : 'sr-only'
            }
          >
            {description}
          </DrawerDescription>
          {shown.length === 0 ? null : (
            <Breadcrumb className="min-w-0">
              <BreadcrumbList className="flex-nowrap gap-1 text-xs font-normal text-muted-foreground">
                {shown.map((crumb, index) => (
                  <Fragment key={`${crumb.label}-${index}`}>
                    <BreadcrumbItem
                      className={crumb.collapsed ? 'shrink-0' : 'min-w-0'}
                    >
                      {crumb.collapsed ? (
                        <span title={crumb.label} className="cursor-default">
                          <BreadcrumbEllipsis className="size-4 text-muted-foreground [&>svg]:size-3.5" />
                          <span className="sr-only">{crumb.label}</span>
                        </span>
                      ) : index === last ? (
                        <BreadcrumbPage className="truncate font-medium tracking-tight text-foreground">
                          {crumb.label}
                        </BreadcrumbPage>
                      ) : (
                        <span
                          title={crumb.label}
                          className="block max-w-[5.5rem] truncate font-normal"
                        >
                          {crumb.label}
                        </span>
                      )}
                    </BreadcrumbItem>
                    {index === last ? null : (
                      <BreadcrumbSeparator className="shrink-0 [&>svg]:size-3" />
                    )}
                  </Fragment>
                ))}
              </BreadcrumbList>
            </Breadcrumb>
          )}
        </div>
      )}
      {actions === undefined ? (
        <PanelCloseButton
          label={closeLabel}
          ariaLabel={closeAriaLabel}
          onClose={onClose}
        />
      ) : (
        <div className="flex shrink-0 items-center gap-1">
          {actions}
          <PanelCloseButton
            label={closeLabel}
            ariaLabel={closeAriaLabel}
            onClose={onClose}
          />
        </div>
      )}
    </DrawerHeader>
  )
}

/**
 * The identity block every entity panel opens with: what this is, then where
 * it sits and how big it is.
 *
 * Typography is the cell panel's, exactly — `text-sm font-semibold`
 * for the name and `text-xs` muted for the meta line.
 * Three panels each inventing their own heading is how a shell stops reading
 * as one surface.
 */
export function PanelIdentity({
  badge,
  title,
  meta,
  children,
}: {
  /**
   * What kind of thing this is — ABOVE the title, because it is the context
   * the title is read in, and a reader who just clicked a green cell needs
   * the green badge to confirm they opened what they aimed at. Below the
   * title it read as an afterthought and indented away from its own heading.
   */
  badge?: ReactNode
  /** Empty when a badge already says it — a tech cell named by its tool. */
  title: string
  /** Counts and relationships — never a restatement of the title. */
  meta: ReactNode
  children?: ReactNode
}) {
  return (
    <div className="flex min-w-0 flex-col items-start gap-2">
      {badge}
      {title ? <p className={PANEL_HEADING_CLASS}>{title}</p> : null}
      {meta ? <p className="text-xs font-normal text-muted-foreground">{meta}</p> : null}
      {children}
    </div>
  )
}

/**
 * The kind badge. Tinted with the LANE's own cell colour when there is one —
 * or with a TOUCHPOINT's tone, which is the same mechanism one row down — so
 * the panel and the cell you clicked are visibly the same object; neutral
 * `secondary` for the levels that have no colour on the canvas.
 *
 * One geometry for all three. A touchpoint cell used to stack a round tool
 * badge above a differently-sized lane badge; two badges naming two things
 * about one cell belong side by side, at one size.
 *
 * The tint comes from `data-blueprint-lane` — the attribute blueprint.css
 * turns into a lane's surface and ink steps — not from an inline colour. The
 * badge this replaced tried `backgroundColor: style.lane`, and `style.lane` is
 * a ROLE KEY ("actor"), not a colour: the declaration was invalid, the browser
 * dropped it, and the badge had rendered as plain text since the day it
 * shipped.
 */
export function PanelKindBadge({
  label,
  laneRole,
  tone,
  title,
  category,
  description,
}: {
  label: string
  laneRole?: BlueprintLaneRole | null
  /** A touchpoint's tone — the cell face's colour, on the badge's geometry. */
  tone?: TouchpointTone | null
  title?: string
  /**
   * The CATEGORY this badge's label is one of, and what that category means —
   * the first section of the card, above the label's own.
   *
   * Only the stakeholder badge passes one: its label is a party's name, and
   * the kind that party belongs to ("Staff") is a fact the reader has to learn
   * separately. A lane-role badge already IS its category, so it passes none
   * and the card is one section.
   */
  category?: DefinitionSection | null
  /**
   * What this kind of row IS, shown on hover, under the label as its term.
   *
   * It used to hang off an ⓘ beside the badge — a second control for one fact,
   * when the badge is already the thing whose meaning is in question. Hovering
   * the word you do not recognise is where you would look for its definition.
   */
  description?: string | null
}) {
  /*
    A section per fact, and no section without a body: a heading over blank
    space is a promise of content that never arrives.
  */
  const sections: DefinitionSection[] = []
  if (category) sections.push(category)
  if (description) sections.push({ term: label, body: description })

  /*
    What an explained badge wears, and the one thing it must not.

    The focus ring comes from `badgeVariants` and the popover trigger supplies
    `tabIndex`, so the definition is reachable without a pointer — hover is
    never the only way in. The `cursor-help` and the dotted rule that used to
    sit beside them are gone — nothing on the resting page announces a
    definition now. What is deliberately absent, and always was, is a hover
    colour: this badge is not clickable, and a surface that repaints under
    the pointer says it is.
  */
  const explain = (badge: ReactNode) =>
    sections.length > 0 ? (
      /* A POPOVER, not a tooltip, and the change is a bug fix rather than a
         preference: Base UI's tooltip never opens on touch, so every
         description this badge has ever carried — a lane's role, a
         stakeholder's one-liner — was invisible on a phone. The card shape
         itself is a separate change. */
      <DefinitionPopover sections={sections} side="bottom">
        {badge as never}
      </DefinitionPopover>
    ) : (
      badge
    )

  if (tone) {
    return explain(
      <Badge
        {...blueprintToneAttrs(tone)}
        title={title}
        className="max-w-full truncate border-transparent"
        style={{
          backgroundColor: 'var(--background-blueprint-cell)',
          color: 'var(--foreground-blueprint-cell)',
        }}
      >
        {label}
      </Badge>,
    )
  }
  if (!laneRole) {
    // `secondary` alone is white-on-white here — the slice header band hit the
    // same thing and answered it the same way: a faint foreground wash and a
    // named edge rung, so the badge reads as a badge on the popover surface.
    return explain(
      <Badge
        variant="secondary"
        className="max-w-full truncate border-muted bg-foreground/5 text-muted-foreground"
        title={title}
      >
        {label}
      </Badge>,
    )
  }
  return explain(
    <Badge
      {...blueprintLaneAttrs(laneRole)}
      title={title}
      className="max-w-full truncate border-transparent"
      /*
        Inline, not a utility: the badge's own `variant` paints
        `bg-primary`, and a same-specificity arbitrary-property class lost to
        it — measured, the badge came out brand teal on every lane. The values
        are the tokens `[data-blueprint-lane]` publishes, so nothing here is a
        colour; this is the same idiom BlueprintStepStoryboard uses for the
        cell face.
      */
      style={{
        backgroundColor: 'var(--background-blueprint-cell)',
        color: 'var(--foreground-blueprint-cell)',
      }}
    >
      {label}
    </Badge>,
  )
}

/**
 * What a panel shows when its entity has nothing recorded.
 *
 * The fourth state, and the one all four panels were missing: they had
 * loading and error, so a lane with no owner, no KPIs and no tools rendered a
 * full form of blank fields, which reads as a loaded form the reader has to
 * inspect to discover is empty.
 *
 * View mode only. In Edit mode a blank form is CORRECT — it is how a value
 * gets recorded — which is why this cannot be lifted from a reference
 * implementation that has no view/edit split.
 */
export function PanelEmpty({ subject }: { subject: string }) {
  return (
    <p className="text-sm text-muted-foreground">
      Nothing recorded for this {subject} yet.
    </p>
  )
}

/**
 * Save and Cancel, portalled to the drawer's footer host.
 *
 * The four entity panels each carried this block verbatim — twenty-two lines,
 * byte-identical, four times. One panel changing its disabled logic without
 * the others is the failure that costs; this is the fix.
 *
 * Falls back to rendering inline when the host is not there yet, which is the
 * first paint and nothing else.
 */
export function PanelFooterControls({
  footerHost,
  busy,
  changed,
  error,
  onSave,
  onCancel,
}: {
  footerHost: HTMLElement | null
  busy: boolean
  /** Save stays disabled until something actually differs from the baseline. */
  changed: boolean
  error: string | null
  onSave: () => void
  onCancel: () => void
}) {
  const controls = (
    <div className="flex items-center gap-2">
      <Button type="button" size="sm" disabled={busy || !changed} onClick={onSave}>
        {busy ? 'Saving…' : 'Save'}
      </Button>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        disabled={busy}
        onClick={onCancel}
      >
        Cancel
      </Button>
    </div>
  )
  return (
    <>
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
      {footerHost ? createPortal(controls, footerHost) : controls}
    </>
  )
}
