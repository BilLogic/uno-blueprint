# Customization

How a workspace takes a new template release, then the template's lane roles,
layouts, scale, agent account and portfolio conventions. Everything here is
guidance except two hard rules, both in the upgrade recipe: the
schema-version compat check, and every bump shipping its migration in the
same change.

A deployment's front end — theming, config fields, composition claims, agent
search, bundling — is `docs/guide/05-customizing-a-deployment.md`; the
headings at the end of this file point there.

## Contents

- Template upgrade recipe (⚠ compat check required)
- Lane roles
- Layouts & path kinds
- Scale
- Agent account
- Portfolio conventions (consultants / agencies)
- Pointers: theming, deployment inputs, composition, agent search, bundling

## Template upgrade recipe (⚠ compat check required)

The template evolves under N client workspaces. The plugin and template
version together; `blueprint-workspace.json` records the workspace's
`schema_version`.

1. **Check compat first**: compare the workspace `schema_version` with the
   new template's. Same → skip to step 4.
2. Read the template CHANGELOG between the two versions for schema and
   lane-role vocabulary changes.
3. Pull the new template into the workspace clone (git merge from the
   template remote, or re-clone + copy `blueprint/`, `.env`, `HANDOFF.md`,
   `blueprint-workspace.json` forward). Resolve conflicts in favor of the
   template for app code — workspace-local app edits are unsupported.
   Take `skills/`, `references/`, `agents/`, `scripts/` and `.agents/` from
   the new template whole. `.agents/skills/` is the copy of each skill that
   other coding agents read, and a copy by glob (`cp -r template/* .`) skips
   it because its name starts with a dot. Confirm it with
   `node scripts/sync-agent-skills.mjs --check`.
4. Carry the IR across the bump — do **not** hand-edit `schema_version`:

   ```
   python3 scripts/migrate_ir.py blueprint/blueprint.json \
       --workspace blueprint-workspace.json --write
   ```

   Dry-run first (drop `--write`) to read the plan. The script rewrites the
   IR's field names for each version it steps through, sets the new
   `schema_version` on the IR and the workspace state, and re-anchors sign-off
   (below). Editing the version by hand leaves the file's fields at the old
   shape while claiming the new one — the exact mis-parse the version exists
   to prevent.
5. Re-run `scripts/validate_ir.py` (vocabulary/schema drift surfaces here).
6. Re-import per `skills/map/references/review-import-playbook.md` (re-provision if the
   DDL changed), rebuild, redeploy, verify with `render-checker`.

**Never import an IR whose `schema_version` mismatches the workspace clone**
— that's the compat check the import pre-flight enforces.

### The versioning rule (⚠ hard rule for template authors)

**Every `schema_version` bump ships its migration in the same change.** A new
value in the enum in `references/ir-schema.json` and a new step in
`scripts/migrate_ir.py` land together, or neither lands. A bump without a step
tells every workspace it is out of date and hands it nothing to run — and the
IR is not re-derivable: sign-off is a human decision recorded against
content that already exists.

A version leaves the enum only when its migration stops existing, which is
also when an IR at that version stops being upgradable and the workspace must
check out the template revision that wrote it.

**The rule was broken once, at `2026.09.08`, and what it cost is worth
keeping.** `21000122000000` stamped a migrated database with that value for
the lane-role vocabulary, and neither the enum nor `scripts/migrate_ir.py`
ever learned it — so no workspace could author an IR against the version, and
a target that had run every migration in order read as a version this template
does not speak. `scripts/check-target-schema.mjs` exists to catch a target
that is behind, and for two releases it was failing the one that was exactly
right. The dependency rename that followed took `2026.09.09` rather than the
collision, because one stamp naming two shapes is worse than a gap.

The gap is closed. `to_2026_09_08` is the step that migration never shipped —
it renames a lane role carried by its retired spelling, which is what makes a
`2026.09.07` file importable into a database whose CHECK now refuses the old
word. The value was **added** to the enum, never moved: it is stamped inside
an applied migration and inside the generated portable core, and an applied
record keeps the spelling it was written with. Two lessons survive it. A bump
that lands in a migration is a bump, even when the change looks like it only
touched database identifiers — the wire format shares that namespace. And a
gap costs more the longer it stands: the debt was two releases old before
anyone ran the check against a freshly replayed database.

### Sign-off across a bump

Sign-off binds to a SHA-256 of a scenario's subtree
(`scripts/compute_signoff_hash.py`). Renames land **inside** that subtree —
2026.07.16 → 2026.08.25 moved `description` → `summary` and `layers` →
`lanes` — so a hash recorded before a bump does not match the migrated file.
Signed scenarios would silently de-sign.

`--workspace` is what prevents that. For each scenario whose recorded
`content_hash` equals its pre-migration hash, the migration replaces it with
the post-migration hash and keeps `signed_at`/`signed_by`: sound because a
step moves no authored *value* — it renames a field name, or materializes a
default the absent field already meant. A step that ever edits authored
content declares itself non-content-preserving, and the script refuses to
touch sign-off at all — those scenarios go back through review.

