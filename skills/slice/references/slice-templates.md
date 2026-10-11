# Slice Document Templates

The markdown companion `slice_tools.py doc` emits is a skeleton: title,
slides, cited cells. These templates say what the prose around it should
cover, per slice type. They are editorial guidance — adapt them to the
audience; `skills/slice/SKILL.md` § Hard rules bind them unchanged.

Headings below are ours, not any vendor's. Cell content is described with the
**function / form** pair the data model uses: *function* is what the cell has
to accomplish (role, responsibility, requirements); *form* is how it comes
across (communication, look, feel).

## Contents

- Journey summary (`journey`)
- Step summary (`step`)
- Lane spec (`lane`)
- Cell brief (`cell`)
- Custom (`custom`)
- Common to all

(Headings inside each template block are the template's own structure,
not sections of this file.)

## Journey summary (`journey`)

For: anyone who needs to feel the service from one actor's side — execs,
partners, a new hire.

```markdown
# <Actor> — <what they are trying to get done>

<One paragraph: who this actor is, what brings them here, what "done" means
for them. Persona, never a participant.>

## 1. <Moment>
<What the actor does, and what answers them. Name the cells' function; note
the form only where the form is the point (a message that reassures, a
screen that confuses).>

- `<lane>` @ `<step>` — `<cell key>`

## Where it gets thin
<Frames where the actor is carrying effort the service should carry. Each
bullet points at a frame number and its cells — no free-floating criticism.>
```

Close with the thin-spots section or leave it out entirely; do not pad it.
If nothing is thin, say the journey holds and stop.

## Step summary (`step`)

For: operational alignment — "at this moment, who is doing what".

```markdown
# <Step> — everything at once

<One paragraph: what this moment is, and why it is worth freezing.>

## Top to bottom
<Lane by lane, in row order: what that lane is doing, and what it depends on.
The reading order is the grid's order, which is the point of a step slice.>

## Hand-offs in this column
<Only interactions the blueprint records as dependencies. Source cell → target
cell, one line each.>

## Where it is fragile
<Lanes whose cell is empty here, or whose work depends on something with no
recorded dependency. Absence is a finding; state it as absence, not as a
guess about what fills it.>
```

## Lane spec (`lane`)

For: the team that owns the lane — scope, load, and where the lane is
carrying other people's work.

```markdown
# <Lane> — what this lane owns

**Owner:** <team, if the lane records one> · **Tools:** <if recorded>

## The lane, left to right
<Step by step: the function of each cell. Note where the lane goes quiet —
gaps in a lane are as informative as its cells.>

## What it depends on
<Incoming dependencies, cited. If the lane depends on something with no
recorded dependency, say it is undocumented rather than asserting it.>

## Load and thin spots
<Steps where the lane carries several cells at once, or is alone at a moment
the customer is waiting.>
```

## Cell brief (`cell`)

For: a working session on one cell — design, spec, or a decision.

```markdown
# <Cell content> — <lane> at <step>

**Where this sits:** <the journey around it, in one sentence: what precedes,
what follows, who is waiting.>

## Function
<What this cell has to accomplish. Requirements, responsibility, what it is
on the hook for.>

## Form
<How it comes across: communication, look, feel. Where form matters to the
outcome, say why.>

## Value
<Who gets what from it, one line per audience — from the cell's recorded
value props, referenced not quoted.>

## Dependencies
<Recorded dependencies in and out, both `leads_to` and `enables`. Cite each.>

## Open questions
<What the blueprint does not answer about this cell. Questions, not
speculation dressed as findings.>
```

A cell brief always includes the "where this sits" line. A cell described
without its journey placement is the orphan brief this template exists to
prevent.

## Custom (`custom`)

No template — the user chose the cells, so they have a structure in mind.
Ask what the set is for, then borrow the closest template above. Keep the
citation block per frame regardless.

## Common to all

- **Keep every frame's citation block** when you rewrite the generated doc.
- **Say "not recorded" out loud.** A slice that quietly skips a gap reads as
  a complete picture. The gaps are usually the reason the slice was asked
  for.
