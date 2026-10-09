# check: jargon-lint
wave: 1
severity-default: info

## Question
Which customer-facing texts use words the customer would never say?

## Read
Cells in lanes whose role is customer_actions or frontstage_* only. The
lane vocabulary (references/lane-vocabulary.md) tells you which actor
reads each lane. Lane roles resolve PER PATH (`paths[].lanes[]`) — the
same lane key can carry different roles in different scenarios/paths, so
never resolve a role from the key alone.

## Finding shape
One finding per term (grouped across cells), cell_keys = every cell using
it. The summary names the term and a plainer candidate, citing keys — never
rewriting cell text in the summary. Internal-system names, org-chart words,
and acronyms in customer-visible cells → warn; the same words in backstage
lanes → not a finding.

## Impact and effort
Rate both on every finding, from the anchors below. Pick the level whose
anchor the finding matches most closely; between two, rate impact the lower
and effort the higher — a finding has to earn Do first.

| Level | Impact — how much the plainer word matters | Effort — how much work the change takes |
| --- | --- | --- |
| low | The term sits in text the customer skims, and most customers would still decode it | A word swap in one or two cells |
| medium | An acronym or internal name in the main text the customer reads at a step | The term recurs across the scenario, or the plainer word has to be agreed with whoever owns the copy |
| high | The term sits where the customer must act on it — a choice, a consent, a payment — and misreading it sends them down the wrong path | The term is a name the shipped interface itself uses, so the product's copy changes along with the blueprint's |

## Non-findings
Domain terms the customer genuinely uses (verify against evidence titles
if present); product names the service deliberately teaches; backstage
shorthand. Crew-behavior narration in `frontstage_actions` cells that the
customer experiences but never READS (the cell describes what staff do,
not copy shown to the customer) — the lint applies to customer-read text.
Phase names ARE customer-facing (they render as headers), and a phase
is not a lane, so the role test below does not reach one.
`journey_stage` is not a role either — the vocabulary is closed and
refuses it, as it refuses `physical_evidence`.
When unsure whether the customer sees the cell, check the lane's role —
do not guess from wording.
