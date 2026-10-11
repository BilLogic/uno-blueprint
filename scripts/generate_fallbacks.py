#!/usr/bin/env python3
"""Generate the no-DB fallback data module from a Service Blueprint IR.

Usage:
    python3 scripts/generate_fallbacks.py <ir-file> --locale <tag>
        [--out src/data/generatedBlueprints.ts] [--register]
        [--registry-out <path> --nav-out <path>]
        [--skip-validation]

This is the no-DB fallback adapter (references/adapter-contract.md): "import"
means regenerating the app's data module from the IR for ONE locale. It emits
a TypeScript module exporting `BlueprintData` per path, keyed by scenario
UUID, with the SAME UUIDv5 ids as scripts/generate_seed_sql.py — the two
adapters must stay behaviorally identical (same IR in -> same render out).

Registration: src/data/blueprintFallbacks.ts derives its lookup tables from
the registry (PACKAGE_SAMPLE_BLUEPRINTS) in a marker-delimited block:

    // GENERATED-BLUEPRINT-REGISTRY:BEGIN …
    // GENERATED-BLUEPRINT-REGISTRY:END

  * With --register, this script rewrites the block in place to import from
    the generated module (transactional: the registry is only rewritten after
    the generated module has been written successfully; re-running is
    idempotent). It ALSO regenerates the offline nav list (SAMPLE_NAV) in
    src/data/sampleNav.ts from the IR service, between its own markers:

        // GENERATED-NAV:BEGIN …
        // GENERATED-NAV:END

    so the nav (phases + scenarios) never drifts from the blueprint data. The
    two are the two halves of one offline board, and a deployment mounting
    this package hands BOTH to its config — `sample.nav` and
    `sample.blueprints` — since a nav replaces rather than merges.
  * Without --register (or if the markers are missing), it prints the exact
    blocks to paste, so nothing is guessed about a hand-modified file.
  * --registry-out/--nav-out is the same pass for a tree that has no markers
    to rewrite: a DEPLOYMENT, which reads the application out of the package
    and holds both halves as modules of its own. They write two standalone
    modules — `SAMPLE_BLUEPRINTS` and `SAMPLE_NAV` — that name their types by
    package name rather than through an '@/…' path their tree does not have.
    Required together, because the two are one board, and refused alongside
    --register, which is the marker rewrite of this repository's own src/.

Output is tsc-clean by construction: all literals are emitted through JSON
serialization (double-quoted, control characters escaped, U+2028/U+2029
escaped), so CJK text, quotes, backticks, and newlines in content are safe.
Verify with `npx tsc -p tsconfig.app.json` after generation — the adapter
contract's read-back step for this adapter.

Parity: this adapter and the SQL one project the SAME model through the SAME
field functions (generate_seed_sql.seed_cell_fields / seed_dependency_fields), so
a field reaches the database and this module in one change. It did not always:
between 2026-08-17 and this note the field lists were written out twice by
hand, they drifted, and the drift lost cell_key, position, the cell spec
fields and cell_dependencies.kind — silently, and only on the adapter an adopter
with no database is told is "not a degraded mode". scripts/adapter_parity.py
now checks the claim instead of asserting it.

Still outside the projection on BOTH adapters, which is parity by absence:
cell_dependencies label/note, which the IR has no shape to author. `kind` was on
that list until 2026.08.26 and is not any more — the IR can author a `needs`
edge, and it reaches both adapters through the same field function. Lanes were
on the list too, wrongly — the SQL adapter carried kpis and tools all along and
the no-DB one did not, which is how a sentence about parity ended up being the
next thing to drift.

Stdlib only. Validation runs first via scripts/validate_ir.py (same dir);
a failing IR generates nothing (the module is replaced wholesale and only
written if generation fully succeeds).
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import validate_ir  # noqa: E402
from generate_seed_sql import (  # noqa: E402
    build_model,
    seed_cell_fields,
    seed_lane_fields,
    seed_resource_fields,
    seed_touchpoint_fields,
    seed_dependency_fields,
)

#: Columns the SQL adapter stores that the nested fallback shape implies.
IMPLIED_BY_NESTING = frozenset({"path_id"})

#: The same idea, one level further in. A resource and a placement are nested
#: under the cell they hang off, so `cell_id` is the row's location rather than
#: a value; `origin` is the same literal on every imported row; `position` is
#: the array index the fallback shape already carries. Both keep their `id`:
#: an editor writes through it, and since 21000118000000 a resource keeps
#: its id across a save the way a placement always did.
IMPLIED_BY_CELL_NESTING = frozenset({"cell_id", "origin", "position"})
IMPLIED_ON_RESOURCE = IMPLIED_BY_CELL_NESTING
IMPLIED_ON_TOUCHPOINT = IMPLIED_BY_CELL_NESTING

#: A placement field the database adapter reads THROUGH A JOIN rather than
#: from the placement row: the registry entry's kind (#112). The fallback
#: serves it on the placement because it has no registry to join, and the
#: parity harness compares it as nested rather than as a column of the row.
JOINED_ON_TOUCHPOINT = frozenset({"kind"})

#: Keys the fallback cell carries that are not cell COLUMNS — they are the two
#: relations the fallback nests instead of joining. Compared as aggregates of
#: their own (scripts/adapter_parity.py), so the cell comparison must not read
#: them as fields served without a database.
NESTED_UNDER_CELL = frozenset({"resources", "touchpoints"})

#: The places the two adapters disagree on a NAME rather than a value. The
#: app's BlueprintLane has called it `role` since before the column did, and
#: renaming a field every component reads to match a column nobody reads would
#: be the wrong way round; a resource's `placementId` is `cell_touchpoint_id`
#: read as the app names it. Declared here so adapter_parity.py can compare
#: through it instead of reporting a difference that is only spelling.
FALLBACK_FIELD_NAMES = {
    "lane_role": "role",
    "cell_touchpoint_id": "placementId",
    "touchpoint_id": "touchpointId",
}


def project(fields: dict, implied: frozenset = IMPLIED_BY_NESTING) -> dict:
    """A SQL-adapter row as the no-DB adapter serves it."""
    return {
        FALLBACK_FIELD_NAMES.get(column, column): value
        for column, value in fields.items()
        if column not in implied
    }

MARKER_BEGIN = "GENERATED-BLUEPRINT-REGISTRY:BEGIN"
MARKER_END = "GENERATED-BLUEPRINT-REGISTRY:END"
NAV_MARKER_BEGIN = "GENERATED-NAV:BEGIN"
NAV_MARKER_END = "GENERATED-NAV:END"
DEFAULT_OUT = Path("src/data/generatedBlueprints.ts")
REGISTRY_FILE = Path("src/data/blueprintFallbacks.ts")
NAV_FILE = Path("src/data/sampleNav.ts")

# The name a deployment imports this package by. Only the standalone modules
# below spell it: the blocks written into this repository's own src/ import
# through '@/…', because there the package IS the tree.
PACKAGE_NAME = "uno-blueprint"
# Where the generated data module names `BlueprintData` when it is written
# into this repository's own src/ — the alias, since there the package IS the
# tree. A deployment's copy names the package instead.
REPO_TYPE_IMPORT = "@/types/blueprint"


def ts_literal(value) -> str:
    """Serialize a value as a TS expression via JSON (valid TS object-literal
    syntax). ensure_ascii=False keeps CJK readable; U+2028/U+2029 are the only
    JSON-legal-but-JS-hostile characters, so escape them explicitly."""
    text = json.dumps(value, ensure_ascii=False, indent=2)
    return text.replace(" ", "\\u2028").replace(" ", "\\u2029")


def indent_block(text: str, prefix: str) -> str:
    lines = text.splitlines()
    return "\n".join(lines[0:1] + [prefix + line if line else line for line in lines[1:]])


# ---------------------------------------------------------------------------
# Model -> BlueprintData (mirrors src/types/blueprint.ts)
# ---------------------------------------------------------------------------


def blueprint_data_for_path(scenario: dict, path: dict) -> dict:
    """Project the shared model onto BlueprintData.

    Cells and edges are projected through generate_seed_sql's own field
    functions, so this adapter carries exactly what the SQL adapter writes.
    `path_id` is the only column dropped, and only because the fallback shape
    nests cells under their path already.
    """
    step_by_id = {step["id"]: step for step in scenario["steps"]}
    return {
        "path": {
            "id": path["id"],
            "name": path["name"],
            "summary": path["summary"],
            "note": path["note"],
            "kind": path["kind"],
            # The IR authors no status: a blueprint an adopter imports states
            # what the service does today, which is the column's own default.
            "status": "live",
        },
        "lanes": [project(seed_lane_fields(lane, path)) for lane in path["lanes"]],
        # Steps in this path's column order (array index = position).
        "steps": [
            {
                "id": ps["step_id"],
                "name": step_by_id[ps["step_id"]]["name"],
                "position": ps["position"],
            }
            for ps in path["path_steps"]
        ],
        # The two relations that replaced `cells.links`, nested under their
        # cell rather than served as rows of their own — the fallback shape
        # nests what the database joins, which is why `path_id` is dropped
        # above and `cell_id` is dropped below.
        "cells": [
            {
                **project(seed_cell_fields(cell, path)),
                "resources": [
                    project(seed_resource_fields(r, cell), IMPLIED_ON_RESOURCE)
                    for r in cell["resources"]
                ],
                "touchpoints": [
                    {
                        **project(seed_touchpoint_fields(t, cell), IMPLIED_ON_TOUCHPOINT),
                        # The registry entry's kind, as the database adapter
                        # reads it through the join (#112).
                        "kind": t["kind"],
                    }
                    for t in cell["touchpoints"]
                ],
            }
            for cell in path["cells"]
        ],
        "dependencies": [project(seed_dependency_fields(edge)) for edge in path["dependencies"]],
    }


def emit_module(model: dict, ir_name: str, type_specifier: str = REPO_TYPE_IMPORT) -> str:
    fallbacks_by_scenario = {
        scenario["id"]: [blueprint_data_for_path(scenario, path) for path in scenario["paths"]]
        for scenario in model["scenarios"]
    }
    scenario_ids = [scenario["id"] for scenario in model["scenarios"]]
    dimensions = "\n".join(
        f"//   {scenario['key']} ({scenario['id']}): "
        f"{len(scenario['paths'])} paths, {len(scenario['steps'])} steps, "
        f"{sum(len(p['cells']) for p in scenario['paths'])} cells, "
        f"{sum(len(p['dependencies']) for p in scenario['paths'])} dependencies"
        for scenario in model["scenarios"]
    )
    return f"""// GENERATED by scripts/generate_fallbacks.py — edit the IR and regenerate; do not hand-edit.
