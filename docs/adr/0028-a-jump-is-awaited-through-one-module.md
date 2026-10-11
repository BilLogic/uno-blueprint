---
summary: A camera move toward a named target is awaited through one module that is handed the target and the act that commits the selection — so it arms before it commits, races one measured 2000 ms camera deadline, detaches both losers and answers in one of four jump verdicts (landed, cancelled, superseded, unanswered); arming after the selection commits becomes unsayable rather than documented at either entry point, the three hand-tuned CAMERA deadlines collapse into one number whose justification is a measurement while the shell-selection poll keeps its own 1800 ms, the answer's shape makes a verdict without its answer unrepresentable, and silence becomes a word an agent can report instead of three private timeouts.
---

# 28. A jump is awaited through one module, and answers in one jump verdict

**Status** Accepted — 2026-09-18. Replaces the keyed waiter map
`canvasNavigationOutcome.ts`, deleted in the same change.
**Context** `src/lib/canvasJump.ts`, `src/lib/agent/uiBridge.ts`,
`src/components/mobile/mobileAgentBridge.ts`,
`src/hooks/useZoomPanViewport.ts`, § The camera in
[`CONTEXT.md`](../../CONTEXT.md). Sits under
[7](0007-the-canvas-and-the-shell-run-on-separate-clocks.md), whose
one-directional read this handshake obeys rather than reopens.

## Context

A jump is one camera move toward a named target — a scenario the reader asked
for in words, a phase, a cell. Three callers awaited one: the agent's
navigation tools, the agent's cell focus, and the phone's sheet, which gives
the caret up for the move and takes it back when the canvas has settled.

The channel they shared was fifty-four lines of keyed waiter map. Every hard
fact about using it correctly lived outside it:

**The ordering rule.** The verdict is published by the fit the selection
triggers, so a waiter has to be attached BEFORE the selection commits. The
channel took a key and nothing else, so an arm-after-select typechecked
perfectly. The rule was held in three prose comments and pinned for the phone
alone, and the defect it describes shipped twice.

**The deadline.** Three hand-tuned numbers for one physical flight: 1800 ms
for the navigation tools, 1500 ms for cell focus, 2000 ms for the phone's
caret hand-back. The phone's had to exceed the tool's or the caret came back
before the tool had answered — a relationship no file expressed, and one that
a reader tuning any single number would have broken without noticing.

**The verdicts.** Three kinds in the type, and a fourth state that existed
only as silence. A viewport may let go of a flight without answering for it —
an unmount is not a verdict — and a viewport that is gone for good answers
nothing at all. Each caller re-learned that silence as its own timeout, gave
it its own sentence, and one of them discarded the verdict it had waited for.

## Decision

**The module commits the selection.** A caller hands over the target and the
act that commits the selection; the module arms, commits, races, detaches both
losers and answers once. A seam that only documents the ordering is the seam
we already had, so there is no way to obtain a waiter without also handing
over the commit — the mistake is unsayable rather than forbidden. It holds at
BOTH entry points, which matters because there are two: `awaitPublishedJump`
takes the commit, and so does `awaitSelfAnsweringJump`. The probe: a caller
written to arm after committing fails to compile in four places, because the
functions it would need (`armJump`, `waitForJump`) do not exist on either.

**One CAMERA deadline of 2000 ms, and no override parameter.** Measured rather
than felt. Driven through the agent's scenario open against a live bridge on a
390×844 viewport, read from the publisher itself, the verdict arrives at a
median of 366 ms and a maximum of 422 ms — the 200 ms fade, plus the canvas
remount, plus the fit; the flight itself is effectively free. At a 4× CPU
throttle the maximum is 1332 ms. 2000 ms clears the median by about 5.5× and
holds under that throttle, and the first real failure appears around a 5–6×
slowdown. Nothing varies across the three call sites: cell focus has no
remount to wait for, and the tool's 1800 ms was never tight either. The old
pairing of 1800 and 2000 existed only so the phone outlasted the tool, and
with one number that relationship has nothing left to express.

What it does NOT cover is the navigation tool's other wait: a poll of the
shell's reported context for the selection it asked for. That asks a different
question of a different half — a shell re-rendering and re-reporting what it
holds — and a measurement of the fade plus the remount plus the fit justifies
nothing about it. It keeps its own named constant at the 1800 ms it has always
had, in the file that spends it, with its own one-line reason. Unifying it
would have shifted a sentence a model reads by 200 ms for no measured reason.

**Four verdict words: landed, cancelled, superseded, unanswered.** The canvas
may claim the first three. `unanswered` is what the deadline says, and the
type refuses it to the publisher: silence is the only way to reach it, so a
viewport claiming it would be claiming that nobody answered while answering.
It earns its place on evidence rather than on caution — at a 6× slowdown a
real run reached it, and *"the camera outcome was not verified before
timeout"* is a thing an agent must be able to report honestly.

**A verdict and the thing it is about are one shape, so the nonsense will not
typecheck.** The published half answers with the verdict word itself; nothing
else was ever read off it, and the camera transform it used to carry was read
by tests alone, so it is gone rather than published for nobody. The
self-answering half answers with a union: an arm that carries the commit's own
result, and an arm that is silence and carries nothing. `{ verdict: 'landed',
answer: null }` no longer says the impossible, and a caller can no longer test
the answer for null and infer silence from it — an inference that was correct
only for as long as no commit's own result could itself be null, which is a
fact about somebody else's return type. Every caller reads the verdict.

