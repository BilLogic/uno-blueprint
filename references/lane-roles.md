# Lane Roles

The semantic contract between blueprint content and rendering. Source of
truth: `src/lib/laneRoles.ts` (vocabulary + legacy shim) and
`src/lib/blueprintLayout.ts` (rendering + divider-line rules).

## The split: display name vs role

A lane has two identities:

- `display_name` (`lanes.name`) — free-form label in **any language**
  ("现场技术员", "Field Technician", "Compliance Review").
- `role` (`lanes.lane_role`) — a stable semantic key that drives rendering.
  `null`/absent = plain generic swimlane.

Never infer semantics from the display name. That was the old magic-name
contract; it broke every non-English blueprint.

## Canonical vocabulary

The set is **closed**: `lanes_lane_role_check` accepts exactly these eight
roles or `null`, and so does the IR. A lane whose role is not one of them is
refused at authoring time by `scripts/validate_ir.py` — an unconstrained
column is how a lane goes unclassified, and the divider lines are drawn from
the role.

`LANE_ROLES` in `src/lib/laneRoles.ts` holds the Label and Definition
columns. A role's **label** is the word the lane badge prints; its
**definition** is the sentence the badge's hover shows underneath, and it
opens past the label, which the badge above it has already said.

| Role | Label | Definition | Rendering | Typical lane |
| --- | --- | --- | --- | --- |
| `customer_actions` | Customer actions | The spine of the journey. The interaction line draws below it. | Text cells; **interaction line draws after this lane** | The spine actor's actions |
| `frontstage_actions` | Frontstage | Staff actions the customer can see. | Text cells; **visibility line draws after** | Staff actions the spine actor sees |
| `frontstage_touchpoints` | Frontstage touchpoints | What the customer meets: apps, documents, places and channels. | Touchpoint cells (one per newline-separated item); visibility line draws after it *unless* a `frontstage_actions` lane immediately follows (then the line follows the actions lane) | Touchpoints the customer meets directly |
| `backstage_actions` | Backstage | Staff actions out of sight. | Text cells; **internal interaction line draws after** it when a `support_actions` lane immediately follows | Staff actions out of sight |
| `backstage_touchpoints` | Backstage touchpoints | The tools and artifacts staff use out of sight. | Touchpoint cells | Touchpoints only staff meet |
| `support_actions` | Support | Teams, vendors and infrastructure behind the work. | Text cells; the internal interaction line anchors on it | Supporting teams, vendors, infrastructure |
| `partner_actions` | Partner | A party outside the service, acting where the customer can see them. | Text cells | A party outside the service, acting where the customer can see them |
| `storyboard` | Storyboard | The frames for each step, not text. A step's frames across the lanes are its strip. | Storyboard frame row (image cells, no text) | Journey frames |

## Line-anchoring semantics

The three classic blueprint divider lines are **anchored by roles**, not row
positions:

- **Interaction line**: after the `customer_actions` lane.
- **Visibility line**: after `frontstage_actions` (or `frontstage_touchpoints`
  when no actions lane follows it) — i.e. above the backstage lanes.
- **Internal interaction line**: after `backstage_actions` only when a
  `support_actions` lane comes next (marks the hand-off to support).

No role present → no line. That is valid: an internal-ops blueprint with no
customer lane renders as plain swimlanes with no interaction line.
**No role is a mandatory spine** — assign `customer_actions` to whichever
actor's journey is the spine (ask "whose journey is the spine?" during
elicitation), or to none.

## Touchpoint and storyboard lanes

- Roles `frontstage_touchpoints` and `backstage_touchpoints` render cell
  `content` as **touchpoints**: one touchpoint per newline-separated line
  (`"GIS Portal\nWork Order App"` → two touchpoints). A `cell_touchpoints` row
  attaches long-form copy, resources and a featured link to one touchpoint:
  its `name` is the touchpoint's label, and the row survives a rename where
  the old label-matched entry silently stopped being found. A "tech" lane was
  never only tech — it held the things a moment happens *through*, which is a
  touchpoint: an app, a document, a channel, a place.
