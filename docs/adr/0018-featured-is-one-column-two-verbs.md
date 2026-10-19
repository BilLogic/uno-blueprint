---
summary: A featured link is one of its owner's buttons, held by one boolean rather than a role enum. The other half — a featured attachment as the owner's preview — is superseded: a cell's featured image is its frame.
---

# 18. Featured is one column, two verbs

**Status** Accepted — 2026-09-02. Moved into this repository from
BilLogic/plus-uno-blueprint ADR 0011 on 2026-09-10 (#551); the number
here is this repository's. **Partly superseded — 2026-09-13 (#713).** The
link half stands: a featured link is one of its owner's buttons. The
attachment half does not: a cell's picture is no longer a featured
attachment but its **featured image**, which is `cells.frame` (see
"Featured image" in [CONTEXT.md](../../CONTEXT.md)). The panel says "Set as
featured image" over a picture, and nothing says "Set as preview" any more.
The record below is kept as it was decided.
**Context** `src/lib/resourcePresentation.ts`,
BilLogic/plus-uno-blueprint#271,
BilLogic/plus-uno-blueprint#273,
BilLogic/plus-uno-blueprint#276

## Context

A placement, or a cell, can point at any number of resources
(BilLogic/plus-uno-blueprint#271). What it LEADS with — the picture the panel
opens on, the buttons under it — is decided by one boolean on the resource
row, `featured`, and read through the resource's `kind`:

- a featured **attachment** is the owner's **preview**: at most one per
  owner, held by a partial unique index;
- a featured **link** is one of the owner's **buttons**, named by its host:
  any number.

When this was decided, the panel said "Set as preview" over an attachment and
"Set as button" over a link (BilLogic/plus-uno-blueprint#273); the column underneath says
`featured = true` for both.

## Why one column and not two, or an enum

The obvious alternatives were `preview_id` on the owner and `is_button` on
the link, or a `role in ('preview', 'button', 'none')` on the resource. Both
encode on the row a fact that is already there: an attachment cannot be a
button and a link cannot be a preview, so the second word is always
determined by `kind`. A role enum would admit the two contradictory rows
(`kind = 'link', role = 'preview'`) that the split forbids by construction,
and a pointer on the owner would need a second write to stay in step with the
row it points at — the shape that made the placement's old `screenshot` and
`url` columns drift from the resources copied out of them
(BilLogic/plus-uno-blueprint#276).

The author's decision is one bit: *lead with this*. The reader sees two
verbs because the two kinds are shown two ways. Keeping the bit on the row
means "unset" is the same write whichever verb it undoes, the inverse is
`restore_featured_resources` over `{id, featured}` pairs whatever the kind,
and a resource carries everything about itself.

## Consequences

The first two consequences below describe the attachment half, and are
historical since the supersession above; the third still holds for links.

- The "one preview per owner" rule is a partial unique index over
  `(cell_touchpoint_id) where featured and kind = 'attachment'` and its
  cell-owned twin, not a foreign key. Featuring a second attachment first
  clears the first in the same transaction (`set_featured_resource`); a
  restore writes `false` rows before `true` rows for the same reason.
- A reader who wants "the preview" reads `featured and kind = 'attachment'`,
  never `featured` alone. `featuredPresentation` is where the app does this
  once.
- The plausible "fix" — adding `role` so the verb is stored — would store a
  second copy of `kind`. If a third kind ever needs a third verb, it gets
  one in the presentation layer, and the column stays a bit.
