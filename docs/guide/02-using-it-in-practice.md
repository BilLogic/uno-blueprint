---
summary: What a designer or PM actually does with a mapped service — checking it still describes reality, tracing a change through it, cutting the view one audience needs, and comparing two versions of a journey.
---

# Using it in practice

**For** the designer or PM deciding whether, and how, this fits their week.
**Answers** what do I do with it?

## 1. Four situations

In the order the skills come up once a service is mapped — check it, trace a
change through it, cut a view from it — plus the comparison the app does on
its own.

**Checking the blueprint still describes reality.** Services change faster
than the artefacts that describe them. `ub:audit` runs its roster and
hands back findings to triage: gaps behind frontstage promises, channels
that disagree, moments nobody owns.

**Scoping a change.** Someone proposes removing a step. Before estimating,
you want to know what else touches it. `ub:whatif` walks the dependency
graph from that cell and returns the cells the change would reach and the
assumptions it would break, on a copy. Nothing moves until you accept it.

**Bringing a stakeholder up to speed.** A team needs the part of the
service that concerns them, not all of it. `ub:slice` takes that view —
one lane, one step, one journey — as a document that still points back at
the cells it cites, so it cannot quietly drift from the blueprint.

**Comparing designed against actual.** Two paths in one scenario, side by
side, column by column. This is the service-design move of comparing the
intended journey with the observed one, done on shared data rather than in
two documents that were true on different days.

## 2. Ways in

![Ways into the blueprint](../assets/four-ways-in.svg)

| Way in | Who it is for | What it can do |
| --- | --- | --- |
| the app | anyone | read, compare, present |
| the in-app agent | the person already reading | ask, and it drafts the change |
| agentic tools | whoever works in an IDE or CLI | map and audit with the `ub` skills |
| a Slack bot you build | everyone else | answers, and links to the exact cell |

The first three read and write, and this template ships all three. The fourth
is a shape rather than a component: **nothing here is a Slack bot**, and the
row names Slack because that is where a chat surface over a blueprint usually
lands. What makes it buildable in an afternoon is the row below it — the bot
reads what is published, holding only the publishable key, so it needs no
write path and no secret of its own.

What enforces that is the account each surface uses, covered in
[guide/04](./04-operations.md).

## 3. Presenting and sharing

A slice enters presentation mode as one slide at a time on a dark surface,
with the filmstrip along the bottom and a locator showing where the slide
sits on the blueprint. Print and PDF come from the same place.

For sharing outside the team, deploy read-only: the app builds to a plain
`dist/` and a published blueprint answers reads without any account at all.
