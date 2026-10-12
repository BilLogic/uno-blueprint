import type { ReactNode } from 'react'
import { EntityDefinitionPopover } from '@/components/blueprint/EntityDefinitionPopover'
import { EntityTitleAffordance } from '@/components/blueprint/EntityTitleAffordance'
import {
  BLUEPRINT_MENUBAR_IDENTITY_HEIGHT,
  BLUEPRINT_MENUBAR_SUMMARY_CLASS,
  BLUEPRINT_MENUBAR_TITLE_CLASS,
} from '@/components/editor/menubarHeaderLayout'
import { Badge } from '@/components/ui/badge'
import { DeferredSkeleton } from '@/components/ui/deferred-skeleton'
import { Skeleton } from '@/components/ui/skeleton'
import type { EntityDetailKind } from '@/contexts/EntityDetailContext'
import { useShellBooting } from '@/contexts/shellBootStore'
import { ENTITY_KIND_DEFINITIONS } from '@/lib/panelTerms'
import { cn } from '@/lib/utils'

/**
 * How far along the identity is. The three settled `QueryResult` states, with
 * `ready` split by whether there is anything to name: a surface fed by props
 * is simply always ready.
 */
export type EntityHeaderStatus = 'loading' | 'ready' | 'error'

export type EntityHeaderProps = {
  kind: EntityDetailKind
  /** The row the title opens. Absent while loading, or when there is none. */
  id?: string | null
  /** What it is called. Absent for the same reasons. */
  label?: string | null
  /** What it is, under the name. Conditional at every call site. */
  summary?: string | null
  status?: EntityHeaderStatus
  /** The failure, in the SUMMARY slot. Read only when `status` is `error`. */
  message?: string | null
  /**
   * A trail to stand in the title's place, for a surface whose title is the
   * trail's own last crumb. The scenario bar passes one; the badge and the
   * summary are unchanged by it.
   *
   * A FUNCTION and not a node, because this block stays the only builder of
   * the title affordance: it hands the trail the very affordance it would
   * otherwise have rendered alone, and the trail decides where in itself that
   * goes. A plain node would mean a second site constructing an entity title
   * from an identity it had to derive again.
   */
  trail?: (current: ReactNode) => ReactNode
  className?: string
}

/**
 * The identity block's own skeleton session.
 *
 * Deliberately NOT `EDITOR_BOOT_HOLD_KEY`. That key is the shell's boot layer,
 * and a shared hold key is ONE session with one fade — the right tool for
 * stages of a waterfall that hand off to each other, which this bar is not a
 * stage of. It draws its own skeleton in its own session — the hold-key rule
 * `DeferredSkeleton` states.
 *
 * That is a different question from WHEN the session may end, and the two were
 * once answered as one. This bar waits on its query AND on the shell's boot
 * layer, so the bar, the sidebar and the board arrive on one beat instead of the
 * bar finishing first over a screen that is still loading.
 */
/**
 * Shared with `PathSelectorMenu`: the path control sits in the same bar, so the
 * two are one waterfall stage of one surface — the case a shared key is
 * reserved for. One session, one beat, one fade.
 */
export const ENTITY_HEADER_HOLD_KEY = 'entity-header'

/**
 * The title affordance's outdent: the negative of its `px-2` inset, so the
 * name's text edge and the summary's text edge are one edge.
 */
export const ENTITY_TITLE_OUTDENT_CLASS = '-ml-2'

/**
 * The two lines, as boxes rather than as text. `aria-hidden` because a
 * placeholder read aloud is a placeholder announced as content — the same
 * rule `EditorSidebarBootSkeleton` follows.
 */
