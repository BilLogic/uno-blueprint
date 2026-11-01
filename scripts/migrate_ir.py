#!/usr/bin/env python3
"""Carry a Service Blueprint IR forward across schema-version bumps.

Usage:
    python3 scripts/migrate_ir.py <ir-file> [--to <version>] \\
        [--workspace <blueprint-workspace.json>] [--write] [--json]

Exit codes:
    0 — the IR is already at the target version, or a migration path exists
        (and was applied, with --write)
    1 — the file could not be read, or no migration path reaches the target

The IR states the shape it was authored against in its own `schema_version`
field, and `scripts/validate_ir.py` refuses a file that is not at the version
this template speaks. This script is the other half of that refusal: the
named way to move a file the refusal is about.

⚠ THE VERSIONING RULE: every schema_version bump ships its migration in the
same change. A version that lands in the enum in `references/ir-schema.json`
without a step here is a bump that tells consumers they are out of date and
gives them nothing to run — and consumers have hand-signed-off data riding on
the IR, so re-authoring is not an available answer.

Migrations are chained: a file two bumps behind is carried through both steps
in IR order, so a step only ever has to know about its own predecessor.

## Sign-off hashes

Sign-off binds to a SHA-256 of a scenario's subtree (see
scripts/compute_signoff_hash.py and skills/map/references/workspace-state.md).
Renaming a field inside a scenario changes that subtree, so a recorded hash
does NOT survive a bump that touches scenario content — the 2026.07.16 →
2026.08.25 bump renames `description` → `summary`, `layers` → `lanes` and
`layer` → `lane`, all of which live under a scenario.

A bump does not HAVE to touch the subtree, and the cheapest sign-off answer is
to design one that does not. 2026.08.25 → 2026.08.26 adds an optional `kind` to
a dependency edge whose absence means exactly what every existing edge already
meant, so the step writes nothing into the tree: every scenario hashes to the
byte-identical digest afterwards and `--workspace` reports each one as already
anchored. Materializing the default into every edge would have been
content-preserving too — no authored value would have moved — but it would have
changed every signed scenario's hash for no gain, and made sign-off survival
depend on the operator remembering `--workspace`.

2026.08.26 → 2026.08.27 writes nothing either, and for a reason worth keeping
separate: the table it renamed was never in the IR. Only the stamp moves. Two
consecutive no-op hops is not a sign the versioning is idle — it is what a
schema version costs when the schema and the interchange format are allowed to
move independently, which is the arrangement that keeps sign-off cheap.

Rather than silently de-sign every scenario an org already approved, `--workspace`
re-anchors the recorded hashes: for each scenario whose stored `content_hash`
equals its PRE-migration hash, the stored hash is replaced with its
POST-migration hash and `signed_at`/`signed_by` are kept. That is sound
precisely because a migration step moves no authored VALUE — it renames a
field name, or materializes a defaulted one — and unsound the moment a step
starts editing content, so a step that does must say so
(`content_preserving = False`). Such a step is watched scenario by scenario:
the scenarios whose subtree it actually changed are left with their recorded
hash — stale on purpose, so they go back through review — and every other
scenario re-anchors as usual. A blanket refusal was the alternative, and it
would have de-signed a whole workspace over a step that touched none of it.

A stored hash that matches NEITHER side was already stale before the
migration ran: the scenario was hand-edited after it was signed. Those are
reported and left alone — repairing them is a re-review, not a rename.

`targets[*].last_import.content_hash` is deliberately untouched. The upgrade
recipe (references/customization.md) re-imports after a bump anyway, and a
last-import record is a claim about what a target actually holds; rewriting
it would be a lie about a database this script cannot see.

Stdlib only, like every script in this directory. Loads via
validate_ir.load_ir (JSON native; YAML only if PyYAML is importable).
"""

from __future__ import annotations

import argparse
import copy
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import compute_signoff_hash  # noqa: E402
import validate_ir  # noqa: E402


# ---------------------------------------------------------------------------
# Steps
# ---------------------------------------------------------------------------


def rename(obj, old: str, new: str) -> None:
    """Rename a key in place, preserving its position among its siblings.

    `obj[new] = obj.pop(old)` would move the field to the end of the object,
    which is a diff on every line between it and the end of the file for a
    format humans hand-edit and review.
    """
    if not isinstance(obj, dict) or old not in obj:
        return
    items = [(new if k == old else k, v) for k, v in obj.items()]
    obj.clear()
    obj.update(items)


def to_2026_08_25(doc: dict) -> None:
    """2026.07.16 → 2026.08.25 — the lane-vocabulary renames.

    Ten renames landed in the database (see the migrations in the
    21000101000000–21000109000000 band); five of them are visible in the IR:

        $.lifecycle                 → $.service
        <path>.layers               → lanes
        <cell>.layer, <cellref>.layer → lane
        description                 → summary, on service, phase, scenario,
                                      path and cell

    `description` on a LINK payload is deliberately not renamed: a link's
    description is prose about the link, and the schema still calls it
    `description`. That is why this walks the tree by shape instead of
    rewriting the text of the file — a global rename would take the links
    with it.
    """
    rename(doc, "lifecycle", "service")
    service = doc.get("service")
    if not isinstance(service, dict):
        return
    rename(service, "description", "summary")
    for phase in service.get("phases", []) or []:
        rename(phase, "description", "summary")
        for scenario in phase.get("scenarios", []) or []:
            rename(scenario, "description", "summary")
            for path in scenario.get("paths", []) or []:
                rename(path, "description", "summary")
                rename(path, "layers", "lanes")
                for cell in path.get("cells", []) or []:
                    rename(cell, "description", "summary")
                    rename(cell, "layer", "lane")
                for trigger in path.get("triggers", []) or []:
                    if isinstance(trigger, dict):
                        rename(trigger.get("source"), "layer", "lane")
                        rename(trigger.get("target"), "layer", "lane")