The cheapest answer is a bump that never enters the subtree. 2026.08.25 →
2026.08.26 gives a dependency edge an optional `kind` whose absence means the
drawn kind — what every existing edge already meant — so the step writes
nothing, every scenario hashes to the same digest as before, and `--workspace`
reports each signed scenario as already anchored. Materializing the default
into every edge would have been content-preserving too, and would have
re-hashed every signed scenario for no gain.

A recorded hash matching neither side was already stale (the scenario was
hand-edited after it was signed). The migration reports it and leaves it: it
is a re-review, not a rename. `targets[*].last_import.content_hash` is left
alone too — step 6 re-imports anyway, and that record is a claim about what a
target actually holds.

### Stale workspaces & the audit-skill fallback

Workspaces scaffolded before the audit skill split may lack its files, and
the two layouts genuinely differ: the template repo carries the split layout
(`skills/audit/SKILL.md`, check docs at `skills/audit/references/check-*.md`,
`skills/audit/scripts/audit_tools.py`), while installed-plugin layouts may be
pre-split — check docs at `references/check-*.md` with no `skills/audit/`
directory at all. A fallback that assumes one layout reports files as
missing when they merely live at the other path, so **try both paths**:
look under `skills/audit/references/` first, then `references/`, and treat
a file as absent only when neither has it.

To bring a stale workspace current, **re-vendor from the template repo**
concretely: copy `skills/audit/` (the SKILL.md, the `references/check-*.md`
docs, and `scripts/audit_tools.py`) plus `references/audit-playbook.md`
from the template repo into the workspace, then continue the upgrade recipe
above from step 4.

## Lane roles

The roles a lane may take, and the act a new one takes:
`references/lane-roles.md` § No custom roles and § Adding a role.

## Layouts & path kinds

Set per scenario / per path **in the IR**, not in code: `layout`
(`stacked` | `merged`) and `kind` (`happy` | `variant` | `exception`).

Retired values are recorded in `scripts/retired-vocabulary.mjs`.

The stacked layout compares any two labeled variants via `variant_label` —
designed-vs-reality, before/after a redesign, or two stakeholders' conflicting
accounts. There are no hardcoded scenario or path IDs left in the template; do
not reintroduce any.

## Scale

Schema and frontend support unbounded lanes/steps/paths — more actors just
means more lanes. The validator emits **soft warnings** above ergonomic
thresholds, never errors; the shipped sample content (8 paths across 6
scenarios, one 7-lane roster, widest board 8 lanes × 10 steps) is the proof
fixture.

## Agent account

A connected database can generate an agent-facing account of its schema —
vocabulary from `src/lib/panelTerms.ts`, table and column comments from
`public.schema_comments()`. The generator and its check live in this template;
the generated document is the deployment's own content.

```bash
npm run agent-account                 # splice the generated sections
npm run agent-account -- --record    # …and record the coverage ratchet
npm run check:agent-account            # fail if the account or the ratchet drifted
```

With no database configured, both commands print a skip and exit 0. Nothing
is generated, nothing is supplied, and the agent's `get_reference` list
is this template's own.

A deployment that has generated the account supplies it through its config —
never by teaching the template's reference loader a path:

- Put it on the deployment config: `agent: { references: { blueprint: account } }`,
  where `account` is the document's text (the host holds the `?raw` import).
  A name the template already serves replaces that document; a new name is
  listed to the agent right after the canvas adapter.

After adopting a release, the reference loader stays byte-identical to this
template's: extra names go through the config, not a path import of another
repository's file.

## Portfolio conventions (consultants / agencies)

- **One git workspace per client**: each client gets their own template
  clone with their own `blueprint/` dir and `blueprint-workspace.json`.
  Never mix clients in one workspace or one backend target.
- Per-client env & deploy registry: each workspace's state file records its
  own per-locale targets; keep client `.env` files out of git (verified
  gitignored).
- **`HANDOFF.md` per workspace** (generated from
  `assets/HANDOFF.md.template`): the offboarding story — where the IR lives,
  how to update, how to redeploy — written for whoever inherits the
  workspace after the engagement.
- Two authors collaborate via normal git branching; sign-off is per-branch.

## Theming & branding

The theme files' brand seam, the brand dials, edge weight and pinned touchpoint palettes: `docs/guide/05-customizing-a-deployment.md` § 1.

### Pinning an org touchpoint palette

Moved: `docs/guide/05-customizing-a-deployment.md` § Pinning an org touchpoint palette.

## Deployment inputs and their config homes

The config field that replaced each deployment-owned file: `docs/guide/05-customizing-a-deployment.md` § 2.

### The offline board is two fields

Moved: `docs/guide/05-customizing-a-deployment.md` § The offline board is two fields.

### Eagerly or behind a loader

Moved: `docs/guide/05-customizing-a-deployment.md` § Eagerly or behind a loader.

## Composition claims: what a deployment still documents

What a deployment claims under `composition.claimed`, and overriding a composition document by filename: `docs/guide/05-customizing-a-deployment.md` § 3.

## Agent search

Switching on `search_blueprint` and listing a deployment's vector indexes under `agent.search`: `docs/guide/05-customizing-a-deployment.md` § 4.

## Bundling the agent's tool definitions

The `?raw` loader a deployment's eval harness installs from `uno-blueprint/vite-imports`: `docs/guide/05-customizing-a-deployment.md` § 5.