//
// Source IR: {ir_name}
// Locale:    {model['locale']} (one generated module per locale; never mix locales in one build)
//
// No-DB fallback adapter output (references/adapter-contract.md): BlueprintData
// per path, keyed by scenario UUID. Ids are UUIDv5 from IR keys + locale —
// identical to the ids scripts/generate_seed_sql.py writes to the database,
// so fallback and live-DB modes render the same content.
//
// Dimensions:
{dimensions}

import type {{ BlueprintData }} from '{type_specifier}'

/** Locale this module was generated for. */
export const GENERATED_BLUEPRINT_LOCALE = {ts_literal(model['locale'])}

/** Scenario UUIDs in IR order; the first is the default sample scenario. */
export const GENERATED_SCENARIO_IDS: readonly string[] = {ts_literal(scenario_ids)}

/** The default scenario rendered offline without a database. */
export const GENERATED_PRIMARY_SCENARIO_ID = {ts_literal(scenario_ids[0])}

/** BlueprintData per path, keyed by scenario UUID, in picker order. */
export const GENERATED_PATH_FALLBACKS_BY_SCENARIO: Record<string, BlueprintData[]> =
  {indent_block(ts_literal(fallbacks_by_scenario), '  ')}
"""


# ---------------------------------------------------------------------------
# Registry block (src/data/blueprintFallbacks.ts between the markers)
# ---------------------------------------------------------------------------


def module_specifier(out_path: Path, repo_root: Path) -> str | None:
    """'@/…' import specifier for the generated module, or None if the module
    is outside src/ (then --register cannot wire it up)."""
    try:
        rel = out_path.resolve().relative_to((repo_root / "src").resolve())
    except ValueError:
        return None
    return "@/" + rel.with_suffix("").as_posix()


def registry_value(name: str) -> str:
    """The registry literal itself, under whichever name is exporting it.

    ONE payload with two homes — the marker block here and the standalone
    module a deployment gets — so a field added to SampleBlueprintRegistry is
    added once rather than in two emitters that drift the way the field lists
    of the two adapters once did."""
    return f"""export const {name}: SampleBlueprintRegistry = {{
  blueprintsByScenario: GENERATED_PATH_FALLBACKS_BY_SCENARIO,
  // Paths hidden from pickers/grids until ready in the UI (generated: none).
  uiHiddenPathIdsByScenario: {{}},
}}"""


def nav_value(model: dict) -> str:
    """The nav list itself, shared by the marker block and the standalone
    module for the same reason `registry_value` is."""
    return f"export const SAMPLE_NAV: NavItem[] = {ts_literal(nav_items(model))}"


def registry_block(specifier: str) -> str:
    return f"""// {MARKER_BEGIN} — managed by scripts/generate_fallbacks.py --register.
