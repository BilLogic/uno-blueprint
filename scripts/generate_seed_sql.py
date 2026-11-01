#!/usr/bin/env python3
"""Generate a transactional Supabase/Postgres seed from a Service Blueprint IR.

Usage:
    python3 scripts/generate_seed_sql.py <ir-file> --locale <tag>
        [--out supabase/seeds/blueprint.<locale>.sql] [--verify]
        [--skip-validation]

One IR + one locale -> ONE seed SQL file (per-locale artifacts; see
references/adapter-contract.md). The seed conforms to the adapter contract's
transactional scenario-replace semantics:

  * everything runs inside a single BEGIN; ... COMMIT; transaction — a failing
    statement aborts the whole import and leaves the target untouched;
  * scenario-scoped delete-and-reinsert: each scenario in the IR is deleted by
    its UUIDv5 id (FK cascades remove paths/steps/path_steps/lanes/cells/
    dependencies), then reinserted in dependency order
    paths -> steps -> path_steps -> lanes -> cells -> cell_dependencies;
  * service/phases are shared across scenarios and therefore UPSERTED
    (`on conflict (id) do update`), never deleted;
  * IDs are UUIDv5 from stable IR keys + locale (NFC-normalized), so
    re-running the same seed is idempotent by construction.

--verify additionally writes `<out>.verify.sql`, a read-back verification
script (adapter contract op 6): per-scenario row counts for every table plus
content spot-checks, raising an exception on any mismatch (so `psql -f`/
`supabase db execute` fails loudly).

Schema coverage (migrations 20260729120000_derived_layer +
20260818000000_authoring_foundation are the schema truth):

  * cells carry `cell_key` — the authored qualified key
    `<service>/<phase>/<scenario>/<path>/<lane>/<step>`, byte-identical to
    the string this script already hashes into the cell's UUIDv5 and to the
    keys skills/slice/scripts/slice_tools.py writes into
    `slides.cell_keys`. Stored, not derived: only the import pipeline
    knows the authored keys (see the cells.cell_key column comment).
  * cells carry `position`. The IR identifies a cell by its
    (path, lane, step) triple, so it CANNOT express two cells in one slot —
    imported cells are always position 0. Slot siblings are an app-side
    concept (`upsert_cell` mints them with '-2'/'-3' key suffixes).
  * Wave-2 spec fields pass through when the IR carries them: cells
    function/form/owner/perceived_owner/value_props; lanes kpis/tools.
    Absent IR fields emit null / '[]'::jsonb, matching the column defaults.
    (lanes.owner_team, phases.business_impact/operational_requirements and
    cell_dependencies label/note have NO IR shape yet — columns stay default.)
  * cell_dependencies carry the IR edge's `kind` ('leads_to' | 'enables';
    absent in the IR means 'leads_to', the column default). The kind is part of the
    edge's IDENTITY, not just its payload: the database's uniqueness key is
    (source_cell_id, target_cell_id, kind), so one pair may carry both an
    arrow and an `enables` edge, and the UUIDv5 qualified key ends in
    `#<kind>` so the two do not collide. label/note still have no IR shape.
  * DERIVED TABLES ARE NEVER SEEDED. slices/slides/findings/evidence/
    business_models is a runtime output of the ub:* skills, not IR-authored
    content — there is deliberately no IR shape for them. Seeds cannot break
    them either: derived tables reference cells softly (uuid[]/text[], no FK),
    so the scenario-replace delete cannot cascade into them. The --verify
    script REPORTS derived rows touching the seeded scenarios (notice, never
    an exception) so a re-import shows what user-authored content it orphaned.

Stdlib only. Validation runs first via scripts/validate_ir.py (same dir);
a failing IR generates nothing.
"""

from __future__ import annotations

import argparse
import json
import sys
import unicodedata
import uuid
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import validate_ir  # noqa: E402

# UUIDv5 namespace, fixed: every id a seed has ever minted derives from it, so
# changing it would re-key every row in every deployment. Per entity,
# uuid5(ns, f"{locale}:{entity_type}:{qualified_key}") with NFC-normalized
# keys — the same derivation in every adapter, so the seed SQL and the
# generated fallback module agree on every id.
NAMESPACE = uuid.UUID("37310bd6-53e3-578e-9879-ed5cc6845c87")


def entity_uuid(locale: str, entity_type: str, qualified_key: str) -> str:
    name = unicodedata.normalize("NFC", f"{locale}:{entity_type}:{qualified_key}")
    return str(uuid.uuid5(NAMESPACE, name))


def pick_text(locale_map, locale: str, declared_locales) :
    """Resolve a localeText map for one locale, falling back deterministically
    (requested locale -> declared-locale order -> any) so partially localized
    IRs still generate."""
    if not isinstance(locale_map, dict) or not locale_map:
        return None
    if locale_map.get(locale):
        return locale_map[locale]
    if locale in locale_map:  # present but empty string — honor it
        return locale_map[locale]
    for loc in declared_locales:
        if locale_map.get(loc):
            return locale_map[loc]
    for value in locale_map.values():
        if value:
            return value
    return next(iter(locale_map.values()))


def sql_quote(value) -> str:
    """SQL string literal with single-quote doubling. CJK-safe (UTF-8 file,
    no escaping needed beyond quotes; standard_conforming_strings leaves
    backslashes literal)."""
    if value is None:
        return "null"
    return "'" + str(value).replace("'", "''") + "'"


def localize_resources(resources, locale: str, locales) -> list:
    out = []
    for resource in resources or []:
        localized = {
            "name": pick_text(resource.get("name"), locale, locales) or "",
            "url": resource.get("url"),
            "kind": resource.get("kind") or "link",
            "featured": bool(resource.get("featured", False)),
        }
        out.append(localized)
    return out


