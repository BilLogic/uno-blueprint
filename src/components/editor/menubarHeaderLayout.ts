/** Shared layout classes for blueprint canvas menubar headers. */
/*
  `flex` is stated here rather than left to the caller. The phase bar renders
  this class on a `Menubar`, which is flex by itself; the service bar renders
  it on a plain `<div>`, where `items-center` without `flex` did nothing and
  the identity block sat on the row's top edge instead of its middle.

  No height of its own: the bar hugs the identity block, which pins its own
  two-line height, plus `py-2` above and below — `BLUEPRINT_MENUBAR_ROW_HEIGHT`
  says why. `h-auto` and not nothing, because the phase bar is a `Menubar`,
  whose base class is a fixed `h-8` that would otherwise come back.
*/
export const BLUEPRINT_MENUBAR_HEADER_CLASS =
  'relative flex h-auto w-full max-w-full shrink-0 items-center gap-3 rounded-none border-0 bg-transparent px-3 py-2 shadow-none'

/** Docked navbar bar — same surface/elevation as the side nav. */
export const BLUEPRINT_NAVBAR_BAR_CLASS =
  'relative shrink-0 border-b border-border bg-sidebar px-4'

/**
 * Cell-detail drawer top offset. The drawer is portalled to the body, so it
 * cannot inherit the chrome above it — the panel measures the canvas region
 * (`[data-slide-canvas]`) at open time and publishes the result in this
 * variable. The fallback is the base view's docked navbar — one menubar row
 * (`BLUEPRINT_MENUBAR_ROW_HEIGHT`) plus its 1px bottom border — and the 16px
 * gap; a slice tab, which stacks its header band on top, resolves taller and
 * no longer covers it. Written out for the same reason the bottom class is:
 * the row height is derived below, and the layout test holds this literal to
 * the derived value, so a change to the block or the padding that forgets the
 * fallback fails there instead of opening the drawer under the bar.
 */
export const CELL_DETAIL_PANEL_TOP_VAR = '--cell-detail-panel-top'
export const CELL_DETAIL_PANEL_TOP_CLASS =
  '!top-[var(--cell-detail-panel-top,calc(3.5rem+1px+1rem))]'

/** Gap between the canvas top edge and the panel — matches its right inset. */
export const CELL_DETAIL_PANEL_TOP_GAP_PX = 16

/**
 * Cell-detail drawer bottom offset — the top pattern's counterpart. Keeps the
 * drawer clear of the bottom canvas chrome (the annotation toolbar band) with
 * the same 16px breathing room as CELL_DETAIL_PANEL_TOP_GAP_PX.
 */
/**
 * Height of the bottom canvas chrome (the annotation toolbar band) plus the
 * same 16px breathing room the top gap uses. Named, because a bare
 * `bottom-[61px]` is a number nobody can check against the thing it clears.
 */
export const CELL_DETAIL_PANEL_BOTTOM_GAP_PX = 61
/*
  Written out, not interpolated. Tailwind reads SOURCE text: a template
  literal produces a class at runtime that the compiler never saw, so
  `!bottom-[61px]` had no rule behind it and the drawer ran to the bottom of
  the viewport, under the annotation toolbar. The test below keeps the literal
  and the constant in step.
*/
export const CELL_DETAIL_PANEL_BOTTOM_CLASS = '!bottom-[61px]'

/** The canvas region the panel measures against. */
export const CANVAS_REGION_SELECTOR = '[data-slide-canvas]'

/** Flattens the menubar when it sits inside the docked navbar bar. */
export const BLUEPRINT_MENUBAR_FLAT_CLASS =
  'relative h-auto rounded-none border-0 bg-transparent px-0 py-2 shadow-none'

/**
 * Left-aligned title + paths control row. Right padding keeps the row clear
 * of the absolutely-positioned zoom indicator / Reset View cluster.
 */
export const BLUEPRINT_MENUBAR_TITLE_CLASS =
  'relative z-10 flex h-full min-w-0 max-w-[calc(100%-9rem)] items-center gap-2 px-1'

