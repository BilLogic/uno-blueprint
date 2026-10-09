#!/usr/bin/env bash
# Round-trip tests for the Phase 1 IR scripts:
#   scripts/validate_ir.py, scripts/generate_seed_sql.py,
#   scripts/generate_fallbacks.py
#
# Usage: bash scripts/tests/run_tests.sh
#
# Covers: validator pass on the bilingual sample fixture; validator FAIL with
# the right messages on four crafted-bad mutations, one of them a lane role
# outside the closed eight; YAML-support branch;
# seed SQL for en + zh (transaction wrapper, balanced quotes, insert order,
# deterministic UUIDv5 ids across runs, per-locale divergence, --verify
# companion); generators refusing an invalid IR without writing output;
# fallback TS generation + `tsc` type-check + --register round-trip against
# src/data/blueprintFallbacks.ts (restored afterwards); an IR authored with the
# retired `path.triggers` spelling still loading, by being carried across the
# 2026.09.09 rename; a lane role carried by a spelling the closed vocabulary
# retired being renamed by the 2026.09.08 step, and a role outside the eight
# being nulled by the 2026.09.10 step that closed the wire format; a
# dependency edge's
# `kind` round-tripping through both adapters, including an `enables` edge and
# the identity that keeps both kinds of one pair apart; the service's per-kind
# examples reaching the seed in the seed's own locale, and the conflict clause
# still reading an empty map as silence; schema-version
# migration (a superseded IR is refused by name, migrate_ir.py carries it
# forward through every step, a signed scenario's sign-off hash is re-anchored
# rather than dropped when a step moves the subtree, and left exactly alone
# when a step does not).
#
# Requires: python3 (stdlib only) and the repo's node_modules (for tsc).

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
SAMPLE="$SCRIPT_DIR/sample-ir.json"
SAMPLE_OLD="$SCRIPT_DIR/sample-ir-2026.07.16.json"
SAMPLE_PREV="$SCRIPT_DIR/sample-ir-2026.08.25.json"
VALIDATE="$REPO_ROOT/scripts/validate_ir.py"
MIGRATE="$REPO_ROOT/scripts/migrate_ir.py"
SEED_GEN="$REPO_ROOT/scripts/generate_seed_sql.py"
FALLBACK_GEN="$REPO_ROOT/scripts/generate_fallbacks.py"
REGISTRY="$REPO_ROOT/src/data/blueprintFallbacks.ts"
GENERATED_TS="$REPO_ROOT/src/data/generatedBlueprints.ts"
NAV="$REPO_ROOT/src/data/sampleNav.ts"

TMP="$(mktemp -d)"
PASS_COUNT=0

# Snapshot app files the --register test mutates, and restore them on exit.
cp "$REGISTRY" "$TMP/blueprintFallbacks.ts.bak"
cp "$NAV" "$TMP/nav.ts.bak"
GENERATED_TS_EXISTED=0
if [ -f "$GENERATED_TS" ]; then
  GENERATED_TS_EXISTED=1
  cp "$GENERATED_TS" "$TMP/generatedBlueprints.ts.bak"
fi

cleanup() {
  cp "$TMP/blueprintFallbacks.ts.bak" "$REGISTRY"
  cp "$TMP/nav.ts.bak" "$NAV"
  if [ "$GENERATED_TS_EXISTED" = 1 ]; then
    cp "$TMP/generatedBlueprints.ts.bak" "$GENERATED_TS"
  else
    rm -f "$GENERATED_TS"
  fi
  rm -rf "$TMP"
}
trap cleanup EXIT

pass() {
  PASS_COUNT=$((PASS_COUNT + 1))
  echo "PASS  $1"
}

fail() {
  echo "FAIL  $1" >&2
  exit 1
}

# ---------------------------------------------------------------------------
# 1. Validator accepts the bilingual sample fixture
# ---------------------------------------------------------------------------

python3 "$VALIDATE" "$SAMPLE" > "$TMP/valid.out" 2>&1 \
  || fail "validator-sample: expected exit 0, got $? — $(cat "$TMP/valid.out")"
grep -q "OK" "$TMP/valid.out" || fail "validator-sample: no OK line"
pass "validator-sample (bilingual fixture validates cleanly)"

# ---------------------------------------------------------------------------
# 2. Validator rejects four crafted-bad mutations with the right messages
# ---------------------------------------------------------------------------

python3 - "$SAMPLE" "$TMP" <<'PY'
import json, sys
sample_path, tmp = sys.argv[1], sys.argv[2]
base = json.load(open(sample_path, encoding="utf-8"))
scenario = lambda d: d["service"]["phases"][0]["scenarios"][0]

# bad1: cell referencing a scenario step absent from the path's path_steps
# ('archive' is not on as-done) — the DB-trigger preview case.
bad = json.loads(json.dumps(base))
scenario(bad)["paths"][1]["cells"].append(
    {"lane": "compliance", "step": "archive", "content": {"en": "x", "zh": "x"}}
)
json.dump(bad, open(f"{tmp}/bad1.json", "w", encoding="utf-8"), ensure_ascii=False)

# bad2: duplicate step in path_steps (duplicate position).
bad = json.loads(json.dumps(base))
scenario(bad)["paths"][0]["path_steps"].append("report")
json.dump(bad, open(f"{tmp}/bad2.json", "w", encoding="utf-8"), ensure_ascii=False)

# bad3: cross-path dependency — (field-tech, verify) is a cell on as-done
# only, referenced from an edge on as-designed.
bad = json.loads(json.dumps(base))
scenario(bad)["paths"][0]["dependencies"].append(
    {
        "source": {"lane": "citizen", "step": "report"},
        "target": {"lane": "field-tech", "step": "verify"},
    }
)
json.dump(bad, open(f"{tmp}/bad3.json", "w", encoding="utf-8"), ensure_ascii=False)

# bad4: a lane role outside the closed eight. This passed in SILENCE until
# #204 — the schema took any ^[a-z0-9][a-z0-9_]*$ while lanes_lane_role_check
# took eight values — so the document validated here and was refused by
# Postgres part-way through its import, which is the one moment its author
# can do nothing about it.
bad = json.loads(json.dumps(base))
scenario(bad)["paths"][0]["lanes"][-1]["role"] = "compliance_review"
json.dump(bad, open(f"{tmp}/bad4.json", "w", encoding="utf-8"), ensure_ascii=False)
PY

expect_invalid() {
  local name="$1" file="$2" needle="$3"
  if python3 "$VALIDATE" "$file" > "$TMP/$name.out" 2>&1; then
    fail "$name: expected non-zero exit"
  fi
  grep -q "$needle" "$TMP/$name.out" \
    || fail "$name: expected message containing '$needle' — got: $(cat "$TMP/$name.out")"
  pass "$name"
}

expect_invalid "validator-bad1 (cell step missing from path_steps)" "$TMP/bad1.json" "cells_validate_path_match"
expect_invalid "validator-bad2 (duplicate position in path_steps)" "$TMP/bad2.json" "duplicate step 'report' in path_steps"
expect_invalid "validator-bad3 (cross-path dependency)" "$TMP/bad3.json" "cross-path edges are invalid"
expect_invalid "validator-bad4 (lane role outside the closed eight)" "$TMP/bad4.json" "is not one of the eight"

# The message is the whole of what the author gets, so it is checked as such:
# the offending value, the lane carrying it, every legal value, and the fact
# that null is one of them. A reader who has to open another document to find
# out what the ninth role should have been has been told the wrong thing.
python3 "$VALIDATE" "$TMP/bad4.json" > "$TMP/bad4.out" 2>&1 || true
for needle in "compliance_review" "on lane 'compliance'" "customer_actions" \
  "frontstage_actions" "backstage_actions" "partner_actions" \
  "frontstage_touchpoints" "backstage_touchpoints" "support_actions" \
  "storyboard" "Use null" "lanes_lane_role_check"; do
  grep -q "$needle" "$TMP/bad4.out" \
    || fail "validator-bad4: the message does not say '$needle' — $(cat "$TMP/bad4.out")"
done
pass "validator-bad4-message (the value, the lane, all eight, and null)"

# The version field was checked for being a STRING and nothing else, so an IR
# authored against a shape the database does not have validated cleanly.
python3 - "$SAMPLE" "$TMP" <<'PY'
import json, sys
tmp = sys.argv[2]
doc = json.load(open(sys.argv[1], encoding="utf-8"))
doc["schema_version"] = "1999.01.01"
json.dump(doc, open(f"{tmp}/bad-version.json", "w", encoding="utf-8"), ensure_ascii=False)
PY
expect_invalid "validator-schema-version (unknown version rejected by name)" "$TMP/bad-version.json" "unknown schema_version"
python3 "$VALIDATE" "$TMP/bad-version.json" > "$TMP/bad-version.out" 2>&1 || true
grep -q "migrate_ir.py" "$TMP/bad-version.out" \
  || fail "validator-schema-version: the message must say where the migration steps live"

# ---------------------------------------------------------------------------
# 3. YAML branch: native JSON always works; YAML needs PyYAML (clear message)
# ---------------------------------------------------------------------------

if python3 -c "import yaml" 2>/dev/null; then
  python3 -c '
import json, sys, yaml
doc = json.load(open(sys.argv[1], encoding="utf-8"))
yaml.safe_dump(doc, open(sys.argv[2], "w", encoding="utf-8"), allow_unicode=True)
' "$SAMPLE" "$TMP/sample.yaml"
  python3 "$VALIDATE" "$TMP/sample.yaml" > "$TMP/yaml.out" 2>&1 \
    || fail "validator-yaml: PyYAML present but YAML IR failed — $(cat "$TMP/yaml.out")"
  pass "validator-yaml (PyYAML present: YAML IR validates)"
else
  printf 'schema_version: "1"\n' > "$TMP/sample.yaml"
  if python3 "$VALIDATE" "$TMP/sample.yaml" > "$TMP/yaml.out" 2>&1; then
    fail "validator-yaml: expected non-zero exit without PyYAML"
  fi
  grep -q "PyYAML" "$TMP/yaml.out" || fail "validator-yaml: no PyYAML fallback message"
  pass "validator-yaml (no PyYAML: clear fallback message, JSON stays native)"
fi

# ---------------------------------------------------------------------------
# 4. Seed SQL: en + zh, wrapper, quoting, insert order, determinism, --verify
# ---------------------------------------------------------------------------

python3 "$SEED_GEN" "$SAMPLE" --locale en --out "$TMP/seed.en.sql" --verify > /dev/null \
  || fail "seed-en: generation failed"
python3 "$SEED_GEN" "$SAMPLE" --locale zh --out "$TMP/seed.zh.sql" --verify > /dev/null \
  || fail "seed-zh: generation failed"
[ -f "$TMP/seed.en.verify.sql" ] || fail "seed-verify: en companion missing"
[ -f "$TMP/seed.zh.verify.sql" ] || fail "seed-verify: zh companion missing"
pass "seed-generate (en + zh + --verify companions)"

python3 - "$TMP/seed.en.sql" "$TMP/seed.zh.sql" <<'PY'
import re, sys

TABLE_ORDER = ["paths", "steps", "path_steps", "lanes", "cells", "cell_dependencies"]

for path in sys.argv[1:]:
    sql = open(path, encoding="utf-8").read()
    body = "\n".join(
        line for line in sql.splitlines() if not line.lstrip().startswith("--")
    )

    # Transaction wrapper.
    assert body.lstrip().startswith("begin;"), f"{path}: missing begin; wrapper"
    assert body.rstrip().endswith("commit;"), f"{path}: missing trailing commit;"
    assert body.count("begin;") == 1 and body.count("commit;") == 1, f"{path}: not one transaction"

    # Balanced single quotes (every literal contributes an even count once
    # doubled quotes are counted as two characters).
    quotes = body.count("'")
    assert quotes % 2 == 0, f"{path}: unbalanced single quotes ({quotes})"

    # Scenario-replace before any scenario-child insert; dependency order.
    delete_pos = body.index("delete from public.scenarios")
    positions = [body.index(f"insert into public.{t} ") for t in TABLE_ORDER]
    assert delete_pos < min(positions), f"{path}: delete must precede child inserts"
    assert positions == sorted(positions), f"{path}: insert order violates paths->steps->path_steps->lanes->cells->cell_dependencies"

    # Service and phases are upserts keyed on the derived id; scenario children
    # are plain inserts.
    assert body.count("on conflict (id) do update") == 2, f"{path}: service+phases must be the only id-keyed upserts"

    # The registry reconciles on the NAME, because that is the identity
    # `unique (name)` asserts (#201). Keyed on the derived id it refused a
    # second service's seed outright, and it could not land on a target whose
    # rows predate the deployment-stable derivation.
    assert body.count("on conflict (name) do update") == 1, f"{path}: the registry must upsert on the name"
    registry = body.index("insert into public.touchpoints ")
    assert body.index("on conflict (name) do update") > registry, f"{path}: the name-keyed upsert is not the registry's"

    # A placement points at whatever row the target actually holds under that
    # name — read back, never written as the derived literal.
    assert "(select id from public.touchpoints where name = " in body, (
        f"{path}: a placement writes a derived registry id instead of resolving one"
    )