def localize_touchpoints(touchpoints, locale: str, locales) -> list:
    out = []
    for touchpoint in touchpoints or []:
        localized = {
            "name": pick_text(touchpoint.get("name"), locale, locales) or "",
            "summary": pick_text(touchpoint.get("summary"), locale, locales),
            "role": touchpoint.get("role"),
            "resources": localize_resources(
                touchpoint.get("resources"), locale, locales
            ),
        }
        out.append(localized)
    return out


def values_rows(rows) -> str:
    return ",\n".join("  (" + ", ".join(row) + ")" for row in rows)


# ---------------------------------------------------------------------------
# The projection both v1 adapters share
# ---------------------------------------------------------------------------
#
# The adapter contract says the SQL adapter and the no-DB adapter are
# behaviourally identical: same IR in, same render out. That claim used to live
# in a docstring while the two generators each wrote out their own field list by
# hand — and they drifted, silently, in the direction that costs an adopter
# their cell specs.
#
# So the field list is written once, here, and both generators read it.
# scripts/adapter_parity.py compares what they produce rather than trusting the
# sentence. A field added below reaches the database and the no-DB module in the
# same change, or the parity check fails.

#: Columns whose Python value is JSON-encoded and cast to jsonb.
JSONB_FIELDS = frozenset({"value_props", "kpis", "tools"})
#: Columns whose Python value is a list of strings, emitted as a text[] literal.
TEXT_ARRAY_FIELDS = frozenset()
#: Columns emitted as a bare SQL literal (numbers), never quoted.
RAW_FIELDS = frozenset({"position"})
#: Booleans are SQL keywords, not quoted strings.
BOOL_FIELDS = frozenset({"featured"})


def seed_cell_fields(cell: dict, path: dict) -> dict:
    """One cell as `cells` column -> value.

    `position` is always 0: the IR identifies a cell by (path, lane, step)
    and so cannot express slot siblings. `origin` stays at its 'import' column
    default — these rows ARE the import pipeline's.
    """
    return {
        "id": cell["id"],
        "path_id": path["id"],
        "lane_id": cell["lane_id"],
        "step_id": cell["step_id"],
        "position": 0,
        "content": cell["content"],
        "frame": cell["frame"],
        "summary": cell["summary"],
        "cell_key": cell["cell_key"],
        "function": cell["function"],
        "form": cell["form"],
        "value_props": cell["value_props"],
        "owner": cell["owner"],
        "perceived_owner": cell["perceived_owner"],
    }


def seed_lane_fields(lane: dict, path: dict) -> dict:
    """One lane as `lanes` column -> value.

    Lanes were left out of the shared projection when cells and edges got it,
    and the omission immediately produced a false sentence: the contract said
    kpis and tools were carried by neither adapter, when in fact the SQL side
    carried both and the no-DB side carried neither. Same defect as before,
    one aggregate over.
    """
    return {
        "id": lane["id"],
        "path_id": path["id"],
        "name": lane["name"],
        "lane_role": lane["role"],
        "position": lane["row"],
        "kpis": lane["kpis"],
        "tools": lane["tools"],
    }


def seed_dependency_fields(edge: dict) -> dict:
    """One edge as `cell_dependencies` column -> value.

    `kind` is emitted explicitly even though 'leads_to' is the column default,
    because an IR edge can now be either kind and the row should say which.
    label and note still have no IR shape and stay at their defaults on both
    adapters, which is parity by absence rather than by accident.

    Called `seed_trigger_fields` until IR 2026.09.09. The name is part of the
    adapter contract's parity claim (references/adapter-contract.md § The two
    v1 adapters), so it moved with the field it reads rather than being left as
    the one place a consumer still meets the retired word.
    """
    return {
        "id": edge["id"],
        "source_cell_id": edge["source_cell_id"],
        "target_cell_id": edge["target_cell_id"],
        "kind": edge["kind"],
    }


def seed_touchpoint_fields(touchpoint: dict, cell: dict) -> dict:
    """One placement as `cell_touchpoints` column -> value.

    `position` is 1-based and contiguous within the cell, which is what the
    table's deferred unique assumes and what the migration that created it
    wrote. `origin` stays at 'import' — these rows ARE the import pipeline's.
    """
    return {
        "id": touchpoint["id"],
        "cell_id": cell["id"],
        # Both, here: the fallback shape keeps the name beside the registry
        # id because it has no registry to join. The seed nulls the name of a
        # linked row at emission — the table holds one identity, not two.
        "touchpoint_id": touchpoint["touchpoint_id"],
        "name": touchpoint["name"],
        "position": touchpoint["position"],
        "summary": touchpoint["summary"],
        "role": touchpoint["role"],
        "origin": "import",
    }


def seed_resource_fields(resource: dict, cell: dict) -> dict:
    """One resource as `resources` column -> value.

    Every row carries its cell. A resource authored under a touchpoint
    placement carries the placement as well, in `cell_touchpoint_id`; one
    authored on the cell carries none.
    """
    return {
        "id": resource["id"],
        "cell_id": cell["id"],
        "cell_touchpoint_id": resource.get("cell_touchpoint_id"),
        "kind": resource["kind"],
        "name": resource["name"],
        "url": resource["url"],
        "position": resource["position"],
        "featured": resource["featured"],
        "origin": "import",
    }


class Sql(str):
    """A value already written as SQL — emitted verbatim, never quoted.

    One user: the `touchpoint_id` on a placement, which is a subquery rather
    than a literal (see `registry_lookup`). It is a subclass of `str` so that
    the shared projection stays a dict of plain values for
    `scripts/generate_fallbacks.py` and `scripts/adapter_parity.py`, and only
    `emit_seed_sql` — the one consumer that emits SQL — ever wraps anything.
    """