function EntityHeaderSkeleton() {
  return (
    <div
      data-entity-header-skeleton=""
      aria-hidden
      className="flex h-full w-full min-w-0 flex-col gap-1"
    >
      {/* The title's 20px `text-sm` line, on the block's top edge — the
          affordance's `py-1` is cancelled there, so the line is what lands.
          No inset: the affordance's `px-2` is cancelled by the header's
          matching negative margin, so the name lands at the column's edge,
          and the placeholder holds the space where it will land. */}
      <div className="flex h-5 items-center">
        <Skeleton className="h-3.5 w-40 max-w-full rounded-md" />
      </div>
      {/* The summary's 16px `text-xs` row, on the same left edge and the
          block's bottom edge, where the summary lands. */}
      <div className="mt-auto flex h-4 items-center">
        <Skeleton className="h-2.5 w-64 max-w-full rounded-md" />
      </div>
    </div>
  )
}

/**
 * What KIND of thing this bar names, said in a word rather than in a hue.
 *
 * A reader who has never seen a service blueprint cannot tell a scenario bar
 * from a phase bar: both are a bold name over a sentence. The badge says which
 * without being hovered, and carries that kind's definition for the reader who
 * then wants one.
 *
 * NEUTRAL by decision, not by omission. The grid already spends colour on lane
 * role and path kind. The diagram assets do carry a per-entity tint, but those
 * are hardcoded hexes with no token behind them, so adopting them would invent
 * a THIRD colour axis rather than reuse either existing one.
 * `outline` is the badge's own neutral variant; the ink drops to
 * `text-muted-foreground` so the word does not compete with the semibold name
 * beside it. Nothing here touches the badge's size — one size for every badge
 * is settled in one place, not per call site.
 *
 * A DEFINITION TRIGGER AND NOTHING ELSE. `EntityTitleAffordance` keeps the
 * panel: it is one target with an `absolute inset-0` opener filling it, so a
 * badge placed inside it would either open the panel on click or have to climb
 * back out on a z-index. Rendering it as the affordance's SIBLING is what makes
 * "the badge does not open the panel" true by construction rather than by a
 * `stopPropagation` somebody can delete.
 *
 * No `cursor-help`: it is on its way out everywhere along with the dotted cue
 * and the ⓘ, and adding one here only to delete it next is churn.
 *
 * The accessible name is the kind THEN the entity's own name, so a screen
 * reader gets the pairing a sighted reader gets from the two sitting side by
 * side. Kind first, because the visible word has to start the name it is read
 * by for the two to be one label rather than two.
 */
function EntityKindBadge({
  kind,
  label,
}: {
  kind: EntityDetailKind
  label: string
}) {
  const term = ENTITY_KIND_DEFINITIONS[kind]

  return (
    <EntityDefinitionPopover kind={kind} side="bottom">
      <Badge
        data-entity-kind-badge=""
        variant="outline"
        aria-label={`${term.label}: ${label}`}
        className="text-muted-foreground"
      >
        {term.label}
      </Badge>
    </EntityDefinitionPopover>
  )
}

/**
 * The identity block above the canvas: what this thing is called, and what
 * it is.
 *
 * ONE component for three surfaces — the service overview, a phase, a
 * scenario. The same block was written three times, and only one of the three
 * owned a query, which is exactly why only that one was broken. It takes a
 * RESOLVED identity and never a query: the service surface unpacks
 * `useServiceSpec`, the phase and scenario surfaces unpack the props they
 * already hold, and this component never learns which is which.
 *
 * It reserves its height rather than sizing to it — see
 * `BLUEPRINT_MENUBAR_IDENTITY_HEIGHT`, which is where the number and the
 * argument live, because all three bars draw their geometry from that module.
 *
 * The name is followed by a neutral badge naming its KIND — see
 * `EntityKindBadge`. It rides here rather than inside the title affordance
 * because it must not open the panel the affordance opens.
 *
 * FOUR STATES, THREE PICTURES:
 *
 *   loading            the skeleton
 *   ready, an entity   the name and its summary
 *   ready, nothing     a present, empty bar — this deployment has no service
 *   error              a present bar, with the failure in the SUMMARY slot
 *
 * The failure goes in the summary slot and never the title slot. The title is
 * an interactive affordance — it opens the entity panel — so error text there
 * offers a control that leads nowhere.
 *
 * The summary is a row UNDER the title, inside the same block. Inline after a
 * separator it competed with the name for the same line and truncated first on
 * a narrow canvas; outside the block it lost the block's own
 * `max-w-[calc(100%-9rem)]` and `gap-1`, so the two lines sat at a different
 * rhythm from the identical bar one level down. `title` and not a tooltip:
 * this is truncated prose, and the full text is one click away in the panel
 * the name opens.
 */