**A result that never became a flight gets no verdict, rather than borrowing
one.** A cell the board does not hold answers — there is a result to read —
but nothing flew, so there is nothing for the canvas to have settled. Its
verdict is `null`: the absence of one, said out loud. It briefly borrowed
`cancelled`, which reports a flight taken back from something that never left
the ground, and then needed a comment beside it excusing the word.

**Letting go is publishing nothing.** A viewport can vanish mid-flight while
the destination the reader asked for is unchanged: a freshly opened scenario's
path filter resolves a beat after the selection, the board falls to its
no-paths state, and the canvas remounts and refits the SAME target. The dying
mount publishes nothing, so the jump is still listening when the mount that
took the camera over answers.

**That hand-off's only guard is the React harness, and it must stay.** The
acceptance criterion asked for a plain unit assertion, and the honest answer
is that the module cannot make one: from inside the jump, letting go is
indistinguishable from any other silence, because it IS the absence of a call.
The unit suite therefore asserts what it can — that a waiting jump is still
attached after time has passed with no verdict, so a later publisher reaches
it — under a name that says only that. The behaviour that was fixed by hand is
held by the viewport case `hands a flight to the next mount instead of
cancelling it on unmount` in
`src/hooks/useZoomPanViewport.cameraFlight.test.tsx`, which owns a real
unmount and a real remount. Retiring it because a unit test looks like it
would leave the fix unguarded; both tests say so in their own comments.

## What was verified

The whole point of the change is that nothing a reader can see moves, so
"looks right" would not have been checkable. Driven in a browser against this
branch: 22 jumps, desktop and phone, every one of them answered by the landed
sentence, and no console error in any of them.

- **The same-target re-jump** — a jump to the destination already selected,
  which triggers no board remount, and therefore the case where a waiter
  could plausibly have been left with nobody to answer it. It answered in
  68 ms rather than hanging to the deadline.
- **Phone timings held.** Median 369 ms across the phone runs, against the
  366 ms pre-refactor baseline the deadline was measured from — inside the
  noise of the same measurement.
- **The phone's sheet never disappeared,** polled every 20 ms through each
  jump: it stands aside for the flight and comes back, and the scrim held
  exactly one state throughout.
- **The caret came back to the composer every time,** including from a
  blurred start — which is the behaviour the phone's watcher exists for, and
  the one that would have broken silently if the narrowed callback had stopped
  firing on any verdict.

## What this rejects

**An override parameter with a stated reason.** It was the first shape
proposed, and the measurement removed its subject: an override is a seam for a
difference, and after measuring, there is no difference. Building it now would
carry three numbers forward in a parameter instead of in three files. The next
caller that genuinely differs can introduce one, with its own measurement.

**A module that documents the ordering and leaves the caller to obey it.**
That is what stood here, with the rule stated three times in prose. Comments
cannot be run.

**Making the phone's watcher read the verdict optional.** It already had a
generation guard — a superseded flight's verdict must leave the caret alone
while a second jump is still moving — and it threw the verdict away. The guard
stays, because which jump owns the caret is the shell's decision; the verdict
now reaches it, because why the caret came back is something the shell can
legitimately see.

## Consequences

**A caller gives up the moment it commits.** Handing the commit over means the
selection happens inside somebody else's function call, and the commit runs
synchronously before the promise is returned — a caller that wants to do
something in parallel with the flight (the navigation tools verify the
selection separately) starts that work after `awaitJump` returns, not before
it is called.

**A jump that answers for itself needs a second shape, and the two entry
points are named for the difference.** A cell focus hands its flight result
straight back through the call instead of publishing it against a target, so
the module offers `awaitSelfAnsweringJump` beside `awaitPublishedJump`. Same
deadline, same four words; where the answer comes from is the whole
distinction, and the names carry it — `awaitJump` said nothing about which
half a reader was in, and the self-answering one touches no waiter, names no
target, and can still answer `unanswered`. Two entry points in one module is
the price of not inventing a target key for a call that already has an
answer.

**The deadline is one number for every jump, including ones nobody has
measured.** The cold first navigation, the reduced-motion path (which skips
the fade), and phase jumps were not sampled, and the measurement is a dev
build on a desktop-class CPU with one sample blueprint and no physical phone.
A device far enough outside that envelope reports `unanswered` on a flight
that actually landed — which is a wrong answer, but an honest one, and the
verdict word exists so that it reads as one.

**The read still runs one way.** The canvas publishes where it got to and is
never told when to be there; the jump is a caller waiting on that publication
and nothing on the canvas waits on a shell state in return. Record 7 holds,
and a jump that asked the canvas to wait would close the loop it forbids.

**The plausible "fix" that would undo this:** a caller in a hurry adding
`awaitJump(target, commit, { deadlineMs })`, on the reasoning that its own
surface is faster or slower than the rest. The number is not the point — the
single number is, and the first override reintroduces the relationship between
deadlines that nothing can express. An override earns its place by arriving
with a measurement that shows a real difference, and by moving the
justification into the file that overrides.
