# The interface→schema map

Every word a panel puts in front of a reader, and the name behind it.
`scripts/retired-vocabulary.mjs` records the words that **changed**; this
records what every current word is **bound to**, the agreements included. A
table of divergences alone cannot say that the rest are fine — "not listed"
would mean both "aligned" and "nobody looked", and that ambiguity is the state
[#89](https://github.com/BilLogic/uno-blueprint/issues/89) was
raised about: *"how come we have inconsistent naming from front and backend
again (i.e., resources vs. links)?"* The complaint was never that the words
differ. It was that no document said which of the differences were on purpose.

The interface word is a **panel label** — the word a panel puts above a field,
a section, or a relation. For the cell panel those words are not written in JSX
at all: they are the `label` and `hint` of the cell field descriptors in
`src/lib/cellFields.ts`, and the cell rows of the table below are read from
those descriptors, so the word a reader sees and the word this map binds are
one string. Elsewhere the label is still written where the field is rendered.
The schema word is a `table.column`, or a bare table where
the label heads a whole relation rather than one field of it. The two **agree**
when they are the same word once case, spaces and a foreign key's `_id` are set
aside; singular and plural agree too, because the label over a relation names
the thing and the table names the collection. Anything further apart than that
owes the third column a reason.

## The binding

<!-- generated:binding — npm run interface-map -->

| The interface says | The schema says | Why they differ |
|---|---|---|
| **Content** | `cells.content` | — |
| **Summary** | `cells.summary`, `cell_touchpoints.summary`, `paths.summary`, `phases.summary`, `scenarios.summary`, `services.summary`, `steps.summary`, `touchpoints.summary` | — |
| **Owner** | `cells.owner` | — |
| **Perceived owner** | `cells.perceived_owner` | — |
| **Function** | `cells.function` | — |
| **Form** | `cells.form` | — |
| **Value proposition** | `cells.value_props` | `props` abbreviates this exact phrase and no other. A label is read once and a name is typed daily, so the panel spells out what the schema shortens. |
| **Touchpoint** | `touchpoints` | — |
| **Name** | `touchpoints.name` | — |
| **URL** | `touchpoints.url` | — |
| **Icon** | `touchpoints.icon_url` | The field shows the picture and offers Upload and Clear; nobody types an address into it. The column holds where the uploaded file lives, which is why it is a URL, and the label names the thing a reader sees rather than how it is stored. |
| **Role** | `cell_touchpoints.role` | — |
| **Dependencies** | `cell_dependencies` | The relation names both ends, because a dependency always runs from one cell to another. The tab is already standing inside a cell, so the prefix would be the one word on it that told a reader nothing. |
| **Follows** | `cell_dependencies.kind` | Names a VALUE read from one end rather than a column: these rows are `kind = 'leads_to'` arriving. The schema stores one row and the panel shows it twice, once from each end, so the label has to say which end a reader is standing at — and no column could be called this. |
| **Leads to** | `cell_dependencies.kind` | The same value from the other end — `kind = 'leads_to'` leaving, and here the label IS the value minus its underscore. What the pair carries that `kind` cannot is the direction, which is why the arriving end keeps a word of its own. |
| **Enabled by** | `cell_dependencies.kind` | The recorded kind, arriving — `kind = 'enables'` with this cell as the target. The same one-row-two-ends rule as Follows: without its own word, a reader standing at the target reads "Enables › A" as this cell enabling A, the exact inversion the rename ended. |
| **Enables** | `cell_dependencies.kind` | The word IS the value — `kind = 'enables'` leaving, the recorded dependency that never draws — and `kind` is the name of the place holding it. |
| **Also on this step** | `cells.content` | Not a field of anything: it heads the touchpoints standing in the same step that nothing on this cell points at, and each item under it is one name parsed out of a touchpoint cell's content. A touchpoint is not always technology, so the label says where the items stand rather than what they are. `content` names where the words live. |
| **Registry** | `cell_touchpoints.touchpoint_id` | The control names what a reader is choosing FROM — the deployment's touchpoint registry — and the column is the key the choice lands in. The same split `Actor` draws over `lanes.stakeholder_id`: the label is the pool, the name is the pointer. |
| **Evidence** | `evidence` | — |
| **Kind** | `evidence.kind`, `touchpoints.kind` | — |
| **Title** | `evidence.title` | — |
| **Note** | `evidence.note` | — |
| **Resources** | `resources` | — |
| **Actor** | `lanes.stakeholder_id` | The registry the key points into is `stakeholders`, and the word this vocabulary uses for a party standing in the room is actor: a lane names its actor, and a `team` is a stakeholder that can never be one. The label says the narrower word, which is the only one the board is about. |
| **Owner team** | `lanes.owner_team` | — |
| **KPIs** | `lanes.kpis` | — |
| **Tools** | `lanes.tools` | — |
| **Business impact** | `phases.business_impact` | — |
| **Operational requirements** | `phases.operational_requirements` | — |
| **Paths** | `paths` | — |
| **Status** | `cells.status`, `paths.status` | — |
| **Author note** | `paths.note` | `note` is this vocabulary's word for an author's aside, and the label says whose aside it is because it sits directly under Summary, which is the path's own sentence. That distinction is worth a word on screen and not worth a second column. |
| **Funding** | `business_models.funding` | — |
| **Pricing** | `business_models.pricing` | — |
| **Delivery cost** | `business_models.delivery_cost` | — |
| **Revenue model** | `business_models.revenue_model` | — |
| **Partners** | `business_models.partners` | — |
| **Examples** | `services.entity_examples` | The section heads a jsonb map, not a field, and the column carries an `entity_` qualifier the label drops: on the service panel the only examples in question are the board’s six entity kinds, so the qualifier is understood and the heading says the plain word. The six inputs beneath it name the kinds, not columns, so they carry no row of their own; this one row binds the whole map. |
| **Position** | `path_steps.position` | — |
| **Storyboard** | `lanes.lane_role` | The one row whose right-hand side is a VALUE rather than the name of a place to put one: `storyboard` is one of the eight `lane_role` admits, and this label heads the frames of the lanes carrying it. The word is in the schema; it is simply not a column name. |

<!-- /generated:binding -->

Thirteen rows out of forty-one carry a reason, and each one is a decision rather
than an accident. That is the claim the table exists to make checkable, and
[`scripts/tests/labels-name-their-columns.test.mjs`](../scripts/tests/labels-name-their-columns.test.mjs)
checks it two ways: every row names something the schema has, and a divergent
row carries a reason while an aligned row does not. It used to check two more —
that every label a panel says has a row, and that every row is a label some
panel still says — by scanning the app's JSX for label props. The cell panel's
words are no longer written there: they are the cell field descriptors in
`src/lib/cellFields.ts`, and the map's cell rows are read from those same
descriptors, so for a cell field a label with no row cannot arise — the
descriptor carrying the word *is* the binding. Rules a check cannot fail are
worse than absent ones, so the scan is gone. The pair that remains is the one
worth stating out loud. A reason recorded about a label that never diverged reads as
a decision and settles nothing, and a reason column with decoration in it is a
column readers learn to skip — taking the real ones with it.

**Two labels were renamed rather than reasoned about**, which is the other half
of what this table is for. The panel said **Text** where the column is
`cells.content`, and **Value** where it is `cells.value_props`; both columns
were already right while the words above them were not, so the labels now say
Content and Value proposition. Neither is a migration — a label rename moves
words on a screen — and neither needs a row in `scripts/retired-vocabulary.mjs`,
which records what the *schema* was called.

**`Resources` was the sharp one, and the answer to it was not a rename.**
`cells.links` carried two things a reader meets under two names — the `url`
entries the Resources tab lists, and the `tech_description` entries the grid
draws as a touchpoint's prose. One column, two concepts, named after neither.
No label could fix that: `Links` over the tab would promise both and show one,
and `Resources` on the column would be wrong for half its rows. So the map
carried the divergence as a recorded decision and said the fix would be a
schema change rather than a naming one.

`21000113000000` made that change. `resources` holds what a cell — through
one of its touchpoint placements, or on its own — points at, `cell_touchpoints`
holds the per-moment summary and role, and `cells.links` is gone. **The row that
carried the reason is deleted rather than rewritten**, which is what that
promise meant: `Resources` and `resources` are the same word, so the row that
remains is an aligned one like `Evidence`, and rule 4 forbids it a reason. The
label stays in the map because the map is where a reader looks the word up — a
word nobody bound to a name is the defect the map exists to catch — but the
divergence it was holding open has stopped existing rather than acquired a
better excuse.

**The subject is panel labels, and that is narrower than "words on screen" on
purpose.** *Line of visibility* and *line of interaction* reach a reader as
drawings rather than as the name of a field, and are derived from lane roles at
render time, so there is nothing to bind them to. So it is for every heading
that names a view rather than a field. A word that heads no field has no name
to be bound to, and a rule pretending otherwise would be a rule nobody could
satisfy — which is the failure mode that gets a check deleted rather than
fixed.

## What the catalogue says

The half above is a decision about words. The schema carries prose of its own —
a `COMMENT ON` for most of the names a label binds — and this document counts
those rather than reprinting them. A comment is the catalogue's sentence, and
reprinting it here would make this a second copy that starts drifting the day
it is written; two of them are already stale in a way the sweeps over this tree
cannot see. So the number, and the gaps by name, because a column an agent
reads with nothing written about it is a gap and hiding it would make this
document look complete.

<!-- generated:coverage — npm run interface-map -->

35 of 46 names carry a comment in the catalogue. Read them there — `\d+ <table>` in psql, or the `COMMENT ON` statements in the dump.

11 that carry none:

- `cell_touchpoints.summary`
- `phases.summary`
- `scenarios.summary`
- `services.summary`
- `evidence.kind`
- `evidence.title`
- `business_models.funding`
- `business_models.pricing`
- `business_models.delivery_cost`
- `business_models.revenue_model`
- `business_models.partners`

<!-- /generated:coverage -->

**The enforced half is `LABEL_COLUMNS` in `scripts/interface-schema-map.mjs`,
and this document is rendered from it** rather than kept beside it. That is the
one thing this map does differently from the rename map: two hand-kept halves
need a parity test, and a generated half cannot disagree with its source, so
what CI holds is that the document is what the sources render —
`npm run check:interface-map`. What a parity test still buys, and what
`scripts/tests/labels-name-their-columns.test.mjs` keeps, is the RENDERING: a
reason dropped on the way out, or one name lost from a multi-name row, is a
difference `--check` cannot see, because `--check` compares the document to the
same render.
