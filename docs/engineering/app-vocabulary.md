---
summary: The words that matter only inside the app's code — five words for arrival, three for the camera, the session's parts and its query keys, and eight for type — each defined once with the qualified names that keep it apart from a glossary word spelled the same.
---

# The app's own vocabulary

**For** anyone reading or changing code under `src/`.
**Answers** what does this word mean in the app, and which glossary word is it
not?

A word defined here changes what the app's code does and nothing an agent
writes to a board, a skill or a document; those words are `CONTEXT.md`'s. The
decision record that governs each group is named at its head.

## Five words for arrival

Five words for *not there yet*, naming five different things. Two belong to the
shell, one to the canvas, one is a duration, and one is about the data rather
than the screen. They are set out together because apart they read as spellings
of one idea, and they are spelled here in lower case as the code spells them:
each is a value or a constant, not a thing on the board. Where the halves they
belong to meet is
[ADR 0007](../adr/0007-the-canvas-and-the-shell-run-on-separate-clocks.md).

**entrance** — the shell's from-state as it arrives: `idle`, `pending`, `shown`.
`pending` lasts a single frame, and exists so that the fade which follows has
somewhere to start. Nothing is waiting on data while it runs, which is what
separates it from every other word here.

**boot** — the sidebar's once-per-entry latch: `off`, `armed`, `skeletoning`. It
answers whether this is the reader arriving or a surface they have already
loaded coming back — a question no rung of the reveal ladder can answer,
because a canvas that stayed mounted does not restart that ladder, and one that
remounts does. `skeletoning` was called *staging* until the collision with the
reveal ladder's first rung was named.

**revealStage** — the canvas's **reveal ladder**, six rungs from
`CANVAS_REVEAL_STAGING` to `CANVAS_REVEAL_DONE`. It says how much of the board
is painted and nothing about the shell around it. The canvas is the only thing
that sets it; everything else reads it.

**hold** — `SKELETON_HOLD_MS`, 250 ms: how long a surface may load before its
skeleton is allowed to paint. **A duration, not a state** — the one word here
measured in milliseconds rather than spelled as values, and the reason a fast
load shows no placeholder at all instead of one that flashes.

**query status** — what a query returned: `loading`, `ready` or `error`, the
`status` of a `QueryResult`. It is a fact about the data and not about the
screen, so a bar can be `ready` while the sidebar is still `skeletoning`
without the two contradicting each other. It only ever describes a read; the
status stored in a column is the board's, defined in `CONTEXT.md`.

## The camera

Three words for a camera move that somebody is waiting on. They belong to the
move itself rather than to any one caller: the canvas publishes them, and the
desktop navigation tools, the agent's cell focus and the phone's ✦ sheet all
read the same words. Where the halves they cross meet is
[ADR 0028](../adr/0028-a-jump-is-awaited-through-one-module.md).

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
[`checks.md`](checks.md). And not a status: a jump verdict is said once,
about one camera move, and describes a move rather than a thing on the board.
**And not persistence's `superseded`** — there the word asks whether the
account a read was made for is still the one signed in, and the answer is a
boolean a piece of work reads about itself rather than a verdict anyone
publishes.

## The session

The four axes a surface may not conflate are
[ADR 0011](../adr/0011-one-question-a-surface-may-ask.md)'s; the active
service is [ADR 0005](../adr/0005-cross-surface-state-is-a-module-store.md)'s,
and query keys [ADR 0016](../adr/0016-reads-never-refetch-on-their-own.md)'s.

**identity** — whether anyone is signed in.

**tier** — regular creator, or the editing privilege the database reports
for this session.

**build** — a dev server, or a production bundle.

**config** — whether a database is connected.

**active service** — the single service the URL slug names, resolved once at
the surface root into a module store (`contexts/activeService.ts`) as its id,
slug and name together. There is no inactive service and no flag that marks
one; a reader who takes it as a filter over many gets a plural where the code
means a singular. A service-scoped read takes the id as a parameter and
resolves nothing; given none, it reads nothing — never the first service,
never all of them.

**query key** — the name a read caches under, built in one place
(`queryKeys`) that the read hook and the write both use. A **family** is a
prefix and the keys under it (`slice:` and one slice's `slice:<id>`); the
**structural set** is the families a phase, scenario, path, step, lane or
cell write can change. A key is invalidated by the mutation module that
changed its rows, never by a panel or the agent.

## The type system

Eight words for how text is sized, weighted and faced. They are set out
together because the axes look interchangeable until each is named. The
three that the canvas's reveal ladder and the writing ladder also use carry
*type* in front. The decision they serve is
[ADR 0012](../adr/0012-a-rung-owns-size-and-leading.md).

**type rung** — one named size on the type scale: `xs`, `sm`, `base`, and so
on. A type rung owns its size and, through pairing, its line-height.

**type ladder** — the ordered set of type rungs a face may use. Two exist,
selected by type scope.

**type scope** — which face a type ladder applies to. Sans sizes live on the
root; mono sizes are scoped to monospace elements, sizes only, because
monospace renders optically smaller at the same nominal value.

**pairing** — the line-height ratio declared once on the root for each type
rung, so the same ratio meeting a larger mono size yields a larger box.

**leading** — the line box a type rung carries. A call site writes a leading
utility only when it overrides for geometry.

**tracking** — letter-spacing. A call-site decision; the type rung leaves it
to the call site.

**working weight** — 400, the weight of all content. 500 is the one emphasis;
600 is headings only.

**density** — which surface the text is on, and therefore which type rung it
asks for: canvas chrome, editor UI, panel, presentation.