class Step:
    """One version-to-version hop.

    `content_preserving` is the sign-off contract: True means the step moves no
    authored VALUE — it renames a field name, or writes a field whose value is
    the default the absent field already meant — so what a signer approved is
    still what the file says, and the recorded hash may be re-anchored onto the
    migrated subtree. A step that edits, drops or synthesizes authored values
    must set it False — then sign-off is a human decision again and this script
    will not make it silently.

    True is not a claim that the hash is unchanged. A rename changes the
    subtree and therefore the hash, which is exactly why `--workspace` exists;
    a step that writes nothing (2026.08.25 → 2026.08.26) leaves the hash alone
    and re-anchoring reports it as already anchored. Both are content-
    preserving; only one needs the re-anchor to do any work.
    """

    def __init__(self, from_version: str, to_version: str, summary: str,
                 apply, content_preserving: bool = True) -> None:
        self.from_version = from_version
        self.to_version = to_version
        self.summary = summary
        self.apply = apply
        self.content_preserving = content_preserving


def to_2026_08_26(doc: dict) -> None:
    """2026.08.25 → 2026.08.26 — dependency edges gain `kind`.

    Nothing to do, and the nothing is the point.

    The database has stored `cell_dependencies.kind in ('trigger','needs')`
    since 20260729120000 and the app has read both kinds all along; the IR
    was the half that could not say `needs`, so a needs edge was silently
    dropped on export and could not survive a re-import. 2026.08.26 gives the
    edge a `kind` field — OPTIONAL, defaulting to 'trigger', which is the
    column default and the meaning every edge authored before this bump
    already had.

    So a 2026.08.25 file is already a valid 2026.08.26 file. Writing
    `"kind": "trigger"` into every edge would say the same thing at greater
    length, change every signed scenario's content hash, and put every
    existing blueprint one forgotten `--workspace` away from de-signing
    itself. The version stamp is the whole migration; `migrate_document`
    applies it.
    """


def to_2026_08_27(doc: dict) -> None:
    """2026.08.26 → 2026.08.27 — `propositions` became `business_models`.

    Nothing to do, for a different reason than the last no-op.

    2026.08.26 wrote nothing because the field it added was optional and its
    absence already meant the default. This one writes nothing because the
    table it renamed is not in the IR at all: `business_models` holds one
    record per service and is authored at RUNTIME by the ub:* skills, like
    slices, findings and evidence. The IR carries the blueprint — phases,
    scenarios, paths, cells, dependencies — and never carried this.

    The version still moves, because the SCHEMA moved and the stamp is what a
    target is checked against. A file that says 2026.08.26 would be refused by
    a template speaking 2026.08.27 even though the two documents are byte-
    identical apart from the stamp, which is exactly what this step exists to
    fix.
    """


def to_2026_08_31(doc: dict) -> None:
    """2026.08.27 → 2026.08.31 — `links` splits into `resources` and
    `touchpoints`.

    A cell's `links` array carried two unrelated things under a name that
    described one of them: entries typed `url`, which are what the cell points
    at, and entries typed `tech_description`, which are prose, screenshots and
    a design link about ONE touchpoint used at this cell. The database column
    behind it is now two tables (21000113000000), and this is the same split
    one layer up, where an author writes.

    Field by field:

        {type: url, label, url}                  → resources[]: {name, url}
        {type: tech_description, label,
         description, picture, pictures, url}    → touchpoints[]: {name,
                                                    summary, screenshots, url}

    `label` becomes `name` because both objects name a thing a reader
    navigates to. `description` becomes `summary` on a TOUCHPOINT for the
    reason 2026.08.25 renamed it everywhere else — it is the one-line précis
    of the thing, and 2026.08.25 spared it only because a link's description
    was prose about the link rather than about a touchpoint. `picture` and
    `pictures` become one `screenshots` array, which is what the two fields
    were always describing: the reader already preferred `pictures` when both
    were set, so folding them loses nothing and stops a second answer.

    CONTENT-PRESERVING. Every authored value survives under a new name, in the
    same order, and nothing is synthesized: an entry with no `type` is left
    alone below rather than guessed at, so a file this step cannot read fails
    validation with its content intact rather than passing with content this
    script invented. The discriminator `type` is the one field that stops
    existing, and it is not an authored value — it is the array membership the
    two new arrays now say structurally.
    """
    service = doc.get("service")
    if not isinstance(service, dict):
        return
    for phase in service.get("phases", []) or []:
        for scenario in phase.get("scenarios", []) or []:
            for path in scenario.get("paths", []) or []:
                for cell in path.get("cells", []) or []:
                    _split_links(cell)