// Everything between the BEGIN/END markers is replaced wholesale on
// registration; do not hand-edit. Current content: generated blueprint
// registry derived from {specifier}.
import {{
  GENERATED_PATH_FALLBACKS_BY_SCENARIO,
  GENERATED_PRIMARY_SCENARIO_ID,
}} from '{specifier}'

/** The generated primary scenario (rendered offline without a database). */
export const SAMPLE_SCENARIO_ID = GENERATED_PRIMARY_SCENARIO_ID

/**
 * This build's own offline board. A deployment that reads the application out
 * of the package hands this same value to the config as `sample.blueprints`,
 * beside the `sample.nav` generated in the same run — the nav lists the
 * scenarios, this draws them, and one without the other is rows over an empty
 * canvas.
 */
{registry_value('PACKAGE_SAMPLE_BLUEPRINTS')}
// {MARKER_END}"""


def rewrite_marker_block(
    path: Path, begin_marker: str, end_marker: str, block_text: str
) -> bool:
    """Replace a marker-delimited block in place. Returns True on success,
    False if markers are missing/malformed (caller prints manual instructions)."""
    text = path.read_text(encoding="utf-8")
    lines = text.splitlines(keepends=True)
    begin = end = None
    for index, line in enumerate(lines):
        if begin_marker in line and begin is None:
            begin = index
        elif end_marker in line and begin is not None:
            end = index
            break
    if begin is None or end is None:
        return False
    new_text = "".join(lines[:begin]) + block_text + "\n" + "".join(lines[end + 1:])
    path.write_text(new_text, encoding="utf-8")
    return True