en = open(sys.argv[1], encoding="utf-8").read()
zh = open(sys.argv[2], encoding="utf-8").read()
assert "Submit repair ticket" in en, "en seed missing en content"
assert "提交报修工单" in zh, "zh seed missing zh content"
assert en != zh, "en and zh seeds must differ"

# Locale-scoped UUIDv5: no shared entity ids between locale artifact sets.
uuid_re = re.compile(r"'[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}'")
assert not (set(uuid_re.findall(en)) & set(uuid_re.findall(zh))), "en/zh UUID sets overlap"

verify = open(sys.argv[1].replace(".sql", ".verify.sql"), encoding="utf-8").read()
for needle in ("do $$", "path_steps", "cell_dependencies", "raise exception"):
    assert needle in verify, f"verify sql missing {needle!r}"
PY
pass "seed-assertions (wrapper, balanced quotes, insert order, locale content, verify checks)"

python3 "$SEED_GEN" "$SAMPLE" --locale en --out "$TMP/seed.en.2.sql" > /dev/null
diff -q "$TMP/seed.en.sql" "$TMP/seed.en.2.sql" > /dev/null \
  || fail "seed-deterministic: two runs differ"
pass "seed-deterministic (identical output across runs — idempotent UUIDv5 ids)"

# A registry row's id is the DEPLOYMENT's, not the seeding service's (#201).
# The derivation took `f"{service_key}#{name}"`, so two services minted two ids
# for one tool. That was consistent under `unique (service_id, name)` and wrong
# the moment 21000131000000 made the catalog one deployment-level pool: seeding
# a second service into a target holding the first was refused by
# `touchpoints_name_key`. The id is what a row that does not yet exist is born
# with, and the constraint says a name is the identity — so the two must agree.
python3 - "$REPO_ROOT" "$SAMPLE" <<'PY' || fail "seed-registry-id: the derivation is not deployment-stable"
import copy, json, sys

repo, sample = sys.argv[1:3]
sys.path.insert(0, f"{repo}/scripts")
from generate_seed_sql import build_model

doc = json.load(open(sample, encoding="utf-8"))
other = copy.deepcopy(doc)
other["service"]["key"] = doc["service"]["key"] + "-second"
other["service"]["name"] = {k: v + " (second)" for k, v in doc["service"]["name"].items()}

mine = build_model(doc, "en")
theirs = build_model(other, "en")
assert mine["touchpoints"], "the sample seeds no registry row; this test proves nothing"
assert mine["service"]["id"] != theirs["service"]["id"], (
    "the two services share an id — the fixture did not diverge"
)
by_name = lambda model: {tp["name"]: tp["id"] for tp in model["touchpoints"]}
assert by_name(mine) == by_name(theirs), (
    f"one tool, two ids: {by_name(mine)} vs {by_name(theirs)}"
)

# And still per-locale: two targets, one per locale, must not share a row id.
assert by_name(mine) != by_name(build_model(doc, "zh")), (
    "the locale left the derivation; en and zh would collide in one target"
)
PY
pass "seed-registry-id (one tool, one registry id across services; still per-locale)"

if python3 "$SEED_GEN" "$TMP/bad1.json" --locale en --out "$TMP/seed.bad.sql" > /dev/null 2>&1; then
  fail "seed-invalid-ir: expected refusal"
fi
[ ! -f "$TMP/seed.bad.sql" ] || fail "seed-invalid-ir: output written despite invalid IR"
pass "seed-invalid-ir (invalid IR generates nothing — target untouched)"

# ---------------------------------------------------------------------------
# 4b. Schema parity: cell_key, position, spec fields, trigger kind,
#     derived-row reporting (authoring_foundation + derived_layer migrations)
# ---------------------------------------------------------------------------

# cell_key: emitted for every cell, deterministic, collision-free, and
# byte-identical to BOTH the UUIDv5 input and the slice tooling's convention
# (service/phase/scenario/path/lane/step).
python3 - "$REPO_ROOT" "$SAMPLE" "$TMP/seed.en.sql" <<'PY' \
  || fail "seed-cell-key: cell_key emission broke parity"
import json, sys
repo, sample, seed_path = sys.argv[1:4]
sys.path.insert(0, f"{repo}/scripts")
sys.path.insert(0, f"{repo}/skills/slice/scripts")
from generate_seed_sql import build_model, entity_uuid
import slice_tools

doc = json.load(open(sample, encoding="utf-8"))
model = build_model(doc, "en")
keys = []
for sc in model["scenarios"]:
    for p in sc["paths"]:
        for c in p["cells"]:
            keys.append(c["cell_key"])
            # The stored key IS the UUIDv5 input: id must re-derive from it.
            assert entity_uuid("en", "cell", c["cell_key"]) == c["id"], \
                f"cell_key does not re-derive the cell id: {c['cell_key']}"
            assert c["cell_key"].startswith(sc["qualified_key"] + "/"), \
                f"cell_key missing scenario prefix: {c['cell_key']}"
assert len(keys) == len(set(keys)), "cell_key collision on the sample IR"

# Convention parity with the slice tooling (the consumer of these keys).
index = slice_tools.index_ir(doc)
k = slice_tools.cell_key(index, "operate/asset-repair", "as-designed", "citizen", "report")
assert k in keys, f"slice_tools convention diverged: {k}"

# And every key is actually written into the seed SQL's cells insert.
seed = open(seed_path, encoding="utf-8").read()
assert "cell_key" in seed.split("insert into public.cells ", 1)[1].split(") values", 1)[0], \
    "cells insert has no cell_key column"
for key in keys:
    assert f"'{key}'" in seed, f"cell_key missing from seed SQL: {key}"
PY
pass "seed-cell-key (deterministic, collision-free, uuid- and slice-tooling parity)"

# Spec fields: pass through when the IR carries them; default when absent.
python3 - "$TMP/seed.en.sql" <<'PY' || fail "seed-spec-fields: spec-field passthrough broken"
import sys
seed = open(sys.argv[1], encoding="utf-8").read()

cells_stmt = seed.split("insert into public.cells ", 1)[1].split(";\n", 1)[0]
cols = cells_stmt.split(") values", 1)[0]
for col in ("position", "cell_key", "function", "form", "value_props", "owner", "perceived_owner"):
    assert col in cols, f"cells insert missing column {col}"

# Values from the sample IR's spec-annotated cells (citizen/report as-designed
# carries all five; backstage-tech/triage as-done carries owner only).
assert "Capture the fault with enough detail" in seed, "function value missing"
assert "Mobile web form with photo upload" in seed, "form value missing"
assert "'city-311'" in seed, "owner value missing"
assert "the city''s repair crew" in seed, "perceived_owner value missing (or quote-doubling broken)"
assert '"for": "citizen"' in seed and "Fault logged without waiting on hold" in seed, \
    "value_props jsonb missing"
assert "'maintenance-contractor'" in seed, "partial spec cell (owner only) missing"
# Cells without spec fields fall back to null / empty jsonb array defaults.
assert ", null, null, '[]'::jsonb, null, null)" in seed, \
    "spec-less cells should emit null/null/[]/null/null"

lanes_stmt = seed.split("insert into public.lanes ", 1)[1].split(";\n", 1)[0]
assert "kpis" in lanes_stmt and "tools" in lanes_stmt, "lanes insert missing kpis/tools"
assert "mean-time-to-repair" in lanes_stmt, "lane kpis value missing"
assert "FieldOps app" in lanes_stmt, "lane tools value missing"
PY
pass "seed-spec-fields (cells + lanes wave-2 fields pass through; absent -> defaults)"

# Dependency kind, end to end. The IR could not express the panel-only kind at
# all until 2026.08.26, so one authored in the fixture is the whole round trip:
# it has to reach the insert, keep its kind, and not collide with the arrow.
python3 - "$TMP/seed.en.sql" <<'PY' || fail "seed-dependency-kind: kind emission broken"
import sys
seed = open(sys.argv[1], encoding="utf-8").read()
stmt = seed.split("insert into public.cell_dependencies ", 1)[1].split(";\n", 1)[0]
assert "kind" in stmt.split(") values", 1)[0], "cell_dependencies insert missing kind column"
rows = [r for r in stmt.split(") values", 1)[1].splitlines() if r.strip().startswith("(")]
assert rows, "no cell_dependencies rows emitted"
enables = [r for r in rows if "'enables'" in r]
leads_to = [r for r in rows if "'leads_to'" in r]
assert len(enables) == 1, f"expected the fixture's one enables edge, got {len(enables)}"
assert leads_to, "an edge that states no kind must still be emitted as 'leads_to'"
assert len(enables) + len(leads_to) == len(rows), "an edge row carries neither kind"
PY
pass "seed-dependency-kind (an IR-authored enables edge reaches cell_dependencies as kind='enables')"

# The kind is part of the edge's IDENTITY, because the database's uniqueness
# key is (source, target, kind). One pair carrying both kinds is two rows, and
# two rows need two ids — the failure this guards is a UUIDv5 collision that
# would silently make the second edge overwrite the first.
python3 - "$REPO_ROOT" "$SAMPLE" <<'PY' || fail "seed-dependency-identity: kind is not in the identity"
import copy, json, pathlib, sys
repo, sample = sys.argv[1], sys.argv[2]
sys.path.insert(0, str(pathlib.Path(repo) / "scripts"))
import generate_seed_sql, validate_ir

doc = json.load(open(sample, encoding="utf-8"))
first_path = doc["service"]["phases"][0]["scenarios"][0]["paths"][0]
arrow = next(e for e in first_path["dependencies"] if e.get("kind", "leads_to") == "leads_to")

both = copy.deepcopy(doc)
both["service"]["phases"][0]["scenarios"][0]["paths"][0]["dependencies"].append(
    {"source": arrow["source"], "target": arrow["target"], "kind": "enables"}
)
report = validate_ir.Report("both-kinds")
validate_ir.validate_document(both, report)
assert not report.errors, f"one pair with both kinds must validate: {report.errors}"

model = generate_seed_sql.build_model(both, "en")
edges = [e for p in model["scenarios"][0]["paths"] for e in p["dependencies"]]
pair = [
    e for e in edges
    if (e["source_cell_id"], e["target_cell_id"])
    == (edges[0]["source_cell_id"], edges[0]["target_cell_id"])
]
assert len(pair) == 2, f"the crafted pair produced {len(pair)} edges, expected 2"
assert pair[0]["id"] != pair[1]["id"], "the two kinds collided on one UUIDv5 id"
assert {e["kind"] for e in pair} == {"leads_to", "enables"}, "kind lost between IR and model"

# A genuine duplicate — same pair, SAME kind — is still a duplicate.
dup = copy.deepcopy(both)
dup["service"]["phases"][0]["scenarios"][0]["paths"][0]["dependencies"].append(
    {"source": arrow["source"], "target": arrow["target"]}
)
report = validate_ir.Report("dup")
validate_ir.validate_document(dup, report)
assert any("duplicate leads_to edge" in e for e in report.errors), report.errors

# An unknown kind is refused, naming both legal values.
bad = copy.deepcopy(doc)
bad["service"]["phases"][0]["scenarios"][0]["paths"][0]["dependencies"][0]["kind"] = "causes"
report = validate_ir.Report("bad-kind")
validate_ir.validate_document(bad, report)
assert any("'causes' is not one of ['leads_to', 'enables']" in e for e in report.errors), report.errors
PY
pass "seed-dependency-identity (both kinds on one pair are two ids; duplicates and unknown kinds still fail)"

# --verify: cell_key checks fail loudly; derived rows are reported, never failed.
python3 - "$TMP/seed.en.verify.sql" <<'PY' || fail "verify-derived-report: verify script coverage broken"
import sys
verify = open(sys.argv[1], encoding="utf-8").read()
assert "cell_key" in verify, "verify has no cell_key checks"
assert "missing the authored cell_key prefix" in verify, "verify missing cell_key prefix check"
assert "cell_key mismatch" in verify, "verify missing cell_key spot-check"
# The four tables that are about the board, plus business_models: present,
# guarded, and notice-only.
for table in ("slides", "audit_findings", "evidence", "slices", "business_models"):
    assert f"to_regclass('public.{table}')" in verify, f"derived report missing {table}"
derived = verify.split("to_regclass", 1)[1]
assert "raise notice" in derived, "derived section must report via notice"
assert "raise exception" not in derived, "derived rows must never fail verification"
PY
pass "verify-derived-report (cell_key verified; derived rows reported, not failed)"

# ---------------------------------------------------------------------------
# 4c. The service's per-kind examples reach the seed, per locale
# ---------------------------------------------------------------------------
#
# `services.entity_examples` was writable from the editor and invisible to this
# pipeline: the IR did not model it and the generator did not emit it. These
# are the claims a file can make without a database — that the column is in the
# insert, that the authored text is the LOCALE's, and that the conflict clause
# still guards the empty map. What that guard is FOR is a database question,
# and scripts/tests/entity-examples-round-trip.test.sh answers it by loading a
# seed and reading the row back.

