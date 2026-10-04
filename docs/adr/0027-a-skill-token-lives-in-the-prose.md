---
summary: A skill token lives in the prose the reader typed and the text is the only record of which skills a message runs — parsed at send, in token order; colour is the signal, and a coloured token always runs; the badge row that preceded it is deleted because accepting a match moved the reader's word to the front of their own message, and a contenteditable rewrite was rejected because a real textarea is what gives IME, mobile keyboards, selection and native undo for free.
---

# 27. A skill token lives in the prose, and the text is the only record

**Status** Accepted — 2026-09-17. Replaces the badge row the composer's
skill mechanism first shipped with.
**Context** `src/components/editor/agent/AgentChatView.tsx`,
`src/components/editor/agent/ComposerInkedField.tsx`,
`src/components/editor/agent/composerFieldMetrics.ts`,
`src/lib/agent/skills.ts`, `src/lib/agent/sessions.ts`, § The agent in
[`CONTEXT.md`](../../CONTEXT.md). Follows
[26](0026-a-skill-is-invoked-by-its-official-name.md), which settled which
spelling invokes.

## Context

The composer needs to answer two questions about a draft: which skills this
message will run, and how a reader can see that before they send it. The first
version answered them with two records. Accepting a match from the slash menu
REMOVED the `/token` from the draft and stood the skill in a badge row above
the field; the draft carried a `skillId` beside its text, and the badge was
that field drawn.

Both halves failed, and the visible half failed first. Accepting a match moved
the reader's word out of the sentence it was in: `asdasd /ub:audit` became
`[/ub:audit] asdasd`. In the user's words — *"the skill converted inline
always move to front instead of hold its inline position"*. A completion that
relocates the thing it completes is not a completion; it is an edit the reader
did not ask for, applied to the one part of the screen they own.

The invisible half was two records of one fact. A badge could outlive the
token that made it, and a token typed straight into a sentence sat there with
nothing recording it — so a message could show a skill it would not run, and
run a skill it did not show. The pair could disagree, and did.

## Decision

**The token stays where it was typed, and takes a colour.** A word-start slash
token that resolves to a skill is drawn in role ink exactly where it sits.
Accepting from the menu completes the token's text in place, the way a shell
completion does — `/ub:aud` becomes `/ub:audit ` — and the prose either side
of it is not read, moved or trimmed.

**The text is the only source of truth.** `AgentDraft` carries text and
nothing else. The skills a message runs are parsed out of that text at send,
in the order the tokens appear, deduped, uncapped. One record cannot disagree
with itself.

**Colour is the signal, and a coloured token always runs.** There is no
picked-versus-mentioned distinction to hold, because nothing outside the text
holds a pick. A resolved token is coloured and it runs; an unresolved one is a
word with a slash on it. What is still asked about is the NEAR MISS — a token
matching only a skill's bare alias, which resolves to nothing and would
otherwise send as prose with nobody told. Every miss in the draft is asked
about, one at a time, and the accepted rewrite is re-checked before it sends:
a message carries as many tokens as its sentence names, so a question about
one of them would leave the rest silent.

**The field stays a real `<textarea>`.** The colour comes from a mirrored
layer behind it that renders the same string with each resolved token in a
span, sharing one class string with the field so the two cannot wrap
differently — and one containing block, a wrapper sized by the field, so that
an add-on placed in the group later narrows both copies or neither.

## Consequences

**A rejected alternative stays rejected: a contenteditable rewrite.** True
inline token elements — a real element per token, in the flow of the text —
is the obvious shape and the expensive one. This repo has no editor
dependency, and the four things a textarea gives for free are the four a
hand-rolled editable surface spends months on: IME composition, the mobile
keyboard, selection, and native undo. The mirrored layer is the cheap
approximation of the same picture, and its known failure mode — the two copies
wrapping differently and the colour drifting off the text — is bounded by the
one shared metrics string, which the composer's tests assert both RENDERED
copies still wear.

**The layer must be kept honest, and the test does half of it.** Every
property that decides a line break belongs to that shared string. The metrics
test iterates the string and asserts that both RENDERED copies still wear
every token in it, so what it catches is a metric DROPPED from either copy —
the likelier edit, since either class list can be touched on its own — and
also the control at the end of the chain quietly not applying the list it was
handed. A second case asserts that each of the two nodes wears the list that
is ITS own: the two lists are built by one call and spread onto two nodes, and
an assertion made against the call's return value alone would pass with them
swapped, caret covered by an opaque copy of the draft. What neither can see is
a metric ADDED to the field and not to the string: a fresh `tracking-` or
`px-` on the textarea is a property the layer is never told about, and a test
that iterates the string has no list of properties to notice it is missing
one. That half is caught in review or not at all, and it is the first thing to
look for when this composer is edited.

**Where the completion leaves the caret is guarded by the component tests.**
The lookup follows the caret: it is the token the caret sits at the end of,
wherever that is in the draft, so a completion can have prose behind it — a
pick made back inside a sentence, or an accepted near-miss offer. There the
offset a completion should produce, past the name and its gap, and the offset
assigning `value` produces on its own, the end of the new text, are different
offsets, and a jsdom assertion on `selectionStart` can tell them apart. Only
at the tail do the two coincide, and a test there catches a caret written to
the wrong offset rather than one never written.

**While an IME composes, the field draws its own text.** The field's text is
transparent only while the layer is drawing, or a preedit string would be
invisible for as long as it is being composed.

**A reader can edit a token into nonsense and lose a skill silently.**
Deleting a character from `/ub:audit` uncolours it, and the message runs
nothing. That is the honest consequence of the text being the record, and it
is visible in the one place the reader is looking: the colour goes.

**The plausible "fix" is to bring back a durable pick.** A future reader will
find no state anywhere holding the skill a reader chose and reach for one — a
field on the draft, a set in component state. That is the pair this record
replaced. If a fact about the message is worth keeping, it belongs in the
message's text, where the reader can see it and edit it.