/*
  `max-w-full` is what makes `truncate` truncate. The summary's parent is a
  `flex-col items-start` column, and an `items-start` child sizes to its own
  content: without a bound the line was as wide as its sentence, ran under the
  right-hand controls and off the viewport, and never showed an ellipsis.
  Bound to the column, it clips at the block's edge.
*/
export const BLUEPRINT_MENUBAR_SUMMARY_CLASS =
  'min-w-0 max-w-full truncate text-xs text-muted-foreground'

/**
 * The identity block's pinned height: the title line, then the summary line.
 *
 * Reserved, not sized to content. The summary is conditional at every call
 * site — `service.summary ? <p> : null`, a scenario with no description — and
 * on the service bar it arrives a round-trip after the bar does. A block that
 * sizes to content therefore grows by a line under the reader's cursor when
 * the query lands, and the canvas below it jumps. Two lines are held whether
 * or not the second one has anything in it.
 *
 * A LENGTH and not a Tailwind class, so the bars agree on one value a test
 * can read back off the box: the claim is that five different states measure
 * the same, and a class name cannot be measured. A 20px `text-sm` title line
 * + 4px for the block's `gap-1` + a 16px `text-xs` summary line.
 *
 * The title line and not the title's box. `EntityTitleAffordance` pads its
 * hover highlight with `py-1`; counted into the block, that padding sat above
 * the name and nothing matched it below the summary, so the bar looked 4px
 * roomier on top than underneath. The identity row cancels it with the
 * matching negative margin and the summary is pushed onto the block's bottom
 * edge, so both lines sit on the block's edges and the bar's padding is the
 * whole of the room either side. Where `text-sm` resolves to a shorter line,
 * the gap between the two lines takes up the difference, not the edges.
 */
export const BLUEPRINT_MENUBAR_IDENTITY_HEIGHT = '2.5rem'

/**
 * The bar's vertical padding — the length behind the `py-2` both menubar
 * classes spell out, the same 8px step as the `--spacing-sm` token. Tailwind
 * reads source text, so the classes carry the class and this carries the
 * length; the layout test keeps the two in step.
 */
export const BLUEPRINT_MENUBAR_PADDING_Y = '0.5rem'

const sumRem = (...lengths: string[]) =>
  `${lengths.reduce((total, length) => total + Number.parseFloat(length), 0)}rem`

/**
 * The menubar row's height: the identity block, plus the padding above and
 * below it. Derived, not written: the bar holds no height of its own, so its
 * height is whatever the block and the padding make it, and this is that sum
 * for the one thing that cannot measure the bar — the drawer's fallback top.
 *
 * The bar used to hold a fixed height, first `h-9` (36px around a 42px block,
 * so the summary sat on the bar's bottom border) and then `h-[3.25rem]`. The
 * fixed height was there to stop the bar growing when the summary arrives
 * late or not at all, and the block's pinned height already guarantees that:
 * a bar padded around a pinned block is just as still.
 */
export const BLUEPRINT_MENUBAR_ROW_HEIGHT = sumRem(
  BLUEPRINT_MENUBAR_IDENTITY_HEIGHT,
  BLUEPRINT_MENUBAR_PADDING_Y,
  BLUEPRINT_MENUBAR_PADDING_Y,
)

export const BLUEPRINT_MENUBAR_TITLE_TEXT_CLASS =
  'shrink-0 text-sm font-semibold tracking-tight text-foreground'

export const BLUEPRINT_MENUBAR_SEPARATOR_CLASS =
  'shrink-0 text-xs text-muted-foreground'

/**
 * The phase crumb in the scenario header's trail.
 *
 * Capped, so a long phase name cannot squeeze the name of the thing you are
 * actually looking at — the current crumb, which fills what this leaves. The
 * cap clips, so the crumb carries its full label on `title`; that is the
 * component's job, but the number is a layout rule and lives here with the
 * bar's other geometry rather than inline in one component.
 */
export const BLUEPRINT_MENUBAR_PHASE_CRUMB_CLASS =
  'max-w-[10rem] truncate font-normal'