# ---------------------------------------------------------------------------
# Offline nav (src/data/sampleNav.ts SAMPLE_NAV between the GENERATED-NAV markers)
# ---------------------------------------------------------------------------


def nav_items(model: dict) -> list:
    """The offline nav list (SAMPLE_NAV) derived from the IR service: one
    entry per phase, each followed by its scenarios (subslides). Positional
    ordering only — mirrors the DB-backed nav the app builds from phases +
    scenarios, so fallback nav never drifts from the blueprint data."""
    phase_id_by_key = {ph["key"]: ph["id"] for ph in model["phases"]}
    scenarios_by_phase: dict = {}
    for scenario in model["scenarios"]:
        scenarios_by_phase.setdefault(scenario["phase_id"], []).append(scenario)

    items = []
    for phase in sorted(model["phases"], key=lambda p: p["order"]):
        item = {"id": phase["id"], "index": phase["order"], "label": phase["name"]}
        if phase.get("summary"):
            item["summary"] = phase["summary"]
        if phase.get("loops_to"):
            loop_id = phase_id_by_key.get(phase["loops_to"])
            if loop_id:
                item["loopToId"] = loop_id
        items.append(item)
        for scenario in sorted(
            scenarios_by_phase.get(phase["id"], []), key=lambda s: s["order"]
        ):
            sub = {
                "id": scenario["id"],
                "index": scenario["order"],
                "label": scenario["name"],
                "parentId": phase["id"],
                # One vocabulary since 21000116000000: the IR's value is the
                # slide's. Anything else falls back to stacked, the default.
                "layout": scenario["layout"]
                if scenario["layout"] in ("stacked", "merged")
                else "stacked",
            }
            if scenario.get("summary"):
                sub["summary"] = scenario["summary"]
            items.append(sub)
    return items


def nav_block(model: dict) -> str:
    return f"""// {NAV_MARKER_BEGIN} — managed by scripts/generate_fallbacks.py --register.
// Replaced wholesale on registration; do not hand-edit. Offline nav derived
// from the IR service (phases + their scenarios) for locale {model['locale']}.
{nav_value(model)}
// {NAV_MARKER_END}"""


# ---------------------------------------------------------------------------
# Standalone modules for a deployment (--registry-out / --nav-out)
# ---------------------------------------------------------------------------
#
# A deployment that reads the application out of the package has no marker
# block to rewrite: the registry and the nav it hands to `sample.blueprints`
# and `sample.nav` are its OWN modules, held beside its cover copy. So these
# two are written whole rather than spliced, they name their types by package
# name because no '@/…' path of the writing tree can reach them, and they come
# as a pair for the reason the config field documents — one half without the
# other is rows over an empty canvas, not a partial board.