def _split_links(cell) -> None:
    if not isinstance(cell, dict) or "links" not in cell:
        return
    links = cell.pop("links")
    if not isinstance(links, list):
        # Left where the validator will find it: a `links` value that is not
        # an array is not something this step can read, and inventing an empty
        # array in its place would hide the file that needs a person.
        cell["links"] = links
        return

    resources: list = []
    touchpoints: list = []
    unreadable: list = []
    for link in links:
        if not isinstance(link, dict):
            unreadable.append(link)
            continue
        if link.get("type") == "url":
            resource = {"name": link.get("label")}
            if "url" in link:
                resource["url"] = link["url"]
            resources.append(resource)
        elif link.get("type") == "tech_description":
            touchpoint = {"name": link.get("label")}
            if "description" in link:
                touchpoint["summary"] = link["description"]
            screenshots = [
                shot
                for shot in (link.get("pictures") or [link.get("picture")])
                if isinstance(shot, str) and shot.strip()
            ]
            if screenshots:
                touchpoint["screenshots"] = screenshots
            if "url" in link:
                touchpoint["url"] = link["url"]
            touchpoints.append(touchpoint)
        else:
            unreadable.append(link)

    if resources:
        cell["resources"] = resources
    if touchpoints:
        cell["touchpoints"] = touchpoints
    if unreadable:
        cell["links"] = unreadable


def to_2026_09_01(doc: dict) -> None:
    """2026.08.31 → 2026.09.01 — the two dependency kinds, and one of them turns.

    `trigger` becomes `leads_to` and `needs` becomes `enables`, matching
    21000114000000. The first is a rename. The second is not:

        A needs   B   →  B comes first, B is required by A
        A enables B   →  A comes first, A makes B possible

    So every `needs` edge has its `source` and `target` exchanged as its kind
    is rewritten. An edge left where it lay would claim the exact reverse of
    what its author wrote. This is the only migration step in this file that
    moves authored content rather than a stamp, which is why it is also the
    only one that can change a scenario's content hash — a workspace holding
    signed `needs` edges re-signs those scenarios, and that is correct: the
    bytes really did change.

    `trigger` edges are rewritten in place because a rename cannot move a
    meaning. An edge with NO kind is left alone: absence meant the drawn kind
    before this bump and still does, so a file full of bare edges migrates by
    its stamp and hashes identically.
    """
    service = doc.get("service")
    if not isinstance(service, dict):
        return
    for phase in service.get("phases", []) or []:
        for scenario in phase.get("scenarios", []) or []:
            for path in scenario.get("paths", []) or []:
                for edge in path.get("triggers", []) or []:
                    if not isinstance(edge, dict):
                        continue
                    kind = edge.get("kind")
                    if kind == "trigger":
                        edge["kind"] = "leads_to"
                    elif kind == "needs":
                        edge["source"], edge["target"] = (
                            edge.get("target"),
                            edge.get("source"),
                        )
                        edge["kind"] = "enables"


def to_2026_09_02(doc: dict) -> None:
    """2026.09.01 → 2026.09.02 — a cell's `picture` is its `frame`.

    One word had to serve two ideas: the image on a cell, and the border drawn
    around one in a walkthrough. The vocabulary settles it — `frame` is ONE
    image on ONE cell, a step's frames across the lanes are its `strip`, a
    slice's screen is a `slide`, and `storyboard` is the lane — so the column
    took the word and the picture-frame sense kept it only where it means a
    border.

    A straight rename of one optional field. Every authored value moves, so a
    file that sets any `picture` changes its bytes and its scenarios re-sign;
    a file that sets none migrates by its stamp alone.
    """
    service = doc.get("service")
    if not isinstance(service, dict):
        return
    for phase in service.get("phases", []) or []:
        for scenario in phase.get("scenarios", []) or []:
            for path in scenario.get("paths", []) or []:
                for cell in path.get("cells", []) or []:
                    if isinstance(cell, dict) and "picture" in cell:
                        cell["frame"] = cell.pop("picture")


def to_2026_09_03(doc: dict) -> None:
    """2026.09.02 → 2026.09.03 — one spelling each, and two shorter enums.

    `path_type`, `slice_type` and `view_type` all said "the kind of thing this
    is" in a field that could say `kind`, which dependency edges already did.
    Two of those three reach the IR, as `paths[].path_type` and
    `scenarios[].view_type`; the third is a runtime column the IR never carried.

    Both also lose values, and that is the part that moves authored content:

      unhappy, alternative  →  variant     two spellings of one thing, and
                                           `exception` already carries "this
                                           went wrong"
      side-by-side, integrated  →  stacked one layout a reader switches
                                           between, not two a scenario is
                                           stored as

    A file that authored either retired value changes its bytes and its
    scenarios re-sign. A file that stated neither field migrates by its stamp
    alone.
    """
    path_kinds = {"variant": "variant", "variant": "variant"}
    layouts = {"side-by-side": "stacked", "integrated": "stacked"}

    service = doc.get("service")
    if not isinstance(service, dict):
        return
    for phase in service.get("phases", []) or []:
        for scenario in phase.get("scenarios", []) or []:
            if not isinstance(scenario, dict):
                continue
            if "view_type" in scenario:
                scenario["layout"] = scenario.pop("view_type")
            if scenario.get("layout") in layouts:
                scenario["layout"] = layouts[scenario["layout"]]
            for path in scenario.get("paths", []) or []:
                if not isinstance(path, dict):
                    continue
                if "path_type" in path:
                    path["kind"] = path.pop("path_type")
                if path.get("kind") in path_kinds:
                    path["kind"] = path_kinds[path["kind"]]