python3 - "$SAMPLE" "$TMP/seed.en.sql" "$TMP/seed.zh.sql" <<'PY' \
  || fail "seed-entity-examples: an authored example did not reach the seed"
import json, re, sys

sample, en_path, zh_path = sys.argv[1:4]
authored = json.load(open(sample, encoding="utf-8"))["service"]["entity_examples"]
assert authored, "the fixture authors no examples; this test would prove nothing"

for locale, path in (("en", en_path), ("zh", zh_path)):
    sql = open(path, encoding="utf-8").read()
    insert = re.search(
        r"insert into public\.services \((?P<columns>[^)]*)\) values\n(?P<row>.*?)\non conflict",
        sql,
        re.S,
    )
    assert insert, f"{path}: the service insert is not where this test looks"
    columns = [c.strip() for c in insert.group("columns").split(",")]
    assert "entity_examples" in columns, f"{path}: the service insert drops entity_examples"

    row = insert.group("row")
    for kind, locale_map in authored.items():
        text = locale_map[locale]
        assert text in row, f"{path}: the {locale} example for {kind!r} is not in the service row"
        # The seed is per-locale, so the OTHER locale's wording must not ride
        # along — a jsonb literal carrying the whole map would pass a bare
        # substring check and put Chinese in an English target.
        other = locale_map["zh" if locale == "en" else "en"]
        assert other not in row, f"{path}: the service row carries the other locale's {kind!r} example"

# The clause the round-trip test proves the behaviour of. Asserted here as TEXT
# so a rewrite that quietly drops the guard is caught on a machine with no
# database — which is the mode its absence is invisible in.
body = "\n".join(
    line for line in open(en_path, encoding="utf-8").read().splitlines()
    if not line.lstrip().startswith("--")
)
clause = body[body.index("insert into public.services"):body.index("insert into public.phases")]
assert "entity_examples = case" in clause, "the conflict clause overwrites examples unconditionally"
assert "'{}'::jsonb then services.entity_examples" in clause, (
    "the conflict clause no longer reads an empty map as silence"
)
PY
pass "seed-entity-examples (the authored example is in the row, in the seed's own locale)"

# A service block that says nothing about examples generates the empty map the
# clause above reads as silence. That input is the one the guard exists for, so
# it has to be generable.
python3 - "$REPO_ROOT" "$SAMPLE" <<'PY' || fail "seed-entity-examples-absent: an absent map did not generate {}"
import copy, json, sys

repo, sample = sys.argv[1:3]
sys.path.insert(0, f"{repo}/scripts")
from generate_seed_sql import build_model, emit_seed_sql

doc = json.load(open(sample, encoding="utf-8"))
silent = copy.deepcopy(doc)
silent["service"].pop("entity_examples")

assert build_model(silent, "en")["service"]["entity_examples"] == {}, (
    "a service block with no examples did not model an empty map"
)
sql = emit_seed_sql(build_model(silent, "en"), "silent.json")
row = sql.split("insert into public.services", 1)[1].split("on conflict", 1)[0]
assert "'{}'::jsonb" in row, f"an absent map emitted something other than an empty one: {row!r}"
PY
pass "seed-entity-examples-absent (a service block with no examples emits the empty map — silence, not a clear)"

# ---------------------------------------------------------------------------
# 5. Fallback TS module: generate, type-check, determinism, --register,
#    and the standalone pair a deployment generates for its own tree
# ---------------------------------------------------------------------------

cd "$REPO_ROOT"

python3 "$FALLBACK_GEN" "$SAMPLE" --locale en --out "$GENERATED_TS" > /dev/null \
  || fail "fallback-generate: generation failed"
python3 "$FALLBACK_GEN" "$SAMPLE" --locale en --out "$TMP/generated.2.ts" > /dev/null
diff -q "$GENERATED_TS" "$TMP/generated.2.ts" > /dev/null \
  || fail "fallback-deterministic: two runs differ"
pass "fallback-deterministic (identical output across runs)"

python3 - "$GENERATED_TS" "$TMP/seed.en.sql" <<'PY'
import re, sys
ts = open(sys.argv[1], encoding="utf-8").read()
sql = open(sys.argv[2], encoding="utf-8").read()
assert "现场技术员" in ts, "generated TS missing CJK content"
uuid_re = re.compile(r"[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}")
ts_ids, sql_ids = set(uuid_re.findall(ts)), set(uuid_re.findall(sql))
missing = ts_ids - sql_ids
assert not missing, f"adapter parity broken — TS ids missing from seed SQL: {sorted(missing)[:3]}"
PY
pass "fallback-parity (same UUIDv5 ids as the en seed SQL — adapter parity)"

# The other half of the round trip. Export losing the kind was the bug; an
# adapter that serves the edge without it is the same bug wearing a different
# hat, so the no-DB module has to carry both kinds too.
python3 - "$GENERATED_TS" <<'PY' || fail "fallback-dependency-kind: kind missing from the no-DB adapter"
import json, re, sys
ts = open(sys.argv[1], encoding="utf-8").read()
block = ts.split("GENERATED_PATH_FALLBACKS_BY_SCENARIO: Record<string, BlueprintData[]> =", 1)[1]
data = json.loads(block.strip())
edges = [e for paths in data.values() for path in paths for e in path["dependencies"]]
kinds = [e.get("kind") for e in edges]
assert edges, "the no-DB adapter served no edges at all"
assert kinds.count("enables") == 1, f"expected the fixture's one enables edge, got {kinds.count('enables')}"
assert kinds.count("leads_to") == len(edges) - 1, "an edge reached the module without a kind"
PY
pass "fallback-dependency-kind (the no-DB adapter serves the enables edge as enables)"

npx tsc -p tsconfig.app.json > "$TMP/tsc1.out" 2>&1 \
  || fail "fallback-tsc: type-check failed with generated module present — $(tail -20 "$TMP/tsc1.out")"
pass "fallback-tsc (generated module is tsc-clean, CJK strings escaped safely)"

python3 "$FALLBACK_GEN" "$SAMPLE" --locale en --out "$GENERATED_TS" --register > /dev/null \
  || fail "fallback-register: --register failed"
grep -q "from '@/data/generatedBlueprints'" "$REGISTRY" \
  || fail "fallback-register: registry does not import the generated module"
grep -q "GENERATED-BLUEPRINT-REGISTRY:BEGIN" "$REGISTRY" \
  || fail "fallback-register: BEGIN marker lost"
grep -q "GENERATED-BLUEPRINT-REGISTRY:END" "$REGISTRY" \
  || fail "fallback-register: END marker lost"
npx tsc -p tsconfig.app.json > "$TMP/tsc2.out" 2>&1 \
  || fail "fallback-register-tsc: type-check failed after --register — $(tail -20 "$TMP/tsc2.out")"
pass "fallback-register (marker block rewritten; app type-checks against generated registry)"

# --register also regenerates the offline nav (SAMPLE_NAV) from the IR service.
grep -q "GENERATED-NAV:BEGIN" "$NAV" || fail "nav-register: NAV BEGIN marker lost"
grep -q "GENERATED-NAV:END" "$NAV" || fail "nav-register: NAV END marker lost"
# Generated form drops the sample-only import + phase-id consts. Grep the
# import specifier, not the symbol: the symbol moved out of nav.ts long ago,
# which made this check vacuous.
grep -q "@/data/sampleBlueprint" "$NAV" && fail "nav-register: sample import survived regeneration"
# Nav references the IR's scenario UUIDs (adapter parity with the generated module).
python3 - "$NAV" "$GENERATED_TS" <<'PY'
import re, sys
nav = open(sys.argv[1], encoding="utf-8").read()
mod = open(sys.argv[2], encoding="utf-8").read()
uuid_re = re.compile(r"[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}")
block = nav.split("GENERATED-NAV:BEGIN", 1)[1].split("GENERATED-NAV:END", 1)[0]
nav_ids = set(uuid_re.findall(block))
assert nav_ids, "regenerated SAMPLE_NAV has no UUIDs"
scenario_ids = set(uuid_re.findall(mod))
# phase ids won't appear in the blueprint module; require at least the scenarios present.
assert nav_ids & scenario_ids, f"nav shares no ids with the generated module: {sorted(nav_ids)[:3]}"
PY
pass "nav-register (SAMPLE_NAV regenerated from the IR service; markers kept)"

# Idempotent re-register (registry + nav).
python3 "$FALLBACK_GEN" "$SAMPLE" --locale en --out "$GENERATED_TS" --register > /dev/null
cp "$REGISTRY" "$TMP/registry.after2.ts"
cp "$NAV" "$TMP/nav.after2.ts"
python3 "$FALLBACK_GEN" "$SAMPLE" --locale en --out "$GENERATED_TS" --register > /dev/null
diff -q "$REGISTRY" "$TMP/registry.after2.ts" > /dev/null \
  || fail "fallback-reregister: re-running --register changed the registry"
diff -q "$NAV" "$TMP/nav.after2.ts" > /dev/null \
  || fail "nav-reregister: re-running --register changed nav.ts"
pass "fallback-reregister (re-registration is a no-op — idempotent, registry + nav)"

if python3 "$FALLBACK_GEN" "$TMP/bad1.json" --locale en --out "$TMP/generated.bad.ts" > /dev/null 2>&1; then
  fail "fallback-invalid-ir: expected refusal"
fi
[ ! -f "$TMP/generated.bad.ts" ] || fail "fallback-invalid-ir: output written despite invalid IR"
pass "fallback-invalid-ir (invalid IR generates nothing)"

# The same pass for a DEPLOYMENT: no marker block to rewrite, both halves
# written whole, and every type named by package name because the tree that
# holds them has no `src` for '@/…' to find.
DEP="$TMP/deployment/data"
mkdir -p "$DEP"
python3 "$FALLBACK_GEN" "$SAMPLE" --locale en --out "$DEP/generatedBlueprints.ts" \
  --registry-out "$DEP/sampleBlueprints.ts" --nav-out "$DEP/sampleNav.ts" > /dev/null \
  || fail "deployment-pair: generation failed"
grep -q "^import type { SampleBlueprintRegistry } from 'uno-blueprint'$" \
  "$DEP/sampleBlueprints.ts" \
  || fail "deployment-pair: the registry does not name its type by package name"
grep -q "^import { GENERATED_PATH_FALLBACKS_BY_SCENARIO } from './generatedBlueprints'$" \
  "$DEP/sampleBlueprints.ts" \
  || fail "deployment-pair: the registry does not read the generated module beside it"
grep -q "export const SAMPLE_BLUEPRINTS: SampleBlueprintRegistry" "$DEP/sampleBlueprints.ts" \
  || fail "deployment-pair: no SAMPLE_BLUEPRINTS export"
grep -q "^import type { NavItem } from 'uno-blueprint'$" "$DEP/sampleNav.ts" \
  || fail "deployment-pair: the nav does not name NavItem by package name"
grep -q "export const SAMPLE_NAV: NavItem\[\]" "$DEP/sampleNav.ts" \
  || fail "deployment-pair: no SAMPLE_NAV export"
grep -q "^import type { BlueprintData } from 'uno-blueprint'$" \
  "$DEP/generatedBlueprints.ts" \
  || fail "deployment-pair: the generated module still imports BlueprintData through '@/'"
if grep -q "from '@/" "$DEP/sampleBlueprints.ts" "$DEP/sampleNav.ts" "$DEP/generatedBlueprints.ts"; then
  fail "deployment-pair: an '@/…' import survived into a deployment's own module"
fi
pass "deployment-pair (three standalone modules, every type named by package name)"

# The pair is one board: either flag alone is refused, and nothing is written.
if python3 "$FALLBACK_GEN" "$SAMPLE" --locale en --out "$TMP/half.ts" \
  --registry-out "$TMP/half-registry.ts" > /dev/null 2>&1; then
  fail "deployment-half: --registry-out without --nav-out was accepted"
fi
[ ! -f "$TMP/half.ts" ] || fail "deployment-half: output written despite the refusal"
if python3 "$FALLBACK_GEN" "$SAMPLE" --locale en --out "$TMP/half2.ts" \
  --nav-out "$TMP/half-nav.ts" > /dev/null 2>&1; then
  fail "deployment-half: --nav-out without --registry-out was accepted"
fi
[ ! -f "$TMP/half2.ts" ] || fail "deployment-half: output written despite the refusal"
pass "deployment-half (one half of the board alone is refused, nothing written)"

# --register is the marker rewrite of THIS tree; the pair writes another's.
if python3 "$FALLBACK_GEN" "$SAMPLE" --locale en --out "$TMP/both.ts" --register \
  --registry-out "$TMP/both-registry.ts" --nav-out "$TMP/both-nav.ts" > /dev/null 2>&1; then
  fail "deployment-and-register: the two trees were generated for at once"
fi
[ ! -f "$TMP/both.ts" ] || fail "deployment-and-register: output written despite the refusal"
pass "deployment-and-register (the marker rewrite and a deployment's own modules are exclusive)"

# One payload, two homes: the standalone nav carries exactly the rows the
# marker block carries, so a change to either reaches both.
python3 - "$DEP/sampleNav.ts" "$NAV" <<'NAVPARITY' || fail "deployment-nav-parity: the two nav emitters disagree"
import sys