def registry_lookup(name: str) -> "Sql":
    """The registry row for `name`, as a scalar subquery.

    A placement names its touchpoint by the registry's identity, and that
    identity is the NAME (`unique (name)`, 21000131000000), not an id this
    script derived. Reading it back here rather than writing the derived id
    is what lets the seed land on a target whose rows predate the
    deployment-stable derivation: those rows keep the ids they were born with,
    and the placement points at whatever the row actually holds (#201).
    """
    return Sql(f"(select id from public.touchpoints where name = {sql_quote(name)})")


def jsonb(value) -> str:
    """A JSON value as a `jsonb` literal. `sql_row` does this for the columns it
    is given a mapping for; the service insert is written out by hand, so it
    reaches for the conversion directly.

    Keys are SORTED, which `sql_row` has no need to do: those columns hold
    lists, and this one holds a map an author edits by hand. Without the sort,
    moving two examples past each other in the IR would rewrite a committed
    seed that says exactly what it said before.
    """
    return sql_quote(json.dumps(value, ensure_ascii=False, sort_keys=True)) + "::jsonb"


def sql_row(fields: dict) -> list:
    """Column values as SQL literals, in the order the insert names them."""
    out = []
    for column, value in fields.items():
        if isinstance(value, Sql):
            out.append(str(value))
        elif column in JSONB_FIELDS:
            out.append(sql_quote(json.dumps(value, ensure_ascii=False)) + "::jsonb")
        elif column in TEXT_ARRAY_FIELDS:
            out.append(
                "array[" + ", ".join(sql_quote(v) for v in value or []) + "]::text[]"
            )
        elif column in RAW_FIELDS:
            out.append(str(value))
        elif column in BOOL_FIELDS:
            out.append("true" if value else "false")
        else:
            out.append(sql_quote(value))
    return out


# ---------------------------------------------------------------------------
# IR -> flat, id-resolved model (per locale)
# ---------------------------------------------------------------------------