def to_2026_09_04(doc: dict) -> None:
    """2026.09.03 → 2026.09.04 — a scenario left merged opens merged.

    `layout` was `single | stacked` while the canvas drew three things, and
    the one a reader reached for most — merged, the paths combined into ONE
    blueprint — was the one the field could not say. Now it can:

      single  →  stacked      stacked with one path IS one path drawn in
                              full; `single` only changed which component
                              drew it, so nothing a reader sees moves

    A file that authored `single` changes its bytes and its scenarios
    re-sign. A file that authored `stacked` migrates by its stamp alone.
    `merged` is new, so no existing file carries it.
    """
    service = doc.get("service")
    if not isinstance(service, dict):
        return
    for phase in service.get("phases", []) or []:
        for scenario in phase.get("scenarios", []) or []:
            if isinstance(scenario, dict) and scenario.get("layout") == "single":
                scenario["layout"] = "stacked"


def to_2026_09_05(doc: dict) -> None:
    """2026.09.04 → 2026.09.05 — a resource keeps its id, knows its cell,
    and one of them is featured.

    The IR carries two of the four: `resources[].kind` loses `other`, which
    named nothing, for `attachment`, which names a file the cell points at;
    and `resources[].featured` arrives, optional, absent meaning false. The
    id and the cell are the database's — the IR nests a resource under its
    cell already.

      other  →  attachment

    A file that authored `other` changes its bytes and its scenarios
    re-sign. No shipped fixture did.
    """
    service = doc.get("service")
    if not isinstance(service, dict):
        return
    for phase in service.get("phases", []) or []:
        for scenario in phase.get("scenarios", []) or []:
            if not isinstance(scenario, dict):
                continue
            for path in scenario.get("paths", []) or []:
                if not isinstance(path, dict):
                    continue
                for cell in path.get("cells", []) or []:
                    if not isinstance(cell, dict):
                        continue
                    for resource in cell.get("resources", []) or []:
                        if isinstance(resource, dict) and resource.get("kind") == "other":
                            resource["kind"] = "attachment"


def to_2026_09_06(doc: dict) -> None:
    """2026.09.05 → 2026.09.06 — a placement says what a tool does here.

    A touchpoint placement is its words (`summary`), its weight (`role`,
    new and optional) and what it points at (`resources`). The two URL
    fields it carried become resources ON the placement, named after it:

      url             →  resources[]: {kind: link, featured: true}
      screenshots[i]  →  resources[]: {kind: attachment, featured: i == 0}

    A file that authored either field changes its bytes and its scenarios
    re-sign; the shipped fixture did.
    """
    service = doc.get("service")
    if not isinstance(service, dict):
        return
    for phase in service.get("phases", []) or []:
        for scenario in phase.get("scenarios", []) or []:
            if not isinstance(scenario, dict):
                continue
            for path in scenario.get("paths", []) or []:
                if not isinstance(path, dict):
                    continue
                for cell in path.get("cells", []) or []:
                    if not isinstance(cell, dict):
                        continue
                    for touchpoint in cell.get("touchpoints", []) or []:
                        if not isinstance(touchpoint, dict):
                            continue
                        moved = []
                        url = touchpoint.pop("url", None)
                        if url:
                            moved.append({"name": touchpoint.get("name"), "url": url, "featured": True})
                        for index, shot in enumerate(touchpoint.pop("screenshots", None) or []):
                            if not shot:
                                continue
                            moved.append({
                                "name": touchpoint.get("name"),
                                "url": shot,
                                "kind": "attachment",
                                "featured": index == 0,
                            })
                        if moved:
                            touchpoint["resources"] = list(touchpoint.get("resources") or []) + moved


def to_2026_09_07(doc: dict) -> None:
    """2026.09.06 → 2026.09.07 — a touchpoint is a thing the service owns.

    The service gains an optional `touchpoints` registry; a placement still
    names its touchpoint by name, and the import mints a registry row for
    every name the registry lacks. Nothing in an existing file moves: the
    registry is optional and a placement's shape is unchanged, so only the
    stamp changes.
    """
    return


#: What a retired lane role became, transcribed from
#: `scripts/retired-vocabulary.mjs` — the one list this repository keeps of
#: what each retired word turned into. Restated here rather than read, because
#: that list is JavaScript and every script in this directory is stdlib Python;
#: `21000122000000` restates it in SQL for the same reason.
RETIRED_LANE_ROLES = {
    "frontstage_tech": "frontstage_touchpoints",
    "backstage_tech": "backstage_touchpoints",
    "support_systems": "backstage_touchpoints",
    "visual": "storyboard",
    "step_visual": "storyboard",
}


