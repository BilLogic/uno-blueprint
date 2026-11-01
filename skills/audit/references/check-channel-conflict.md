# check: channel-conflict
wave: 1
severity-default: warn

## Question
Where do simultaneous cells compete for the same actor or the same channel
— one human required in two places, one screen showing two things?

## Read
Column by column (a step is simultaneity). Within each step: which cells
name the same actor across lanes; which name the same tool/channel. Then
dependencies that fan out from one cell to multiple same-step targets on
one path. Simultaneity stays a step on one path: a dependency may reach
another path or scenario of the service, but a journey walks one path at a
time, so targets on two different paths, or in another scenario, never
compete for one moment.

## Finding shape
One finding per (step × contested resource). cell_keys = the competing
cells. The summary names the actor/channel and the collision, by key. An actor
required in N places at one step → warn; the spine actor blocked by it →
critical. If the chain is unclear, walk it yourself by the Method in
`agents/impact-tracer.md` (visited set, depth cap 8, edges into other paths
and scenarios followed like any other) and cite the downstream keys,
naming the scenario and path of any that sit elsewhere.

## Impact and effort
| Level | Impact — how much resolving the collision matters | Effort — how much work resolving it takes |
| --- | --- | --- |
| low | Contention for a tool where a workaround is already normal, such as a shared inbox two people watch | Re-sequencing inside the step: the cells already allow one use after the other |
| medium | One staff role needed in two places at one step, which slows one of them | Moving one cell to another step or lane, and the dependency edges that move with it |
| high | The spine actor is blocked, so the journey stalls at that step | The collision is structural: it needs another person, another channel, or a redesigned step |

## Non-findings
The same TEAM (not person) appearing twice is staffing, not conflict.
Sequential use inside one step (content says "then") is not simultaneity.
Broadcast tools (a dashboard many people watch) don't conflict.
