---
summary: How Matt Pocock's skills repo writes skills and agent-facing docs, his stated reason for each practice, and whether the four ub skills and the canvas agent's prompt should adopt, adapt or skip it — ending in a ranked list of recommended changes.
---

# How Matt Pocock writes skills, and why

Research for the wayfinder ticket "How Matt Pocock writes skills, and why"
(map: the owner-agent effort). Throwaway branch, never merged.

## Sources

- `mattpocock/skills` at `main` = `49dd158` (2026-10-09), read from the local
  plugin marketplace clone, whose HEAD matched `gh api
  repos/mattpocock/skills/commits/main` on 2026-10-15. Installed plugin
  version: 1.3.1.
- Files cited below are paths in that repo. PR and issue numbers are
  `mattpocock/skills` numbers, cited from `CHANGELOG.md` or `gh pr view`.
- Compared against this repo at `origin/main` (`5308ddc6`, v2.8.7):
  `skills/*/SKILL.md`, `AGENTS.md`, `CONTEXT.md`, `docs/agents/domain.md`,
  `src/lib/agent/role.md`, `scripts/check-router-budget.mjs`.

Quotes are kept under 15 words; everything else is paraphrase.

## The frame: two loads

Every other practice is the same trade made in a different place, so it comes
first.

- **What it is.** Each document or pointer spends one of two budgets. Context
  load: always-loaded material (an `AGENTS.md` line, a skill description) costs
  tokens and attention every turn. Cognitive load: the human has to remember
  what exists and when to reach for it.
- **Matt's reason.** Cognitive load is "the price of human agency"
  (`skills/productivity/writing-for-agents/SKILL.md`, § The two loads), so
  spend it only where human judgement matters; context load is paid whether
  or not the material fires.
- **Fit: already adopted.** `scripts/check-router-budget.mjs` ratchets both
  censuses (the always-loaded router and every skill description) with a
  ceiling and a slack. Nothing to change in the template. For the owner
  agent, apply the same census to whatever the host loads every turn (the
  role prompt plus every skill description).

## Practices

### 1. The description is the trigger (description-first triggering)

- **What it is.** A skill's `description` is a **context pointer**: the one
  always-loaded line that decides whether the agent reaches the body. Rules:
  front-load the leading word; one trigger per **branch** (a distinct case
  the skill handles); collapse synonyms that rename one branch; cut identity
  the body already carries.
- **Matt's reason.** "The pointer's _wording_, not its target, decides when
  the agent reaches" (`writing-for-agents/SKILL.md`, § Context pointers). A
  must-have target behind a weak pointer is a **variance bug**: sharpen the
  wording before inlining material.