def to_2026_09_08(doc: dict) -> None:
    """2026.09.07 → 2026.09.08 — the tech lanes were never only tech.

    `21000122000000` closed `lanes.lane_role` to eight values and renamed the
    roles it retired on the way in. This is the wire-format half of that
    migration, written two releases after it (#197): the migration stamped a
    database with `2026.09.08` and taught neither the enum in
    `references/ir-schema.json` nor this script the value, so a correctly
    migrated target read as INCOMPATIBLE to `scripts/check-target-schema.mjs`
    — a check that exists to catch a target which is behind, failing the one
    that was exactly right.

    THIS IS NOT AN IDENTITY BUMP, and reading the migration is what settles
    it. The IR's `lanes[].role` is that column: the schema field says
    `lanes.lane_role` in as many words, `seed_lane_fields` in
    `scripts/generate_seed_sql.py` writes the authored string straight into
    it, and nothing between the two normalises anything. So a document
    authored at `2026.09.07` may carry a role by its retired spelling, and
    that document now meets a database whose CHECK constraint refuses the
    word. Renaming it here is the whole of what keeps such a file importable.

    The five renames are `RETIRED_LANE_ROLES` above, and each carries the
    migration's own reasoning. A "tech" lane never held only software — it
    held the things a moment happens THROUGH, which is a touchpoint.
    `support_systems` did two jobs at once, back-office people and back-office
    systems, and every lane wearing it in this template is the systems half.
    `visual` said what the MEDIUM is where every sibling role says what the
    row is FOR, and `step_visual` named a storyboard variation a step never
    carried.

    WHAT THIS STEP DOES NOT DO, and where the question it parked was
    answered. The migration also sets to NULL every role outside the closed
    eight, an adopter's own word included. It had to: `add constraint`
    validates every existing row as it is added, so a lane already in the
    table had to be re-classified or the migration would abort. A document
    being carried forward is under no such duress, so this step renames the
    five and leaves anything else alone — deleting a role here would have
    settled by deletion a question nobody had asked: whether the IR closes the
    set the way the database does.

    That question was asked, and answered yes (#204). Leaving the IR open let
    a document validate and then be refused by the target's CHECK, which is
    the value named at the one moment the author can do nothing about it. So
    `references/ir-schema.json` now carries the eight as an enum,
    `scripts/validate_ir.py` refuses a ninth, and `to_2026_09_10` below is
    where a role outside the set becomes null — the same answer this migration
    gave the rows it found, asked at the version boundary where a carried
    document can hear it. This step is unchanged: its hop is the rename, and a
    step only ever answers for its own predecessor.

    A lane's role is authored content and lives inside a scenario's subtree,
    so this step declares itself NOT content-preserving — the second step ever
    to do so, after the `needs` turnaround at 2026.09.01. The declaration is
    watched per scenario rather than applied in bulk: a scenario holding a
    renamed lane keeps its recorded hash and reads as stale until someone
    re-signs it, and a document carrying none of the five hashes identically
    on both sides and re-anchors as usual. Most files are the second kind.
    """
    service = doc.get("service")
    if not isinstance(service, dict):
        return
    for phase in service.get("phases", []) or []:
        for scenario in phase.get("scenarios", []) or []:
            if not isinstance(scenario, dict):
                continue
            for path in scenario.get("paths", []) or []:
                if not isinstance(path, dict):
                    continue
                for lane in path.get("lanes", []) or []:
                    if not isinstance(lane, dict):
                        continue
                    role = lane.get("role")
                    if isinstance(role, str) and role in RETIRED_LANE_ROLES:
                        lane["role"] = RETIRED_LANE_ROLES[role]


def to_2026_09_09(doc: dict) -> None:
    """2026.09.08 → 2026.09.09 — a path's `triggers` are its `dependencies`.

    One straight rename of one array, and the last estate to take a word the
    other two settled long ago. The database has held `cell_dependencies` since
    `21000103000000`; the app's domain layer took `dependency` at release 1.5.0;
    the interchange format went on saying `triggers`, which meant the field a
    person hand-edits was the one place the retired word survived. The owner
    settled all three together, and this step is the wire-format half of it
    (#159).

    A rename rather than a search-and-replace, because a wire-format field IS a
    schema version: `scripts/validate_ir.py` refuses a document at any older
    stamp and names this script, and this step is what that refusal is for. An
    IR authored with `triggers` still loads — it loads by being carried here
    first, which is the same contract every bump above has.

    `rename` keeps the array where it sat among its siblings, so the diff a
    person reviews is the one line whose name changed rather than every line
    between it and the end of the file. Every authored VALUE stays where it is,
    so the step is content-preserving; the subtree bytes do move, so a signed
    scenario re-anchors under `--workspace` exactly as the `layers` → `lanes`
    rename did.

    WHY 2026.09.09 AND NOT 2026.09.08, AND WHAT CLOSED THE HOLE. The version
    namespace is shared with the database — `check-target-schema.mjs` reads a
    live target's `public.schema_version` against the enum in
    `references/ir-schema.json` — and `21000122000000` had already stamped
    `2026.09.08` for the lane-role vocabulary without ever adding the value
    here or writing a step for it. Spending `2026.09.08` on this rename would
    have given one stamp two shapes, so this step took the next number and
    left the hole for the migration that made it.

    That hole is closed (#197). `to_2026_09_08` above is the lane-role step
    `21000122000000` never shipped, and this step's predecessor is now that
    version rather than `2026.09.07`. The value was ADDED to the enum rather
    than moved into place: it is stamped inside an applied migration and
    inside the generated portable core, and an applied record keeps the
    spelling it was written with. So the chain runs `.07` → `.08` → `.09`,
    continuous and in order, and a document two hops behind still needs to
    know only about its own predecessor.
    """
    service = doc.get("service")
    if not isinstance(service, dict):
        return
    for phase in service.get("phases", []) or []:
        for scenario in phase.get("scenarios", []) or []:
            if not isinstance(scenario, dict):
                continue
            for path in scenario.get("paths", []) or []:
                rename(path, "triggers", "dependencies")


