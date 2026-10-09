# check: gap-sweep
wave: 1
severity-default: warn

## Question
Which moments the customer or an actor plainly experiences have no cell —
where does the blueprint go silent while the service keeps happening?

## Read
Per path, in step order: the step list vs each lane's cells. Then the
dependency graph.

## Finding shape
Emit one finding per contiguous silent stretch, not per empty cell:
- A lane empty across 3+ consecutive steps while its actor is clearly still
  present in the journey → cell_keys = the flanking cells; summary names the
  silent steps.
- A `leads_to` dependency whose narrative implies a follow-up ("which kicks off…") with
  no cell at the receiving end → warn; cell_keys = the source cell.
- The inverse: a cell whose narrative promises an INBOUND transition
  (reopen, return, retry, "comes back to…") with no incoming dependency edge
  → warn; cell_keys = the promising cell.
- A step no path includes (declared but orphaned) → info; scope-key
  fingerprint.
Raise to critical when the gap touches the interaction line — the rule
applies if ANY step inside the silent stretch is a customer-visible
moment with no frontstage cell at all (not only when the finding is
itself that moment).

## Impact and effort
Rate both on every finding, from the anchors below. Pick the level whose
anchor the finding matches most closely; between two, rate impact the lower
and effort the higher — a finding has to earn Do first.

| Level | Impact — how much filling the gap matters | Effort — how much work filling it takes |
| --- | --- | --- |
| low | A declared step no path includes: untidy, but no reader is misled | One cell to write, whose content the flanking cells already state |
| medium | A backstage lane silent for a stretch while its actor plainly keeps working, so a reader misjudges who carries the load | Several cells along one lane, or a dependency edge plus the cell at its receiving end, to settle with that lane's owner |
| high | A silent stretch at a customer-visible moment: the journey has a hole exactly where the customer is waiting | Nobody in the source says what happens there, so the stretch needs new research, a new step or a new path |

## Non-findings
Empty cells are NORMAL — a lane legitimately idle at a step is not a gap.
Only flag silence that the surrounding cells' content contradicts. Never
propose invented content; the finding names the hole, the human decides.
