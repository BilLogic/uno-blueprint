---
summary: A text style is a rung, a weight and an ink — the rung owns size and leading, the call site owns weight, tracking and a named ink rung rather than an opacity, two ladders are selected by face, a semantic type-role layer is the alternative this tree already tried, and the four panel judgements that layer held live in this record.
---

# 12. A rung owns size and leading; a call site owns weight and tracking

**Status** Accepted — 2026-09-10
**Context** `src/styles/theme.css`,
[ADR 0008](./0008-a-primitive-is-a-hue-and-a-semantic-token-is-a-job.md),
issue #531

## Context

Colour has ADR 0008 and a guard, and that pairing is why colour has not
drifted while type has. Type has neither. The stylesheet already states a
weight rule at `theme.css:441-442` — *no weight overrides* — and the tree
runs four weights, because a comment in a stylesheet is not a decision anyone
is pointed at.

Someone adding a label, a caption or a heading has no way to ask for a *kind
of text*. They pick a size, a weight and a colour from utilities, and the
same job ends up spelled differently in different files. Measured across the
authored tree (per JSX line, excluding vendored `ui/` primitives and tests):
657 call sites improvise size and weight because no role exists; 185 pick a
weight with no doctrine; 70 hand-write a leading (an earlier count of 120
included the vendored primitives this record does not edit); 31 reach for
monospace with no usage rule. Zero of those sites name a rung that already
exists and then misspell it — the defect is that the rungs do not carry
enough, not that they are unused.

A second problem the first one hides: the ladder's small end goes four rungs
below anything legible. `text-2xs` (11px) through `text-5xs` (8px) carry 110
call sites between them. Two of those rungs exist because a container was
sized first and the text shrunk to fit it.

The ladder below was derived by measuring shipped CSS rather than by
inference, and two of the numbers that measurement offered are deliberately
not taken. Adopting a mechanism while refusing values that came with it looks
like an oversight in six months unless the refusal is written down, so it is
written down here.

## Decision

**A text style has five axes: size, weight, family, leading, ink.** A rung
owns size and leading. A call site owns weight, tracking and ink, and writes
each of those three by naming one of a closed set — never by dialling a
number of its own. Family is chosen by which of three registers the text
belongs to, not by feel.

**There is no semantic type-role layer.** `PANEL_TEXT` and any constant that
names a role instead of a rung is the rejected alternative. Colour already
does this correctly: a primitive is a hue, a semantic token is a job, and
the call site writes the utilities. Type tried the other shape — a
TypeScript constant of roles — and reached 3.9% adoption (28 call sites
against 685 hand-written size-and-weight decisions). A constant is invisible
in JSX: someone reading a component for a class name sees
`className={PANEL_TEXT.sectionLabel}` and has to open another file to know
what it renders. Consistency comes from complete primitives and few of them,
not from a dictionary of roles: a label writes `text-xs font-medium
text-muted-foreground` where it stands, and a reader sees the whole style.
3.9% after two years is evidence the shape is wrong, not that the effort was
insufficient.

### A rung is declared twice and a ratio once

Sans sizes live on `:root`. Mono sizes are scoped to
`.font-mono, code, kbd, pre, samp`, **sizes only**. The
`--text-*--line-height` ratios are declared once, on the root, as `calc()`
expressions that preserve upstream Tailwind's box for the size each rung
replaces.

The second block is scoped to monospace, not a leftover default. Monospace
renders optically smaller at the same nominal size — the reason browsers
default `monospace` to 13px against 16px — so the sans ladder is Tailwind's
minus 2px from `sm` up, and mono keeps the unshrunk one. `xs` is the single
rung where both agree, at 12px. A reader who does not know that will delete
the second block as a duplicate.

The mono block declares no line-heights. That is the point: the same ratio
meeting a larger size yields a larger box, and the mono column lands on
upstream Tailwind's boxes without restating them. Pair the ratio, not the
number, so a rung can be retuned later without its leading being redesigned.

Nothing below `xs` exists in either scope. The floor is 12px.

No root `font-size`, on any platform. Root follows the browser and the
user's own setting. Setting it per breakpoint would override that preference
and rescale every rem-derived spacing and radius token.

| rung | sans | mono | ratio, once on the root |
|---|---|---|---|
| `xs` | .75rem · 12px | .75rem · 12px | `calc(1 / .75)` |
| `sm` | .8125rem · 13px | .875rem · 14px | `calc(1.25 / .875)` |
| `base` | .9375rem · 15px | 1rem · 16px | `calc(1.5 / 1)` |
| `lg` | 1rem · 16px | 1.125rem · 18px | `calc(1.75 / 1.125)` |
| `xl` | 1.125rem · 18px | 1.25rem · 20px | `calc(1.75 / 1.25)` |
| `2xl` | 1.375rem · 22px | 1.5rem · 24px | `calc(2 / 1.5)` |
| `3xl` | 1.75rem · 28px | 1.875rem · 30px | `calc(2.25 / 1.875)` |
| `4xl` | 2.125rem · 34px | 2.25rem · 36px | `calc(2.5 / 2.25)` |
| `5xl` | 2.875rem · 46px | 3rem · 48px | `1` |

### Two numbers declined, and why the refusals are written down

**A normal weight above 400 is declined; both scopes stay at 400.** A sans
scope set to 450 is a compensation for a typeface that reads light at 400.
Ubuntu Sans holds its colour at 400 down to 12px, so the compensation would
correct a problem this tree does not have. Declaring the weight *per scope*
is worth keeping — the knob has to exist for the day a face needs it — and
that is what is taken here: the mechanism, at the value this face wants.

**Body at 500 is declined.** With body at 500 the next emphasis step is 600,
which is already the heading weight, so labels and headings collapse onto one
weight. At 400 there are three clean steps:

- **400** — all content: values, cell text, prose, meta, hints. The working
  weight.
- **500** — labels, eyebrows, active states, badge text. The one working
  emphasis.
- **600** — headings only: panel title, canvas column header, cover title,
  slide title.
- **700** — retired.

This is the load-bearing decision of the type system. Under the new ladder
the two content rungs are 12px and 13px. One pixel is not a signal, so the
hierarchy that size used to carry moves onto weight and colour.

### Family is three registers, not one

Monospace is not "text a machine produced." That reading was withdrawn
because it does not survive contact with the call sites: uppercase mono on a
nav heading or a wordmark is a typographic register, not a claim about where
the string came from. Read across every call site rather than counted, this
tree's monospace does three distinct jobs. A call site belongs to at least one
register and may name two; what it may not be is none. The map is #536.

1. **Code, identifiers and stored values** — model ids, API keys, error
   payloads, inline and fenced code, a stored enum shown as the value it is.
2. **Aligned numerals** — always beside `tabular-nums`; the two travel
   together. Digit alignment, not a claim that the text is machine-generated.
3. **Eyebrow and wordmark** — uppercase section labels and marks, set in
   mono for the even colour of its caps rather than for provenance.

Register 2 is the only one that may pair with a numeric utility; register 3
is the only one that may pair with tracking. Sans is the default and covers
everything not named above, including all canvas cell text.

### A rung is chosen for the text's job, never to fit a container

When a container cannot hold the smallest legible rung, the container
changes or the text goes. The rung does not shrink. This is the rule that
deletes `4xs` and `5xs` honestly rather than by decree.

### Ink is named, never dialled

A call site writes the ink rung the text's job asks for, and never an
opacity on top of one:

- `text-foreground` — what the surface is about: titles, values, body.
- `text-muted-foreground` — labels, meta, and chrome that frames content.
- `text-tertiary-foreground` — present but not being read: placeholders,
  disabled states, dim counts.

`text-foreground/70` is rejected in every form, including behind a variant
and inside a `cn()` branch. Two reasons, and the first is the one that
matters: a lightness cannot be read back. Nothing tells a later reader
whether `/70` and `/75` are two jobs or two afternoons, so the tree
accumulates steps nobody can defend and nobody dares change. The second is
mechanical — an opacity composites against whatever happens to sit behind
it, so the same class is a different colour on a card than on a page, and
a theme that moves the background moves ink it never declared.

Text that genuinely needs an ink these three do not name gets a token, in
the semantic layer, with a name that says its job. That is a decision
someone can find. A number on one call site is not.

`typeInk.ts` holds this, at the class-list seam, and its failure message
names the rung to write instead.

## The two arguments in the stylesheet this record overrules

Both comments stay. The answer changed; the argument they made was not
confused.

`theme.css:520-522` — *No `--text-*--line-height` on purpose: the utilities
set font-size only… call sites keep their own `leading-*`.* The original
argument was about what a utility should do. The counter-evidence is what
the tree looks like after two years of it: 70 authored leading values across
14 distinct spellings, where a page whose rungs carry their own boxes needs
two. The rung now supplies the box. A call site writes `leading-*` only where it
overrides for deliberate geometry, and that override carries a comment
naming which.

`theme.css:531-534` — *Collapsing them would be a design change nobody asked
for*, defending `4xs` and `5xs` with a geometry each. The defence was
correct: both rungs are load-bearing — a 9px digit inside a hard 16px
circle, and an 8px nowrap caption under a storyboard thumbnail. The answer
changed because the owner asked for the design change, and because the two
geometries are themselves the defect. One of them already clips today at
nine cited cells. The governing rule is the one above: a rung is chosen for
the text's job, never to fit a container.

## What this rejects

**A semantic type-role layer** (`PANEL_TEXT` grown until every call site
asks for a role by name). Tried; 3.9% adoption; invisible at the call site.
The constant is retired. The four jobs it named
are rules here, written at the call site as a rung, a weight and a colour:

- **title** — a panel's heading is `text-sm`, semibold (600), full ink.
- **meta** — counts and relationships under a title, and never a
  restatement of the title.
- **sectionLabel** — a field's name, always the same weight, size and
  colour.
- **value** — authored prose, the thing the panel exists to show.

Under the ladder, title and value share `sm`; meta and sectionLabel share
`xs`. Weight and colour separate them: 600 / 400 and 500 / 400-muted.

**One register for monospace**, "machine-generated, full stop." It breaks
aligned numerals and the eyebrow register, both of which are typographic
choices that have nothing to do with how the string was produced.

**Adopting a borrowed 450 and a borrowed body-at-500.** Take a mechanism when
it earns its place here; take a number only when this tree's own typeface and
hierarchy ask for it.

**A root font-size, on any platform.** Accessibility is the user's setting.
Responsive type stays a per-utility `md:` decision.

## Consequences

- **A guard, not a constant, holds the rules.** Roster, floor, weight,
  family, display floor. Each is written with a class-*list* reader, because
  a type rule is almost never about one utility.
- **Expand, then contract.** The new ladder lands on the names the tree
  already uses while the sub-12px rungs still exist, call sites migrate in
  batches, then the old rungs are deleted. Deleting a rung before its call
  sites move cannot land green.
- **12px means chrome, 13px means UI text.** Editor shell body text moves
  off the floor so the chrome being lifted onto `xs` does not land on top of
  it.
- **On a display surface the floor is `sm`, and stage text is never
  muted-only.** Presentation inherited editor rungs by accident.
- **A sixth divergence belongs here rather than in a commit message.** Same
  duty ADR 0008 already accepted for colour.