def to_2026_09_10(doc: dict) -> None:
    """2026.09.09 → 2026.09.10 — the lane vocabulary closes in the wire format too.

    `21000122000000` closed `lanes.lane_role` to eight values with a CHECK and
    `to_2026_09_08` above carried the retired spellings across it. What neither
    did was close the WIRE FORMAT: `references/ir-schema.json` went on admitting
    any `^[a-z0-9][a-z0-9_]*$` and `scripts/validate_ir.py` passed a ninth role
    in silence. So a document could validate and still be refused on import, and
    the refusal arrived as a constraint violation half-way through the write —
    the value named, but at the one moment its author can no longer fix it
    (#204).

    Three answers were on the table: close the schema, open the constraint, or
    document the gap and live with it. The schema closes. Everything else here
    already states the set as closed — the constraint, the `lanes.lane_role`
    column comment, `docs/erd.mmd`, `references/lane-roles.md` — and
    `lane_role` is read as exhaustive by code that switches on it, so opening
    the column would have meant auditing every such reader for a value that had
    never reached it.

    This step is what closing costs a document that is already authored. A role
    outside the eight becomes `null` — a generic swimlane, which is precisely
    how that role already drew: no style of its own, no divider anchored on it.
    That is the same answer `21000122000000` gave the rows it found, and it is
    given here at a version boundary, where the migration report names the file
    and `--workspace` puts the affected scenarios back through review, rather
    than by a Postgres error mid-import.

    THE LANE'S NAME IS UNTOUCHED, and that is the whole reason nulling is not
    the deletion it looks like. `display_name` is free-form in any language and
    carries what the lane MEANS ("Compliance Review"); `role` carries what the
    renderer must do about it, and there was never anything for it to do. The
    reader of a migrated file still sees the compliance lane. What goes is a
    key no target would have stored.

    A role is authored content inside a scenario's subtree, so the step is
    `content_preserving = False` — the third, after the edge turnaround at
    2026.09.01 and the rename at 2026.09.08. Watched per scenario as those are:
    a scenario holding a nulled role keeps its recorded hash and reads as stale
    until someone re-signs it, and a document carrying none — which is most of
    them, the eight having been the only importable values all along — hashes
    identically on both sides and re-anchors as usual.

    NO MIGRATION STAMPS THIS VERSION, and none needs to: the database has
    refused the ninth value since `21000122000000` stamped `2026.09.08`. The
    version namespace is shared, `scripts/check-target-schema.mjs` accepts any
    version this checkout speaks, and a target sitting at `2026.09.08` stays
    compatible. `2026.09.09` set that precedent — a wire-format bump with no
    DDL behind it — and this is the second.
    """
    service = doc.get("service")
    if not isinstance(service, dict):
        return
    for phase in service.get("phases", []) or []:
        for scenario in phase.get("scenarios", []) or []:
            if not isinstance(scenario, dict):
                continue
            for path in scenario.get("paths", []) or []:
                if not isinstance(path, dict):
                    continue
                for lane in path.get("lanes", []) or []:
                    if not isinstance(lane, dict):
                        continue
                    role = lane.get("role")
                    if role is not None and role not in validate_ir.CANONICAL_ROLES:
                        lane["role"] = None


def to_2026_09_11(doc: dict) -> None:
    """2026.09.10 → 2026.09.11 — a service carries its own examples.

    The service block gains an optional `entity_examples` map: one free-text
    example per core kind, in this deployment's own words, shown under that
    kind's generic definition. `21000123000000` added the column and granted it
    to a signed-in author, and the wire format never learned it — so the value
    was writable from the editor and invisible to the pipeline, and a re-map
    wrote nothing where a deployment had something.

    Nothing in an existing file moves. The map is optional, absent means the
    deployment has authored none, and the seed generator reads an absent map as
    silence rather than as an instruction to clear — so only the stamp changes.

    The stamp changes at all because a version names a SHAPE. `2026.09.10`
    refuses `entity_examples` and this one accepts it; leaving both under one
    value would make the stamp mean two shapes, which is the confusion
    `references/customization.md` records as worse than a gap. No migration
    stamps this version — the database has had the column since
    `21000123000000` — so a target at an earlier version stays compatible.
    """
    return


def to_2026_09_12(doc: dict) -> None:
    """2026.09.11 → 2026.09.12 — a link may cross paths within one service.

    A dependency end gains two optional qualifiers, `path` and `scenario`,
    naming a cell on another path of the service (ADR 0035). An end without
    them is on the path that lists the link, which is what every end authored
    before this version meant, so nothing in an existing file moves and only
    the stamp changes.

    The stamp changes because a version names a shape: `2026.09.11` refuses
    a qualified end and this one accepts it. No migration stamps this version
    — the database took cross-path links in `21000324000000` — so a target at
    an earlier version stays compatible.
    """
    return