def sibling_label(from_file: Path, to_file: Path) -> str:
    """One generated module's name as the other's header should write it —
    relative, so the sentence says the same thing wherever the pair was
    generated from and a committed file is not stamped with somebody's cwd."""
    return os.path.relpath(
        to_file.resolve(), start=from_file.resolve().parent
    ).replace(os.sep, "/")


def relative_specifier(from_file: Path, to_file: Path) -> str:
    """Extensionless relative import specifier from one module to another,
    always prefixed so a bundler reads it as a path rather than a package."""
    rel = sibling_label(from_file, to_file.with_suffix(""))
    return rel if rel.startswith(".") else f"./{rel}"


def standalone_registry_module(data_specifier: str, nav_label: str) -> str:
    return f"""// GENERATED by scripts/generate_fallbacks.py --registry-out — edit the IR and
// regenerate; do not hand-edit.
//
// This deployment's offline board, in the shape `sample.blueprints` takes.
// Hand it to the config with the nav generated in the same run ({nav_label}).
// Why both, and why the type comes by package name:
// docs/guide/05-customizing-a-deployment.md § The offline board is two
// fields, in the installed package.
import type {{ SampleBlueprintRegistry }} from '{PACKAGE_NAME}'
import {{ GENERATED_PATH_FALLBACKS_BY_SCENARIO }} from '{data_specifier}'

{registry_value('SAMPLE_BLUEPRINTS')}
"""


def standalone_nav_module(model: dict, registry_label: str) -> str:
    return f"""// GENERATED by scripts/generate_fallbacks.py --nav-out — edit the IR and
// regenerate; do not hand-edit.
//
// The phases and scenarios this deployment shows before a database answers.
// Locale: {model['locale']}.
// What each row draws is the registry generated in the same run
// ({registry_label}); hand both to the config.
import type {{ NavItem }} from '{PACKAGE_NAME}'

{nav_value(model)}
"""


