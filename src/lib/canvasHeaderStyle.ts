/**
 * One treatment for both canvas header axes.
 *
 * The row header (a lane's name) and the column header (a step's name) are the
 * same kind of object — the label of an axis, and the way into what that axis
 * describes — and they had drifted into two: 11px bold ink-coloured in a
 * `px-1 py-1` box on one axis, 12px medium muted in a `px-2 pb-2` box on
 * the other, with different gaps to their icons and a selected state that
 * looked exactly like hover.
 *
 * What stays different is what is actually different: a row label reads from
 * the top-left of a tall row, a column label is centred over its column, and
 * each keeps its own ink (a lane carries its role's colour; a step is chrome).
 */

/** Size, weight and tracking — identical on both axes. */
export const CANVAS_HEADER_TEXT = 'text-xs font-semibold tracking-tight'

/** The box: one radius, one padding, one gap to the ⓘ. */
export const CANVAS_HEADER_BOX = 'rounded-md px-2 py-2 gap-2'

/**
 * Rest → hover → selected, as three distinguishable states.
 *
 * Hover and selected were the same wash, so an open panel gave the canvas no
 * way to say which label it belonged to. Selected is the deeper wash plus the
 * ring a SELECTED CELL wears — one selection vocabulary on one canvas.
 *
 * `ring-inset` on both rings, and this is the whole fix for the cut-off
 * header: an outset ring is painted OUTSIDE the element's box, and both
 * headers sit inside a clipping parent — the label rail is `overflow-hidden`
 * and the column header row is a fixed-height track. A ring drawn outside a
 * box that fills its container has nowhere to go, so it came back sheared off
 * along whichever edge it met. Drawn inside, it is always whole.
 *
 * Worn by the BOX, not by the button inside it. The header now holds two
 * targets — the name, which explains what kind of row or column this is, and
 * everything else, which opens the panel — so the wash and the selected ring
 * belong to the block they share rather than to one of them. `data-open`
 * replaces `aria-pressed` for the same reason: the state is the header's, and
 * `aria-pressed` stays on the button that actually toggles.
 */
export const CANVAS_HEADER_STATE = [
  'relative transition-colors duration-(--motion-micro)',
  'hover:bg-foreground/5',
  // Neutral, not the brand colour. A header is chrome — it names an axis; it
  // is not one of the coloured objects on the board. Borrowing the CELL's
  // teal selection ring put the loudest hue in the app on the quietest thing
  // in it, and two selected headers read as more important than the cells
  // they label. Ink at 30% says "this one" without competing.
  'data-open:bg-foreground/[0.07] data-open:ring-2 data-open:ring-inset',
  'data-open:ring-foreground/30',
  // The OPENER's focus, specifically — not any button in the block. The
  // block also holds the touch ⓘ, a second button; ringing the whole header
  // when the tiny ⓘ takes focus would say "this header" when the reader only
  // reached for its definition. The ⓘ wears its own ring instead.
  'has-[[data-canvas-header-opener]:focus-visible]:ring-2',
  'has-[[data-canvas-header-opener]:focus-visible]:ring-inset',
  'has-[[data-canvas-header-opener]:focus-visible]:ring-ring/50',
].join(' ')

/**
 * How long the pointer rests on a header block before its definition opens.
 *
 * The whole block is the hover target now, not the one word — a reader learns
 * the board by sweeping it rather than by aiming — so the definition needs a
 * beat of intent before it appears, or every pass across the axis pops a
 * card. Short, because it is a rest, not a wait.
 */
export const CANVAS_HEADER_HOVER_DELAY = 500

/*
  THE ⓘ CAME BACK, but only for the reader who has no other way in.

  It was always-on at first; the round that made the whole block the opener
  removed it, because by then the opener was a full-size target on any input
  and the definition opened on hover — so the mark was decoration, and one
  beside every named thing was resting-state clutter. Its return keeps that
  judgement for the pointer reader: the definition still opens on hover of the
  block, and nothing is drawn at rest.

  What the removal could not answer is the reader who cannot hover and whose
  tap is spent opening the panel. For them the definition had no door. The ⓘ
  is that door and no more: it is INVISIBLE on a fine pointer, and appears
  only where hover cannot reach it — under keyboard focus, and on a coarse
  pointer. So the resting board a pointer reader sees is exactly as clean as
  the removal left it, and the touch reader is no longer locked out. See
  `CANVAS_HEADER_INFO`.
*/

/**
 * The header's name: the word this axis is called.
 *
 * Plain prose now, not a control. The definition it used to carry moved to
 * the block's own hover and to the touch ⓘ, so the word is no longer a focus
 * stop or a hover trigger of its own — and `pointer-events-none` lets a click
 * on it fall straight through to the opener beneath, which is the whole fix
 * for the label that used to eat its own click.
 */
export const CANVAS_HEADER_NAME = 'relative z-10 w-fit pointer-events-none'

/** The invisible full-block target that opens the panel. */
export const CANVAS_HEADER_OPENER =
  'absolute inset-0 rounded-md outline-none'

/**
 * The touch ⓘ: the definition's door for a reader who cannot hover.
 *
 * Invisible at rest — `opacity-0` on a fine pointer, so a pointer reader's
 * board stays exactly as clean as it was before the ⓘ came back. It fades in
 * only where hover is not there to open the definition: under keyboard focus
 * (`focus-visible`), and on a coarse-pointer device
 * (`@media (pointer: coarse)`), which are exactly the two readers the
 * block-hover never reaches. Same touch-reveal idiom as the sidebar's row
 * actions (`SidebarNav`). It carries its own focus ring, since the block's
 * ring is the opener's alone.
 */
export const CANVAS_HEADER_INFO = [
  'z-10 inline-grid size-4 place-items-center rounded-full text-muted-foreground',
  'opacity-0 outline-none transition-opacity duration-(--motion-micro)',
  'focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring/50',
  '[@media(pointer:coarse)]:opacity-100',
  // Invisible must also mean untouchable. On a fine pointer the glyph is
  // transparent but kept its hit area, and its click stops propagation — so
  // the corner of every header was a ~16px dead zone where a click opened
  // nothing. It takes clicks only where it can be seen: a coarse pointer, or
  // keyboard focus.
  'pointer-events-none focus-visible:pointer-events-auto',
  '[@media(pointer:coarse)]:pointer-events-auto',
].join(' ')

/**
 * The horizontal inset of one column of the board — the lane label and the
 * cell slot beside it, one value.
 *
 * The rail carried `pl-5 pr-3` while the slot carried `px-4`, so the label
 * started 6px further in than the cells it names and stopped 2px short of
 * them on the other edge. Nothing enforced the relationship; the two numbers
 * were set in separate files and drifted. Reading them from here is what
 * makes the rail sit on the grid's rhythm rather than near it.
 */
export const BLUEPRINT_SLOT_INSET = 'px-4'

/** The same inset at compact density. */
export const BLUEPRINT_SLOT_INSET_COMPACT = 'px-3'

/**
 * The left half of the same inset, for a row that only has a left edge to
 * honour — the divider caption, which runs off toward the board and lets its
 * rule cross the outline rather than stopping at it.
 *
 * It was `pl-5`, so the "Line of …" captions started 6px left of the lane
 * labels stacked directly above them and the column read as two columns.
 */
export const BLUEPRINT_SLOT_INSET_LEFT = 'pl-4'