MARKER = "export const SAMPLE_NAV: NavItem[] = "


def rows(path):
    text = open(path, encoding="utf-8").read()
    assert MARKER in text, f"no SAMPLE_NAV in {path}"
    return text.split(MARKER, 1)[1].rsplit("]", 1)[0] + "]"


standalone, block = (rows(path) for path in sys.argv[1:3])
assert standalone == block, "the standalone nav and the marker block carry different rows"
NAVPARITY
pass "deployment-nav-parity (one nav payload behind both emitters)"

# A deployment must not grow a `src` — it captures every '@/…' the app imports.
if python3 "$FALLBACK_GEN" "$SAMPLE" --locale en \
  --registry-out "$TMP/s-registry.ts" --nav-out "$TMP/s-nav.ts" > /dev/null 2>&1; then
  fail "deployment-src-out: the default src/ output path was accepted"
fi
[ ! -f "$TMP/s-registry.ts" ] || fail "deployment-src-out: a module written despite the refusal"
if python3 "$FALLBACK_GEN" "$SAMPLE" --locale en --out "$TMP/dep-g.ts" \
  --registry-out "$TMP/src/r.ts" --nav-out "$TMP/dep-n.ts" > /dev/null 2>&1; then
  fail "deployment-src-out: --registry-out under src/ was accepted"
fi
if python3 "$FALLBACK_GEN" "$SAMPLE" --locale en --out "$TMP/dep-g.ts" \
  --registry-out "$TMP/dep-r.ts" --nav-out "$TMP/src/n.ts" > /dev/null 2>&1; then
  fail "deployment-src-out: --nav-out under src/ was accepted"
fi
[ ! -f "$TMP/dep-g.ts" ] || fail "deployment-src-out: a module written despite the refusal"
pass "deployment-src-out (any of the three outputs under src/ is refused, not only --out)"

# Restore the shipped registry + nav state and confirm they still type-check.
cp "$TMP/blueprintFallbacks.ts.bak" "$REGISTRY"
cp "$TMP/nav.ts.bak" "$NAV"
rm -f "$GENERATED_TS"
npx tsc -p tsconfig.app.json > "$TMP/tsc3.out" 2>&1 \
  || fail "restore-tsc: default registry no longer type-checks — $(tail -20 "$TMP/tsc3.out")"
pass "restore-tsc (default scale-fixture registry + nav restored and type-check)"

# ---------------------------------------------------------------------------
# 6. Per-scenario sign-off hash (friction #19)
# ---------------------------------------------------------------------------

SIGNOFF_GEN="$REPO_ROOT/scripts/compute_signoff_hash.py"

H1="$(python3 "$SIGNOFF_GEN" "$SAMPLE")"
H2="$(python3 "$SIGNOFF_GEN" "$SAMPLE")"
[ "$H1" = "$H2" ] || fail "signoff-deterministic: two runs differ"
echo "$H1" | grep -qE 'asset-repair[[:space:]]+sha256:[0-9a-f]{64}' \
  || fail "signoff-format: expected '<key>\\tsha256:<hex>'"
pass "signoff-deterministic (stable per-scenario hash; sha256 format)"

# Editing a scenario changes ITS hash (content sensitivity).
python3 - "$SAMPLE" "$SIGNOFF_GEN" <<'PY' || fail "signoff-sensitivity: edit did not change the hash"
import json, subprocess, sys, tempfile, os
ir, gen = sys.argv[1], sys.argv[2]
base = subprocess.run([sys.executable, gen, ir], capture_output=True, text=True).stdout
doc = json.load(open(ir, encoding="utf-8"))
sc = doc["service"]["phases"][0]["scenarios"][0]
name = sc["name"]
if isinstance(name, dict):
    k = next(iter(name)); name[k] = name[k] + " EDIT"
else:
    sc["name"] = name + " EDIT"
tmp = tempfile.NamedTemporaryFile("w", suffix=".json", delete=False, encoding="utf-8")
json.dump(doc, tmp, ensure_ascii=False); tmp.close()
after = subprocess.run([sys.executable, gen, tmp.name], capture_output=True, text=True).stdout
os.unlink(tmp.name)
sys.exit(0 if base != after else 1)
PY
pass "signoff-sensitivity (editing a scenario changes its content hash)"

# --scenario filter + missing-key error.
python3 "$SIGNOFF_GEN" "$SAMPLE" --scenario asset-repair --json | grep -q '"asset-repair"' \
  || fail "signoff-filter: --scenario --json did not emit the key"
if python3 "$SIGNOFF_GEN" "$SAMPLE" --scenario nope > /dev/null 2>&1; then
  fail "signoff-missing: expected non-zero exit for an unknown scenario key"
fi
pass "signoff-filter (--scenario selects one; unknown key errors)"

# ---------------------------------------------------------------------------
# Slice tools
# ---------------------------------------------------------------------------

SLICE_TOOLS="$REPO_ROOT/skills/slice/scripts/slice_tools.py"
SLICE_FILE="$TMP/slices.json"

# select -> validate -> sql -> doc round trip.
python3 "$SLICE_TOOLS" select --ir "$SAMPLE" --scenario operate/asset-repair \
  --kind journey --lane citizen --key citizen-repair --actor "Citizen" > "$SLICE_FILE" \
  || fail "slice-select: journey selection failed"
python3 "$SLICE_TOOLS" validate --ir "$SAMPLE" --slices "$SLICE_FILE" > /dev/null \
  || fail "slice-validate: generated skeleton did not validate"
pass "slice-select (journey skeleton validates)"

# The cell ids a slice emits MUST match the ids the seed generator writes —
# this is the whole contract between the derived layer and the blueprint.
python3 "$SEED_GEN" "$SAMPLE" --locale en --out "$TMP/seed-slice-check.sql" > /dev/null
python3 "$SLICE_TOOLS" sql --ir "$SAMPLE" --slices "$SLICE_FILE" --locale en \
  --service-id 11111111-1111-4111-8111-111111111111 > "$TMP/slice-en.sql" \
  || fail "slice-sql: emission failed"
python3 - "$TMP/slice-en.sql" "$TMP/seed-slice-check.sql" <<'PY' \
  || fail "slice-idmatch: a slice cell id is absent from the seed SQL"
import re, sys
slice_sql, seed_sql = (open(p, encoding="utf-8").read() for p in sys.argv[1:3])
ids = set(re.findall(r"array\[([^\]]*)\]::uuid\[\]", slice_sql))
cell_ids = {value.strip().strip("'") for group in ids for value in group.split(",") if value.strip()}
assert cell_ids, "no cell ids found in slice SQL"
missing = [cid for cid in cell_ids if cid not in seed_sql]
sys.exit(1 if missing else 0)
PY
pass "slice-idmatch (every slice cell id appears in the seed SQL)"

grep -q "^begin;" "$TMP/slice-en.sql" && grep -q "^commit;$" "$TMP/slice-en.sql" \
  || fail "slice-sql: missing transaction wrapper"
grep -q "delete from public.slices where id" "$TMP/slice-en.sql" \
  || fail "slice-sql: missing delete-then-insert replace"
pass "slice-sql (transactional replace)"

# Locales diverge (per-locale artifacts), keys do not.
python3 "$SLICE_TOOLS" sql --ir "$SAMPLE" --slices "$SLICE_FILE" --locale zh \
  --service-id 11111111-1111-4111-8111-111111111111 > "$TMP/slice-zh.sql"
if diff -q "$TMP/slice-en.sql" "$TMP/slice-zh.sql" > /dev/null; then
  fail "slice-locale: en and zh emitted identical SQL"
fi
pass "slice-locale (per-locale ids and text diverge)"

# Determinism: same inputs, same bytes.
python3 "$SLICE_TOOLS" sql --ir "$SAMPLE" --slices "$SLICE_FILE" --locale en \
  --service-id 11111111-1111-4111-8111-111111111111 > "$TMP/slice-en-2.sql"
diff -q "$TMP/slice-en.sql" "$TMP/slice-en-2.sql" > /dev/null \
  || fail "slice-determinism: two runs produced different SQL"
pass "slice-determinism (re-run is byte-identical)"

# Validation catches the three failures that would otherwise render as
# silently-wrong content rather than as errors.
python3 - "$SLICE_FILE" "$TMP/slice-bad.json" <<'PY'
import json, sys
doc = json.load(open(sys.argv[1], encoding="utf-8"))
entry = doc["slices"][0]
entry["slides"][0]["cells"].append(
    "streetlight-service/operate/asset-repair/as-designed/citizen/does-not-exist"
)
entry["slides"][-1]["cells"].append(entry["slides"][0]["cells"][0])
json.dump(doc, open(sys.argv[2], "w", encoding="utf-8"), ensure_ascii=False)
PY
if python3 "$SLICE_TOOLS" validate --ir "$SAMPLE" --slices "$TMP/slice-bad.json" > /dev/null 2>&1; then
  fail "slice-validate-bad: expected non-zero exit for unresolvable + duplicate cells"
fi
# Capture first: the validator exits non-zero by design, and `pipefail` would
# fail the pipeline even when grep matches.
python3 "$SLICE_TOOLS" validate --ir "$SAMPLE" --slices "$TMP/slice-bad.json" \
  > "$TMP/slice-bad.out" 2>&1 || true
grep -q "cell key not in IR" "$TMP/slice-bad.out" \
  || fail "slice-validate-bad: missing unresolvable-key message"
grep -q "appears twice" "$TMP/slice-bad.out" \
  || fail "slice-validate-bad: missing duplicate-cell message"
pass "slice-validate-bad (unresolvable key and duplicate cell both reported)"

# Emitters refuse an invalid slice file — no half-written import artifacts.
if python3 "$SLICE_TOOLS" sql --ir "$SAMPLE" --slices "$TMP/slice-bad.json" --locale en \
  --service-id 11111111-1111-4111-8111-111111111111 > /dev/null 2>&1; then
  fail "slice-sql-guard: emitted SQL for an invalid slice file"
fi
pass "slice-sql-guard (invalid slice file produces no SQL)"

# Journey selection is arrow-derived: a lane with no dependency edge to the
# actor must not appear in any slide.
python3 - "$SAMPLE" "$SLICE_FILE" <<'PY' || fail "slice-journey-arrows: uncited companion cell in a slide"
import json, sys
ir = json.load(open(sys.argv[1], encoding="utf-8"))
doc = json.load(open(sys.argv[2], encoding="utf-8"))
entry = doc["slices"][0]
scenario = ir["service"]["phases"][0]["scenarios"][0]
path = next(p for p in scenario["paths"] if p["key"] == entry["path"])
linked = set()
for edge in path.get("dependencies", []):
    for end in ("source", "target"):
        linked.add((edge[end]["lane"], edge[end]["step"]))
for slide in entry["slides"]:
    for key in slide["cells"][1:]:
        lane, step = key.split("/")[4:6]
        if (lane, step) not in linked:
            print(f"uncited companion: {key}", file=sys.stderr)
            sys.exit(1)
PY
pass "slice-journey-arrows (companions come from recorded dependencies only)"

# Step and lane selections stay inside their column / row.
python3 "$SLICE_TOOLS" select --ir "$SAMPLE" --scenario operate/asset-repair \
  --kind step --step dispatch --key dispatch-moment > "$TMP/slice-step.json"
python3 "$SLICE_TOOLS" validate --ir "$SAMPLE" --slices "$TMP/slice-step.json" > /dev/null \
  || fail "slice-step: step selection did not validate"
python3 - "$TMP/slice-step.json" <<'PY' || fail "slice-step: slide contains a foreign step"
import json, sys
doc = json.load(open(sys.argv[1], encoding="utf-8"))
for slide in doc["slices"][0]["slides"]:
    for key in slide["cells"]:
        if key.split("/")[5] != "dispatch":
            sys.exit(1)
PY
python3 "$SLICE_TOOLS" select --ir "$SAMPLE" --scenario operate/asset-repair \
  --kind lane --lane field-tech --key field-tech-lane > "$TMP/slice-lane.json"
python3 - "$TMP/slice-lane.json" <<'PY' || fail "slice-lane: slide contains a foreign lane"
import json, sys
doc = json.load(open(sys.argv[1], encoding="utf-8"))
for slide in doc["slices"][0]["slides"]:
    for key in slide["cells"]:
        if key.split("/")[4] != "field-tech":
            sys.exit(1)
PY
pass "slice-step/lane (selections stay inside their column and row)"

# Unknown scenario / missing required flag are errors, not empty output.
if python3 "$SLICE_TOOLS" select --ir "$SAMPLE" --scenario nope/nope --kind lane \
  --lane citizen --key x > /dev/null 2>&1; then
  fail "slice-select-guard: expected non-zero exit for an unknown scenario"
fi
if python3 "$SLICE_TOOLS" select --ir "$SAMPLE" --scenario operate/asset-repair \
  --kind lane --key x > /dev/null 2>&1; then
  fail "slice-select-guard: expected non-zero exit for a missing --lane"
fi
pass "slice-select-guard (unknown scenario and missing flag both error)"