- A touchpoint cell's `frame` is its **logo**: placing a touchpoint fills an
  empty frame with that touchpoint's icon. So the storyboard walkthrough — the
  step's stack, the canvas strip and the walkthrough deck, which share one
  roster — steps through every lane except the storyboard rows and these two,
  `frontstage_touchpoints` and `backstage_touchpoints`.
  A frame drawn for a moment comes from an actor lane; a logo is not a moment.
  Nothing is cleared to arrange that: the cell panel still draws the
  touchpoint's frame at logo size.
- Role `storyboard` renders `frame` and ignores text content. An empty
  storyboard row (null `frame`) is a valid default — see
  `skills/map/references/ingest-playbook.md` §6 for sourcing stage images.

## No custom roles

The vocabulary is closed, at the database and in the IR. A lane that means
something the eight roles do not name uses `null` (a generic swimlane) — a
"Stakeholders" band, an actor lane named for a person, a compliance review.
`null` is legal on purpose and is exactly how such a lane already rendered: no
role style, no divider anchored on it. The lane's meaning lives in its
`display_name`, which is free-form in any language and is what a reader
actually sees; the role only says what the renderer must do about the row, and
for these lanes there is nothing to do. The old advice to mint an org-defined
role (`physical_evidence`, `compliance_review`, `partner_ops`) no longer
holds, because an unconstrained column is how thirty-six support lanes once
went unclassified.

**Authoring refuses a ninth.** `references/ir-schema.json` carries the eight
as an enum and `scripts/validate_ir.py` errors on anything else, naming the
value, the lane it is on and all eight legal values. This closed with the
`2026.09.10` schema version: until then the schema took any
`^[a-z0-9][a-z0-9_]*$` and the validator passed
a ninth role in silence, so a document validated and was then refused by
`lanes_lane_role_check` part-way through its import — the value named, but at
the one moment its author could no longer act on it. A file authored before
that, carrying a role outside the set, is carried across by
`scripts/migrate_ir.py` (`to_2026_09_10`), which nulls the role and leaves the
display name alone; the scenarios it touches go back through review, because
a role is authored content.

All layout logic is role-agnostic where it can be: e.g. backward in-lane
loop corridors are computed from dependency geometry for ANY lane, `null`
role included (`laneHasInLaneLoopCorridor`).

## Adding a role

A ninth role is a deliberate act across several files, and it is not finished
until all of them agree — `scripts/tests/lane-role-roster.test.mjs` compares
every copy of the roster to the constraint and fails the build otherwise.
In order:

1. **The constraint.** A migration that drops and re-adds
   `lanes_lane_role_check` with the new value, and updates the
   `lanes.lane_role` column comment (it lists the values too). It stamps a new
   `schema_version`.
2. **The wire format.** The `enum` on `$defs.lane.properties.role` in
   `references/ir-schema.json`, plus that version in the `schema_version` enum
   and its step in `scripts/migrate_ir.py` — the hard rule of
   `references/customization.md` § The versioning rule.
3. **The validator.** `CANONICAL_ROLES` in `scripts/validate_ir.py`.
4. **The renderer.** `CANONICAL_LANE_ROLES` and `LANE_ROLES` (label and
   definition both) in `src/lib/laneRoles.ts`, the role table above, and a
   fill in `src/lib/blueprintTheme.ts`.
5. **The documents.** `docs/erd.mmd` (held to the constraint
   by `scripts/tests/erd-enums.test.mjs`) and `README.md`.

A role that only needs a different label, not different rendering, is not a
new role: rename the lane.

## Legacy name shim

Content that predates `lane_role` (rows with null role) is resolved through
`LEGACY_NAME_TO_ROLE` in `src/lib/laneRoles.ts`: exact display names like
`'Front Stage Tech'`, `'Customer Actions'`, `'Visual'` map to roles at render
time; a deployment adds its own spine actors to that map. The shim is for
legacy data only — **new IR must always set `role` explicitly** and never rely
on name matching. The validator warns on near-miss names that look like they
wanted a role (`'Frontstage Tech'`, `'前台技术'` → "did you mean
frontstage_touchpoints?").

## Guidance for assigning roles

- One `customer_actions` per path at most (the layout draws one interaction
  line); multiple actor lanes are fine — the non-spine actors get `null`.
- Keep touchpoint lanes as touchpoint roles; prose in a touchpoint lane reads
  badly.
- Row order is yours (`row` in the IR), but the conventional top-to-bottom
  reading is: storyboard → spine actor → other actors → frontstage
  touchpoints/actions → backstage touchpoints/actions → support actions.
