# check: channel-conflict
wave: 1
severity-default: warn

## Question
Where do simultaneous cells compete for the same actor or the same channel
— one human required in two places, one screen showing two things?

## Read
Column by column (a step is simultaneity). Within each step: which cells
name the same actor across lanes; which name the same tool/channel. Then
dependencies that fan out from one cell to multiple same-step targets.

## Finding shape
One finding per (step × contested resource). cell_keys = the competing
cells. Note names the actor/channel and the collision, by key. An actor
required in N places at one step → warn; the spine actor blocked by it →
critical. If the chain is unclear, dispatch impact-tracer on the
suspected cells and cite its downstream list.

## Impact and effort
Rate both on every finding, from the anchors below. Pick the level whose
anchor the finding matches most closely; between two, rate impact the lower
and effort the higher — a finding has to earn Do first.

| Level | Impact — how much resolving the collision matters | Effort — how much work resolving it takes |
| --- | --- | --- |
| low | Contention for a tool where a workaround is already normal, such as a shared inbox two people watch | Re-sequencing inside the step: the cells already allow one use after the other |
| medium | One staff role needed in two places at one step, which slows one of them | Moving one cell to another step or lane, and the dependency edges that move with it |
| high | The spine actor is blocked, so the journey stalls at that step | The collision is structural: it needs another person, another channel, or a redesigned step |

## Non-findings
The same TEAM (not person) appearing twice is staffing, not conflict.
Sequential use inside one step (content says "then") is not simultaneity.
Broadcast tools (a dashboard many people watch) don't conflict.
