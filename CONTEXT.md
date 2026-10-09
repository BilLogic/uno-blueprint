# Domain language

Every term this repository uses to mean something particular, defined once.
Definitions only: what a word denotes, not how to use it. Procedure lives in
`docs/`, the schema in `references/data-model.md`, and the routes to both in
`INDEX.md`.

A term is defined here when getting it wrong changes what an agent writes to
the database. Where a term is spelled differently in the database, the
blueprint file and the app, every spelling is given.

**This file is definitions and nothing else.** That constraint is its whole
value: an agent or a person can read it end to end before touching anything,
and it stays readable because it never grows a second job. It said so while
three of its six sections were something else, which is how a promise nothing
enforces ends up. `scripts/check-glossary-only.mjs` holds it there now, so the
sentence has a build behind it rather than a habit.

Three reference sections used to live here and now live where they are
enforced. The rename map is
[`scripts/retired-vocabulary.mjs`](scripts/retired-vocabulary.mjs), the one
list three checks read, and its header carries why each name went and which
renames the word lists deliberately leave out. The four words retired as
identifiers rather than as words are the header of
[`scripts/check-retired-identifiers.mjs`](scripts/check-retired-identifiers.mjs),
beside the exemption list that applies them. Every panel label and the column
behind it is
[`references/interface-schema-map.md`](references/interface-schema-map.md),
generated from the list CI acts on.

## The application

**Template** — the canonical application: its code, its schema and its defaults.
Published and installable, and the one codebase every deployment runs. The
Template is called Uno Blueprint.

**Deployment** — an installation of the template that supplies its own content,
brand and data through its config, and authors no application code of its own
beyond the residents it still holds. A Deployment is named for its owner: the
owner's name, then Uno Blueprint (Acme Uno Blueprint, say).

**Overlay** — the deployment's source tree laid over the package's, per path:
for a path under the application alias, the deployment's copy if it exists,
else the package's.

**Resident** — a file still in a deployment's source tree, standing for the
package's file at the same path. Every resident is listed with a reason —
owned, or diverged with a ticket.

**Sample registry** — an offline board's content: every path of every
scenario, keyed by scenario id, read whenever no database is configured. A
deployment supplies its own on `sample.blueprints`, beside the `sample.nav`
that lists those scenarios; omitted, the package's own stands.

**Offline board** — one installation's sample registry, settled and indexed:
the value the deployment config provider holds and hands down its tree, and
what every no-database lookup takes as its argument. One per tree rather than
one per process, so two providers hold two boards.

