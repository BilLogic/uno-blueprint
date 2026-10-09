# check: kpi-alignment
wave: 2   # needs lane `kpis` (and optionally `tools`); skip if absent/empty everywhere
severity-default: warn

## Question
Do the lane's KPIs reward what its cells actually do — or do they reward
something the journey never shows?

## Read
Per lane with non-empty `kpis`: the KPI list vs that lane's cells across
all steps and paths. `tools` for whether the measured thing is even
instrumented. Lane roles resolve PER PATH (`paths[].lanes[]`) — the same
lane key can carry different roles in different scenarios/paths, so never
resolve a role from the key alone.

## Finding shape
Two directions, one finding each per lane:
- A KPI no cell contributes to (measured but never enacted) → warn;
  cell_keys = the lane's cells (or scope-key if the lane is empty).
- A dominant cell activity no KPI rewards (enacted but never measured) →
  info; cell_keys = the strongest example cells.
Note cites the KPI text and keys — no invented metrics.

## Impact and effort
Rate both on every finding, from the anchors below. Pick the level whose
anchor the finding matches most closely; between two, rate impact the lower
and effort the higher — a finding has to earn Do first.

| Level | Impact — how much aligning the measure matters | Effort — how much work aligning it takes |
| --- | --- | --- |
| low | An activity no KPI measures, in a lane off the journey's critical path | Naming the KPI in a cell, or adding the missing tool: the activity already happens |
| medium | A KPI no cell contributes to: the lane is measured on something the blueprint never shows | Rewriting several cells, or the KPI's wording, with the lane's owner |
| high | The KPI rewards behaviour the cells show working against the customer, such as speed measured where the journey needs care | The KPI is set outside the blueprint, by an organisation-level target, and moves only by negotiation |

## Non-findings
Org-level KPIs (NPS, revenue) that legitimately roll up beyond one lane;
lanes with kpis deliberately empty (skip, don't flag).
