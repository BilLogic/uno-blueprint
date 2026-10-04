---
summary: The shell's landing view — a content model supplied by the deployment, one navigating action, click-to-expand figures with a light and a dark file drawn to one art direction, and one measure down the whole page.
claims:
  - src/components/cover/CoverCommandCopy.tsx
  - src/components/cover/CoverFigure.tsx
  - src/components/cover/CoverPage.tsx
  - src/components/cover/CoverSections.tsx
  - src/components/cover/CoverServicesSelector.tsx
  - src/components/cover/CoverTabStrip.tsx
  - src/components/cover/coverInline.tsx
  - src/components/cover/coverMeasure.ts
  - src/components/cover/coverModel.ts
  - src/components/cover/packageCoverFigures.ts
---

# Cover page

The shell's landing view — what a visitor meets before any blueprint is open.

> Everything visible is data from a `CoverContent` module; the components here
> own only layout and theme treatment. Tab state is local and unserialized:
> `?slice=` deep links resolve one way, out of this page into app surfaces,
> never into a cover tab — a second writer on the query string would race the
> slice resolution.

## Two classes of button, and only one of them navigates

**The header's button is the page's only NAVIGATING action** — the one way to
leave the cover. Figures are click-to-expand, which is a second class of button,
deliberately: it never writes, fetches, or navigates, so the page stays
identical for a read-only visitor and in a zero-config workspace, whether or not
a reader ever opens one. A test asserts the header action stands alone.

Reading order in the header is title → lede → the way in. The button used to sit
on the title's baseline, opposite the heading, which put the page's only action
level with the words before the reader had been told what they were opening.
Reading order and visual order now agree: what this is, what it does, how to
enter. When no database is connected, one muted line under the CTA reads
"No database connected · read-only. Sample data shown." and names no vendor.

## The content split

Types only in `coverModel.ts` — **no strings live there**. The renderers know
nothing about any one organisation; a deployment is entirely defined by its
content module. That split is what lets a deployment change every label, figure
and link without touching a component.

Section kinds are `prose`, `figure`, `defs`, `portrait` and `skill`. Three rules
in the model are worth keeping:

- **An absent figure is first-class.** A section whose figure has not been
  authored yet renders prose-only. No placeholder box, no broken `src`.
- **The repo link is quiet and inline**, rendered only when the deployment
  configures one. There is no button form of it — the page has one button.
- **Portrait images are a different treatment from wide figures**, not a smaller
  size of them. A wide diagram plate is sized from its own viewBox at the page
  measure; a portrait is a fixed small square, because blowing it up to the page
  measure would blur a logomark or let a character illustration dominate a page
  otherwise made of technical diagrams.

**Who authored a figure is who supplies it.** The thirteen wide diagrams draw the
blueprint model rather than any one service, so the template brings them:
`packageCoverFigures` exports each as a value whose `src` is a module import, and
a content module places one by naming it. A deployment that wants its own words
spreads the figure and overrides `alt`; it does not fork the cover to do so. The
portraits are the other half — a deployment's logomark and its illustrations are
its own artwork, served out of `public/` and named as paths.

That split is about authorship, not file type, and the mechanism follows it. A
path is served by whatever tree holds the file, so a figure named as `/cover/…`
and absent from the tree serving the page does not 404: the single-page fallback
answers **200 with `text/html`**, the reader gets a broken-image box and the
network tab reports success. An import has no such slack — it resolves at build
time or the build stops.

**Figure dimensions come from each SVG's viewBox**, so the page reserves the
right box before the image decodes.

## One measure

`COVER_MEASURE` is the page's one width, and it exists as a constant because it
previously did not — and the page showed it twice over. Prose sat at one width
while figures ran to another, so every figure overhung the paragraph above it and
the column edge moved at each image; and the header's lede disagreed with the
content below it.

It is the wider of the two, because the header sets the page's edge and the
reader meets it first. It runs a little past the classic measure at the body
size; that is the accepted cost of one edge down the entire page, and it buys the
wide diagrams noticeably more room.

**Import it. Do not restate the value — two literals is how the page got into
this state.** A test holds every block to one measure, so the column edge never
moves.

## Figures

**No plate, no border, no padding — deliberately.** Every figure is authored with
a full-bleed rounded background rect across its whole viewBox, so the artwork
already *is* its own container. Wrapping it in a second bordered, padded white
box drew a frame around a frame.

**Dark mode is a second file.** Fills, text and strokes are literal values
inside each SVG, and an `<img>` seals page CSS out of them, so the page's `.dark`
class never reaches in. A figure therefore ships as `name.svg` and
`name.dark.svg`, and its `packageCoverFigures` entry carries the second as
`srcDark`. `CoverFigure` picks the file from the app's resolved theme, so the
toggle swaps it live and the opened viewer shows the same one. A figure without
a dark file yet shows its light file in both themes. **Not `dark:invert`**, which
destroys the lane colours the figures encode; not an opacity dim either, which
drops the smallest labels below AA.