**Subject** — a named tree a check measures, with its rule: where its root is,
which files are its, and what "cannot see the subject" means there — a skip
said out loud, or a failure. The sweep answers eight (the application, the
prose, the scripts, the migrations, the reference surface, the package's
reference documents, a deployment's seed, and the commit); a check names one,
receives its files, and judges. A check's own location is never the root: the
tree it runs in is.

## The blueprint

**Service** — the whole thing being blueprinted, and the top container. One
service per deployment, normally.

**Phase** — an ordered stage of a service. A phase may point back at an
earlier phase (`loops_to_phase_id`), which is how a renewal or a repeat visit
is modelled without duplicating the journey.

**Scenario** — a situation within a phase, and the unit a reader navigates.
A scenario owns its steps and its paths.

**Path** — one route through a scenario. A path is named for the *condition*
that routes you down it, never for the activity — the scenario already said
that. Exactly one path per scenario is the `happy` route, the one taken when
nothing intervenes; the others are a `variant` (a different but equally valid
route) or an `exception` (a route taken because something went wrong). A path
is an **alternative, not a stage**: the paths of a scenario are read beside one
another rather than after one another, and nothing connects across them.

**Step** — a column. Steps are scenario-scoped and shared across the paths of
that scenario; a path selects the steps it uses and their order.

**Lane** — a row, holding one actor's activity across the steps. A lane's
display label is free text in any language; its behaviour comes from a
separate semantic role key (`lane_role`), which is what decides colour,
whether cells render as pills, and where the dividing lines fall.

**Layer** — *not* a domain word, and listed here because it is the one this
vocabulary keeps colliding with. A layer is anything stacked, staged,
composited or tiered: the CSS cascade's `@layer`, a composited paint layer,
the opaque cover a boot skeleton draws over the sidebar, a rung of the canvas
reveal, a design-token tier, an architectural tier such as the tool layer.
The table `layers` became `lanes`, which retired the NAME and not the English
word — a layer is never a row of the board, and a lane is never stacked on
anything.

**Cell** — what one actor does at one moment: the content at the intersection
of a lane and a step on a path. A cell is the unit everything else points at
— a slice cites cells, a finding names cells, evidence attaches to a cell.

**Storyboard** — the lane that draws the service rather than describing it.
`lane_role = 'storyboard'`, one of the roles the lane-role constraint admits.
Its own cells are empty: a storyboard cell's face is the *strip* below it,
drawn from the cells beside it.

**Frame** — one image on one cell. Column `cells.frame`. A cell outside the
storyboard holds at most one. A frame is never a row of a slice; that is a
*slide*.

**Featured image** — the one picture a cell leads with. It **is** `cells.frame`:
one slot per cell. It may be a storyboard illustration, a screenshot, one of the
cell's attachments, or its touchpoint's logo — whatever a person chose. What is
stored is what shows; nothing is substituted at display time. A cell panel
draws every one of them; the *strip* is the one reader that leaves some out.

**Strip** — a step's frames, read across the lanes: the script for that moment.
**Not a column.** It is derived at render time from the frames of the step's
cells, which is why a strip and the frames it is made of cannot disagree. It is
the step's frames **less the storyboard rows and the touchpoint rows**: the
storyboard row is the artwork the walkthrough already shows, and a touchpoint
cell's frame is that touchpoint's logo rather than a drawn moment. A *slide*
shows a strip too, and its rule is its own: every cell the slice cites, plus
that step's storyboard cell.

**Touchpoint** — a thing a moment happens through: an app, a document, a
physical object, a channel. One `touchpoints` row per name across the whole
deployment — the registry — carrying the touchpoint's kind, summary and home
once, not per cell; a service has a touchpoint exactly when one of its cells
places it (ADR 0003).

**Placement** — one touchpoint used at one cell: a `cell_touchpoints` row with
the summary and role for THAT moment, and the resources it points at hanging
off it. A placement names its touchpoint one of two ways and exactly one — by
`touchpoint_id` into the registry, or by `name` alone.

**Name-only placement** — a placement whose touchpoint the registry lacks. It
is still a placement: drawn dashed on the board, opening the same panel, and
offered "Link to registry" there. Never matched to the entry it resembles by a
rule; the choice is the author's.

**Stakeholder** — an actor in the service: a recipient, staff, a partner, a
provider or a team. One `stakeholders` row per name across the whole
deployment — the cast list — carrying the actor's kind, summary and aliases
once; no service owns one, and a service "has" an actor exactly when one of
its lanes names it (ADR 0003). A lane names its actor by `stakeholder_id`; a
structural lane — the storyboard, the touchpoint rows — names nobody.

An actor may be *part of* another — `part_of_id` — so a deployment that
names a function on one lane and a sub-function on another can still ask
what the whole owns. Exactly one level: an actor that is part of
something is part of nothing further. A lane
always names the specific actor, never the one it rolls up into.

**Status** — how far along a cell or a path is, on one shared six-value
vocabulary, the `entity_status` domain: `proposed`, `planned`, `built`,
`live`, `at_risk`, `deprecated`. Default `live` — a current-state blueprint
documents what is in use. Paths share it deliberately; a second vocabulary for
the same question drifts from the first within a month.

**Spec** — the descriptive detail hanging off a board object, as opposed to
its place on the board. `cells.function` / `form` / `value_props` / `owner` /
`perceived_owner`; `phases.business_impact` / `operational_requirements`;
`lanes.kpis` / `owner_team` / `tools`; and `business_model` for the service.
Four levels, one word.

**Scenario, step and path own no spec.** Scenario and step each open a detail
panel and fill it entirely from structure and from their cells; a path adds
`summary`, `note`, `kind` and `status`, and nothing that describes what it is
like. Whether that is the design or the backlog is undecided; the four levels
above are what exists.

Structure is *where a thing sits* — a cell's lane, step and path — and moves
only through an authoring RPC. Spec is *what it is like*, and carries a
column-scoped grant so a panel can edit it without opening the board's shape to
the same path. That split is why the word is load-bearing: `skills/audit`
instructs an agent to read "the spec columns" and skip gracefully when they are
empty, and until now this file had never heard of them.

**Not a UI word.** The interface says Function, Form, Value proposition,
Owner — never "spec fields". The ban is on the *interface*, not the glossary,
and reading it as both is how a word the skills are told to use went undefined
on both sides.

**Cell field** — one column of a cell, with everything the application says
about it: the label and hint a person sees, the group (structure, content or
spec), the write route, the argument name the agent sets it under, and
whether the canvas budget applies. The **cell field list** is the one place
those are said; what reads or writes a cell's columns derives from it.

**Line of visibility** — the divider between what the recipient of the service
can see and what they cannot. It is derived from lane roles rather than
stored: it draws below the last customer-facing lane. Its companion, the
**line of interaction**, separates what the recipient does from what the
service does, and draws below the **last** lane holding the recipient's own
actions. The recipient's side is a band and can be several rows deep, so a line
drawn once per such row would not be a boundary: a second actor row on the
recipient's own side extends the band rather than dividing the board again.

**Dependency** — a directed edge from one cell to another on the same path.
Two kinds, and the difference between them is whether the edge draws.

**Leads to** — the drawn kind (`kind = 'leads_to'`): this cell makes that one
happen. A handoff, rendered as an arrow.

**Enables** — the recorded kind (`kind = 'enables'`): this cell makes that one
possible without causing it. A precondition, never drawn, because a blueprint
in which every relationship is an arrow cannot be read. Both kinds read
source-first: `A enables B` puts the precondition at the source, the same end
`A leads_to B` puts the cause. (The `needs` that `21000114000000` retired put it at the target, so
those edges turned around in `21000114000000`.) The panel names each end:
**Follows** and **Leads to** for the drawn kind, **Enabled by** and
**Enables** for the recorded one.

> The test that separates the two: remove the other cell and ask what happens.
> If this one never starts, that was a `leads_to`. If it starts but goes wrong,
> that was an `enables`.

The retired values — `cell_dependencies.kind = 'trigger'` and
`cell_dependencies.kind = 'needs'` — are values, not identifiers, so the
identifier sweep has no fragment to key on and the copy sweep no reader-facing
word: a database *trigger* is a live subject in these documents, and "needs"
is English. `scripts/check-dependency-kinds.mjs` holds them instead, across
every rulebook tree an agent or reader follows — in their code-span form, and
in the short list of phrases where either word can only be a dependency kind
("trigger-vs-needs", the slashed pair, either word beside "edge"), which is
what caught the two documents that spelled the pair with no backticks at all.

The same is true of `scenarios.layout = 'side-by-side'`,
`scenarios.layout = 'integrated'`, `paths.kind = 'unhappy'` and
`paths.kind = 'alternative'`, which `21000116000000` folded into `stacked`,
`exception` and `variant`, of `scenarios.layout = 'single'`, which
`21000117000000` folded into `stacked`, and of `resources.kind = 'other'`,
which `21000118000000` folded into `attachment`: values, so no fragment and
no copy word. `cell_touchpoints.url` and `cell_touchpoints.screenshots`, which
`21000119000000` moved into `resources` as a featured link and attachments,
retire no fragment either: `url` is a live column on `resources`, and
"screenshots" is English wherever a render check takes them.
`scripts/value-set-claims.mjs` holds them — a list in any swept document
that names one is stale, unless the sentence records the retirement and
cites the migration — and holds every documented value set to the CHECK
that defines it, read off the schema dump.

## What the skills produce

**Records about the board** — `evidence`, `audit_findings`, `slices`, `slides` hold
what is said *concerning* the board rather than squares of it. Evidence and
findings concern cells directly; a slice reaches cells through the slides it
presents. Evidence, findings and slices are hard-bound to the service; a slide
has no direct service binding and is hard-bound only to its slice. The exact
keys and constraint topology live in `references/data-model.md`.

**There is deliberately no collective noun for the four.** Two were tried and
both claimed something untrue of half the set;
[`scripts/retired-vocabulary.mjs`](scripts/retired-vocabulary.mjs) records
which, and why. What they have instead is an OWNER, and the write surface says who — because a
table's owner is whoever may change it, not whoever reads it most:

| record | written by | belongs to |
| --- | --- | --- |
| `slices`, `slides` | `create_slice`, `update_slice`, `replace_slides` | the slice |
| `audit_findings` | `create_finding`, `update_finding` | the audit |
| `evidence` | `create_evidence`, `update_evidence` | the cell |

**Evidence belongs to the cell**, not to whichever reader reaches for it. It
is research provenance — recorded when a blueprint is imported, cited by a
slice, weighed by an audit — and no ONE reader's work is what it is for, so
naming it after the audit would be wrong in the direction a slice would notice
first. The cell is the claim the source grounds, and it is the one thing every
evidence row the agent can write names.

That row said **nobody** until the agent gained `create_evidence` and
`update_evidence`, and "nobody" was a fact about the roster rather than a
position: the panel was the only writer, so no tool named the table. The
moment one did, the honest answer had to be a real owner — which is what
rule 2 of `who-writes-what` exists to force.

**And no record at all belongs to what-if**, which is worth saying rather than
leaving as an absence: it walks the dependency graph and returns a trace, on a
copy. Where it does record something it records a finding, and a finding is the
audit's — the what-if skill says so itself. So the vocabulary still has to be
able to say **nobody**; what-if is what it says it about, which is why the owner
column is prose rather than a name drawn from a list of readers. A category
covering all four was always going to strain, because one of the four readers
has nothing of its own in it.

So write the owner you mean — *the slice's record*, *the audit's findings*,
*the cell's evidence*. Where a statement genuinely covers all four — a grant, a
migration's scope — enumerate them, which is four words against a category name
that has twice had to be replaced.
`scripts/tests/who-writes-what.test.mjs` holds the table above against
the write surface, so a renamed tool or a new write with no owner fails
`npm test` rather than leaving this table quietly wrong.

**`business_model` is not one of them**, and the schema settles it rather than
taste: it holds no cell reference of any kind. It is the service's spec row —
which is why it belongs under **Spec** above. Its fields live in
`references/data-model.md`.

**Slice** — a saved one-dimensional cut through the grid, taken for one
audience: an actor's journey, a single moment, one lane, one cell, or a custom
selection. A slice *references* the cells it presents and never copies them,
so the blueprint stays the single source of the text.

**Slide** — one row of a slice: one moment of it, as a reader meets it. Table
`slides`, carrying `position`, the cited `cell_ids`/`cell_keys`, a `title`, a
`caption`, and an ordered set of images (`slide_images`) drawn from the cells
it cites and from uploads to that slide. A slide nobody has touched shows
every cited cell's frames. A slide and the board may differ only where
somebody said they should. Its title is a `title` and not a `name`
under the rule the board keeps throughout: `name` is for structure a reader
navigates, `title` for authored content a reader reads.

**A slide is not a frame, and a screen is neither.** A frame is one image on
one cell; a slide is a row of `slides`. `screen` is ordinary English — a
display, a viewport, the surface a reader happens to be looking at — and never
a name for either. Letting the schema's own prose call a slide a frame is the
defect the `slides` rename fixed, which
[`scripts/retired-vocabulary.mjs`](scripts/retired-vocabulary.mjs) records;
calling one a screen is that defect wearing a third word.

The slice AUTHORING FORMAT says the same words as the columns it writes:
`kind`, `summary`, `authorship`, `position`, `slides`. It used to say `type`,
`description`, `origin`, `order`, `frames` and `narrative`, so an author had to hold two
vocabularies to write one file, and the tooling carried a comment explaining
the split. There is no alias for the old keys — a file that uses one is
refused by name, told which word replaced which.

**Finding** — one triageable observation about a blueprint, raised by a
consistency check or a change trace. A finding carries a severity, an
impact and an effort, the cells it concerns, and a triage state: open,
resolved, or dismissed. It is a claim
about the blueprint, not a change to it — nothing acts on a finding until a
person triages it.

**Severity** — how wrong a finding says something is: `info`, `warn` or
`critical`.

**Impact** — how much fixing a finding matters to the service: `low`,
`medium` or `high`.

**Effort** — how much work fixing a finding takes: `low`, `medium` or
`high`. A finding recorded before impact and effort existed has neither,
and is **unrated**.

**Priority group** — where a finding falls in the audit report, read off
its impact and effort: Do first (high impact, low effort), Plan (high
impact, more effort), Quick wins (lesser impact, low effort), or Later
(everything else, unrated findings included).

**Evidence** — one provenance record attached to a cell: where the claim in
that cell came from, and when it was observed. A cell with no evidence is an
assumption; that state is derived from the absence of evidence rows and is
never stored as a flag.

## Five words for arrival

Five words for *not there yet*, naming five different things. Two belong to the
shell, one to the canvas, one is a duration, and one is about the data rather
than the screen. They are set out together because apart they read as spellings
of one idea, and they are spelled here in lower case as the code spells them:
each is a value or a constant, not a thing on the board. Where the halves they
belong to meet is `docs/adr/0007-the-canvas-and-the-shell-run-on-separate-clocks.md`.

**entrance** — the shell's from-state as it arrives: `idle`, `pending`, `shown`.
`pending` lasts a single frame, and exists so that the fade which follows has
somewhere to start. Nothing is waiting on data while it runs, which is what
separates it from every other word here.

**boot** — the sidebar's once-per-entry latch: `off`, `armed`, `skeletoning`. It
answers whether this is the reader arriving or a surface they have already
loaded coming back — a question no rung of the canvas's ladder can answer,
because a canvas that stayed mounted does not restart that ladder, and one that
remounts does. `skeletoning` was called *staging* until the collision with the
rung below was named.

**revealStage** — the canvas's ladder, six rungs from `CANVAS_REVEAL_STAGING` to
`CANVAS_REVEAL_DONE`. It says how much of the board is painted and nothing about
the shell around it. The canvas is the only thing that sets it; everything else
reads it.

**hold** — `SKELETON_HOLD_MS`, 250 ms: how long a surface may load before its
skeleton is allowed to paint. **A duration, not a state** — the one word here
measured in milliseconds rather than spelled as values, and the reason a fast
load shows no placeholder at all instead of one that flashes.

**status** — what a query returned: `loading`, `ready` or `error`. It is a fact
about the data and not about the screen, so a bar can be `ready` while the
sidebar is still `skeletoning` without the two contradicting each other. **Not
the board's *Status*** above, the six-value word for how far along a cell or a
path is: that one is stored in a column, this one only ever describes a read.

## The camera

Three words for a camera move that somebody is waiting on. They belong to the
move itself rather than to any one caller: the canvas publishes them, and the
desktop navigation tools, the agent's cell focus and the phone's ✦ sheet all
read the same words. Where the halves they cross meet is
`docs/adr/0028-a-jump-is-awaited-through-one-module.md`.

**Jump** — one camera move toward a named target, awaited by whoever asked for
it. The target is a scenario, a phase or a cell. The awaiting is what
separates a jump from any other camera move: a reader's own pan answers to
nobody, while a jump is asked for and answered.

**Flight** — the camera's own move between two transforms, run by the
viewport: the thing a jump verdict is a claim about. A jump is asked for and
answered; a flight is the movement itself, and a jump may involve none at all
— a cell the board does not hold is answered without anything having flown.
**Not a persistence flight** — `AgentPersistenceFlight` in
`src/lib/agent/persistenceReadiness.ts` is one run of a piece of parked
database work, and nothing moves on screen for it.

**Jump verdict** — a jump's one settled answer, in four words: `landed`,
`cancelled`, `superseded`, `unanswered`. The first three are the canvas's own
claim about a flight it owned; `unanswered` is what silence is called, and
belongs to the deadline alone. **Not a check's verdict** — that word is how a
check's run came out, four values of its own, defined in
`docs/engineering/checks.md`. And not a status: a jump verdict is said once,
about one camera move, and describes a move rather than a thing on the board.
**And not persistence's `superseded`** — there the word asks whether the
account a read was made for is still the one signed in, and the answer is a
boolean a piece of work reads about itself rather than a verdict anyone
publishes.

## The writing vocabulary

Five words for how a document is written and reached, shared with the
deployment this template was generalised from so that one harness review of both
repositories uses one language.

**Pointer** — a line held in always-loaded context that names material outside
it and the branch that should reach it: a row of `AGENTS.md` § Skill routing, a
path beside a rule that holds for every skill. Its wording, not its target,
decides whether a session gets there. What a pointer points at is a
*reference* — which in this repository is also the name of a folder, and
`references/` is exactly that: the rulebook a skill reaches by pointer.

**Ladder** — where a piece of writing sits by how immediately a session needs
it: an in-file step, then an in-file reference, then a **disclosed** reference
behind a pointer. A skill's `SKILL.md` is the top rung of its own ladder, and
the reference files it names are the rungs below. **Not the canvas's reveal
ladder** in § Five words for arrival, and **not the type ladder** in § The type
system.

**Disclosed** — a reference pushed out of the always-loaded tier and behind a
pointer, loaded only when that pointer fires. Everything under `docs/`,
`skills/` and `references/` is disclosed; `AGENTS.md` is the tier itself, and
`scripts/always-loaded.mjs` is the list that says which is which.

**Leading word** — the first word of a routing item, chosen so that it is the
word carrying the branch — *vocabulary*, *routing*, *editing* — and front-loaded
so a scanned pointer triggers on it. `scripts/check-pointers.mjs` is what holds
it there.

**Sprawl** — a document too long even when every line of it is live: attention
thins across the whole of it. The cure is the ladder rather than a shorter
sentence. Distinct from *bloat*, which is dead weight.

## The agent

**Tool** — one thing the in-app agent may call: its name, its surface (read,
interface or write), its argument schema, where it may run (without a database;
on the mobile shell), and what it does. A tool is one definition under the
agent's tools folder, grouped with the others that act on the same noun, and
nothing else declares it — the spec the model receives, the roster and the
dispatch all derive from that definition. **Not a table and not an RPC**: the
tool `create_step` calls the RPC `add_step`.

**Roster** — the tools one session is offered. Derived, never listed: the
definition list filtered by the deployment's allowlist (`agent.enabledTools`;
absent means every tool) and by each tool's own availability for the session's
mode. A tool absent from the roster does not exist for that session — it is
never offered, so it is never refused.

