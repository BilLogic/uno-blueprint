# Skill evals

Two eval layers, per the Agent Skills best-practices guide ("build
evaluations first") and the skill-creator's description-optimization flow.

## trigger/ — does the right skill fire?

One JSON per skill, 16 queries each: 8 should-trigger (varied phrasings,
casual and formal, some that never name the skill) and 8 should-not
(near-misses that share keywords — the audit/whatif/slice confusions are
the valuable cases). Format is the skill-creator's eval-set schema:

```json
[{ "query": "...", "should_trigger": true }]
```

Run with the skill-creator plugin's optimization loop (requires the
`claude` CLI; each query runs 3× against the live skill description):

```bash
python -m scripts.run_loop \
  --eval-set evals/trigger/audit.json \
  --skill-path skills/audit \
  --model <session model id> \
  --max-iterations 5 --verbose
```

(cwd = the skill-creator skill directory, which ships `scripts/run_loop.py`.
It splits 60/40 train/test, proposes description rewrites, and reports
`best_description` by held-out score.) Descriptions are shared verbatim
with the app's composer and with the `.agents/skills/` mirror — if a loop
rewrites one, re-run `npm run sync:skills` in this repo (`npm test` runs both
`--check` drift guards and fails until you do).

Editing rules for the eval sets: keep queries realistic (backstory, file
paths, typos welcome), keep negatives genuinely tricky — an obviously
irrelevant query tests nothing.

## behavioral/ — does the skill do the right thing once fired?

`behavioral/evals.json`: three scenarios per skill in the
`{skills, query, files, expected_behavior}` shape from the best-practices
guide. There is no built-in runner; the working method:

1. Fresh session with the plugin installed (subagent or `claude -p`).
2. Give it the query (plus fixture files where listed).
3. Judge the transcript against each `expected_behavior` line — these are
   the invariants that regressions actually break (pre-flight gates,
   sign-off hashes, dedupe semantics, cite-only slices, no-write whatif).

The app-side counterpart (canvas surface) lives in this repo:
`scripts/agent-harness/` runs cases A–E against the live tool registry.
These behavioral evals cover the IDE surface the harness cannot reach.
