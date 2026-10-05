#!/usr/bin/env bash

# What `update_touchpoint` does to ROWS, which is why it needs a database.
#
# The migration that creates the function proves its posture on every apply —
# SECURITY DEFINER, closed to anon — and an empty replay is enough for that.
# It cannot say anything about the claims that matter to an author, because
# every one of them is about rows moving together or not at all:
#
#   1. one call writes all five fields, and a changed name moves the word in
#      every bearing cell as `rename_touchpoint` does — whole items, the
#      author's delimiters and spacing kept, a longer name containing the old
#      one left alone;
#   2. the previous values it returns, posted back, restore the row AND the
#      cell text — the inverse the session ledger records;
#   3. a rename that is refused leaves the other four fields unwritten;
#   4. a refusal on one of the other four takes the rename back out of every
#      cell;
#   5. an empty name is refused;
#   6. the icon can be cleared;
#   7. a signed-in reader without the service claim changes nothing, and anon
#      cannot call it at all.
#
# It replays the migration series behind the shim, loads the sample seed, and
# calls the function in the role and with the claims a deployed author or
# reader carries. Requires a local PostgreSQL server and permission to create a
# database — the stance of scripts/tests/entity-examples-round-trip.test.sh.

set -Eeuo pipefail

export PGOPTIONS="${PGOPTIONS:---client-min-messages=warning}"

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
DATABASE_NAME="${1:-update_touchpoint_test}"
RERUN="bash scripts/tests/update-touchpoint.test.sh"
CREATED=0

cleanup() {
  if [ "$CREATED" = 1 ]; then
    dropdb "$DATABASE_NAME"
  fi
}
trap cleanup EXIT

on_error() {
  local status=$?
  local source="${BASH_SOURCE[1]#"$REPO_ROOT"/}"
  local line="${BASH_LINENO[0]}"
  trap - ERR
  echo "$source:$line: update-touchpoint command failed (exit $status)" >&2
  echo "Run: $RERUN" >&2
  exit "$status"
}
trap on_error ERR

# The sample seed's one registry entry, placed at two cells whose whole text
# is its name. A second entry whose name CONTAINS the first is added beside it
# on one of those cells: the near miss a substring replace gets wrong.
TP='f0000000-0000-4000-8000-000800010000'
NEAR='f0000000-0000-4000-8000-000800019999'
CELL_A='f0000000-0000-4000-8000-210300030107'
CELL_B='f0000000-0000-4000-8000-220300030107'
ORIGINAL_NAME='Cell detail panel'
NEAR_NAME='Cell detail panel tabs'
ORIGINAL_A=$'Cell detail panel,\n  Cell detail panel tabs '

AUTHOR_CLAIMS='{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated","app_metadata":{"role":"service"}}'
READER_CLAIMS='{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated","app_metadata":{}}'

createdb "$DATABASE_NAME"
CREATED=1
psql -v ON_ERROR_STOP=1 -d "$DATABASE_NAME" \
  -f "$REPO_ROOT/supabase/portable/supabase-shim.sql" >/dev/null