**Admission** — the one answer a tool call gets: run it, or refuse it with
this sentence. Derived from the same description the roster is derived from,
so the offer and the admission cannot disagree about a declarable fact, plus
the facts only the run holds — the abort signal, the write-batch count for
this send, the repeat-read record for this turn, and whether this call writes
(`ui_command` writes when its argument names a mutating control, which no
roster can hold). **Not the roster**: the roster answers about a tool, an
admission about a call.

**Scope** — which service(s) one agent call covers: the active service,
handed to the session in its context and the same default the interface has;
the whole deployment, when a call names it (`service: "all"`); or none, when
no service is active, in which case a call names its scope or is refused. A
read covers its scope unless its `service` argument moves it; a write that
creates under the service lands on the scope's service. A tool never
resolves a slug — the shell did, once.

**Skill** — one of the four flows a reader starts by naming it in the
composer: `/ub:map`, `/ub:slice`, `/ub:audit`, `/ub:whatif`. The same
`SKILL.md` an IDE agent follows from this repository's `skills/` tree,
vendored into the bundle and joined to the system prompt for the one message
that names it. **Not a tool**: a tool is one call the model makes, a skill is
a flow the reader starts. One message may name any number of them, in the
order their tokens appear in its text and with no ceiling — the text is the
only record of which skills a message runs.

