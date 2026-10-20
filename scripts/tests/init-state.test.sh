#!/usr/bin/env bash
# What init proves against a real database:
#   1. an empty database starts onboarding; a seeded one starts daily work;
#   2. all three profiles are offered, with their separate may-confirm rights;
#   3. a contribution is attributed, and only a confirmer approves it;
#   4. approval writes the cell once and records the approving login;
#   5. catch-up reads human edits, and mark-run advances its cursor;
#   6. findings, queued questions and service proposals need no cell, dedupe,
#      and leave blueprint rows unchanged;
#   7. commands resolve the workspace even when called from another directory.
# Requires local PostgreSQL; CI runs this in the portable-core job.
set -Eeuo pipefail
export PGOPTIONS="${PGOPTIONS:---client-min-messages=warning}"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
DATABASE_NAME="${1:-init_state_test}"
RERUN="bash scripts/tests/init-state.test.sh"
INIT="$REPO_ROOT/skills/init/scripts/init_state.py"
CREATED=0
TEMP_DIR="$(mktemp -d)"
cleanup() {
  if [ "$CREATED" = 1 ]; then dropdb "$DATABASE_NAME"; fi
  rm -rf "$TEMP_DIR"
}
trap cleanup EXIT
on_error() {
  local status=$?
  local source="${BASH_SOURCE[1]#"$REPO_ROOT"/}"
  local line="${BASH_LINENO[0]}"
  trap - ERR
  echo "$source:$line: init-state command failed (exit $status)" >&2
  echo "Run: $RERUN" >&2
  exit "$status"
}
trap on_error ERR
fail() { echo "init-state: $*" >&2; echo "Run: $RERUN" >&2; exit 1; }
# Small field reader: dotted object keys and a count suffix, never eval.
field() {
  python3 -c 'import json,sys
value=json.load(sys.stdin)
for key in sys.argv[1].split("."):
    value=len(value) if key == "count" else value[key]
print(value)' "$1"
}
owner() { psql -X -q -At -v ON_ERROR_STOP=1 -d "$DATABASE_NAME" -c "$1"; }
createdb "$DATABASE_NAME"
CREATED=1
for file in supabase/portable/supabase-shim.sql supabase/portable/platform-defaults.sql \
  supabase/generated/portable-core.generated.sql supabase/generated/supabase-recipe.generated.sql; do
  psql -X -q -v ON_ERROR_STOP=1 -d "$DATABASE_NAME" -f "$REPO_ROOT/$file" >/dev/null
done
URL="postgresql:///$DATABASE_NAME"
# Deliberately outside the workspace for the rest of the run.
cd "$TEMP_DIR"
entry=$(python3 "$INIT" state --db-url "$URL" | field entry)
[ "$entry" = onboarding ] || fail "an empty database did not start onboarding"
for file in supabase/seed.sql scripts/tests/fixtures/profiles.sql; do
  psql -X -q -v ON_ERROR_STOP=1 -d "$DATABASE_NAME" -f "$REPO_ROOT/$file" >/dev/null
done
# Test the SQL generator directly; the operator CLI is intentionally guarded
# against seeding a linked project without an explicit test-project opt-in.
(cd "$REPO_ROOT"; node --input-type=module -e '
import {pilotProfilesSql} from "./scripts/seed-pilot-profiles.mjs";
import {readFileSync} from "node:fs";
process.stdout.write(pilotProfilesSql(JSON.parse(readFileSync("supabase/pilot/profiles.example.json"))));') \
  | psql -X -q -v ON_ERROR_STOP=1 -d "$DATABASE_NAME" -f - >/dev/null
CONSULTANT=b0000000-0000-4000-8000-000000000001
EXPERT=b0000000-0000-4000-8000-000000000003
CELL=f0000000-0000-4000-8000-110300010001
state=$(python3 "$INIT" state --db-url "$URL" --profile "$EXPERT")
[ "$(field entry <<<"$state")" = daily ] || fail "a seeded blueprint did not start daily work"
[ "$(field profiles.count <<<"$state")" = 3 ] || fail "the three profiles were not offered"
[ "$(owner 'select count(*) from public.profiles where may_confirm')" = 2 ] || fail "may-confirm changed"
suggestion=$(python3 "$INIT" contribute --db-url "$URL" --profile "$EXPERT" --cell "$CELL" \
  --title "Told to Uno in a session" --note "Intake starts with a call." \
  --proposed "Intake starts with a call" | field suggested_change_id)
[ -n "$suggestion" ] || fail "a contribution left no suggestion"
[ "$(owner 'select contributed_by from public.evidence where contributed_by is not null')" = "$EXPERT" ] \
  || fail "evidence attribution differs"
if output=$(trap - ERR; python3 "$INIT" approve --db-url "$URL" --profile "$EXPERT" --suggestion "$suggestion" 2>&1); then
  fail "a contributor approved a change"
fi
[[ "$output" == *"only someone who may confirm"* ]] || fail "approval refused for the wrong reason"
python3 "$INIT" approve --db-url "$URL" --profile "$CONSULTANT" --suggestion "$suggestion" >/dev/null
[ "$(owner "select confirmed_by from public.cells where id = '$CELL'")" = "$CONSULTANT" ] || fail "approval did not confirm"
[ "$(owner "select content from public.cells where id = '$CELL'")" = 'Intake starts with a call' ] || fail "approval did not write the cell"
[ "$(owner "select count(*) from public.authoring_changes where fn = 'approve_suggested_change' and args ? 'update' and (revert->'args'->'update') ? 'confirmed_by' and revert->'args'->'update'->'confirmed_by' = 'null'::jsonb and author_id = (select user_id from public.profiles where id = '$CONSULTANT')")" = 1 ] || fail "approval did not log the approving login once"
owner "insert into public.authoring_changes (fn, label) values ('update_cell_content', 'A canvas edit')" >/dev/null
edits=$(python3 "$INIT" state --db-url "$URL" --profile "$EXPERT" | field changes_since_last_run)
[[ "$edits" == *"A canvas edit"* ]] || fail "the canvas edit was not reported"
python3 "$INIT" mark-run --db-url "$URL" --profile "$EXPERT" >/dev/null
[ "$(python3 "$INIT" state --db-url "$URL" --profile "$EXPERT" | field changes_since_last_run.count)" = 0 ] || fail "mark-run did not advance"
BEFORE=$(owner "select md5(string_agg(row_to_json(c)::text, '' order by id)) from public.cells c")
for kind in finding question service-proposal question; do
  python3 "$INIT" record --profile "$EXPERT" --kind "$kind" --scope topic:reason \
    --summary 'A topic to revisit' --severity info --impact medium --effort low \
    --ledger "$TEMP_DIR/ledger.json" >/dev/null
done
[ "$(field rows.count < "$TEMP_DIR/ledger.json")" = 3 ] || fail "records did not dedupe by kind and scope"
[ "$(owner "select md5(string_agg(row_to_json(c)::text, '' order by id)) from public.cells c")" = "$BEFORE" ] || fail "recording changed cells"
echo "init-state: seven claims hold: entry, profiles, guarded approval, cell and audit write, cursor, no-cell records, workspace root"