On GitHub the README and the guide cannot see the app's theme, so they embed a
figure that has a dark file as a `<picture>` and let GitHub follow its own:

```html
<picture>
  <source media="(prefers-color-scheme: dark)" srcset="./docs/assets/why-now.dark.svg">
  <img src="./docs/assets/why-now.svg" alt="…">
</picture>
```

`scripts/sync-cover-assets.mjs` copies each dark file along with its figure, and
refuses a dark file whose light figure is not in the manifest.

The whole image is the trigger — a diagram this dense benefits from a big hit
target — and the cursor stays a plain pointer, because the corner hint already
says "this expands". What opens is the shared image viewer, whose contract lives
in `dialogs-sheets-and-forms.md`: zoom toward the pointer, pan past fit, three
exits, and a diagram that is operated rather than dismissed. The figure passes
it no siblings, because a cover figure has none.

**That reverses what this page used to say**, which was that the opened figure
was inert and that every square inch of the popup — the diagram included —
closed it. It was a coherent decision while fit-to-viewport was all the popup
had to offer. But fit is exactly the scale at which a diagram authored at 880px
still hides the labels the reader opened it to read, so the popup being the end
of the interaction restated the problem rather than solving it. Reopening still
starts at fit: the zoom a reader builds up is a per-visit choice, not a
remembered preference.

The first figure decodes eagerly; the rest are lazy.

## Art direction

How the figures look and how they argue. `why-now` and `when-to-use` are drawn to
it; the rest follow as they are redrawn.

- **One idea per figure.** Decide the one sentence the figure proves, then cut
  everything that does not help prove it. The prose around the figure carries
  the detail.
- **Minimal text, sentence case.** A short title and a short line where a label
  is needed; no in-figure headline when the section already has one. No ALL
  CAPS. Use the words `CONTEXT.md` fixes: lane, step, cell, slice, path.
- **A label the app shows is marked.** Where a figure draws a field label the
  cell panel shows (Owner, Leads to, Enabled by), its `<text>` carries
  `class="uiLabel"` and nothing else in the class, styled like `.label`. That
  marker is how a sweep tells a panel label from a caption, here and in any
  repository that reads the figures out of the installed package, and a label
  it cannot find is a label nobody checks.
- **Never under 11px at the rendered width.** Beside the sidebar the cover
  shows an 880-wide figure at about 688px, so author text at 14.5px or more and titles at 15px. Measure each title in
  the system fallbacks (SF, Segoe UI, Arial) and leave it at least 15 units of
  slack in its column.
- **Type.** `font-family="'Ubuntu Sans', system-ui, sans-serif"` on the root.
  An image cannot load a webfont, so most readers see the fallback; leave room
  for the wider face rather than fitting labels to Ubuntu Sans exactly.
- **Three marks, three meanings.** Teal is what the figure explains:
  `#00806a` light, `#3ecfb0` dark. A teal cell is a 2px teal outline with a
  faint teal halo round it (the same teal at 28%, 3px wide, 3 units out), no
  fill, and a teal skeleton bar: the app's selection ring, drawn small. The
  halo is what keeps it apart from a Customer cell, because teal against the
  Customer line's green is about 1.1:1 and the outline alone does not read.
  A stale cell — one that no longer holds — is the only filled cell: a faint
  amber wash, `#fff4e0` (dark `#33260f`), under a solid 1.25px amber outline,
  `#b45309` (dark `#fbbf6a`), and it keeps its skeleton bar, drawn in the
  same amber at 55%, because it is content that is wrong rather than content
  that is missing. The wash is what carries it: an amber outline alone
  measures about 1.0:1 against the Support and Backstage lane lines. Dashed
  means not yet, missing or proposed. Everything else stays ink, muted ink
  or a lane line, so the eye lands on the teal first.
- **Ink.** Text `oklch(.21 .008 175)` (`#151a18`), muted `oklch(.47 .008 175)`
  (`#565c5a`). Dark: `#ebf0ee` and `#a6acaa`.
- **A cell is an outline, not a fill.** `fill: none`, a 1.25px stroke in
  its lane's line colour, radius 8, and one translucent-ink skeleton bar
  inside. The row's swatch is a 10px square in the same colour. The line
  colours are the board's own: each lane is its role's family at step 11,
  the step the board draws a cell's ring in, so a figure matches the board a
  reader opens next. Measured against the plate and the card (WCAG contrast,
  at least 3:1 for a line that carries meaning):

  | Lane | Role, family | Light | Dark |
  | --- | --- | --- | --- |
  | Customer | `customer_actions`, green | `#18794e` (5.07 / 5.41) | `#4cc38a` (8.40 / 7.71) |
  | Frontstage | `frontstage_actions`, pink | `#cd1d8d` (4.74 / 5.05) | `#f65cb6` (6.31 / 5.79) |
  | Backstage | `backstage_actions`, orange | `#bd4b00` (4.72 / 5.04) | `#ff8b3e` (7.98 / 7.33) |
  | Support | `support_actions`, amber | `#ad5700` (4.76 / 5.07) | `#f1a10d` (8.72 / 8.00) |

  A lane the table leaves out takes its role's step-11 colour the same way
  (`colors.css`, `--color-{family}-1100`), measured before it ships.
  `blueprint-anatomy` and `why-now` are drawn to this recipe.