- **Here.** The four descriptions front-load well ("Service blueprints —",
  "Blueprint slice —", "Blueprint audit —", "Blueprint what-if —") and end
  with routing clauses (`→ ub:audit`), which are genuine distinct branches.
  Two weaknesses: `map` lists synonyms of one branch ("FigJam, Figma, Miro or
  spreadsheet"; "Journey maps and frontstage/backstage swimlanes count"), and
  `slice` restates identity the body carries ("writes it back as a slice the
  app presents").
- **Fit: adapt.** Run one pruning pass on the four descriptions against the
  branch rule, under the existing char budget. For the owner agent the
  descriptions must also trigger on an **owner's** words, not a designer's:
  an owner says "what happens if we stop doing X", not "what-if". Add owner
  phrasing as branches only where it is a genuinely different case.

### 2. Model-invoked vs user-invoked (`disable-model-invocation`)

- **What it is.** A model-invoked skill keeps a model-facing description and
  can be fired by the agent or by another skill. A user-invoked skill sets
  `disable-model-invocation: true` (and `policy.allow_implicit_invocation:
  false` in `agents/openai.yaml` for Codex); its description becomes a
  human one-liner and only a person typing its name can reach it.
- **Matt's reason.** "If it only ever fires by hand, make it user-invoked
  and pay no context load" (`writing-for-agents/SKILL-MECHANICS.md`, §
  Invocation). The test: "could the model usefully reach for this
  autonomously?" (`.agents/invocation.md`). Invariant: no skill can reach a
  user-invoked skill (#878 follow-up in `CHANGELOG.md`).
- **Here.** All four `ub` skills are model-invoked; none sets the flag.
- **Fit: skip for the four skills, adopt for new owner-facing commands.**
  The owner agent must reach map, audit, slice and whatif on its own, and a
  scheduled audit has no human to type a name, so all four stay
  model-invoked. Any new command that only an owner should fire (a
  `wait-what`-style corrective, a "promote this what-if" accept) is a
  candidate for user-invoked: zero context load, and the agent can never
  fire it on the owner's behalf, which is the property whatif promotion
  already demands in prose ("promotion only on the user's explicit
  acceptance", `role.md`). Check that Cursor, the dogfood host, honours the
  flag before relying on it as a guardrail.

### 3. Operative cross-skill calls name the Skill tool

- **What it is.** When a skill's own step must run another skill now, it
  says `Call the Skill tool with "grilling"`, one skill per call. Router
  prose that only names skills for a human keeps `/skill` labels.
- **Matt's reason.** Naming the tool "is what gets it fired"
  (`.agents/invocation.md`, § Dependencies between them; PR #878).
- **Here.** The `ub` skills never chain operatively. Each hands off by
  stopping ("Stop. Nothing to audit — that is the `ub:map` skill's job";
  whatif "STOP and tell the user to invoke ub:map"). That is correct: the
  hand-offs are deliberate human gates.
- **Fit: skip today, adopt when the owner agent chains.** If the owner agent
  gains an AFK chain (scheduled audit, then an impact check after an owner
  edit), write each operative step as an explicit Skill-tool call.

### 4. Information hierarchy and progressive disclosure

- **What it is.** A ladder: in-file steps, in-file reference, disclosed
  reference behind a pointer. Inline what every branch needs; disclose what
  only some branches reach. Keep a concept's rules beside its definition
  (**co-location**). **Sprawl** is the failure: too long even when every line
  is live.
- **Matt's reason.** Disclosure is "how the hierarchy is protected", not
  mainly a token saving (`writing-for-agents/SKILL.md`, § Information
  hierarchy); buried steps make attending to them a coin-flip.
- **Here.** Already the house shape: entry-state routing table, then hard
  rules, then a "Read when | File" references table in every skill
  (107–136 lines each).
- **Fit: already adopted.** No change.

### 5. Completion criteria: clear and demanding

- **What it is.** Every step ends on a done-condition. Clarity fights
  **premature completion**; demand drives **legwork**. Sharpen the bound
  first; hide later steps across a real context boundary only if the rush is
  observed.
- **Matt's reason.** "The strongest criteria are both checkable and
  exhaustive" (`writing-for-agents/SKILL.md`, § Steps and completion
  criteria).
- **Here.** `map`'s "Deterministic exit conditions" table (validator exit 0,
  sign-off hash recorded, read-back counts match) is the strongest form of
  this practice. `role.md` is weaker: "close with path completeness: ask what
  actually goes wrong … or say why no further path work is needed" has no
  checkable bound.
- **Fit: adopt in the agent prompt.** Give each owner-agent run a checkable
  exit (an interview ends when every step the owner named has a cell or an
  owner-confirmed "unknown"; an audit run ends when every roster check has
  recorded a finding or a pass).

### 6. Leading words, and prompting the positive

- **What it is.** A **leading word** is a pretrained concept (_tight_,
  _red_, _tracer bullet_, _fog of war_) repeated as a token so it anchors
  behaviour cheaply. Its failure-mode twin is **negation**: a prohibition
  makes the forbidden behaviour more available.
- **Matt's reason.** "Prompt the **positive**: state the target behaviour"
  (`writing-for-agents/SKILL.md`, § Leading words); a prohibition earns its
  place only as a hard guardrail, and then paired with the positive target.
- **Here.** The skills use leading words well (_slice_, _roster_,
  _finding_, _sign-off_). `role.md` leans on negation: eight
  "never / do not" phrasings in 40 lines ("never invent filler", "do not
  search exhaustively", "never by counting the page", "Never present an
  off-skill improvisation"). Several have an obvious positive form ("fill
  only what the user can source"; "answer counts from the TOTAL").
- **Fit: adopt for the owner agent's prompt.** Write the new role prompt
  positive-first, keep prohibitions only for true guardrails (no deletes, no
  promotion without acceptance), each paired with its target.

### 7. Pruning: single source, the environment as source, no-ops

- **What it is.** One meaning in one place; a doc that restates
  `package.json` or a config is a **cache** that goes stale; **sediment** is
  stale layers nobody dares remove; a **no-op** is a sentence the model
  already obeys. Delete the whole failing sentence.
- **Matt's reason.** Agents asked to trim "optimise for length, because
  length is the thing they can see"
  (`docs/productivity/writing-for-agents.md`, Common questions); the no-op
  test checks behaviour, settled by running the document.
- **Here.** `role.md` carries a likely stale or garbled clause ("a bare
  /audit only finds one and never runs it") and restates adapter rules it
  also points to ("batch caps, error etiquette, injection handling, no
  deletes all live there").
- **Fit: adopt.** One no-op and single-source pass on `role.md` when the
  owner agent's prompt is written; it starts from this file.

### 8. `CONTEXT.md` → `GLOSSARY.md`

- **What it is.** In 1.3.0 Matt renamed the domain-doc convention to
  `GLOSSARY.md` / `GLOSSARY-MAP.md` everywhere the skills read and write it
  (PRs #876, #1120). Migration is a manual `git mv`.
- **Matt's reason.** The file is "a glossary and nothing else", so the name
  should say so (`docs/engineering/domain-modeling.md`, FAQ). The pressure
  behind it: models treat "write to the domain doc" as permission to persist
  every answer, and the file turns into a running spec, "the most-reported
  problem with the skill" (same page). Note that page's FAQ entry was
  mangled by the find-and-replace and still argues the old side
  (mattpocock/skills#1281, #1153); the reason above is the one the shipped
  text supports.
- **Here.** `CONTEXT.md` is already glossary-only and machine-held to it
  (`scripts/check-glossary-only.mjs`), so the rename buys nothing on bloat.
  The real cost of not renaming is compatibility: the installed 1.3.1
  `domain-modeling` looks only for `GLOSSARY.md` and creates one "when the
  first term is resolved" (`skills/engineering/domain-modeling/SKILL.md`).
  Every wayfinder grilling ticket on this map calls `domain-modeling`, so a
  second, split glossary is one grilling session away. Our
  `docs/agents/domain.md` still says `CONTEXT.md`, which partly steers the
  skills back, but the skill's own text wins on file creation. 51 tracked
  files mention `CONTEXT.md`, 28 of them under `scripts/`.
- **Fit: adopt, decided on the rename ticket.** Until it lands, every
  grilling session on this map should be told to write terms into
  `CONTEXT.md`, and a stray `GLOSSARY.md` should be treated as a bug.

### 9. `wait-what` and Simplified Technical English

- **What it is.** A three-line user-invoked skill. Typed when a message did
  not land, it asks the agent to re-pitch with a little context, in ASD-STE100
  Simplified Technical English, using the glossary's nouns.
- **Matt's reason.** Name the listener's state, not the output: "The leading
  word is **wait**" (`docs/productivity/wait-what.md`). "Be concise" makes the
  model clip words and lose you further; "wait" makes it back up and supply
  the missing premise. It stays three lines because concision skills fail
  by growing: the model copies the skill's length, not its request.
- **Fit: adapt, and this one matters most for the owner agent.** The
  audience is a non-technical owner, so the register problem is the default
  case, not an occasional repair. Two moves:
  1. Put the register in the role prompt as a leading word: owner-facing
     replies in Simplified Technical English. STE is a controlled language
     from aerospace maintenance writing (short sentences, one meaning per
     word, active voice), so it recruits strong priors in one token.
  2. Ship an owner-typed `wait-what` equivalent as a user-invoked command.
  The caveat: STE fixes syntax, and the glossary supplies nouns, but our
  glossary's nouns (_lane_, _cell_, _path_, _finding_) are designer
  vocabulary. The owner needs the business's own words for its own service;
  the glossary term stays underneath for the data. That mapping is a domain
  decision (the map already lists **Audience** as a settled term) and belongs
  in `CONTEXT.md`, not in the prompt.

### 10. HITL vs AFK

- **What it is.** Every wayfinder ticket type is **HITL** (worked with a
  human who speaks for themselves: grilling, prototype) or **AFK** (the agent
  alone: research; a task is either). A HITL ticket resolves only through the
  live exchange.
- **Matt's reason.** A grilling agent "that answers its own questions has
  broken this" (`skills/engineering/wayfinder/SKILL.md`, § Ticket Types). The
  label fixed reports of `/wayfinder` grilling itself instead of the human
  (#763, `CHANGELOG.md`).
- **Fit: adopt, directly.** The owner agent is both. Interviewing the owner
  is HITL: the agent never fills the owner's side, which is exactly what
  **Owner-confirmed** must mean. The scheduled audit is AFK: it records
  findings and stops; anything needing the owner becomes a question queued
  for the next HITL session, never a decision. Label every agent route HITL
  or AFK in the spec, so "wait for the owner" falls out of the label instead
  of being restated as a rule.

### 11. Sizing work to one session

- **What it is.** A wayfinder ticket is "sized to one 100K token agent
  session" (`wayfinder/SKILL.md`, § Tickets); a `to-tickets` ticket fits "a
  single fresh context window" (`docs/engineering/to-tickets.md`). The
  **smart zone** is ~150k tokens. At a **phase boundary** choose, in order:
  continue, `/clear`, `/handoff`, subagent, `/compact`.
- **Matt's reason.** Every move except continue turns a primary source into
  a lossy secondary one; `/compact` first gives a session "confidently wrong"
  about what the summary flattened
  (`skills/engineering/ask-matt/PHASE-BOUNDARIES.md`).
- **Fit: adopt for the build, adapt for the agent.** For the v0 spec and its
  tickets: adopt as is. For the running agent: one owner session is one
  phase (an interview, an audit run, a what-if), and what must outlive it
  goes into the blueprint (the agent's memory) and the edit log, not into a
  transcript summary. The blueprint is a primary source by construction,
  which is the strongest argument for "blueprint as the agent's context".

### 12. The acceptance bar: "It's working if" and observed failures

- **What it is.** Each promoted skill has a human docs page ending in
  **It's working if** (observable signs of success). A change request must
  describe an **observed failure** from a real session (`SCOPE.md`, § The
  bar).
- **Matt's reason.** There is "no automated eval"; you check by running the
  document by hand (`docs/productivity/writing-for-agents.md`). Hypothetical
  improvements do not clear the bar.
- **Fit: adapt.** We have an eval harness (`scripts/agent-harness/`,
  `evals/`), which is stronger than "run it by hand". Borrow the two
  disciplines: write each owner-agent skill's "It's working if" list as the
  pilot acceptance criteria for the three businesses, and require an
  observed failure from a pilot transcript before editing a skill. Related
  warning from the same page: a skill written up from one run "fits that one
  run too closely"; generalise across all three pilots, not from Glimmer
  Health alone.

### Not adopted

- **No em-dashes in prose** (`CLAUDE.md`). House style; Matt gives no
  behavioural reason, and this repo's voice uses them throughout. Skip.
- **Router skill for many user-invoked skills** (`SKILL-MECHANICS.md`, §
  Router skills). We have four model-invoked skills and `AGENTS.md` as the
  router. Revisit only if user-invoked owner commands multiply.

## Recommended changes, ranked

1. **Label every owner-agent route HITL or AFK in the v0 spec.** The
   interview never answers for the owner; the scheduled audit records and
   queues, never decides. Highest leverage, zero code.
2. **Settle the `GLOSSARY.md` rename on its ticket before the next grilling
   ticket runs**, and until then tell each grilling session to write into
   `CONTEXT.md`. Prevents a split glossary.
3. **Owner-facing register: Simplified Technical English as a leading word in
   the role prompt**, plus an owner-to-glossary term mapping recorded in
   `CONTEXT.md` under Audience.
4. **Write the owner agent's role prompt fresh against
   `writing-for-agents`**: positive-first, checkable exit per run, one
   no-op pass; start from `src/lib/agent/role.md` but do not inherit its
   negations or its restated adapter rules.
5. **Prune the four skill descriptions** to one trigger per branch, adding
   owner phrasing only where it is a distinct branch; keep under the
   existing char budget.
6. **One session per agent phase, state in the blueprint**, written into the
   spec as the memory model.
7. **Pilot acceptance as "It's working if" lists**, generalised across all
   three businesses; skill edits require an observed pilot failure.
8. **User-invoked owner commands** (`wait-what`, accept a what-if) once the
   host's support for `disable-model-invocation` is confirmed.
