---
summary: The identity fill derives from the resolved action fill through three optional per-channel dials, so an uncustomised template resolves brand to exactly primary and a deployment separates the two by setting one number — superseding the half of ADR 8 that gave brand an independent pair of dials, and leaving the job split between the two words intact.
---

# 25. Brand derives from primary, with one dial per channel

**Status** Accepted — 2026-09-16. Supersedes the brand-dial mechanism of
[ADR 0008](./0008-a-primitive-is-a-hue-and-a-semantic-token-is-a-job.md) —
marked in place there, and named passage by passage under "What falls in 0008"
below. That record's division of the two words by job stands. Amended
2026-10-03 (#1032): the template no longer ships neutral. Its default accent
is now teal, and the mechanism below stands unchanged — brand still resolves
to exactly primary until a deployment sets a dial. Where this record reasons
from "a template that ships neutral", read it as a deployment that sets
`--primary-chroma: 0` to stay neutral; the recipe is
[`references/customization.md`](../../references/customization.md).
**Context** `src/styles/semantic.css`, `src/styles/themes/light.css`,
`src/styles/themes/dark.css`, `src/lib/palette.test.ts`,
[ADR 0008](./0008-a-primitive-is-a-hue-and-a-semantic-token-is-a-job.md)

## Context

[ADR 0008](./0008-a-primitive-is-a-hue-and-a-semantic-token-is-a-job.md)
divides the two words for the accent by job: `--primary` is the action fill,
tuned until a filled control clears its contrast floor, which is why a neutral
one has to invert between modes; `--brand` is the identity fill at the
vividness the identity was authored at, which does not have to move when the
lights go out. Then it names the mechanism that separates them: "a pair of
dials each."

The job split is right and is not what this record touches. The pair of dials
is what did not survive contact.

What the second pair actually shipped, in both theme files, was
`--brand-lightness: 0.594` at `--brand-chroma: 0`. That is a mid grey, and the
identity fill wears it under the `text-sm` label the cover CTA carries, at
3.89:1 — below the 4.5:1 that label's size asks for, and sitting in the trough
`semantic.css` itself names, where "a fill near L 0.6 is the worst ground
either polarity of ink has". The dial pair existed so the identity could hold its vividness while
the action fill inverted, and the only value it was ever exercised at is a
contrast trough. A knob whose sole shipped setting is the defect is a knob that
costs more than it returns.

It is worth recording why an aliased brand looked impossible when 0008 was
written, because the reason is verifiably wrong and it shaped the decision.
`semantic.css` argues that an alias "inherits a colour with no lightness the
ink can read, which is the same defect a fixed on-colour has". Under relative
colour syntax that is false: the on-colour flip resolves against whatever the
aliased colour resolves to. Take `--color-scale-1200` from `colors.css`, which
is `hsl(206 24% 9%)` in light and `hsl(0 0% 93%)` in dark — the kind of step an
aliased `--brand` would name. Then
`oklch(from hsl(206 24% 9%) clamp(0.205, calc((0.62 - l) * 100), 0.985) calc(c * 0.08) h)`
resolves to `oklch(0.985 …)`, and the dark half of the same step resolves to
`oklch(0.205 …)`. Verified in a browser. The flip, the derived hairline and the
ring all read an aliased colour's lightness perfectly well. The claim predates
the browser support it denies and outlived it.

Removing the pair is therefore possible. The question this record answers is
what replaces it, and the obvious answer is not the right one.

## Decision

**`--brand` derives from `--primary`'s resolved colour, through three optional
dials, one per channel.**

```css
--brand: oklch(from var(--primary)
  var(--brand-lightness, l)
  var(--brand-chroma,    c)
  var(--brand-hue,       h)
);
```

With no dial declared, every channel falls through to primary's own and
`--brand` resolves byte-identically to `--primary`. Declare one dial and only
that channel diverges; the other two keep following the accent.

**One declaration is a complete seam, because the rest of the set chains off
it.** `--brand-foreground`, `--surface-brand`, `--text-brand` and
`--text-on-surface-brand` each derive `oklch(from var(--brand) …)`;
`--border-brand` derives from `--surface-brand` and `--wash-brand` from
`--text-brand`. Only `--brand`'s own derivation changes here — the six below it
keep theirs, and nothing downstream is retyped.

**What falls in 0008, and what does not.** Three passages go with the
mechanism: the "a pair of dials each" sentence that closes "Two brand
vocabularies, divided by a different thing"; the `--brand` derivation under
"The stepped scales", with its "a rebrand is two numbers in the theme files";
and the "A retune is dials, not a curve" consequence, which names
`--brand-lightness` and `--brand-chroma` as the edit. The division by **job**
that the first of those sits inside is untouched, and so is the rest of the
record — the five divergences, the derive-versus-take method, and the rule that
a primitive is named for its hue and never for its role. There is still no
`brand` family in `colors.css` and this record does not add one. 0008's escape
hatch is intact and is now one line: a deployment that wants its identity as
steps adds the hue those steps are made of, under the hue's own name, and sets
`--brand` from a rung of it.

Which sites wear the brand hue is not 0008's to keep or lose. That inventory
lives in `BRAND_JOBS` in `lib/palette.test.ts`, whose header says it is its one
home, and this decision does not move it.

**Brand gains a hue dial it never had.** The pair it replaces was lightness and
chroma over `var(--primary-hue)`, so under 0008 brand could not differ from
primary in hue at all without redeclaring the whole token — and hue is the axis
an identity most often wants to move. 0008's framing implies brand was already
independently authorable; in one of three channels it was not. That is a gain,
not a like-for-like swap.

**Primary's own mechanism is deliberately left open.** Whether `--primary`
should itself become a ramp-step alias rather than three dials is a separate
decision, and it is separable precisely because brand reads primary's
*resolved colour* rather than its dials. Primary can change shape later and
brand follows with no second record.

## What this rejects

**A plain alias, `--brand: var(--primary)`.** It fixes the contrast defect just
as completely, and it was the shape this decision started as. It is rejected on
the cost an adopter actually feels: it leaves a deployment that wants a
distinct identity fill hand-writing a whole `oklch(…)` and re-deriving from
scratch what the template had already worked out. That is worse customisation
than the two-dial model it replaces, which is not an acceptable trade for
fixing a contrast bug. Per-channel dials keep a rebrand at setting a number,
which is the entire point of the dial vocabulary this system runs on.

**Keeping the second pair and simply retuning it.** That treats 3.89:1 as a bad
number rather than as evidence about the mechanism. The pair's premise was that
the identity needs its own independent lightness; the only value it has ever
carried is a grey inherited from a ramp that no longer exists, which says the
template has no independent identity to express. A template that ships neutral
should say so, rather than encode a placeholder as a decision.

## Consequences

**Unbranded, `--brand` and `--primary` are the same colour.** The four identity
surfaces look exactly like the action fill until a deployment says otherwise.
That is the honest meaning of an unbranded template: it has one accent, not two
that happen to be set to different greys.

**Two guards in `lib/palette.test.ts` are invalidated and have to be
rewritten.** One asserts `--brand`'s resolved lightness and chroma equal the
`--brand-lightness` and `--brand-chroma` dials to six places; the other asserts
that brand and primary are more than a just-noticeable perceptual distance
apart. Both are impossible the moment no dial is declared, and the second was
the assertion that "`--brand` and `--primary` share the accent hue and nothing
else" — a claim this decision retires rather than breaks. They are the price of
the decision, not an oversight of it, and whoever lands the mechanism owes them
replacements that assert the new contract: brand equals primary when unset, and
diverges in exactly the channel a dial is set on.

**The identity fill now inverts with the theme.** It inherits primary's dial
pair, and a neutral primary must invert — near-black ink in light, near-white in
dark. Mode-invariance is the property 0008 chose a second pair to protect, and
it is genuinely lost by default. It returns the moment a deployment sets a
dial, which is the only circumstance in which there was an identity to protect.

**The failure mode is a leftover dial declaration, and it is silent.**
`var(--brand-lightness, l)` reaches its fallback only when *nothing* declares
that dial. A stray declaration left in a theme file reinstates the old grey
with no error, no failed build and no visible seam — the fallback simply never
fires. Anything relying on brand tracking primary has to hold the absence of
those declarations, not merely their value.

**Primary's mechanism stays a live question and that is now cheap.** Because
the derivation reads a resolved colour, the deferred decision about `--primary`
costs nothing to defer. Deciding it later changes one token and brand follows.
