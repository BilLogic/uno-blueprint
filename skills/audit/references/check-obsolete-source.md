# check: obsolete-source
wave: 1
severity-default: warn

## Question
Which cells model a surface, system, or flow that no longer exists in the
source it was mapped from?

## Read
Cells carrying `resources` that point into a codebase, internal tool, or
document tree, and the `url` of any touchpoint placed on them — plus any
cell whose content names a concrete surface (a portal, an app screen, a
servlet, a form). When the workspace has access to the source (a repo
checkout, a reachable URL), resolve each one: a
path absent from the current tree, a 404ing internal URL, or a screen the
current build no longer ships is the signal. Without source access, flag
only cells whose own evidence contradicts them (e.g. a newer cited doc
says the surface was retired) and report the rest as unverifiable, not
clean.

## Finding shape
One finding per dead surface (grouped across cells), cell_keys = every
cell built on it. The summary names the surface, the evidence it is gone
(missing path, retired doc, dead URL), and the blast radius — whether the
dead surface is one stray step or the spine of a whole scenario. A
scenario built entirely on a dead surface is one finding at the scenario
level, not N per-cell findings.

## Impact and effort
Rate both on every finding, from the anchors below. Pick the level whose
anchor the finding matches most closely; between two, rate impact the lower
and effort the higher — a finding has to earn Do first.

| Level | Impact — how much correcting the model matters | Effort — how much work correcting it takes |
| --- | --- | --- |
| low | One stray cell names a retired surface; the step it sits in is otherwise accurate | A relink: the live replacement is known and does the same job |
| medium | A step or a path is built on the dead surface | The replacement works differently, so a few cells need rewriting |
| high | A scenario's spine is built on it: a reader learns a journey that no longer exists | The replacement is unknown or the flow itself changed, so the scenario is re-mapped from the current source |

## Non-findings
Planned or future-state paths (a surface that does not exist YET is the
point of a `planned` path, not rot); a url that fails for access reasons
(auth walls, network) rather than absence; renamed-but-live surfaces when
the rename is traceable — those are a relink suggestion in the summary, not
an obsolete-source finding. This check flags modeling of the PAST, never
modeling of the intended future.