# A file written against the retired document keys fails on the NAMES. There
# is no alias — nothing reads `type` or `frames` any more — so the only thing
# standing between an author and a bewildering "missing 'kind'" is the error
# saying which word replaced which.
python3 - "$SLICE_FILE" "$TMP/slice-retired.json" <<'RETIRED' || fail "slice-retired-keys: could not build the fixture"
import json, sys
doc = json.load(open(sys.argv[1]))
entry = doc["slices"][0]
entry["type"] = entry.pop("kind")
entry["frames"] = entry.pop("slides")
entry["origin"] = entry.pop("authorship", "generated")
json.dump(doc, open(sys.argv[2], "w"))
RETIRED
if python3 "$SLICE_TOOLS" validate --ir "$SAMPLE" --slices "$TMP/slice-retired.json" \
  > "$TMP/slice-retired.out" 2>&1; then
  fail "slice-retired-keys: expected non-zero exit for a file using the old keys"
fi
grep -q "'type' is now 'kind'" "$TMP/slice-retired.out" \
  || fail "slice-retired-keys: the error does not name what 'type' became"
grep -q "'frames' is now 'slides'" "$TMP/slice-retired.out" \
  || fail "slice-retired-keys: the error does not name what 'frames' became"
grep -q "'origin' is now 'authorship'" "$TMP/slice-retired.out" \
  || fail "slice-retired-keys: the error does not name what 'origin' became"
pass "slice-retired-keys (an old file fails on the names, and the names say the fix)"

# ---------------------------------------------------------------------------
# 7. Audit tools: fingerprint reason slug, intra-batch collision, ledger
#    backstop (audit-playbook §2/§3 reference implementation)
# ---------------------------------------------------------------------------

AUDIT_TOOLS="$REPO_ROOT/skills/audit/scripts/audit_tools.py"

# New fingerprint form: check ':' sha256(sorted cell_keys) ':' reason-slug —
# sorted, so cell order never changes identity.
FP="$(python3 "$AUDIT_TOOLS" fingerprint --check jargon-lint \
  --cell-keys b/cell a/cell --reason uco-acronym)" \
  || fail "audit-fingerprint-form: fingerprint failed"
DIGEST="$(printf 'a/cell\nb/cell' | python3 -c 'import hashlib,sys; print(hashlib.sha256(sys.stdin.buffer.read()).hexdigest())')"
[ "$FP" = "jargon-lint:$DIGEST:uco-acronym" ] \
  || fail "audit-fingerprint-form: expected 'jargon-lint:$DIGEST:uco-acronym', got '$FP'"
# A cell-bearing finding without a reason slug is an error, never an
# old-form (slugless) fingerprint.
if python3 "$AUDIT_TOOLS" fingerprint --check jargon-lint --cell-keys a/cell \
  > "$TMP/audit-noreason.out" 2>&1; then
  fail "audit-fingerprint-reason: expected non-zero exit without --reason"
fi
grep -q "reason slug" "$TMP/audit-noreason.out" \
  || fail "audit-fingerprint-reason: no reason-slug message"
# Zero-cell scope form is unchanged.
FP_SCOPE="$(python3 "$AUDIT_TOOLS" fingerprint --check gap-sweep \
  --scope sample-service:orphan-step)"
[ "$FP_SCOPE" = "gap-sweep:scope:sample-service:orphan-step" ] \
  || fail "audit-fingerprint-scope: got '$FP_SCOPE'"
pass "audit-fingerprint-form (reason slug in every fingerprint; slugless cell finding errors; scope form stable)"

# The live-observed collision: two findings from ONE check over the SAME
# cells. Distinct reason slugs -> two distinct fingerprints, two inserts.
cat > "$TMP/audit-incoming.json" <<'JSON'
[
 {"check_key": "jargon-lint", "severity": "warn", "impact": "medium", "effort": "low", "note": "UCO acronym",
  "cell_keys": ["x/1", "x/2", "x/3"], "reason": "uco-acronym", "source": "audit"},
 {"check_key": "jargon-lint", "severity": "info", "impact": "low", "effort": "low", "note": "perms wording",
  "cell_keys": ["x/1", "x/2", "x/3"], "reason": "perms-wording", "source": "audit"}
]
JSON
rm -f "$TMP/audit-ledger.json"
python3 "$AUDIT_TOOLS" dedupe --ledger "$TMP/audit-ledger.json" \
  --incoming "$TMP/audit-incoming.json" > "$TMP/audit-dedupe.out" \
  || fail "audit-same-cells: dedupe failed on distinct-reason findings"
[ "$(grep -c '^insert' "$TMP/audit-dedupe.out")" -eq 2 ] \
  || fail "audit-same-cells: expected two inserts — $(cat "$TMP/audit-dedupe.out")"
python3 "$AUDIT_TOOLS" report --ledger "$TMP/audit-ledger.json" \
  --incoming "$TMP/audit-incoming.json" --run-id run-1 --apply > /dev/null \
  || fail "audit-same-cells: report --apply failed"
python3 - "$TMP/audit-ledger.json" <<'PY' || fail "audit-same-cells: ledger did not keep both rows open"
import json, sys
rows = json.load(open(sys.argv[1], encoding="utf-8"))["rows"]
assert len(rows) == 2, f"expected 2 rows, got {len(rows)}"
assert all(r["status"] == "open" for r in rows), "both rows must be open"
assert len({r["fingerprint"] for r in rows}) == 2, "fingerprints must differ"
PY
pass "audit-same-cells (same check + same cells, distinct reasons -> two open rows, no collapse)"

# A duplicate fingerprint WITHIN one incoming batch is a reported error,
# not a second insert — for dedupe AND report, which must leave the ledger
# untouched.
cat > "$TMP/audit-dup.json" <<'JSON'
[
 {"check_key": "jargon-lint", "severity": "warn", "impact": "low", "effort": "low", "note": "first",
  "cell_keys": ["x/1"], "reason": "same-slug", "source": "audit"},
 {"check_key": "jargon-lint", "severity": "info", "impact": "low", "effort": "low", "note": "second",
  "cell_keys": ["x/1"], "reason": "same-slug", "source": "audit"}
]
JSON
if python3 "$AUDIT_TOOLS" dedupe --ledger "$TMP/audit-ledger.json" \
  --incoming "$TMP/audit-dup.json" > "$TMP/audit-dup.out" 2>&1; then
  fail "audit-batch-collision: dedupe accepted an intra-batch duplicate"
fi
grep -q "duplicate fingerprint within the incoming batch" "$TMP/audit-dup.out" \
  || fail "audit-batch-collision: no intra-batch message — $(cat "$TMP/audit-dup.out")"
cp "$TMP/audit-ledger.json" "$TMP/audit-ledger.before.json"
if python3 "$AUDIT_TOOLS" report --ledger "$TMP/audit-ledger.json" \
  --incoming "$TMP/audit-dup.json" --run-id run-2 --apply > /dev/null 2>&1; then
  fail "audit-batch-collision: report --apply accepted an intra-batch duplicate"
fi
diff -q "$TMP/audit-ledger.json" "$TMP/audit-ledger.before.json" > /dev/null \
  || fail "audit-batch-collision: report wrote the ledger despite the error"
pass "audit-batch-collision (intra-batch duplicate fingerprint = reported error; ledger untouched)"

# File-ledger backstop mirroring the DB partial unique index: report
# --apply refuses to write two open rows with one fingerprint.
cat > "$TMP/audit-corrupt-ledger.json" <<'JSON'
{"rows": [
 {"check_key": "jargon-lint", "severity": "warn", "note": "a",
  "cell_keys": ["x/1"], "reason": "same-slug", "source": "audit",
  "fingerprint": "jargon-lint:deadbeef:same-slug", "status": "open", "run_id": "old-1"},
 {"check_key": "jargon-lint", "severity": "info", "note": "b",
  "cell_keys": ["x/1"], "reason": "same-slug", "source": "audit",
  "fingerprint": "jargon-lint:deadbeef:same-slug", "status": "open", "run_id": "old-2"}
]}
JSON
cp "$TMP/audit-corrupt-ledger.json" "$TMP/audit-corrupt-ledger.before.json"
printf '[]' > "$TMP/audit-empty.json"
if python3 "$AUDIT_TOOLS" report --ledger "$TMP/audit-corrupt-ledger.json" \
  --incoming "$TMP/audit-empty.json" --run-id run-3 --apply > "$TMP/audit-backstop.out" 2>&1; then
  fail "audit-ledger-backstop: expected refusal on duplicate open fingerprints"
fi
grep -q "duplicate open fingerprints" "$TMP/audit-backstop.out" \
  || fail "audit-ledger-backstop: no backstop message — $(cat "$TMP/audit-backstop.out")"
diff -q "$TMP/audit-corrupt-ledger.json" "$TMP/audit-corrupt-ledger.before.json" > /dev/null \
  || fail "audit-ledger-backstop: refused write still mutated the ledger"
pass "audit-ledger-backstop (two open rows with one fingerprint refuse to be written)"

# Migration: an old-form (slugless) open row stays a valid row and is left
# alone — dedupe compares exact strings, so new-form incoming inserts
# alongside it rather than colliding.
cat > "$TMP/audit-old-ledger.json" <<'JSON'
{"rows": [
 {"check_key": "jargon-lint", "severity": "warn", "note": "old form",
  "cell_keys": ["x/1", "x/2", "x/3"], "source": "audit",
  "fingerprint": "jargon-lint:0123456789abcdef", "status": "open", "run_id": "old-1"}
]}
JSON
python3 "$AUDIT_TOOLS" report --ledger "$TMP/audit-old-ledger.json" \
  --incoming "$TMP/audit-incoming.json" --run-id run-4 --apply > /dev/null \
  || fail "audit-migration: apply over an old-form ledger failed"
python3 - "$TMP/audit-old-ledger.json" <<'PY' || fail "audit-migration: old-form row lost or matched"
import json, sys
rows = json.load(open(sys.argv[1], encoding="utf-8"))["rows"]
assert len(rows) == 3, f"expected old row + 2 inserts, got {len(rows)}"
assert any(r["fingerprint"] == "jargon-lint:0123456789abcdef" for r in rows), "old-form row must survive"
PY
pass "audit-migration (old-form fingerprints stay valid rows; new writes use the new form)"

# export --scenario builds a filtered copy — the loaded IR must not lose
# scenarios (regression: the filter used to mutate the dict in place).
python3 - "$SAMPLE" "$REPO_ROOT" "$TMP" > /dev/null <<'PY' || fail "audit-export-copy: export filter mutated the loaded IR"
import argparse, copy, importlib.util, json, sys
sample, repo, tmp = sys.argv[1:4]
spec = importlib.util.spec_from_file_location(
    "audit_tools", f"{repo}/skills/audit/scripts/audit_tools.py")
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)

# Hand cmd_export a shared, already-loaded dict: the scenario filter must
# work on a copy, leaving the caller's dict byte-identical.
shared = json.load(open(sample, encoding="utf-8"))
snapshot = copy.deepcopy(shared)
mod.load_ir = lambda path: shared
args = argparse.Namespace(ir=sample, scenario="asset-repair", out=f"{tmp}/audit-export.json")
assert mod.cmd_export(args) == 0, "scoped export failed"
assert shared == snapshot, "cmd_export --scenario mutated the loaded IR in place"
export = json.load(open(f"{tmp}/audit-export.json", encoding="utf-8"))
scoped = [s["key"] for p in export["service"]["phases"] for s in p["scenarios"]]
assert scoped == ["asset-repair"], f"scoped export wrong: {scoped}"
PY
pass "audit-export-copy (scenario filter copies; loaded IR and source stay intact)"

# Impact and effort: every incoming finding carries both, beside severity,
# and a finding missing any of the three — or carrying a value outside its
# set — fails the batch the way a malformed auditor output does. Ledger rows
# written before the ratings existed are NOT incoming and stay valid.
for missing in impact effort severity; do
  python3 - "$TMP/audit-missing-$missing.json" "$missing" <<'PY'
import json, sys
finding = {"check_key": "gap-sweep", "severity": "warn", "impact": "high",
           "effort": "low", "note": "n", "cell_keys": ["x/1"], "reason": "r",
           "source": "audit"}
del finding[sys.argv[2]]
json.dump([finding], open(sys.argv[1], "w", encoding="utf-8"))
PY
  if python3 "$AUDIT_TOOLS" dedupe --ledger "$TMP/audit-ledger.json" \
    --incoming "$TMP/audit-missing-$missing.json" > "$TMP/audit-missing.out" 2>&1; then
    fail "audit-ratings-required: dedupe accepted a finding with no $missing"
  fi
  grep -q "$missing" "$TMP/audit-missing.out" \
    || fail "audit-ratings-required: refusal does not name $missing — $(cat "$TMP/audit-missing.out")"
done
cat > "$TMP/audit-bad-rating.json" <<'JSON'
[{"check_key": "gap-sweep", "severity": "warn", "impact": "huge", "effort": "low",
  "note": "n", "cell_keys": ["x/1"], "reason": "r", "source": "audit"}]