def build_model(doc: dict, locale: str) -> dict:
    locales = doc["locales"]
    lc = doc["service"]
    lc_q = lc["key"]

    def text(m):
        return pick_text(m, locale, locales)

    model = {
        "locale": locale,
        "service": {
            "id": entity_uuid(locale, "service", lc_q),
            "key": lc["key"],
            "name": text(lc["name"]),
            "summary": text(lc.get("summary")),
            # The per-kind examples, resolved to THIS locale — a kind whose
            # locale map has no text for the seed being generated is dropped
            # rather than emitted as an empty string, because the reader's
            # side treats an absent key as "nothing authored" and renders
            # nothing, while a blank one renders an empty section.
            "entity_examples": {
                kind: picked
                for kind, locale_map in (lc.get("entity_examples") or {}).items()
                if (picked := text(locale_map))
            },
        },
        "touchpoints": [],
        "phases": [],
        "scenarios": [],
    }

    # The deployment's touchpoint registry: the entries the IR lists, then every
    # placement name the IR uses that they do not cover, minted with kind
    # `other`. Matched case-insensitively, the way the database's fold does,
    # and keyed on the lowered name so a re-import lands on the same row. No
    # service owns a registry row (ADR 0003), so none is named here.
    #
    # THE ID IS DEPLOYMENT-STABLE, NOT SERVICE-SCOPED (#201). It was
    # `f"{lc_q}#{key}"` — the service key in the derivation — which was
    # consistent while `unique (service_id, name)` gave each service its own
    # row and wrong the moment `21000131000000` made the registry one
    # deployment-level pool under `unique (name)`: two services minted two ids
    # for one tool, and seeding the second into a target holding the first was
    # refused outright. The derivation now says what the constraint says.
    #
    # A derived id is what a row that does not yet exist is BORN with. It is
    # not how the seed finds one — the registry's identity is its name, which
    # is what `unique (name)` asserts, so the upsert below conflicts on the
    # name and every placement resolves its registry row by name too. That is
    # what keeps a target seeded before this change idempotent: its rows keep
    # the ids they were born with, and the import updates them in place rather
    # than inserting duplicates beside them.
    registry: dict = {}

    def registry_entry(name: str, listed: dict | None = None) -> dict:
        key = name.strip().lower()
        if key not in registry:
            registry[key] = {
                "id": entity_uuid(locale, "registry-touchpoint", key),
                "name": name.strip(),
                "kind": (listed or {}).get("kind") or "other",
                "summary": text((listed or {}).get("summary")),
                "url": (listed or {}).get("url"),
                "origin": "import",
            }
        return registry[key]

    for listed in lc.get("touchpoints", []) or []:
        listed_name = text(listed.get("name"))
        if listed_name:
            registry_entry(listed_name, listed)

    # Which phase each scenario sits in, so a link naming a scenario by key
    # alone can be given its other end's qualified key — and the cell id that
    # key hashes to — before that scenario has been read.
    scenario_prefixes = {
        scenario["key"]: f"{lc_q}/{phase['key']}/{scenario['key']}"
        for phase in lc["phases"]
        for scenario in phase.get("scenarios", [])
    }
    # Every link of the service, gathered as the paths are read and placed on
    # its SOURCE's path once all of them are: see place_links below.
    links: list = []

    phase_ids = {}
    for phase in lc["phases"]:
        ph_q = f"{lc_q}/{phase['key']}"
        ph_id = entity_uuid(locale, "phase", ph_q)
        phase_ids[phase["key"]] = ph_id
        model["phases"].append(
            {
                "id": ph_id,
                "key": phase["key"],
                "name": text(phase["name"]),
                "summary": text(phase.get("summary")),
                "order": phase["order"],
                "loops_to": phase.get("loops_to"),
            }
        )

        for scenario in phase.get("scenarios", []):
            sc_q = f"{ph_q}/{scenario['key']}"
            sc_id = entity_uuid(locale, "scenario", sc_q)
            steps = []
            step_ids = {}
            for step in scenario["steps"]:
                st_id = entity_uuid(locale, "step", f"{sc_q}/{step['key']}")
                step_ids[step["key"]] = st_id
                steps.append({"id": st_id, "key": step["key"], "name": text(step["name"])})

            paths = []
            for path in scenario["paths"]:
                pa_q = f"{sc_q}/{path['key']}"
                pa_id = entity_uuid(locale, "path", pa_q)
                lane_ids = {}
                lanes = []
                for lane in path["lanes"]:
                    la_id = entity_uuid(locale, "lane", f"{pa_q}/{lane['key']}")
                    lane_ids[lane["key"]] = la_id
                    lanes.append(
                        {
                            "id": la_id,
                            "key": lane["key"],
                            "name": text(lane["display_name"]),
                            "role": lane.get("role"),
                            "row": lane["row"],
                            # Wave-2 lane spec fields (locale-independent
                            # string arrays); absent -> [] = column default.
                            "kpis": lane.get("kpis") or [],
                            "tools": lane.get("tools") or [],
                        }
                    )

                path_steps = [
                    {"step_id": step_ids[key], "position": index}
                    for index, key in enumerate(path["path_steps"])
                ]

                cells = []
                for cell in path["cells"]:
                    ce_q = f"{pa_q}/{cell['lane']}/{cell['step']}"
                    ce_id = entity_uuid(locale, "cell", ce_q)
                    cells.append(
                        {
                            "id": ce_id,
                            # The authored key, stored verbatim in
                            # cells.cell_key: the SAME qualified-key string
                            # hashed into the UUIDv5 above and used by
                            # slice_tools.cell_key() — service/phase/
                            # scenario/path/lane/step. Locale-independent
                            # (IR keys are ASCII slugs by schema; the NFC
                            # normalization in entity_uuid is a no-op here).
                            "cell_key": ce_q,
                            "lane_id": lane_ids[cell["lane"]],
                            "step_id": step_ids[cell["step"]],
                            "content": text(cell.get("content")) or "",
                            "frame": cell.get("frame"),
                            "summary": text(cell.get("summary")),
                            # Two lists where there was one array, because
                            # the column they came from is now two tables.
                            # Ids are UUIDv5 over the cell's qualified key
                            # plus the row's own name, so a re-import lands on
                            # the same row rather than a duplicate — the same
                            # construction every other entity here uses.
                            "resources": (
                                [
                                    {
                                        **resource,
                                        "id": entity_uuid(
                                            locale, "resource",
                                            f"{ce_q}#{resource['name']}@{index}",
                                        ),
                                        "position": index,
                                    }
                                    for index, resource in enumerate(
                                        localize_resources(
                                            cell.get("resources"), locale, locales
                                        ),
                                        start=1,
                                    )
                                ]
                                # A placement's resources are the cell's too,
                                # through the touchpoint (21000118000000):
                                # the same rows, carrying the placement's id.
                                + [
                                    {
                                        **resource,
                                        "id": entity_uuid(
                                            locale, "resource",
                                            f"{ce_q}#{touchpoint['name']}#{resource['name']}@{index}",
                                        ),
                                        "cell_touchpoint_id": entity_uuid(
                                            locale, "touchpoint",
                                            f"{ce_q}#{touchpoint['name']}",
                                        ),
                                        "position": index,
                                    }
                                    for touchpoint in localize_touchpoints(
                                        cell.get("touchpoints"), locale, locales
                                    )
                                    for index, resource in enumerate(
                                        touchpoint["resources"], start=1
                                    )
                                ]
                            ),
                            "touchpoints": [
                                {
                                    **{k: v for k, v in touchpoint.items() if k != "resources"},
                                    "id": entity_uuid(
                                        locale, "touchpoint",
                                        f"{ce_q}#{touchpoint['name']}",
                                    ),
                                    # Linked into the registry, minting the
                                    # entry when the IR did not list it. The
                                    # entry's kind rides along for the
                                    # fallback, which has no join to read it
                                    # through; the seed does not write it.
                                    "touchpoint_id": registry_entry(touchpoint["name"])["id"],
                                    "kind": registry_entry(touchpoint["name"])["kind"],
                                    "position": index,
                                }
                                for index, touchpoint in enumerate(
                                    localize_touchpoints(
                                        cell.get("touchpoints"), locale, locales
                                    ),
                                    start=1,
                                )
                            ],
                            # Wave-2 spec fields (locale-independent strings /
                            # {for, value} array); absent -> null / [] =
                            # column defaults.
                            "function": cell.get("function"),
                            "form": cell.get("form"),
                            "owner": cell.get("owner"),
                            "perceived_owner": cell.get("perceived_owner"),
                            "value_props": cell.get("value_props") or [],
                        }
                    )

                for edge in path.get("dependencies", []):
                    # Absent kind means 'leads_to' — the column default, and
                    # what every edge authored before 2026.08.26 meant.
                    kind = edge.get("kind", "leads_to")
                    src_q = end_key(edge["source"], scenario["key"], path["key"], scenario_prefixes)
                    tgt_q = end_key(edge["target"], scenario["key"], path["key"], scenario_prefixes)
                    src_path_q, tgt_path_q = src_q.rsplit("/", 2)[0], tgt_q.rsplit("/", 2)[0]
                    if src_path_q == tgt_path_q:
                        # One path: the key this edge has always had, so a
                        # re-import lands on the row it already wrote. The
                        # kind is in it because it is in the identity:
                        # cell_dependencies is unique on (source, target,
                        # kind), so the same pair can hold an arrow AND an
                        # enables edge and they need distinct ids.
                        src, tgt = src_q.rsplit("/", 2)[1:], tgt_q.rsplit("/", 2)[1:]
                        tr_q = f"{src_path_q}/{src[0]}/{src[1]}->{tgt[0]}/{tgt[1]}#{kind}"
                    else:
                        # Two paths: both ends in full, so the id is the same
                        # whichever end's path lists the link.
                        tr_q = f"{src_q}->{tgt_q}#{kind}"
                    links.append(
                        {
                            # The namespace label stays "trigger" through the
                            # 2026.09.01 rename of the kinds and the 2026.09.09
                            # rename of this array. It is UUIDv5 input, not
                            # vocabulary: changing it would give every existing
                            # edge a new id and stop re-imports being
                            # idempotent, which is the one property this
                            # derivation exists for.
                            "id": entity_uuid(locale, "trigger", tr_q),
                            "source_cell_id": entity_uuid(locale, "cell", src_q),
                            "target_cell_id": entity_uuid(locale, "cell", tgt_q),
                            "kind": kind,
                            # Where the ends sit, for placement and for the
                            # seed's statement order. Not columns: no field
                            # function projects them.
                            "source_path": src_path_q,
                            "target_scenario": tgt_path_q.rsplit("/", 1)[0],
                        }
                    )

                paths.append(
                    {
                        "id": pa_id,
                        "key": path["key"],
                        "name": text(path["name"]),
                        "summary": text(path.get("summary")),
                        "note": text(path.get("note")),
                        "kind": path["kind"],
                        "lanes": lanes,
                        "path_steps": path_steps,
                        "cells": cells,
                        "qualified_key": pa_q,
                        "dependencies": [],
                    }
                )

            model["scenarios"].append(
                {
                    "id": sc_id,
                    # Qualified key (service/phase/scenario): the prefix of
                    # every cell_key under this scenario — --verify uses it to
                    # report derived rows referencing the seeded scenario.
                    "qualified_key": sc_q,
                    "key": scenario["key"],
                    "phase_id": ph_id,
                    "name": text(scenario["name"]),
                    "summary": text(scenario.get("summary")),
                    "order": scenario["order"],
                    "layout": scenario["layout"],
                    "steps": steps,
                    "paths": paths,
                }
            )

    place_links(model, links)
    model["phase_ids"] = phase_ids
    model["touchpoints"] = list(registry.values())
    return model