STEPS = (
    Step(
        "2026.07.16",
        "2026.08.25",
        "lane vocabulary: lifecycle→service, layers→lanes, layer→lane, "
        "description→summary",
        to_2026_08_25,
    ),
    Step(
        "2026.08.25",
        "2026.08.26",
        "dependency edges gain an optional `kind` (trigger | needs); absent "
        "means trigger, so no authored content moves",
        to_2026_08_26,
    ),
    Step(
        "2026.08.26",
        "2026.08.27",
        "propositions became business_models; the table is runtime output and "
        "was never in the IR, so only the stamp moves",
        to_2026_08_27,
    ),
    Step(
        "2026.08.27",
        "2026.08.31",
        "a cell's `links` array splits into `resources` and `touchpoints`; "
        "label→name, description→summary, picture/pictures→screenshots",
        to_2026_08_31,
    ),
    Step(
        "2026.08.31",
        "2026.09.01",
        "dependency kinds: trigger→leads_to, and needs→enables with the edge "
        "turned around, because the two words put the source at opposite ends",
        to_2026_09_01,
        # Swapping source and target on a `needs` edge is authored content
        # moving, not a field renamed under it.
        content_preserving=False,
    ),
    Step(
        "2026.09.01",
        "2026.09.02",
        "a cell's `picture` is its `frame`; slice_items became slides and its "
        "caption a title, neither of which the IR ever carried",
        to_2026_09_02,
    ),
    Step(
        "2026.09.02",
        "2026.09.03",
        "paths[].path_type became .kind and scenarios[].view_type became "
        ".layout; both enums lost a duplicate spelling (unhappy/alternative "
        "\u2192 variant, side-by-side/integrated \u2192 stacked)",
        to_2026_09_03,
    ),
    Step(
        "2026.09.03",
        "2026.09.04",
        "scenarios[].layout is stacked | merged: `single` folds into stacked "
        "(one path stacked is one band), and merged — until now a session-only "
        "display — is a value a scenario is stored as",
        to_2026_09_04,
    ),
    Step(
        "2026.09.04",
        "2026.09.05",
        "resources[].kind is link | attachment (`other` folds into attachment) "
        "and resources[].featured arrives, optional; a resource keeps its id "
        "across a save and every row knows its cell",
        to_2026_09_05,
    ),
    Step(
        "2026.09.05",
        "2026.09.06",
        "touchpoints[].url and .screenshots become resources on the placement "
        "(a featured link; attachments with the first featured), and "
        "touchpoints[].role arrives, optional",
        to_2026_09_06,
    ),
    Step(
        "2026.09.06",
        "2026.09.07",
        "the service gains an optional `touchpoints` registry; placements "
        "still name their touchpoint by name and the import mints the rest, "
        "so only the stamp moves",
        to_2026_09_07,
    ),
    Step(
        "2026.09.07",
        "2026.09.08",
        "the lane vocabulary closes: the tech roles become touchpoints, "
        "support_systems folds into backstage touchpoints and the storyboard "
        "role takes its own name — the wire-format half of 21000122000000, "
        "written after the fact (#197)",
        to_2026_09_08,
        # A lane's role is authored content, and it lives inside a scenario's
        # subtree. A file carrying one of the five re-signs; a file carrying
        # none of them hashes identically and re-anchors.
        content_preserving=False,
    ),
    Step(
        "2026.09.08",
        "2026.09.09",
        "a path's `triggers` array is its `dependencies` — the word the "
        "database has used since 21000103000000 and the app since 1.5.0, "
        "reaching the interchange format last",
        to_2026_09_09,
    ),
    Step(
        "2026.09.09",
        "2026.09.10",
        "lanes[].role closes to the eight the database has admitted since "
        "21000122000000: a role outside the set becomes null, the generic "
        "swimlane it already drew as (#204)",
        to_2026_09_10,
        # A lane's role is authored content inside a scenario's subtree. A file
        # carrying a role outside the eight re-signs; a file carrying none —
        # which is every file a target ever accepted — hashes identically.
        content_preserving=False,
    ),
    Step(
        "2026.09.10",
        "2026.09.11",
        "the service block gains an optional `entity_examples` map — the "
        "per-kind examples 21000123000000 gave the database and the wire "
        "format never learned; nothing authored moves",
        to_2026_09_11,
    ),
    Step(
        "2026.09.11",
        "2026.09.12",
        "a dependency end may name another path (and scenario) of the "
        "service with `path` and `scenario`; an unqualified end is on the "
        "listing path, as before, so nothing authored moves",
        to_2026_09_12,
    ),
)


def current_version() -> str | None:
    """The version this template speaks — the newest in the schema's enum."""
    known = validate_ir.supported_schema_versions()
    return known[0] if known else None


def migration_path(from_version: str, to_version: str) -> list | None:
    """The steps carrying from_version to to_version, or None if none do."""
    if from_version == to_version:
        return []
    by_from = {step.from_version: step for step in STEPS}
    chain: list = []
    version = from_version
    seen = {version}
    while version != to_version:
        step = by_from.get(version)
        if step is None or step.to_version in seen:
            return None
        chain.append(step)
        version = step.to_version
        seen.add(version)
    return chain


# ---------------------------------------------------------------------------
# Documents
# ---------------------------------------------------------------------------


def iter_scenarios(doc: dict):
    """Yield (key, scenario) under either root name, so a PRE-migration file
    can be hashed with the same code as a POST-migration one."""
    root = doc.get("service")
    if not isinstance(root, dict):
        root = doc.get("lifecycle")
    if not isinstance(root, dict):
        return
    for phase in root.get("phases", []) or []:
        for scenario in phase.get("scenarios", []) or []:
            if isinstance(scenario, dict) and "key" in scenario:
                yield scenario["key"], scenario


def scenario_hashes(doc: dict) -> dict:
    return {
        key: compute_signoff_hash.scenario_content_hash(scenario)
        for key, scenario in iter_scenarios(doc)
    }


def migrate_document(doc: dict, chain: list, moved: set | None = None) -> dict:
    """Apply a chain of steps to a copy of doc, returning the migrated copy.

    When `moved` is given, every scenario key whose subtree a
    non-content-preserving step changed is added to it. Those are the
    scenarios whose sign-off cannot be carried across mechanically.
    """
    migrated = copy.deepcopy(doc)
    for step in chain:
        prior = None if step.content_preserving else scenario_hashes(migrated)
        step.apply(migrated)
        migrated["schema_version"] = step.to_version
        if prior is not None and moved is not None:
            now = scenario_hashes(migrated)
            moved.update(key for key, digest in now.items() if prior.get(key) != digest)
    return migrated


