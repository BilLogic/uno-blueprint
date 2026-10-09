# check: fee-visibility
wave: 2   # needs value_props/description columns carrying money mentions; skip if none found
severity-default: warn

## Question
Where does money change hands — fees, charges, credits — invisibly to the
customer's journey?

## Read
Cells whose content/description/value_props mention prices, fees,
billing, invoices, credits. For each, the same-step and adjacent
customer-lane cells: is the money moment visible frontstage?

## Finding shape
One finding per money moment. Backstage charge with no frontstage
disclosure cell at or before it → critical; disclosure that happens only
AFTER the charge → warn; visible-but-jargoned disclosure → info and defer
wording to jargon-lint (don't double-report).

## Impact and effort
Rate both on every finding, from the anchors below. Pick the level whose
anchor the finding matches most closely; between two, rate impact the lower
and effort the higher — a finding has to earn Do first.

| Level | Impact — how much making the money visible matters | Effort — how much work making it visible takes |
| --- | --- | --- |
| low | The disclosure is visible but worded in jargon | The service already discloses it and the blueprint lacks only the cell that records where |
| medium | The disclosure arrives only after the charge | A disclosure cell at or before the charge, with wording to agree |
| high | A backstage charge with no frontstage disclosure at all | The charge's timing or existence has to change: a pricing or billing decision |

## Non-findings
Internal cost accounting (org pays, customer never does); money mentions
in evidence/provenance rather than the journey itself.