for file in "$REPO_ROOT"/supabase/migrations/*.sql; do
  psql -v ON_ERROR_STOP=1 -d "$DATABASE_NAME" -f "$file" >/dev/null
done
psql -v ON_ERROR_STOP=1 -d "$DATABASE_NAME" -f "$REPO_ROOT/supabase/seed.sql" >/dev/null

psql -v ON_ERROR_STOP=1 -d "$DATABASE_NAME" >/dev/null <<SQL
insert into public.touchpoints (id, name, kind, origin)
values ('$NEAR', '$NEAR_NAME', 'other', 'import');
insert into public.cell_touchpoints (cell_id, touchpoint_id, position, origin)
values ('$CELL_A', '$NEAR', 2, 'import');
update public.cells set content = E'Cell detail panel,\n  Cell detail panel tabs ' where id = '$CELL_A';
SQL

owner() {
  psql -At -X -v ON_ERROR_STOP=1 -d "$DATABASE_NAME" -c "$1"
}

# One statement as a signed-in caller carrying the given claims, in its own
# transaction — the shape a PostgREST request takes.
as_caller() {
  local claims="$1" sql="$2"
  psql -At -X -q -v ON_ERROR_STOP=1 -d "$DATABASE_NAME" <<SQL
begin;
set local role authenticated;
set local request.jwt.claims = '$claims';
$sql;
commit;
SQL
}

as_author() { as_caller "$AUTHOR_CLAIMS" "$1"; }

fail() {
  echo "supabase/migrations/21000301000000_one_write_edits_a_touchpoint_whole.sql: $1" >&2
  shift
  for line in "$@"; do echo "  $line" >&2; done
  echo "Run: $RERUN" >&2
  exit 1
}

expect_eq() {
  local claim="$1" want="$2" got="$3"
  if [ "$got" != "$want" ]; then
    fail "$claim" "expected: $want" "actual:   $got"
  fi
}

row() {
  owner "select concat_ws('|', name, kind, coalesce(summary, '∅'), coalesce(url, '∅'), coalesce(icon_url, '∅')) from public.touchpoints where id = '$TP'"
}
content() {
  owner "select content from public.cells where id = '$1'"
}

# A call that must be refused, and refused for the stated reason — a refusal
# for some other cause (a typo in the call, a missing function) would pass a
# bare "it failed" check while proving nothing.
expect_refused() {
  local claim="$1" reason="$2" claims="$3" sql="$4" output
  # The trap is cleared inside the substitution: a refusal is the expected
  # outcome here, not a failure of the script.
  if output="$(trap - ERR; as_caller "$claims" "$sql" 2>&1)"; then
    fail "$claim" "the call succeeded"
  fi
  if ! grep -q -- "$reason" <<<"$output"; then
    fail "$claim" "expected a refusal matching: $reason" "actual: $output"
  fi
}

ORIGINAL_ROW="$(row)"
ORIGINAL_B="$(content "$CELL_B")"
expect_eq "the fixture did not set up" "$ORIGINAL_A" "$(content "$CELL_A")"

# ── 1. One call writes all five, and the name moves in every bearing cell ──

RESULT="$(as_author "select public.update_touchpoint('$TP', '  Cell panel ', 'app', '  What one cell holds  ', 'https://example.com/panel', 'https://example.com/icon.png')")"

expect_eq "the five fields did not land together" \
  "Cell panel|app|What one cell holds|https://example.com/panel|https://example.com/icon.png" "$(row)"
expect_eq "a bearing cell's item was not renamed whole, or lost its delimiters" \
  $'Cell panel,\n  Cell detail panel tabs ' "$(content "$CELL_A")"
expect_eq "the second bearing cell was not renamed" "Cell panel" "$(content "$CELL_B")"
expect_eq "the near miss was renamed" "$NEAR_NAME" \
  "$(owner "select name from public.touchpoints where id = '$NEAR'")"
expect_eq "the result did not name the cells it rewrote" "2" \
  "$(owner "select jsonb_array_length('$RESULT'::jsonb -> 'cell_ids')")"

# ── 2. The returned previous values are the inverse ────────────────────────

INVERSE="$(owner "select format('%L, %L, %L, %L, %L', p ->> 'name', p ->> 'kind', p ->> 'summary', p ->> 'url', p ->> 'icon_url') from (select '$RESULT'::jsonb -> 'previous' as p) s")"
as_author "select public.update_touchpoint('$TP', $INVERSE)" >/dev/null

expect_eq "posting the previous values back did not restore the row" "$ORIGINAL_ROW" "$(row)"
expect_eq "posting the previous values back did not restore the cell text" "$ORIGINAL_A" "$(content "$CELL_A")"
expect_eq "posting the previous values back did not restore the other cell" "$ORIGINAL_B" "$(content "$CELL_B")"

# ── 3. A refused rename leaves the other four unwritten ────────────────────

expect_refused "a rename onto a name the registry already holds was accepted" \
  "touchpoints_name_key" "$AUTHOR_CLAIMS" \
  "select public.update_touchpoint('$TP', '$NEAR_NAME', 'service', 'Changed', 'https://example.com/x', 'https://example.com/x.png')"
expect_eq "a refused rename let the other fields through" "$ORIGINAL_ROW" "$(row)"
expect_eq "a refused rename changed a cell's text" "$ORIGINAL_A" "$(content "$CELL_A")"

# ── 4. A refusal on another field takes the rename back out ────────────────

expect_refused "a kind outside the vocabulary was accepted" \
  "touchpoints_kind_check" "$AUTHOR_CLAIMS" \
  "select public.update_touchpoint('$TP', 'Renamed anyway', 'not-a-kind', null, null, null)"
expect_eq "a refused kind left the rename on the row" "$ORIGINAL_ROW" "$(row)"
expect_eq "a refused kind left the rename in a cell" "$ORIGINAL_A" "$(content "$CELL_A")"

# ── 5. An empty name is refused ─────────────────────────────────────────────

expect_refused "an empty name was accepted" "needs a name" "$AUTHOR_CLAIMS" \
  "select public.update_touchpoint('$TP', '   ', 'app', null, null, null)"
expect_eq "an empty name changed the row" "$ORIGINAL_ROW" "$(row)"

# ── 6. The icon can be cleared ──────────────────────────────────────────────

as_author "select public.update_touchpoint('$TP', '$ORIGINAL_NAME', 'other', null, null, 'https://example.com/icon.png')" >/dev/null
expect_eq "the icon was not set" "https://example.com/icon.png" \
  "$(owner "select icon_url from public.touchpoints where id = '$TP'")"
as_author "select public.update_touchpoint('$TP', '$ORIGINAL_NAME', 'other', null, null, null)" >/dev/null
expect_eq "the icon was not cleared" "∅" \
  "$(owner "select coalesce(icon_url, '∅') from public.touchpoints where id = '$TP'")"
expect_eq "an edit that kept the name rewrote cell text" "$ORIGINAL_A" "$(content "$CELL_A")"

# ── 7. A reader changes nothing; anon cannot call it ────────────────────────

expect_refused "a signed-in reader without the service claim edited the registry" \
  "cannot edit the blueprint" "$READER_CLAIMS" \
  "select public.update_touchpoint('$TP', 'Reader rename', 'app', 'x', null, null)"
expect_eq "a reader's refused call changed the row" "$ORIGINAL_ROW" "$(row)"

if output="$(trap - ERR; psql -At -X -q -v ON_ERROR_STOP=1 -d "$DATABASE_NAME" 2>&1 <<SQL
begin;
set local role anon;
select public.update_touchpoint('$TP', 'Anon rename', 'app', null, null, null);
commit;
SQL
)"; then
  fail "anon called update_touchpoint"
fi
if ! grep -q "permission denied for function update_touchpoint" <<<"$output"; then
  fail "anon was refused for the wrong reason" "actual: $output"
fi
expect_eq "anon's refused call changed the row" "$ORIGINAL_ROW" "$(row)"

echo "update_touchpoint: 7 claims hold — whole-row write, cell rename, inverse, two rollbacks, empty name, icon clear, guard."