def reanchor_workspace(workspace: dict, before: dict, after: dict,
                       to_version: str, moved: set | None = None) -> list:
    """Move each signed scenario's recorded hash onto its migrated subtree.

    A scenario in `moved` (its authored content changed across a step) keeps
    its recorded hash untouched, so it reads as stale until someone re-signs
    it. Mutates `workspace`. Returns one report line per scenario it looked at.
    """
    notes: list = []
    moved = moved or set()
    workspace["schema_version"] = to_version
    scenarios = workspace.get("scenarios")
    if not isinstance(scenarios, dict):
        return notes
    for key, entry in scenarios.items():
        if not isinstance(entry, dict):
            continue
        recorded = entry.get("content_hash")
        if not recorded:
            continue
        if key not in before:
            notes.append(f"  {key}: signed, but absent from the IR — left alone")
            continue
        if recorded == after[key]:
            notes.append(f"  {key}: already anchored to the migrated subtree")
        elif key in moved and recorded == before[key]:
            notes.append(
                f"  {key}: authored content moved in this migration (an edge "
                "turned around), so its sign-off is not carried across. Left "
                "alone; re-review and re-sign this scenario."
            )
        elif recorded == before[key]:
            entry["content_hash"] = after[key]
            notes.append(f"  {key}: re-anchored {recorded} -> {after[key]}")
        else:
            notes.append(
                f"  {key}: recorded hash matches neither the pre- nor the "
                "post-migration subtree — it was already stale before this "
                "migration (hand-edited after sign-off). Left alone; re-review "
                "and re-sign this scenario."
            )
    return notes


def write_json(path: Path, doc: dict) -> None:
    path.write_text(
        json.dumps(doc, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(
        description="Carry a Service Blueprint IR forward across schema-version bumps."
    )
    parser.add_argument("ir_file", help="IR file (.json native; .yaml if PyYAML is installed)")
    parser.add_argument("--to", dest="to_version", default=None,
                        help="target schema_version (default: the version this template speaks)")
    parser.add_argument("--workspace", default=None,
                        help="blueprint-workspace.json — re-anchors its sign-off hashes")
    parser.add_argument("--write", action="store_true",
                        help="write the migrated files (default: report the plan only)")
    parser.add_argument("--json", action="store_true",
                        help="print the migrated IR to stdout instead of writing it")
    args = parser.parse_args(argv)

    ir_path = Path(args.ir_file)
    doc, load_error = validate_ir.load_ir(ir_path)
    if load_error is not None:
        print(f"ERROR: {load_error}", file=sys.stderr)
        return 1
    if not isinstance(doc, dict):
        print(f"ERROR: {ir_path} is not an IR document (root is not an object)", file=sys.stderr)
        return 1

    target = args.to_version or current_version()
    if target is None:
        print("ERROR: references/ir-schema.json declares no schema_version enum, "
              "so there is no target to migrate to", file=sys.stderr)
        return 1

    from_version = doc.get("schema_version")
    if not isinstance(from_version, str):
        print(f"ERROR: {ir_path} has no string 'schema_version', so there is no "
              "version to migrate FROM. Add the version the file was authored "
              "against and run this again.", file=sys.stderr)
        return 1

    chain = migration_path(from_version, target)
    if chain is None:
        known = " -> ".join(f"{s.from_version} -> {s.to_version}" for s in STEPS) or "(none)"
        print(f"ERROR: no migration carries {from_version!r} to {target!r}. "
              f"Steps this template ships: {known}. Check out the template "
              "revision that wrote this file, or re-author against "
              f"{target!r}.", file=sys.stderr)
        return 1

    # With --json the migrated IR is the stdout payload, so the human report
    # moves to stderr and the command stays pipeable.
    report = sys.stderr if args.json else sys.stdout

    if not chain:
        print(f"migrate_ir: {ir_path} is already at {target} — nothing to do", file=report)
        return 0

    before = scenario_hashes(doc)
    moved: set = set()
    migrated = migrate_document(doc, chain, moved)
    after = scenario_hashes(migrated)

    print(f"migrate_ir: {ir_path}  {from_version} -> {target}", file=report)
    for step in chain:
        print(f"  step {step.from_version} -> {step.to_version}: {step.summary}", file=report)

    workspace_path = Path(args.workspace) if args.workspace else None
    workspace = None
    if workspace_path is not None:
        workspace, ws_error = validate_ir.load_ir(workspace_path)
        if ws_error is not None:
            print(f"ERROR: {ws_error}", file=sys.stderr)
            return 1
        print(f"sign-off hashes in {workspace_path}:", file=report)
        for line in reanchor_workspace(workspace, before, after, target, moved):
            print(line, file=report)

    if args.json:
        print(json.dumps(migrated, ensure_ascii=False, indent=2))
        return 0

    if not args.write:
        print("\nDry run — nothing written. Re-run with --write to apply.", file=report)
        return 0

    write_json(ir_path, migrated)
    print(f"\nwrote {ir_path}", file=report)
    if workspace is not None and workspace_path is not None:
        write_json(workspace_path, workspace)
        print(f"wrote {workspace_path}", file=report)
    print(f"Now run: python3 scripts/validate_ir.py {ir_path}", file=report)
    return 0


if __name__ == "__main__":
    sys.exit(main())