**Send** — one message the reader commits: its text, and the skills it names.

**near miss** — a word-start token in a draft that names no skill but spells
a skill's bare alias: `/audit` where the skill is `/ub:audit`. It invokes
nothing, so the reader is asked before the message goes, and the question has
exactly two answers — spell it properly and run it, or send the sentence as
text.

**declined skill** — a skill a message named and did not run, because the
reader took the second answer. Said three times, all three saying the same
thing: the notice in the composer before the send, a paragraph in that send's
prompt, and a transcript row of its own that outlives the tab. **Not an
error**: declining is one of the offer's two answers, so the row states what
happened in the past tense and stops. And not the other answer's mirror — a
skill that RAN leaves no such row, because the badge on the turn and the
skill's body in its prompt are already the evidence.

**Turn** — a send and everything the agent does answering it, until the loop
stops, exhausts its rounds or fails. The unit a write batch and a repeated
read are both counted against.

**Round** — one provider call inside a turn, with the tool calls its answer
asked for and their results. A turn allows a fixed number of them, and a turn
that spends them all with its last round still asking for tools makes one
further call offered no tools, so it answers from what it learned rather than
stopping mid-work. A turn whose final round answers in prose is finished and
makes no such call.

## The session

**identity** — whether anyone is signed in.

**tier** — regular creator, or the editing privilege the database reports
for this session.

