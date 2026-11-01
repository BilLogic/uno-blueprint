# Elicitation Protocol — the co-creation question script

The ordered question script for building a blueprint conversationally.
`skills/map/references/cocreate-playbook.md` owns the overall flow; this file is the
script itself. Adapt wording freely; keep the order and the branches.

## Q0 — Right-sizing branch (always first)

> "Are we mapping one specific flow (like 'how refunds work'), or a whole
> service with multiple scenarios?"

- **Single flow** → auto-wrap: default service named after the org,
  one phase ("Core"), one scenario. Ask Q1, then go straight to Q4.
- **Whole service** → continue with Q1.
- **Huge / multi-actor / "everything we do"** → Q1, then outline first (Q2–Q3
  fast, as a sketch), then commit to **one scenario per session**; record the rest as
  `pending` in `blueprint-workspace.json`.

## Q1 — Locales

> "One language or two? If two, which is authoritative for domain terms?"

Asked before any cell is written, so every cell after it is captured in each
language as you go; flag domain terms (e.g. 灯杆/配电箱) for a native
review pass rather than silently machine-translating.

## Q2 — Service

> "What's the service called, one sentence on what it does?"

## Q3 — Phases & scenarios (the skeleton)

> "Walk me through the big stages a user/org goes through with this service,
> start to finish. Does the end loop back to a stage?" (→ phases, `loops_to`)
>
> "Within each stage, what are the concrete situations or tasks worth
> mapping? Name them like episodes." (→ scenarios)

Present the resulting outline as markdown; get a nod before proceeding
(the skeleton preview gate).

## Q4 — The spine question (per scenario; ⚠ never skip)

> "Whose journey is the spine of this scenario — whose experience are we
> reading left to right?"

The spine actor's lane gets `customer_actions`. Probe when non-obvious:
B2B ("the buyer, the end user, or your ops team?"), internal-ops ("is there
a 'customer' here at all?"). **"Nobody" is a valid answer** — no
`customer_actions` lane, no interaction line.

## Q5 — Steps

> "From the spine actor's view, what happens first? Then? …until it's done."

Aim for 5–15 named steps; merge micro-steps, split epics. These become
scenario-scoped columns.

## Q6 — Lanes

> "Who else acts in this scenario — people, teams?" (actor lanes)
> "What systems/tools does the spine actor touch directly?" (`frontstage_touchpoints`)
> "What runs behind the scenes?" (`backstage_touchpoints`)
> "Who/what supports it all — vendors, infra, internal teams?" (`support_actions`)
> "Do you want an image row for snapshots per step?" (`storyboard`)

Assign roles per `references/lane-roles.md`. The vocabulary is closed at
eight, so non-spine actors get `null` — a generic swimlane, named by its
display name in whatever language the room speaks.

## Q7 — Cells (walk the grid)

Per lane, left to right: "At step X, what does [lane] do / which systems are
involved?" Empty cells are normal — don't fish for filler. Capture detail
the user volunteers in `description`, not by bloating labels.

## Q8 — Paths

> "That was the way it's supposed to go. What actually goes wrong, and
> what's the workaround?" (→ `exception` and `variant` paths)

For designed-vs-reality comparisons: make it two labeled variants
(`variant_label`, layout `stacked`) and ask for the two labels.

## Q9 — Dependencies

> "Are there hand-offs worth drawing an arrow for — where one cell kicks off
> another?" Only where arrows add information. A hand-off may land on another
> path or scenario of the same service (a review that leads to a weekly
> report elsewhere): list it on the source's path and name the target's
> `path` (and `scenario`). Never across services.

## Chunking checkpoint (after each scenario)

Validate (`scripts/validate_ir.py` → exit 0), mark `drafted`, then:
> "Scenario done. Continue with [next] now, or stop here? Progress is saved
> per scenario."