JSON
cp "$TMP/audit-ledger.json" "$TMP/audit-ledger.before.json"
if python3 "$AUDIT_TOOLS" report --ledger "$TMP/audit-ledger.json" \
  --incoming "$TMP/audit-bad-rating.json" --run-id run-5 --apply > "$TMP/audit-bad.out" 2>&1; then
  fail "audit-ratings-required: report --apply accepted impact 'huge'"
fi
grep -q "low, medium or high" "$TMP/audit-bad.out" \
  || fail "audit-ratings-required: no value-set message — $(cat "$TMP/audit-bad.out")"
diff -q "$TMP/audit-ledger.json" "$TMP/audit-ledger.before.json" > /dev/null \
  || fail "audit-ratings-required: a refused batch still wrote the ledger"
python3 "$AUDIT_TOOLS" validate "$TMP/audit-incoming.json" > /dev/null \
  || fail "audit-ratings-required: validate refused a well-formed batch"
if python3 "$AUDIT_TOOLS" validate "$TMP/audit-missing-effort.json" > /dev/null 2>&1; then
  fail "audit-ratings-required: validate accepted a finding with no effort"
fi
pass "audit-ratings-required (impact, effort and severity each required and closed; refused batch writes nothing)"

# A rating change alone is the same finding: the open row is updated in
# place, never duplicated, and an unchanged re-run inserts nothing.
FP_RATED="$(python3 "$AUDIT_TOOLS" fingerprint --check gap-sweep --cell-keys x/1 --reason silent-stretch)"
cat > "$TMP/audit-rated-ledger.json" <<JSON
{"rows": [
 {"check_key": "gap-sweep", "severity": "warn", "impact": "medium", "effort": "high",
  "summary": "a gap", "cell_keys": ["x/1"], "reason": "silent-stretch", "source": "audit",
  "fingerprint": "$FP_RATED", "status": "open", "run_id": "old-1"}
]}
JSON
cat > "$TMP/audit-rerated.json" <<'JSON'
[{"check_key": "gap-sweep", "severity": "warn", "impact": "high", "effort": "low",
  "summary": "a gap", "cell_keys": ["x/1"], "reason": "silent-stretch", "source": "audit"}]
JSON
python3 "$AUDIT_TOOLS" report --ledger "$TMP/audit-rated-ledger.json" \
  --incoming "$TMP/audit-rerated.json" --run-id run-6 --apply > "$TMP/audit-rerate.out" \
  || fail "audit-rating-update: report --apply failed"
grep -q '"insert": 0' "$TMP/audit-rerate.out" \
  || fail "audit-rating-update: a rating change inserted a row — $(cat "$TMP/audit-rerate.out")"
python3 "$AUDIT_TOOLS" report --ledger "$TMP/audit-rated-ledger.json" \
  --incoming "$TMP/audit-rerated.json" --run-id run-7 --apply > "$TMP/audit-rerun.out" \
  || fail "audit-rating-update: unchanged re-run failed"
grep -q '"insert": 0' "$TMP/audit-rerun.out" \
  || fail "audit-rating-update: an unchanged re-run inserted a row — $(cat "$TMP/audit-rerun.out")"
python3 - "$TMP/audit-rated-ledger.json" <<'PY' || fail "audit-rating-update: ledger not updated in place"
import json, sys
rows = json.load(open(sys.argv[1], encoding="utf-8"))["rows"]
assert len(rows) == 1, f"expected the one row, got {len(rows)}"
assert rows[0]["impact"] == "high" and rows[0]["effort"] == "low", rows[0]
assert rows[0]["status"] == "open" and rows[0]["run_id"] == "run-7", rows[0]
PY
pass "audit-rating-update (a re-rating updates the open row; an unchanged re-run inserts nothing)"

# The report's order: Do first (high impact, low effort), Plan (high impact,
# more effort), Quick wins (lesser impact, low effort), Later (the rest, with
# every unrated row last of all). Within a group: impact desc, effort asc,
# severity desc.
python3 - "$REPO_ROOT" <<'PY' || fail "audit-rank-order: priority order wrong"
import importlib.util, sys
spec = importlib.util.spec_from_file_location(
    "audit_tools", f"{sys.argv[1]}/skills/audit/scripts/audit_tools.py")
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)

def f(name, impact, effort, severity="warn"):
    return {"check_key": "c", "summary": name, "impact": impact, "effort": effort,
            "severity": severity}

rows = [
    f("unrated", None, None, "critical"),
    f("later-low-high", "low", "high"),
    f("later-medium-medium", "medium", "medium"),
    f("quick-low", "low", "low", "critical"),
    f("quick-medium", "medium", "low", "info"),
    f("plan-high-high", "high", "high", "critical"),
    f("plan-high-medium", "high", "medium"),
    f("do-info", "high", "low", "info"),
    f("do-critical", "high", "low", "critical"),
]
groups = mod.rank(rows)
assert [g for g, _ in groups] == ["Do first", "Plan", "Quick wins", "Later"], groups
got = {g: [r["summary"] for r in members] for g, members in groups}
assert got["Do first"] == ["do-critical", "do-info"], got
assert got["Plan"] == ["plan-high-medium", "plan-high-high"], got
assert got["Quick wins"] == ["quick-medium", "quick-low"], got
assert got["Later"] == ["later-medium-medium", "later-low-high", "unrated"], got
assert mod.rating_label(rows[0]) == "unrated", mod.rating_label(rows[0])
PY
python3 "$AUDIT_TOOLS" rank --ledger "$TMP/audit-old-ledger.json" > "$TMP/audit-rank.out" \
  || fail "audit-rank-print: rank failed"
python3 - "$TMP/audit-rank.out" <<'PY' || fail "audit-rank-print: printed report wrong — $(cat "$TMP/audit-rank.out")"
import sys
text = open(sys.argv[1], encoding="utf-8").read()
order = [text.index(h) for h in ("Do first", "Plan", "Quick wins", "Later", "Per check")]
assert order == sorted(order), order
assert "unrated" in text, "the old-form row must print as unrated"
assert "jargon-lint: 3" in text, "per-check counts must print"
PY
pass "audit-rank-order (Do first, Plan, Quick wins, Later; impact desc, effort asc, severity desc; unrated last; per-check counts print)"

# --- adapter parity ---------------------------------------------------------
# The adapter contract calls the no-DB adapter "not a degraded mode". These two
# cases are the difference between that being a claim and being a fact: the
# sample IR must come out of both adapters carrying the same fields, AND the
# check must be able to fail — a parity check that cannot go red is a comment.

python3 "$REPO_ROOT/scripts/adapter_parity.py" "$SAMPLE" > /dev/null \
  || fail "adapter-parity: the two v1 adapters disagree on the sample IR"
pass "adapter-parity (SQL and no-DB adapters carry the same fields)"

python3 - "$SAMPLE" "$REPO_ROOT" <<'PY' || fail "adapter-parity: drift went undetected"
import pathlib, sys
sample, repo = sys.argv[1:3]
sys.path.insert(0, f"{repo}/scripts")
import adapter_parity, generate_seed_sql

# Teach the SQL adapter a column the no-DB adapter never learns — exactly the
# drift that lost cell_key and the cell spec fields — and require a complaint.
original = generate_seed_sql.seed_cell_fields
def wider(cell, path):
    row = original(cell, path)
    row["status"] = "draft"
    return row
generate_seed_sql.seed_cell_fields = adapter_parity.seed_cell_fields = wider

problems = adapter_parity.check(pathlib.Path(sample), None)
assert problems, "a field on one adapter and not the other must be reported"
assert any("status" in line for line in problems), f"wrong complaint: {problems[:1]}"
PY
pass "adapter-parity-negative (a field on one adapter only is reported)"

python3 - "$SAMPLE" "$REPO_ROOT" <<'PY' || fail "adapter-parity: a lane-only field went undetected"
import pathlib, sys
sample, repo = sys.argv[1:3]
sys.path.insert(0, f"{repo}/scripts")
import adapter_parity, generate_fallbacks

# The state this check shipped in, before review caught it: lanes projected by
# hand, without kpis/tools, while the SQL adapter wrote both. The harness
# compared cells and edges only and reported agreement.
original = generate_fallbacks.blueprint_data_for_path
def without_lane_spec(scenario, path):
    data = original(scenario, path)
    data["lanes"] = [
        {k: v for k, v in lane.items() if k not in ("kpis", "tools")}
        for lane in data["lanes"]
    ]
    return data
generate_fallbacks.blueprint_data_for_path = without_lane_spec
adapter_parity.blueprint_data_for_path = without_lane_spec

problems = adapter_parity.check(pathlib.Path(sample), None)
assert problems, "a lane field on one adapter only must be reported"
assert any("kpis" in line for line in problems), f"wrong complaint: {problems[:1]}"
assert any(line.startswith(f"{sample} [en]: lane ") for line in problems), \
    "the complaint must name the aggregate that drifted"
PY
pass "adapter-parity-lanes (a lane field on one adapter only is reported)"

# ---------------------------------------------------------------------------
# 8. Schema-version migration: an old IR is refused by name and carried
#    forward, and sign-off survives the bump (#61)
# ---------------------------------------------------------------------------

# The version enum still lists 2026.07.16, so "is it in the enum" cannot be the
# whole check: an IR at a superseded version has the OLD field names, and
# validating its body would report every renamed field as an unknown key. One
# error, naming the command that fixes it.
if python3 "$VALIDATE" "$SAMPLE_OLD" > "$TMP/old-version.out" 2>&1; then
  fail "migrate-refusal: expected non-zero exit on a superseded schema_version"
fi
grep -q "migrate_ir.py" "$TMP/old-version.out" \
  || fail "migrate-refusal: message must name the upgrade command — got: $(cat "$TMP/old-version.out")"
[ "$(grep -c '^ERROR' "$TMP/old-version.out")" = 1 ] \
  || fail "migrate-refusal: renamed fields leaked into the report — $(cat "$TMP/old-version.out")"
pass "migrate-refusal (superseded version: one error, naming the upgrade)"

# Migrating the oldest fixture must chain through every step and land on the
# current fixture — the files are the same blueprint on either side of the
# bumps, apart from the one edge no version before 2026.08.26 could express.
cp "$SAMPLE_OLD" "$TMP/migrate-me.json"
python3 "$MIGRATE" "$TMP/migrate-me.json" --write > "$TMP/migrate.out" 2>&1 \
  || fail "migrate-forward: migration failed — $(cat "$TMP/migrate.out")"
python3 "$VALIDATE" "$TMP/migrate-me.json" > "$TMP/migrated-valid.out" 2>&1 \
  || fail "migrate-forward: migrated IR does not validate — $(cat "$TMP/migrated-valid.out")"
grep -q "2026.07.16 -> 2026.08.25" "$TMP/migrate.out" \
  || fail "migrate-forward: the chain skipped the lane-vocabulary step — $(cat "$TMP/migrate.out")"
grep -q "2026.08.25 -> 2026.08.26" "$TMP/migrate.out" \
  || fail "migrate-forward: the chain skipped the dependency-kind step — $(cat "$TMP/migrate.out")"
grep -q "2026.08.26 -> 2026.08.27" "$TMP/migrate.out" \
  || fail "migrate-forward: the chain skipped the business-model step — $(cat "$TMP/migrate.out")"
grep -q "2026.08.27 -> 2026.08.31" "$TMP/migrate.out" \
  || fail "migrate-forward: the chain skipped the links split — $(cat "$TMP/migrate.out")"
grep -q "2026.09.07 -> 2026.09.08" "$TMP/migrate.out" \
  || fail "migrate-forward: the chain skipped the lane-role step — $(cat "$TMP/migrate.out")"
grep -q "2026.09.08 -> 2026.09.09" "$TMP/migrate.out" \
  || fail "migrate-forward: the chain skipped the dependency rename — $(cat "$TMP/migrate.out")"
grep -q "2026.09.10 -> 2026.09.11" "$TMP/migrate.out" \
  || fail "migrate-forward: the chain skipped the entity-examples stamp — $(cat "$TMP/migrate.out")"