export function EntityHeader({
  kind,
  id,
  label,
  summary,
  status = 'ready',
  message,
  trail,
  className,
}: EntityHeaderProps) {
  // A failed query has no summary to print, and printing a stale one under a
  // bar that cannot say what it is showing is worse than printing nothing.
  const caption = status === 'error' ? (message ?? null) : (summary ?? null)
  /*
    Two waits, one skeleton. The bar cannot resolve before its own query
    answers, and it does not resolve before the shell lifts its layer either —
    whichever is later is when the reader sees a name. The layer fires once per
    entry, so a return from a slice tab is held by neither: the latch is off
    and the query is warm (`staleTime: Infinity`).
  */
  const shellBooting = useShellBooting()
  /** The title alone, or the trail the caller wraps it in. */
  const renderIdentity = (title: ReactNode) => (trail ? trail(title) : title)

  return (
    <div
      data-entity-header=""
      className={cn(BLUEPRINT_MENUBAR_TITLE_CLASS, className)}
      style={{ height: BLUEPRINT_MENUBAR_IDENTITY_HEIGHT }}
    >
      <DeferredSkeleton
        loading={status === 'loading' || shellBooting}
        holdKey={ENTITY_HEADER_HOLD_KEY}
        skeleton={<EntityHeaderSkeleton />}
        className="flex h-full w-full min-w-0 flex-col items-start gap-1"
      >
        {id && label ? (
          /*
            One ROW: the name, then the kind to its right. The row exists so
            the badge is a SIBLING of the opener rather than a child of it.

            `items-center` against a title row the badge cannot grow — a 20px
            `h-5` badge inside a 24px row — so the two-line height this bar
            pins stays exactly what `BLUEPRINT_MENUBAR_IDENTITY_HEIGHT` says.

            `-my-1` cancels the affordance's `py-1`, the vertical twin of the
            `-ml-2` outdent below: the hover highlight keeps its breathing
            room, reaching into the bar's padding, while the name's line sits
            on the block's top edge. Counted in, that padding put 4px more
            room above the name than below the summary.
          */
          <div
            data-entity-header-identity=""
            className="-my-1 flex min-w-0 max-w-full items-center gap-2"
          >
            {/* `-ml-2` cancels the affordance's own `px-2`. The padding
                is the hover highlight's breathing room and stays; the margin
                pulls the box out by the same amount, so the name's first
                letter sits on the summary's left edge instead of 6px in.
                A trail needs no outdent: its first crumb is an unpadded link,
                already on the summary's edge. */}
            {renderIdentity(
              <EntityTitleAffordance
                kind={kind}
                id={id}
                label={label}
                className={trail ? undefined : ENTITY_TITLE_OUTDENT_CLASS}
              />,
            )}
            <EntityKindBadge kind={kind} label={label} />
          </div>
        ) : null}
        {caption ? (
          /* Under a title, `mt-auto` puts the summary on the block's bottom
             edge, the mirror of the title on its top, so the bar's padding is
             the whole of the room on either side. Alone — a failure, or a
             bar with nothing recorded — it centres, as one line in a
             two-line block should, rather than hanging under an empty row. */
          <p
            data-entity-header-summary=""
            className={cn(
              id && label ? 'mt-auto' : 'my-auto',
              BLUEPRINT_MENUBAR_SUMMARY_CLASS,
            )}
            title={caption}
          >
            {caption}
          </p>
        ) : null}
      </DeferredSkeleton>
    </div>
  )
}