def end_key(ref: dict, scenario_key: str, path_key: str, scenario_prefixes: dict) -> str:
    """The qualified cell key a dependency end names.

    An end with no `path` is on the path that lists the link; one with a
    `path` and no `scenario` is on that path of the same scenario; one with
    both is on that path of the named scenario. The validator has already
    held each end to a cell of this service.
    """
    scenario_key = ref.get("scenario", scenario_key)
    path_key = ref.get("path", path_key)
    return f"{scenario_prefixes[scenario_key]}/{path_key}/{ref['lane']}/{ref['step']}"


def place_links(model: dict, links: list) -> None:
    """Put each link on its source's path, in the order the file gave them.

    A link is listed on either end's path in the IR, so where it was listed
    is not a fact about it. Placing it by its source makes the model — and so
    both adapters and the read-back count — the same however the file spelled
    it, and matches the database, which hangs a dependency off its source.
    """
    by_path = {
        path["qualified_key"]: path
        for scenario in model["scenarios"]
        for path in scenario["paths"]
    }
    for link in links:
        by_path[link["source_path"]]["dependencies"].append(link)


# ---------------------------------------------------------------------------
# SQL emission
# ---------------------------------------------------------------------------


def emit_seed_sql(model: dict, ir_name: str) -> str:
    q = sql_quote
    lc = model["service"]
    # The name each registry row is stored under, by the id the model linked
    # placements to. A placement resolves its row by name at load time, and
    # this is where the name it resolves by comes from — the registry's own
    # stripped spelling, not the placement's, so the two cannot diverge.
    registry_names = {tp["id"]: tp["name"] for tp in model["touchpoints"]}
    parts = []
    parts.append(
        f"""-- GENERATED by scripts/generate_seed_sql.py — edit the IR and regenerate; do not hand-edit.
--
-- Source IR: {ir_name}
-- Locale:    {model['locale']} (one seed file per locale; never mix locales in one target)
-- Scenarios: {', '.join(s['key'] for s in model['scenarios'])}
--
-- Adapter-contract semantics (references/adapter-contract.md):
--   * single transaction — a failing statement leaves the target untouched;
--   * scenario-replace: delete each scenario by UUIDv5 id (cascades remove
--     children), reinsert paths -> steps -> path_steps -> lanes -> cells ->
--     cell_dependencies;
--   * service/phases are shared across scenarios: upserted, not replaced;
--   * UUIDv5 ids from IR keys + locale => idempotent re-import.

begin;

-- Service (shared, upserted) ------------------------------------------------

insert into public.services (id, name, summary, entity_examples) values
  ({q(lc['id'])}, {q(lc['name'])}, {q(lc['summary'])}, {jsonb(lc['entity_examples'])})
on conflict (id) do update
  set name = excluded.name,
      summary = excluded.summary,
      -- AN EMPTY MAP IS SILENCE, NOT AN INSTRUCTION TO CLEAR.
      --
      -- `entity_examples` is the one column here a deployment also writes
      -- from the editor, so a re-map meets values this seed did not author.
      -- Overwriting unconditionally would erase them, which is the same
      -- silent loss as never emitting the column at all — the bug this
      -- clause exists because of. Never writing it would leave a generator
      -- that cannot say anything about examples.
      --
      -- So the source wins where it SPEAKS, the way the registry upsert
      -- below wins only where the import says something. A service block
      -- with no `entity_examples` generates `{{}}`, and `{{}}` is exactly
      -- what a block that authored none generates too — the two are
      -- indistinguishable by the time the seed exists, so the empty map has
      -- to read as "the source said nothing" and leave the target alone.
      -- A map that IS present is the whole truth: a kind it omits IS
      -- cleared, so the generator can still remove an example, by authoring
      -- the map without it rather than by emptying the map.
      entity_examples = case
        when excluded.entity_examples = '{{}}'::jsonb then services.entity_examples
        else excluded.entity_examples
      end;

-- Phases (shared, upserted; loops_to applied after all phases exist) ----------

insert into public.phases (id, service_id, name, summary, position) values
{values_rows(
    [
        [q(ph['id']), q(lc['id']), q(ph['name']), q(ph['summary']), str(ph['order'])]
        for ph in model['phases']
    ]
)}
on conflict (id) do update
  set service_id = excluded.service_id,
      name = excluded.name,
      summary = excluded.summary,
      position = excluded.position;
"""
    )

    if model["touchpoints"]:
        parts.append(
            f"""
-- The deployment's touchpoint registry (shared, upserted) ---------------------
--
-- ON CONFLICT (name), not (id). A registry row's identity is its name — that
-- is what `unique (name)` asserts since 21000131000000 made the catalog one
-- deployment-level pool (ADR 0003) — so the seed reconciles on the name and
-- the derived id is only what a row that does not yet exist is born with. A
-- target seeded before that derivation became deployment-stable keeps the ids
-- it has, and this updates those rows in place instead of inserting duplicates
-- beside them (#201).
--
-- WHAT AN IMPORT MAY OVERWRITE. The merge is `21000131000000`'s own, the one
-- it used when it folded a service's rows into the pool: the import wins where
-- it SAYS something, and says nothing where it was merely minted. An entry the
-- IR never listed arrives as kind `other` with no summary and no home, which
-- is "nobody has judged this yet" rather than a judgement — so it must not
-- erase the judgement a curator, or another service's IR, already recorded
-- against that name.

insert into public.touchpoints (id, name, kind, summary, url, origin) values
{values_rows(
    [
        [q(tp['id']), q(tp['name']), q(tp['kind']), q(tp['summary']), q(tp['url']), q(tp['origin'])]
        for tp in model['touchpoints']
    ]
)}
on conflict (name) do update
  set kind = case when excluded.kind = 'other'
                  then public.touchpoints.kind
                  else excluded.kind end,
      summary = coalesce(excluded.summary, public.touchpoints.summary),
      url = coalesce(excluded.url, public.touchpoints.url);
"""
        )

    for ph in model["phases"]:
        loops_to_id = model["phase_ids"][ph["loops_to"]] if ph.get("loops_to") else None
        parts.append(
            f"update public.phases set loops_to_phase_id = {q(loops_to_id)} where id = {q(ph['id'])};\n"
        )

    for scenario in model["scenarios"]:
        parts.append(
            f"""
-- Scenario '{scenario['key']}' ({scenario['id']}) --------------------------------
-- Scenario-replace: delete (cascades to paths, steps, path_steps, lanes,
-- cells, cell_dependencies), then reinsert in dependency order.

delete from public.scenarios where id = {q(scenario['id'])};

insert into public.scenarios (id, phase_id, name, summary, position, layout) values
  ({q(scenario['id'])}, {q(scenario['phase_id'])}, {q(scenario['name'])}, {q(scenario['summary'])}, {scenario['order']}, {q(scenario['layout'])});

insert into public.paths (id, scenario_id, name, summary, note, kind) values
{values_rows(
    [
        [q(p['id']), q(scenario['id']), q(p['name']), q(p['summary']), q(p['note']), q(p['kind'])]
        for p in scenario['paths']
    ]
)};

insert into public.steps (id, scenario_id, name) values
{values_rows([[q(s['id']), q(scenario['id']), q(s['name'])] for s in scenario['steps']])};

insert into public.path_steps (path_id, step_id, position) values
{values_rows(
    [
        [q(p['id']), q(ps['step_id']), str(ps['position'])]
        for p in scenario['paths']
        for ps in p['path_steps']
    ]
)};

insert into public.lanes ({', '.join(seed_lane_fields(scenario['paths'][0]['lanes'][0], scenario['paths'][0]))}) values
{values_rows(
    [
        sql_row(seed_lane_fields(l, p))
        for p in scenario['paths']
        for l in p['lanes']
    ]
)};
"""
        )

        # Columns come from the projection itself, so the insert cannot name a
        # field list the projection no longer produces.
        cell_fields = [
            seed_cell_fields(c, p) for p in scenario["paths"] for c in p["cells"]
        ]
        if cell_fields:
            parts.append(
                f"insert into public.cells ({', '.join(cell_fields[0])}) values\n"
                + values_rows([sql_row(fields) for fields in cell_fields])
                + ";\n"
            )

        # Placements before resources, because a resource may hang off one.
        touchpoint_fields = [
            # One identity per row: a linked placement carries the registry
            # id and no name (`cell_touchpoints_one_identity`). The id itself
            # is READ BACK from the registry by name rather than written as
            # the derived literal — see `registry_lookup` (#201).
            {
                **fields,
                "touchpoint_id": (
                    registry_lookup(registry_names[fields["touchpoint_id"]])
                    if fields["touchpoint_id"]
                    else None
                ),
                "name": None if fields["touchpoint_id"] else fields["name"],
            }
            for fields in (
                seed_touchpoint_fields(t, c)
                for p in scenario["paths"]
                for c in p["cells"]
                for t in c["touchpoints"]
            )
        ]
        if touchpoint_fields:
            parts.append(
                f"\ninsert into public.cell_touchpoints ({', '.join(touchpoint_fields[0])}) values\n"
                + values_rows([sql_row(fields) for fields in touchpoint_fields])
                + ";\n"
            )

        resource_fields = [
            seed_resource_fields(r, c)
            for p in scenario["paths"]
            for c in p["cells"]
            for r in c["resources"]
        ]
        if resource_fields:
            parts.append(
                f"\ninsert into public.resources ({', '.join(resource_fields[0])}) values\n"
                + values_rows([sql_row(fields) for fields in resource_fields])
                + ";\n"
            )

        dependency_fields = [
            seed_dependency_fields(e)
            for p in scenario["paths"]
            for e in p["dependencies"]
            if e["target_scenario"] == scenario["qualified_key"]
        ]
        if dependency_fields:
            parts.append(
                f"\ninsert into public.cell_dependencies ({', '.join(dependency_fields[0])}) values\n"
                + values_rows([sql_row(fields) for fields in dependency_fields])
                + ";\n"
            )

    # A link into another scenario goes in last, once. Inside its source's
    # block, its target would not exist yet when that scenario comes later in
    # the file, and the target scenario's own replace would cascade it away
    # when that scenario came earlier.
    across_fields = [
        seed_dependency_fields(e)
        for scenario in model["scenarios"]
        for p in scenario["paths"]
        for e in p["dependencies"]
        if e["target_scenario"] != scenario["qualified_key"]
    ]
    if across_fields:
        parts.append(
            "\n-- Links into another scenario, after every scenario's replace.\n"
            f"insert into public.cell_dependencies ({', '.join(across_fields[0])}) values\n"
            + values_rows([sql_row(fields) for fields in across_fields])
            + ";\n"
        )

    parts.append("\ncommit;\n")
    return "".join(parts)