def deployment_invocation_refusal(args, default_out: str) -> str | None:
    """Why this --registry-out/--nav-out run cannot proceed, or None.

    Every one of these is answered BEFORE the IR is read, so a wrong invocation
    writes nothing at all rather than leaving one generated file behind."""
    if not (args.registry_out and args.nav_out):
        return (
            "--registry-out and --nav-out go together. The nav lists the scenarios "
            "and the registry draws them, each REPLACES rather than merges, and one "
            "without the other is rows over an empty canvas in every no-database "
            "build."
        )
    if args.register:
        return (
            f"--register rewrites the marker blocks in this package's own "
            f"{REGISTRY_FILE} and {NAV_FILE}; --registry-out/--nav-out write a "
            "deployment's own modules. Pick the tree you are generating for."
        )
    # A deployment that mounts this package MUST NOT grow a `src`: the '@/…'
    # alias tries the host's root first, so a src holding only the host's files
    # captures every one of the application's own imports and resolves none of
    # them. Every path this run writes is held to that, not just --out.
    for flag, value in (
        ("--out", args.out),
        ("--registry-out", args.registry_out),
        ("--nav-out", args.nav_out),
    ):
        if "src" not in Path(value).parts:
            continue
        named = (
            f"{flag} {value}"
            if flag != "--out" or value != default_out
            else f"the default output path ({value})"
        )
        return (
            f"{named} puts a generated module under src/, and a deployment that "
            "mounts this package must not have one: the '@/…' alias tries the "
            "host's root first, so a src holding only the host's files captures "
            "every one of the application's own imports and resolves none of "
            "them. Generate beside your other content instead (for example "
            "--out deployment/data/generatedBlueprints.ts)."
        )
    return None


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(
        description="Generate the no-DB fallback TS module from a blueprint IR (one locale per run)."
    )
    parser.add_argument("ir_file", help="IR file (.json native; .yaml if PyYAML is installed)")
    parser.add_argument("--locale", required=True, help="locale to generate (must be declared in the IR)")
    parser.add_argument("--out", default=str(DEFAULT_OUT),
                        help=f"output module path (default: {DEFAULT_OUT})")
    parser.add_argument("--register", action="store_true",
                        help="rewrite the marker-delimited registry block in src/data/blueprintFallbacks.ts")
    parser.add_argument("--registry-out", metavar="PATH",
                        help="write a standalone registry module (SAMPLE_BLUEPRINTS) at PATH, "
                             "for a deployment that has no marker block to rewrite; "
                             "requires --nav-out")
    parser.add_argument("--nav-out", metavar="PATH",
                        help="write a standalone nav module (SAMPLE_NAV) at PATH; "
                             "requires --registry-out")
    parser.add_argument("--skip-validation", action="store_true",
                        help="skip the validate_ir.py pre-flight (not recommended)")
    args = parser.parse_args(argv)

    deployment_out = bool(args.registry_out or args.nav_out)
    if deployment_out:
        refusal = deployment_invocation_refusal(args, parser.get_default("out"))
        if refusal is not None:
            print(f"ERROR: {refusal}", file=sys.stderr)
            return 1

    repo_root = Path(__file__).resolve().parent.parent
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
                "(the module is only replaced when generation fully succeeds).",
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
    module_text = emit_module(
        model, ir_path.name, PACKAGE_NAME if deployment_out else REPO_TYPE_IMPORT
    )

    out_path = Path(args.out)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(module_text, encoding="utf-8")
    print(f"Wrote {out_path}")
    for scenario in model["scenarios"]:
        cells = sum(len(p["cells"]) for p in scenario["paths"])
        dependencies = sum(len(p["dependencies"]) for p in scenario["paths"])
        print(
            f"  scenario {scenario['key']} ({scenario['id']}): "
            f"{len(scenario['paths'])} paths, {len(scenario['steps'])} steps, {cells} cells, {dependencies} dependencies"
        )

    if deployment_out:
        registry_out_path = Path(args.registry_out)
        nav_out_path = Path(args.nav_out)
        for path in (registry_out_path, nav_out_path):
            path.parent.mkdir(parents=True, exist_ok=True)
        registry_out_path.write_text(
            standalone_registry_module(
                relative_specifier(registry_out_path, out_path),
                sibling_label(registry_out_path, nav_out_path),
            ),
            encoding="utf-8",
        )
        print(f"Wrote {registry_out_path} (SAMPLE_BLUEPRINTS)")
        nav_out_path.write_text(
            standalone_nav_module(
                model, sibling_label(nav_out_path, registry_out_path)
            ),
            encoding="utf-8",
        )
        print(f"Wrote {nav_out_path} (SAMPLE_NAV)")
        print(
            "Hand both to your deployment config: "
            "sample: { nav: SAMPLE_NAV, blueprints: SAMPLE_BLUEPRINTS }"
        )
        return 0

    specifier = module_specifier(out_path, repo_root)
    registry_path = repo_root / REGISTRY_FILE

    nav_path = repo_root / NAV_FILE

    if args.register:
        if specifier is None:
            print(
                f"ERROR: --register requires the output module to live under src/ "
                f"(got {out_path}); cannot derive an '@/…' import specifier.",
                file=sys.stderr,
            )
            return 1
        if not rewrite_marker_block(
            registry_path, MARKER_BEGIN, MARKER_END, registry_block(specifier)
        ):
            print(
                f"ERROR: could not find the {MARKER_BEGIN} … {MARKER_END} markers in "
                f"{registry_path} — the registry looks hand-modified. Replace its "
                "import + SAMPLE_SCENARIO_ID + FALLBACK_* + UI_HIDDEN_PATH_IDS_BY_SCENARIO "
                "definitions with this block (and keep the markers for next time):\n",
                file=sys.stderr,
            )
            print(registry_block(specifier), file=sys.stderr)
            return 1
        print(f"Registered: rewrote the marker block in {registry_path}")

        if not rewrite_marker_block(
            nav_path, NAV_MARKER_BEGIN, NAV_MARKER_END, nav_block(model)
        ):
            print(
                f"ERROR: could not find the {NAV_MARKER_BEGIN} … {NAV_MARKER_END} markers "
                f"in {nav_path} — replace the SAMPLE_NAV block with this (and keep the "
                "markers for next time):\n",
                file=sys.stderr,
            )
            print(nav_block(model), file=sys.stderr)
            return 1
        print(f"Registered: rewrote the nav block in {nav_path}")
        print("Verify with: npx tsc -p tsconfig.app.json")
        return 0

    if specifier is not None:
        print(
            "\nNot registered (dry run). To wire the app to this module either re-run "
            "with --register, or replace the two marker blocks by hand.\n\n"
            f"{REGISTRY_FILE} — blueprint registry block:\n\n{registry_block(specifier)}\n\n"
            f"{NAV_FILE} — offline nav block:\n\n{nav_block(model)}\n\n"
            "Then verify with: npx tsc -p tsconfig.app.json"
        )
    return 0


if __name__ == "__main__":
    sys.exit(main())
