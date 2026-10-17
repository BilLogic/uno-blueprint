#!/usr/bin/env bash
# `ub:init` reads where Uno starts from the database, and acts in a person's
# name through the database's own may-confirm check.
#
# Two scratch databases built from the generated core and recipe: one with no
# blueprint, which must read as onboarding, and one with the committed sample
# seed, the placeholder pilot logins and the pilot profile seed, which must
# read as a daily session offering the three profiles. On the second, a
# contribution from the employee lands in their name, their approval is
# refused, the consultant's goes through, and a finished run is stamped.
#
# Requires a local PostgreSQL server; CI runs it in the portable-core job.
set -Eeuo pipefail
export PGOPTIONS="${PGOPTIONS:---client-min-messages=warning}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
INIT="$ROOT/skills/init/scripts/init_state.py"
EMPTY="init_state_empty_$$"
DAILY="init_state_daily_$$"
trap 'dropdb --if-exists "$EMPTY"; dropdb --if-exists "$DAILY"' EXIT

build() {
  createdb "$1"
  shift
  for file in supabase/portable/supabase-shim.sql supabase/portable/platform-defaults.sql \
    supabase/generated/portable-core.generated.sql supabase/generated/supabase-recipe.generated.sql "$@"; do
    psql -X -q -v ON_ERROR_STOP=1 -d "$DB" -f "$ROOT/$file" >/dev/null
  done
}
fail() { echo "FAIL: $*" >&2; exit 1; }
field() { python3 -c "import json,sys; d=json.load(sys.stdin); print(eval(sys.argv[1], {}, {'d': d}))" "$1"; }

cd "$ROOT"
DB="$EMPTY" build "$EMPTY"
entry=$(python3 "$INIT" state --db-url "postgresql:///$EMPTY" | field "d['entry']")
[ "$entry" = onboarding ] || fail "a database with no blueprint read as '$entry', not onboarding"

DB="$DAILY" build "$DAILY" supabase/seed.sql scripts/tests/fixtures/profiles.sql
node scripts/seed-pilot-profiles.mjs --file supabase/pilot/profiles.example.json --print \
  | psql -X -q -v ON_ERROR_STOP=1 -d "$DAILY" -f - >/dev/null
URL="postgresql:///$DAILY"
CONSULTANT=b0000000-0000-4000-8000-000000000001
EXPERT=b0000000-0000-4000-8000-000000000003
CELL=f0000000-0000-4000-8000-110300010001

state=$(python3 "$INIT" state --db-url "$URL" --profile "$EXPERT")
[ "$(field "d['entry']" <<<"$state")" = daily ] || fail "a seeded blueprint did not read as a daily session"
[ "$(field "len(d['profiles'])" <<<"$state")" = 3 ] || fail "the three seeded profiles were not offered"
[ "$(field "sorted(p['may_confirm'] for p in d['profiles'])" <<<"$state")" = "[False, True, True]" ] \
  || fail "may-confirm did not come back per profile"

suggestion=$(python3 "$INIT" contribute --db-url "$URL" --profile "$EXPERT" --cell "$CELL" \
  --title "Told to Uno in a session" --note "Intake starts with a call." \
  --proposed "Intake starts with a call" | field "d['suggested_change_id']")
[ -n "$suggestion" ] || fail "a contribution left no suggested change"
by=$(psql -X -At -d "$DAILY" -c "select contributed_by from public.evidence where contributed_by is not null")
[ "$by" = "$EXPERT" ] || fail "the evidence was attributed to '$by', not the person who gave it"

if python3 "$INIT" approve --db-url "$URL" --profile "$EXPERT" --suggestion "$suggestion" 2>/dev/null; then
  fail "a person who may not confirm approved a change"
fi
python3 "$INIT" approve --db-url "$URL" --profile "$CONSULTANT" --suggestion "$suggestion" >/dev/null \
  || fail "a person who may confirm could not approve"
confirmed=$(psql -X -At -d "$DAILY" -c "select confirmed_by from public.cells where id = '$CELL'")
[ "$confirmed" = "$CONSULTANT" ] || fail "approval did not owner-confirm the cell"

psql -X -q -v ON_ERROR_STOP=1 -d "$DAILY" -c "insert into public.authoring_changes (fn, label) values ('update_cell_content', 'A canvas edit')"
edits=$(python3 "$INIT" state --db-url "$URL" --profile "$EXPERT" \
  | field "[c['label'] for c in d['changes_since_last_run'] if c['author'] == 'human']")
[ "$edits" = "['A canvas edit']" ] || fail "a canvas edit since the last run was not reported: $edits"
python3 "$INIT" mark-run --db-url "$URL" --profile "$EXPERT" >/dev/null
since=$(python3 "$INIT" state --db-url "$URL" --profile "$EXPERT" | field "len(d['changes_since_last_run'])")
[ "$since" = 0 ] || fail "a stamped run still reported $since earlier changes"

echo "init state: onboarding and daily entry, profiles offered, contribution and approval in a person's name"
