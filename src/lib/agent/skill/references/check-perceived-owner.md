# check: perceived-owner
wave: 2   # needs cell owner/perceived_owner pair; skip if perceived_owner unset everywhere
severity-default: info

## Question
Where does who-the-customer-thinks-is-acting diverge from who actually
acts — and is each divergence designed or accidental?

## Read
Cells where both `owner` and `perceived_owner` are set and differ.
Cluster by (owner → perceived_owner) pair.

## Finding shape
One finding per divergence pair per scenario; cell_keys = the cells in the
cluster. Divergence on the interaction line (customer perceives X, Y acts)
→ warn if no adjacent cell manages the impression; a divergence that a
cell's own content calls out as deliberate (ghost-writing, white-label) →
info, summary says "reads as designed".

## Impact and effort
Rate both on every finding, from the anchors below. Pick the level whose
anchor the finding matches most closely; between two, rate impact the lower
and effort the higher — a finding has to earn Do first.

| Level | Impact — how much closing the divergence matters | Effort — how much work closing it takes |
| --- | --- | --- |
| low | A divergence the content calls deliberate, or one the customer never acts on | One cell's `perceived_owner` or wording to correct |
| medium | A divergence on the interaction line with no cell managing the impression | Adding the frontstage cell that manages the impression |
| high | The customer would contact or blame the wrong party at a moment that matters — a complaint, a failure, a payment | The divergence comes from how the service is contracted, such as white-labelling, so the fix is a decision outside the blueprint |

## Non-findings
Divergences where perceived_owner is simply unset (that's data absence,
not perception design); backstage cells (nobody perceives them).