python3 - "$TMP/migrate-me.json" "$SAMPLE" <<'PYMIG'
import json, sys
migrated = json.load(open(sys.argv[1], encoding="utf-8"))
current = json.load(open(sys.argv[2], encoding="utf-8"))
# A migration carries content forward; it never invents any. The current
# fixture authors an `enables` edge, which no version before 2026.08.26 had a
# shape for, so what comes out of the chain is the current fixture without it
# — and with no `kind` written anywhere, because absence already means
# `leads_to` and materializing that would rewrite every signed scenario's hash.
expected = json.loads(json.dumps(current))
path = expected["service"]["phases"][0]["scenarios"][0]["paths"][0]
path["dependencies"] = [
    e for e in path["dependencies"] if e.get("kind", "leads_to") != "enables"
]
# Same reason, second shape: the current fixture authors `entity_examples`,
# which no version before 2026.09.11 could carry. to_2026_09_11 is a stamp, so
# what comes out of the chain is a service block that never had any — and
# writing an empty map would be inventing the "nobody authored these" the
# absent key already says, and would be the input the seed generator reads as
# silence.
del expected["service"]["entity_examples"]
assert migrated == expected, "migrated IR differs from the current fixture"
assert not [
    t
    for phase in migrated["service"]["phases"]
    for scenario in phase["scenarios"]
    for pa in scenario["paths"]
    for t in pa.get("dependencies", [])
    if "kind" in t
], "the migration wrote a defaulted kind into the tree"
# The links split, end to end. One array of two shapes became two arrays of
# one shape each, and every authored value came across under its new name —
# including `picture`, which folded into `screenshots` and then, at
# 2026.09.06, into an attachment on the placement.
cells = current["service"]["phases"][0]["scenarios"][0]["paths"][0]["cells"]
assert not any("links" in cell for cell in cells), "a `links` array survived the split"
resource = cells[0]["resources"][0]
assert set(resource) == {"name", "url"}, f"resource shape moved: {resource}"
touchpoint = next(t for cell in cells for t in cell.get("touchpoints", []))
assert "screenshots" not in touchpoint and "url" not in touchpoint, (
    "a placement still carries a URL column"
)
attachments = [r for r in touchpoint["resources"] if r.get("kind") == "attachment"]
assert [r["url"] for r in attachments] == ["https://example.test/assets/gis-portal.png"], (
    "picture did not become an attachment on the placement"
)
assert attachments[0].get("featured") is True, "the first attachment is not featured"
assert "summary" in touchpoint and "description" not in touchpoint, (
    "a touchpoint's description did not become its summary"
)
PYMIG
pass "migrate-forward (the oldest fixture chains through every step and validates)"

# ---------------------------------------------------------------------------
# 8b. A document written with `path.triggers` still loads
# ---------------------------------------------------------------------------
#
# The whole point of a wire-format rename being a schema bump. Consumers hold
# hand-signed-off IR authored against 2026.09.07, where a path's edge array was
# called `triggers`, and "re-author it" is not an available answer — so the
# refusal has to name the way forward and the way forward has to arrive at the
# current shape exactly.
#
# The fixture is built by running the 2026.09.09 step BACKWARDS over the
# current sample: the array goes back to `triggers` and the stamp back to
# 2026.09.07, so the document under test is the real predecessor rather than a
# hand-written approximation that could drift from it. `triggers` is written
# back in the MIDDLE of the path object, before `cells`, because the position is
# part of the contract: `migrate_ir.rename` keeps a renamed field among its
# siblings, so the diff a person reviews is the one line whose name changed
# rather than every line between it and the end of the file.
#
# Reverting one step and stamping two back is deliberate. 2026.09.07 ->
# 2026.09.08 renames a lane role carried by its retired spelling, and this
# sample carries none, so the sample is byte-identical at both versions and
# the stamp is the only thing that distinguishes them. The carry below
# therefore runs two hops and lands on the current fixture exactly. The lane
# roles that DO move get their own document in 8c.
python3 - "$SAMPLE" "$TMP" <<'PY' || fail "migrate-triggers-fixture: could not build the 2026.09.07 document"
import json, sys

sample, tmp = sys.argv[1], sys.argv[2]
doc = json.load(open(sample, encoding="utf-8"))
doc["schema_version"] = "2026.09.07"
seen = 0
for phase in doc["service"]["phases"]:
    for scenario in phase["scenarios"]:
        for path in scenario["paths"]:
            if "dependencies" not in path:
                continue
            edges = path.pop("dependencies")
            rebuilt = {}
            for key, value in path.items():
                if key == "cells":
                    rebuilt["triggers"] = edges
                rebuilt[key] = value
            path.clear()
            path.update(rebuilt)
            seen += 1
assert seen >= 2, f"the sample carries {seen} edge arrays; expected at least 2"
json.dump(doc, open(f"{tmp}/old-spelling.json", "w", encoding="utf-8"), ensure_ascii=False, indent=2)
PY

# The refusal comes first: a 2026.09.07 document is not a 2026.09.09 document,
# and the validator says so by name rather than by failing on an unknown key.
if python3 "$VALIDATE" "$TMP/old-spelling.json" > "$TMP/old-spelling.out" 2>&1; then
  fail "migrate-triggers-refusal: a document spelling the array triggers must not validate"
fi
grep -q "migrate_ir.py" "$TMP/old-spelling.out" \
  || fail "migrate-triggers-refusal: the message must name the upgrade — $(cat "$TMP/old-spelling.out")"
[ "$(grep -c '^ERROR' "$TMP/old-spelling.out")" = 1 ] \
  || fail "migrate-triggers-refusal: the stamp is the only complaint — $(cat "$TMP/old-spelling.out")"
if grep -q "triggers" "$TMP/old-spelling.out"; then
  fail "migrate-triggers-refusal: the renamed field leaked into the report — $(cat "$TMP/old-spelling.out")"
fi
pass "migrate-triggers-refusal (an IR spelling the array triggers is refused by name)"

# And then the carry: one hop, landing on the current fixture exactly.
python3 "$MIGRATE" "$TMP/old-spelling.json" --write > "$TMP/migrate-triggers.out" 2>&1 \
  || fail "migrate-triggers: migration failed — $(cat "$TMP/migrate-triggers.out")"
grep -q "2026.09.08 -> 2026.09.09" "$TMP/migrate-triggers.out" \
  || fail "migrate-triggers: the rename step did not run — $(cat "$TMP/migrate-triggers.out")"
python3 "$VALIDATE" "$TMP/old-spelling.json" > "$TMP/migrate-triggers-valid.out" 2>&1 \
  || fail "migrate-triggers: the carried IR does not validate — $(cat "$TMP/migrate-triggers-valid.out")"
python3 - "$TMP/old-spelling.json" "$SAMPLE" <<'PY' || fail "migrate-triggers: the carry did not land on the current fixture"
import json, sys

carried = json.load(open(sys.argv[1], encoding="utf-8"))
current = json.load(open(sys.argv[2], encoding="utf-8"))
assert carried == current, "the carried document differs from the current fixture"

# Position, not merely presence: the array kept the slot `triggers` occupied.
for phase in carried["service"]["phases"]:
    for scenario in phase["scenarios"]:
        for path in scenario["paths"]:
            keys = list(path)
            assert "triggers" not in keys, f"a triggers array survived the carry: {keys}"
            if "dependencies" not in keys:
                continue
            assert keys.index("dependencies") == keys.index("cells") - 1, (
                f"dependencies moved out of the slot triggers held: {keys}"
            )
PY
pass "migrate-triggers (a 2026.09.07 document carries forward, in place, to the current fixture)"

# ---------------------------------------------------------------------------
# 8c. A 2026.09.07 document carrying lane roles the closed set refuses
#     (#197, #204)
# ---------------------------------------------------------------------------
#
# 21000122000000 closed `lanes.lane_role` to eight values and renamed the ones
# it retired. It stamped a database 2026.09.08 and taught no version list the
# value, so for two releases a correctly migrated target read as incompatible
# and no step carried a document across the rename. This is that step, tested
# the way it will actually be met: a file authored before the vocabulary
# closed, carrying roles the target's CHECK constraint now refuses.
#
# The document is the current sample with the stamp wound back and six lanes
# re-spelled: five retired roles, one per lane so that a rename which goes
# missing names itself, and one role from outside the set entirely.
#
# The two are answered by different steps, which is why they ride in one
# carry. `to_2026_09_08` renames the five and leaves the sixth exactly where
# it is — it declined to delete a role no question had been asked about.
# #204 asked it: leaving the IR open let a document validate and then be
# refused by the CHECK mid-import, so the schema closed, and `to_2026_09_10`
# is where a role outside the eight becomes null. The lane's display name
# survives that, which is what makes it a reclassification and not a
# deletion.
python3 - "$SAMPLE" "$TMP" <<'PY' || fail "migrate-lane-roles-fixture: could not build the 2026.09.07 document"
import json, sys

sample, tmp = sys.argv[1], sys.argv[2]
doc = json.load(open(sample, encoding="utf-8"))
doc["schema_version"] = "2026.09.07"

# The pairs this fixture plants, and what each must become.
retired = ["frontstage_tech", "backstage_tech", "support_systems", "visual", "step_visual"]
lanes = [
    lane
    for phase in doc["service"]["phases"]
    for scenario in phase["scenarios"]
    for path in scenario["paths"]
    for lane in path["lanes"]
]
assert len(lanes) >= len(retired) + 1, f"the sample carries {len(lanes)} lanes; need {len(retired) + 1}"
for lane, role in zip(lanes, retired):
    lane["role"] = role
# And one role from outside the eight, on the last lane: the case the CHECK
# constraint refuses on import and the wire format used to accept in silence.
lanes[-1]["role"] = "compliance_review"
# The array goes back to `triggers` too — the document is at 2026.09.07, so it
# has to be a 2026.09.07 document in every field, not only in the one under
# test.
for phase in doc["service"]["phases"]:
    for scenario in phase["scenarios"]:
        for path in scenario["paths"]:
            if "dependencies" not in path:
                continue
            edges = path.pop("dependencies")
            rebuilt = {}
            for key, value in path.items():
                if key == "cells":
                    rebuilt["triggers"] = edges
                rebuilt[key] = value
            path.clear()
            path.update(rebuilt)
json.dump(doc, open(f"{tmp}/lane-roles.json", "w", encoding="utf-8"), ensure_ascii=False, indent=2)
PY

python3 "$MIGRATE" "$TMP/lane-roles.json" --write > "$TMP/migrate-lane-roles.out" 2>&1 \
  || fail "migrate-lane-roles: migration failed — $(cat "$TMP/migrate-lane-roles.out")"
grep -q "2026.09.07 -> 2026.09.08" "$TMP/migrate-lane-roles.out" \
  || fail "migrate-lane-roles: the rename step did not run — $(cat "$TMP/migrate-lane-roles.out")"
grep -q "2026.09.09 -> 2026.09.10" "$TMP/migrate-lane-roles.out" \
  || fail "migrate-lane-roles: the closing step did not run — $(cat "$TMP/migrate-lane-roles.out")"
python3 "$VALIDATE" "$TMP/lane-roles.json" > "$TMP/migrate-lane-roles-valid.out" 2>&1 \
  || fail "migrate-lane-roles: the carried IR does not validate — $(cat "$TMP/migrate-lane-roles-valid.out")"
python3 - "$TMP/lane-roles.json" <<'PY' || fail "migrate-lane-roles: the roles did not land on the closed set"
import json, sys

carried = json.load(open(sys.argv[1], encoding="utf-8"))
lanes = [
    lane
    for phase in carried["service"]["phases"]
    for scenario in phase["scenarios"]
    for path in scenario["paths"]
    for lane in path["lanes"]
]
expected = [
    "frontstage_touchpoints",
    "backstage_touchpoints",
    "backstage_touchpoints",
    "storyboard",
    "storyboard",
]
got = [lane.get("role") for lane in lanes[: len(expected)]]
assert got == expected, f"lane roles landed on {got}, expected {expected}"

# The role from outside the set is gone, and its LANE is not: nulling a role
# says the renderer has nothing to do with this row, while the display name
# stays what a reader sees. Asserted together, because the reclassification is
# only defensible while both halves hold.
outsider = lanes[-1]
assert outsider.get("role") is None, (
    f"a role outside the eight survived the carry: {outsider.get('role')!r}"
)
assert outsider["display_name"], "the lane lost its display name with its role"

# The closed set, as 21000122000000 states it and as references/ir-schema.json
# now states it too. After the carry nothing outside it is left anywhere.
closed = {
    "customer_actions", "frontstage_actions", "backstage_actions",
    "partner_actions", "frontstage_touchpoints", "backstage_touchpoints",
    "support_actions", "storyboard",
}
survivors = {lane.get("role") for lane in lanes} - closed - {None}
assert survivors == set(), (
    f"a role the vocabulary does not admit survived the carry: {survivors}"
)
PY
pass "migrate-lane-roles (a retired role is renamed, and one from outside the eight is nulled)"

# The two steps that write nothing, on their own. 2026.08.25 -> 2026.08.26
# adds an optional field whose absence already meant the drawn kind, and
# 2026.08.26 -> 2026.08.27 renamed a table the IR never carried: neither
# touches a scenario subtree, so every recorded sign-off hash is byte-identical
# afterwards. That is the honest content_preserving=True, and it is checked
# rather than asserted.
#
# The target is NAMED here where the rest of this file reads it from the
# schema, and the reason is the assertion below: "nothing moved but the stamp"
# is a claim about THESE TWO STEPS, not about the chain. 2026.08.27 ->
# 2026.08.31 splits `links` into `resources` and `touchpoints`, which does move
# the subtree — deliberately, and the re-anchoring test below is what covers
# it. Reading the target from the schema here would silently turn this into a
# test of whatever the newest step happens to do.
if python3 "$VALIDATE" "$SAMPLE_PREV" > "$TMP/prev-version.out" 2>&1; then
  fail "migrate-prev-refusal: expected non-zero exit on the superseded 2026.08.25"
fi
grep -q "migrate_ir.py" "$TMP/prev-version.out" \
  || fail "migrate-prev-refusal: message must name the upgrade command — got: $(cat "$TMP/prev-version.out")"
[ "$(grep -c '^ERROR' "$TMP/prev-version.out")" = 1 ] \
  || fail "migrate-prev-refusal: expected exactly one error — $(cat "$TMP/prev-version.out")"