- **Borders are translucent ink** on everything that is not a cell — cards,
  wells, chips: about 9% at rest, 17% for emphasis.
- **Radii**: 16 for the plate and cards, 8 for cells, 6 for small chips.
- **A skill's name** sits in a dark terminal chip in mint mono, echoing the site: fill `#101417`, text `#7fe3cc` (dark: fill `#232a28` with a 17% ink edge, same text).
- **The plate** is a full-bleed rect with a dot grid on it: 1.6px dots (`r=0.8`) on a
  20px pitch at about 17% ink, masked to fade towards the edges. Cards sit on it in
  the card colour (`#ffffff` light, `#181d1b` dark; plate `#f6f8f7` and
  `#0f1412`).
- **Dashed means not yet, missing or proposed**; solid means it exists. A
  proposed change, a pattern nobody has built. On a cell it is the outline
  that dashes, `stroke-dasharray: 3 3` at the same 1.25px, in the lane's
  colour (or teal, if it is the cell the figure explains). A dashed teal
  cell keeps the teal weight and halo — 2px, dashed `3 3` — since the halo
  is what separates it from the Customer green. A cell that no longer holds
  is amber, not dashed.
- **The mini-blueprint** is the shorthand for a blueprint: rows of a small
  lane-colour square and a label bar, then cells 24px tall, outlined in the
  lane's line colour, each holding one skeleton bar. Highlight cells in teal
  to show which part of it a figure is about.
- **Light and dark differ only in the palette.** Put every colour in the
  file's `<style>` block as a class and keep the drawing identical, so the dark
  file is the light file with that block swapped. A test diffs the two outside
  the block.

## Sections

**One layout for every section: prose first, figure below it at full width.** No
side-by-side variant — a page that mixes the two reads as two designs, and the
wide figures were the only ones that ever qualified. Portraits stack too; rows
were tried twice and dropped both times, because a row split the section's width
unevenly against every other block, reading as its own small layout system
rather than a continuation of the page's.

## The small parts

- **`coverInline`** — three markers, not a markdown engine: `**term**` for a term
  on first definition, `*word*` for the lighter stress the copy uses once or
  twice, `` `code` `` for an invocation or filename. The copy is authored, not
  user input, and anything richer belongs in the section grammar rather than
  inside a string. Bold is matched before italic so a bold run is never read as
  two italics.
- **`CoverCommandCopy`** — a skill invocation, click-to-copy. The skills run in
  Claude Code, not in this app, so the useful affordance is getting the exact
  command onto the clipboard; **a button that pretended to run something here
  would be worse than no button.** The clipboard call is guarded (the API is
  absent over plain http), and a denied clipboard is swallowed — not an error
  worth surfacing on an orientation page, so the control simply stays put. The live
  region announces only on success, because the resting control already reads its
  command.
- **`CoverTabStrip`** — the line-variant tab list with an animated shared
  indicator, with two additions for a four-label strip: the list scrolls
  horizontally when the labels do not fit, with an **edge fade instead of a
  scrollbar** (chrome on an orientation page), and the indicator recomputes on
  scroll as well as resize, since its maths reads live rects.

  The rule that keeps both honest: **the scrolling element holds nothing but the
  triggers.** The border and the indicator — the two pieces that must sit *on*
  the baseline rather than above it — live on a non-scrolling wrapper. Three
  consequences worth not undoing: the frame is `flex` rather than `block`, or an
  inline-level child sits on a line box and the font's descender pushes the
  border clear of the labels; the clip is `overflow-x-clip` rather than
  `hidden`, because `hidden` would make it a scroll container and CSS computes
  the two overflow axes together, reopening the phantom vertical scroll region
  this structure exists to remove; and overscroll containment is x-only, because
  the page's own vertical scroll must still chain.
- **`CoverServicesSelector`** — the front door to a multi-service deployment
  The tab a deployment marks `services:` in its content heads its
  panel with a selector — one segmented control on a recessed track, a tab per
  service, the active one lifted onto the background (the Skills tab's pattern,
  applied to the roster). Picking one makes that service active, which drives
  the URL and re-scopes the board. **It appears only when a second service
  exists:** with one service the tab keeps its singular label and shows no
  selector, so a single-service deployment is unchanged. The roster and the
  active slug are read once at `CoverPage` (from `ActiveServiceContext`) and
  handed to the provider-free `CoverPageView` as props, so the surface stays
  testable without a provider.