def emit_verify_sql(model: dict, ir_name: str) -> str:
    """Read-back verification (adapter contract op 6): per-scenario row counts
    for every table + content spot-checks. Raises on any mismatch."""
    q = sql_quote
    checks = []
    for scenario in model["scenarios"]:
        sid = q(scenario["id"])
        label = scenario["key"]
        expected = {
            "paths": len(scenario["paths"]),
            "steps": len(scenario["steps"]),
            "path_steps": sum(len(p["path_steps"]) for p in scenario["paths"]),
            "lanes": sum(len(p["lanes"]) for p in scenario["paths"]),
            "cells": sum(len(p["cells"]) for p in scenario["paths"]),
            "cell_dependencies": sum(len(p["dependencies"]) for p in scenario["paths"]),
            "cell_touchpoints": sum(
                len(c["touchpoints"]) for p in scenario["paths"] for c in p["cells"]
            ),
            "resources": sum(
                len(c["resources"]) for p in scenario["paths"] for c in p["cells"]
            ),
        }
        counts = {
            "scenario rows": f"select count(*) from public.scenarios where id = {sid}",
            "paths": f"select count(*) from public.paths where scenario_id = {sid}",
            "steps": f"select count(*) from public.steps where scenario_id = {sid}",
            "path_steps": (
                "select count(*) from public.path_steps ps join public.paths p "
                f"on p.id = ps.path_id where p.scenario_id = {sid}"
            ),
            "lanes": (
                "select count(*) from public.lanes l join public.paths p "
                f"on p.id = l.path_id where p.scenario_id = {sid}"
            ),
            "cells": (
                "select count(*) from public.cells c join public.paths p "
                f"on p.id = c.path_id where p.scenario_id = {sid}"
            ),
            "cell_dependencies": (
                "select count(*) from public.cell_dependencies t "
                "join public.cells c on c.id = t.source_cell_id "
                "join public.paths p on p.id = c.path_id "
                f"where p.scenario_id = {sid}"
            ),
            "cell_touchpoints": (
                "select count(*) from public.cell_touchpoints ct "
                "join public.cells c on c.id = ct.cell_id "
                "join public.paths p on p.id = c.path_id "
                f"where p.scenario_id = {sid}"
            ),
            "resources": (
                "select count(*) from public.resources r "
                "join public.cells c on c.id = r.cell_id "
                "join public.paths p on p.id = c.path_id "
                f"where p.scenario_id = {sid}"
            ),
        }
        expected_full = {"scenario rows": 1, **expected}
        for name, query in counts.items():
            want = expected_full[name]
            checks.append(
                f"  select ({query}) into n;\n"
                f"  if n <> {want} then\n"
                f"    raise exception 'scenario {label}: {name} expected {want}, got %', n;\n"
                "  end if;"
            )

        # Every imported cell must carry its authored cell_key (slice recovery
        # depends on it), and each key embeds this scenario's qualified prefix.
        prefix = scenario["qualified_key"]
        checks.append(
            "  select count(*) into n from public.cells c "
            "join public.paths p on p.id = c.path_id\n"
            f"  where p.scenario_id = {sid}\n"
            f"    and (c.cell_key is null or c.cell_key not like {q(prefix + '/%')});\n"
            "  if n <> 0 then\n"
            f"    raise exception 'scenario {label}: % cell(s) missing the authored cell_key prefix {prefix}/', n;\n"
            "  end if;"
        )

        # Content spot-checks: scenario name, each path name, and the first
        # non-empty cell content per path.
        checks.append(
            f"  select name into t from public.scenarios where id = {sid};\n"
            f"  if t is distinct from {q(scenario['name'])} then\n"
            f"    raise exception 'scenario {label}: name mismatch — got %', t;\n"
            "  end if;"
        )
        for p in scenario["paths"]:
            checks.append(
                f"  select name into t from public.paths where id = {q(p['id'])};\n"
                f"  if t is distinct from {q(p['name'])} then\n"
                f"    raise exception 'scenario {label}: path {p['key']} name mismatch — got %', t;\n"
                "  end if;"
            )
            spot = next((c for c in p["cells"] if c["content"]), None)
            if spot is not None:
                checks.append(
                    f"  select content into t from public.cells where id = {q(spot['id'])};\n"
                    f"  if t is distinct from {q(spot['content'])} then\n"
                    f"    raise exception 'scenario {label}: path {p['key']} spot-check cell content mismatch — got %', t;\n"
                    "  end if;"
                )
                checks.append(
                    f"  select cell_key into t from public.cells where id = {q(spot['id'])};\n"
                    f"  if t is distinct from {q(spot['cell_key'])} then\n"
                    f"    raise exception 'scenario {label}: path {p['key']} spot-check cell_key mismatch — got %', t;\n"
                    "  end if;"
                )

    # Derived-layer report (never a failure): slices/findings/evidence/
    # business_models are user- and skill-authored at runtime, NOT seeded, and
    # they soft-reference cells — so rows referencing a just-replaced scenario
    # are legitimate (that is the recovery design), but worth surfacing after
    # a re-import. Guarded by to_regclass so the verify script still runs
    # against a database without the derived-layer migration.
    lc_id = q(model["service"]["id"])
    derived = []
    for scenario in model["scenarios"]:
        pat = q(scenario["qualified_key"] + "/%")
        label = scenario["key"]
        derived.append(
            "  if to_regclass('public.slides') is not null then\n"
            "    select count(*) into n from public.slides si\n"
            f"    where exists (select 1 from unnest(si.cell_keys) k where k like {pat});\n"
            f"    raise notice 'derived (reported, not verified): % slides reference scenario {label}', n;\n"
            "  end if;\n"
            "  if to_regclass('public.audit_findings') is not null then\n"
            "    select count(*) into n from public.audit_findings f\n"
            f"    where exists (select 1 from unnest(f.cell_keys) k where k like {pat});\n"
            f"    raise notice 'derived (reported, not verified): % findings reference scenario {label}', n;\n"
            "  end if;\n"
            "  if to_regclass('public.evidence') is not null then\n"
            f"    select count(*) into n from public.evidence where cell_key like {pat};\n"
            f"    raise notice 'derived (reported, not verified): % evidence rows reference scenario {label}', n;\n"
            "  end if;"
        )
    derived.append(
        "  if to_regclass('public.slices') is not null then\n"
        f"    select count(*) into n from public.slices where service_id = {lc_id};\n"
        "    raise notice 'derived (reported, not verified): % slices on this service', n;\n"
        "  end if;\n"
        "  if to_regclass('public.business_models') is not null then\n"
        f"    select count(*) into n from public.business_models where service_id = {lc_id};\n"
        "    raise notice 'derived (reported, not verified): % business_models rows on this service', n;\n"
        "  end if;"
    )

    body = "\n".join(checks + derived)
    scenario_list = ", ".join(s["key"] for s in model["scenarios"])
    return f"""-- GENERATED by scripts/generate_seed_sql.py --verify — read-back verification.
--
-- Source IR: {ir_name} (locale: {model['locale']})
-- Run AFTER the seed commits. Verifies per-scenario row counts for every
-- table plus content and cell_key spot-checks for: {scenario_list}.
-- Any mismatch raises an exception, so psql/supabase execution fails loudly.
-- Derived-layer rows (slices/findings/evidence/business_models) are REPORTED via
-- notices, never failed: they are runtime skill/user output, not seed output.

do $$
declare
  n bigint;
  t text;
begin
{body}
  raise notice 'read-back verification passed for locale {model['locale']}: {scenario_list}';
end
$$;
"""


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(
        description="Generate a transactional seed SQL file from a blueprint IR (one locale per run)."
    )
    parser.add_argument("ir_file", help="IR file (.json native; .yaml if PyYAML is installed)")
    parser.add_argument("--locale", required=True, help="locale to generate (must be declared in the IR)")
    parser.add_argument("--out", help="output path (default: supabase/seeds/blueprint.<locale>.sql)")
    parser.add_argument("--verify", action="store_true",
                        help="also write <out stem>.verify.sql with read-back verification checks")
    parser.add_argument("--skip-validation", action="store_true",
                        help="skip the validate_ir.py pre-flight (not recommended)")
    args = parser.parse_args(argv)

    ir_path = Path(args.ir_file)
    doc, load_error = validate_ir.load_ir(ir_path)
    if load_error is not None:
        print(f"ERROR: {load_error}", file=sys.stderr)
        return 1

    if not args.skip_validation:
        rep = validate_ir.Report(ir_path.name)
        validate_ir.validate_document(doc, rep)
        for line in rep.errors + rep.warnings:
            print(line, file=sys.stderr)
        if rep.errors:
            print(
                f"ERROR: IR failed validation ({len(rep.errors)} error(s)) — nothing generated "
                "(a deliberately-invalid IR must leave the target untouched).",
                file=sys.stderr,
            )
            return 1

    if args.locale not in doc.get("locales", []):
        print(
            f"ERROR: locale '{args.locale}' is not declared in the IR "
            f"(declared: {', '.join(doc.get('locales', []))})",
            file=sys.stderr,
        )
        return 1

    model = build_model(doc, args.locale)
    seed_sql = emit_seed_sql(model, ir_path.name)

    out_path = Path(args.out) if args.out else Path("supabase/seeds") / f"blueprint.{args.locale}.sql"
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(seed_sql, encoding="utf-8")
    print(f"Wrote {out_path}")
    for scenario in model["scenarios"]:
        cells = sum(len(p["cells"]) for p in scenario["paths"])
        dependencies = sum(len(p["dependencies"]) for p in scenario["paths"])
        print(
            f"  scenario {scenario['key']} ({scenario['id']}): "
            f"{len(scenario['paths'])} paths, {len(scenario['steps'])} steps, {cells} cells, "
            f"{dependencies} dependencies"
        )

    if args.verify:
        verify_path = out_path.parent / (out_path.stem + ".verify.sql")
        verify_path.write_text(emit_verify_sql(model, ir_path.name), encoding="utf-8")
        print(f"Wrote {verify_path} (run after the seed to verify read-back)")

    return 0


if __name__ == "__main__":
    sys.exit(main())