pass "migrate-prev-refusal (2026.08.25 is superseded: one error, naming the upgrade)"

cp "$SAMPLE_PREV" "$TMP/prev.json"
python3 "$SIGNOFF_GEN" "$TMP/prev.json" --json > "$TMP/prev-hashes.json"
python3 - "$TMP" <<'PYWS'
import json, sys
tmp = sys.argv[1]
hashes = json.load(open(f"{tmp}/prev-hashes.json", encoding="utf-8"))
json.dump(
    {
        "schema_version": "2026.08.25",
        "ir_path": "prev.json",
        "locales": ["en", "zh"],
        "scenarios": {
            key: {
                "status": "signed_off",
                "content_hash": digest,
                "signed_at": "2026-08-25T09:00:00Z",
                "signed_by": "bill",
            }
            for key, digest in hashes.items()
        },
    },
    open(f"{tmp}/prev-workspace.json", "w", encoding="utf-8"),
    ensure_ascii=False,
    indent=2,
)
PYWS
python3 "$MIGRATE" "$TMP/prev.json" --to 2026.08.27 \
  --workspace "$TMP/prev-workspace.json" --write \
  > "$TMP/migrate-prev.out" 2>&1 \
  || fail "migrate-prev: migration failed — $(cat "$TMP/migrate-prev.out")"
# Not validated here, and that is the point of `--to`: the file is parked at
# an intermediate version on purpose, and validate_ir refuses anything that is
# not at the newest — which migrate-refusal above already proves. The chain is
# validated end to end by migrate-forward.
grep -q "already anchored" "$TMP/migrate-prev.out" \
  || fail "migrate-prev: a step that writes nothing must leave the hashes alone — $(cat "$TMP/migrate-prev.out")"
if grep -q "re-anchored" "$TMP/migrate-prev.out"; then
  fail "migrate-prev: nothing moved in the subtree, so nothing may be re-anchored"
fi
python3 - "$TMP" "$SAMPLE_PREV" "$REPO_ROOT" <<'PYPREV'
import json, pathlib, sys
tmp, before_path, repo = sys.argv[1], sys.argv[2], sys.argv[3]
sys.path.insert(0, str(pathlib.Path(repo) / "scripts"))
import migrate_ir

# The last version reachable from 2026.08.25 by steps that write nothing.
# Not `migrate_ir.current_version()`: this test's claim is about those steps,
# and the newest step is a rename that moves the subtree on purpose.
current = "2026.08.27"
before = json.load(open(before_path, encoding="utf-8"))
after = json.load(open(f"{tmp}/prev.json", encoding="utf-8"))
assert after["schema_version"] == current, "the version stamp did not move"
before["schema_version"] = current
assert after == before, "the step changed something other than the version stamp"
recorded = json.load(open(f"{tmp}/prev-hashes.json", encoding="utf-8"))
workspace = json.load(open(f"{tmp}/prev-workspace.json", encoding="utf-8"))
assert workspace["schema_version"] == current, "workspace version not bumped"
for key, digest in recorded.items():
    entry = workspace["scenarios"][key]
    assert entry["content_hash"] == digest, f"{key}: a hash moved across a no-op step"
    assert entry["status"] == "signed_off", f"{key}: sign-off dropped"
    assert entry["signed_by"] == "bill", f"{key}: signer lost"
PYPREV
pass "migrate-prev (2026.08.25 -> 2026.08.27 stamps the version and moves no hash)"

# The load-bearing one: sign-off binds to a hash of a scenario subtree, and the
# bump renames fields INSIDE that subtree — so every recorded hash would be
# wrong afterwards. --workspace moves each signed scenario's hash onto its
# migrated subtree, keeping signed_at/signed_by.
cp "$SAMPLE_OLD" "$TMP/signed-ir.json"
python3 - "$REPO_ROOT" "$TMP" <<'PYSIGN'
import json, pathlib, sys
repo, tmp = sys.argv[1], sys.argv[2]
sys.path.insert(0, str(pathlib.Path(repo) / "scripts"))
import migrate_ir

doc = json.load(open(f"{tmp}/signed-ir.json", encoding="utf-8"))
hashes = migrate_ir.scenario_hashes(doc)
assert hashes, "fixture has no scenarios to sign"
scenarios = {
    key: {
        "status": "signed_off",
        "content_hash": digest,
        "signed_at": "2026-07-16T11:03:00Z",
        "signed_by": "bill",
    }
    for key, digest in hashes.items()
}
json.dump(
    {
        "schema_version": "2026.07.16",
        "ir_path": "signed-ir.json",
        "locales": doc["locales"],
        "scenarios": scenarios,
    },
    open(f"{tmp}/signed-workspace.json", "w", encoding="utf-8"),
    ensure_ascii=False,
    indent=2,
)
PYSIGN
python3 "$MIGRATE" "$TMP/signed-ir.json" --workspace "$TMP/signed-workspace.json" --write \
  > "$TMP/migrate-signoff.out" 2>&1 \
  || fail "migrate-signoff: migration failed — $(cat "$TMP/migrate-signoff.out")"
grep -q "re-anchored" "$TMP/migrate-signoff.out" \
  || fail "migrate-signoff: no re-anchor reported — $(cat "$TMP/migrate-signoff.out")"
python3 - "$REPO_ROOT" "$TMP" <<'PYVERIFY'
import json, pathlib, subprocess, sys
repo, tmp = sys.argv[1], sys.argv[2]
sys.path.insert(0, str(pathlib.Path(repo) / "scripts"))
import migrate_ir

workspace = json.load(open(f"{tmp}/signed-workspace.json", encoding="utf-8"))
assert workspace["schema_version"] == migrate_ir.current_version(), "workspace version not bumped"

out = subprocess.run(
    [sys.executable, f"{repo}/scripts/compute_signoff_hash.py",
     f"{tmp}/signed-ir.json", "--json"],
    capture_output=True, text=True, check=True,
)
live = json.loads(out.stdout)
assert live, "migrated IR yielded no scenario hashes"
for key, digest in live.items():
    entry = workspace["scenarios"][key]
    assert entry["content_hash"] == digest, (
        f"{key}: recorded {entry['content_hash']}, IR now hashes to {digest}"
    )
    assert entry["status"] == "signed_off", f"{key}: sign-off dropped"
    assert entry["signed_by"] == "bill", f"{key}: signer lost"
PYVERIFY
pass "migrate-signoff (signed scenarios re-verify after migration)"

# The turn itself, end to end. No fixture before 2026.08.26 can carry a `needs`
# edge and the current fixture already says `enables`, so the one branch of
# to_2026_09_01 that moves authored content — swapping the ends of a `needs`
# edge — ran on zero edges until this test built its own input: the current
# fixture stamped 2026.08.31 with its `enables` edge written the old way round.
# Migrating it must land on the current fixture exactly, and a workspace that
# had signed that scenario must NOT be re-anchored across the turn — the
# sign-off stays stale, and the report says why — while nothing else in the
# chain is refused.
python3 - "$SAMPLE" "$TMP" "$REPO_ROOT" <<'PYTURN'
import json, pathlib, sys
sample, tmp, repo = sys.argv[1], sys.argv[2], sys.argv[3]
sys.path.insert(0, str(pathlib.Path(repo) / "scripts"))
import migrate_ir
doc = json.load(open(sample, encoding="utf-8"))
doc["schema_version"] = "2026.08.31"
turned = 0
for phase in doc["service"]["phases"]:
    for scenario in phase["scenarios"]:
        for path in scenario["paths"]:
            # At 2026.08.31 the array was still `triggers`; the rename comes
            # two steps later. `migrate_ir.rename` is the same helper the
            # forward step uses, so the array goes back into the slot it will
            # come out of and the round trip can be compared for equality.
            migrate_ir.rename(path, "dependencies", "triggers")
            for edge in path.get("triggers", []):
                if edge.get("kind") == "enables":
                    edge["kind"] = "needs"
                    edge["source"], edge["target"] = edge["target"], edge["source"]
                    turned += 1
assert turned == 1, f"expected the fixture to carry exactly one enables edge, found {turned}"
json.dump(doc, open(f"{tmp}/turn-me.json", "w", encoding="utf-8"), indent=2)
before = migrate_ir.scenario_hashes(doc)
signed = {key: {"status": "signed_off", "content_hash": digest,
                "signed_at": "2026-08-31T09:00:00Z", "signed_by": "bill"}
          for key, digest in before.items()}
json.dump({"schema_version": "2026.08.31", "ir_path": "turn-me.json", "scenarios": signed},
          open(f"{tmp}/turn-workspace.json", "w", encoding="utf-8"), indent=2)
PYTURN
python3 "$MIGRATE" "$TMP/turn-me.json" --workspace "$TMP/turn-workspace.json" --write \
  > "$TMP/migrate-turn.out" 2>&1 \
  || fail "migrate-turn: migration failed — $(cat "$TMP/migrate-turn.out")"
grep -q "2026.08.31 -> 2026.09.01" "$TMP/migrate-turn.out" \
  || fail "migrate-turn: the chain skipped the kinds step — $(cat "$TMP/migrate-turn.out")"
grep -q "re-review and re-sign" "$TMP/migrate-turn.out" \
  || fail "migrate-turn: the turned scenario's sign-off was carried across — $(cat "$TMP/migrate-turn.out")"
python3 - "$TMP" "$SAMPLE" "$REPO_ROOT" <<'PYTURNED'
import json, pathlib, sys
tmp, sample, repo = sys.argv[1], sys.argv[2], sys.argv[3]
sys.path.insert(0, str(pathlib.Path(repo) / "scripts"))
import migrate_ir
migrated = json.load(open(f"{tmp}/turn-me.json", encoding="utf-8"))
current = json.load(open(sample, encoding="utf-8"))
assert migrated == current, "turning the needs edge around did not land on the current fixture"
workspace = json.load(open(f"{tmp}/turn-workspace.json", encoding="utf-8"))
after = migrate_ir.scenario_hashes(migrated)
for key, entry in workspace["scenarios"].items():
    assert entry["content_hash"] != after[key], f"{key}: re-anchored across a step that moved its content"
    assert entry["signed_by"] == "bill", f"{key}: the stale sign-off was rewritten instead of left alone"
PYTURNED
pass "migrate-turn (a needs edge turns around, and its sign-off is not carried across)"

# A scenario hand-edited after sign-off carries a hash that matches neither
# side of the bump. It was de-signed before the migration ran, so re-anchoring
# it would launder an unreviewed edit into a signed one: report and leave it.
cp "$SAMPLE_OLD" "$TMP/stale-ir.json"
python3 - "$TMP" <<'PYSTALE'
import json, sys
tmp = sys.argv[1]
json.dump(
    {
        "schema_version": "2026.07.16",
        "ir_path": "stale-ir.json",
        "locales": ["en", "zh"],
        "scenarios": {
            "asset-repair": {
                "status": "signed_off",
                "content_hash": "sha256:" + "0" * 64,
                "signed_at": "2026-07-16T11:03:00Z",
                "signed_by": "bill",
            }
        },
    },
    open(f"{tmp}/stale-workspace.json", "w", encoding="utf-8"),
    ensure_ascii=False,
    indent=2,
)
PYSTALE
python3 "$MIGRATE" "$TMP/stale-ir.json" --workspace "$TMP/stale-workspace.json" --write \
  > "$TMP/migrate-stale.out" 2>&1 \
  || fail "migrate-stale: migration failed — $(cat "$TMP/migrate-stale.out")"
grep -q "already stale before this migration" "$TMP/migrate-stale.out" \
  || fail "migrate-stale: a stale hash must be reported — $(cat "$TMP/migrate-stale.out")"
grep -q '"sha256:0000000000000000000000000000000000000000000000000000000000000000"' \
  "$TMP/stale-workspace.json" \
  || fail "migrate-stale: a hash that was already stale must not be re-anchored"
pass "migrate-stale (a hash stale before the bump is reported, not laundered)"

# A version with no step is a dead end, and says so instead of half-migrating.
python3 - "$SAMPLE" "$TMP" <<'PYNOPATH'
import json, sys
doc = json.load(open(sys.argv[1], encoding="utf-8"))
doc["schema_version"] = "1999.01.01"
json.dump(doc, open(f"{sys.argv[2]}/no-path.json", "w", encoding="utf-8"), ensure_ascii=False)
PYNOPATH
if python3 "$MIGRATE" "$TMP/no-path.json" > "$TMP/no-path.out" 2>&1; then
  fail "migrate-no-path: expected non-zero exit for a version with no step"
fi
grep -q "no migration carries" "$TMP/no-path.out" \
  || fail "migrate-no-path: unhelpful message — $(cat "$TMP/no-path.out")"
python3 "$MIGRATE" "$SAMPLE" > "$TMP/no-op.out" 2>&1 \
  || fail "migrate-no-op: a current IR must exit 0"
grep -q "already at" "$TMP/no-op.out" || fail "migrate-no-op: no 'already at' line"
pass "migrate-edges (no step: named dead end; current IR: no-op)"

echo
echo "All $PASS_COUNT tests passed."