**build** — a dev server, or a production bundle.

**config** — whether a database is connected.

**active service** — the single service the URL slug names, resolved once at
the surface root into a module store as its id, slug and name together. There is no
inactive service and no flag that marks one; a reader who takes it as a
filter over many gets a plural where the code means a singular. A
service-scoped read takes the id as a parameter and resolves nothing; given
none, it reads nothing — never the first service, never all of them.

**query key** — the name a read caches under, built in one place
(`queryKeys`) that the read hook and the write both use. A **family** is a
prefix and the keys under it (`slice:` and one slice's `slice:<id>`); the
**structural set** is the families a phase, scenario, path, step, lane or
cell write can change. A key is invalidated by the mutation module that
changed its rows (ADR 0016), never by a panel or the agent.

## The type system

Eight words for how text is sized, weighted and faced. They are set out
together because the axes look interchangeable until each is named, and
because **ladder** and **rung** already mean something else in this file.

**rung** — one named size on the type scale: `xs`, `sm`, `base`, and so on. A
rung owns its size and, through pairing, its line-height. **Not a rung of
the canvas's reveal ladder**, and not a rung of the writing ladder.

**ladder** — the ordered set of type rungs a face may use. Two exist, selected
by scope. **Not the writing ladder** above, and **not the canvas's reveal
ladder**.

**scope** — which face a ladder applies to. Sans sizes live on the root; mono
sizes are scoped to monospace elements, sizes only, because monospace renders
optically smaller at the same nominal value.

**pairing** — the line-height ratio declared once on the root for each rung,
so the same ratio meeting a larger mono size yields a larger box.

**leading** — the line box a rung carries. A call site does not write a
leading utility unless it overrides for geometry.

**tracking** — letter-spacing. A call-site decision; the rung does not own it.

**working weight** — 400, the weight of all content. 500 is the one emphasis;
600 is headings only.

**density** — which surface the text is on, and therefore which rung it asks
for: canvas chrome, editor UI, panel, presentation.
