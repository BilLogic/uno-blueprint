#!/usr/bin/env bash

# What `replace_slides`, `restore_slides` and `create_slice` do to ROWS, which
# is why they need a database.
#
# The migration that creates them proves their posture on every apply —
# SECURITY DEFINER, closed to anon — and an empty replay is enough for that.
# The claims that matter to an author are about rows moving together or not at
# all, and only a loaded database can say anything about those:
#
#   1. a replace writes the new slides in order, carries an image set onto the
#      slide that sent one, and keeps a slide id it was handed;
#   2. what a replace returns as `previous` is the slice's slides and their
#      image sets as they stood under the lock — the inverse the ledger keeps;
#   3. a replace whose new slides fail to insert — a cell that is not an id, an
#      image member that names nothing — leaves the prior slides and their
#      `slide_images` exactly as they were;
#   4. a replace on a slice that does not exist, or with no list of slides, is
#      refused in a sentence;
#   5. a create writes the slice and its slides in one call;
#   6. a create whose slides fail to insert leaves no slice row behind;
#   7. a create with a blank title is refused;
#   8. a signed-in reader without the service claim changes nothing, and anon
#      cannot call any of the three;
#   9. a restore whose captured rows fail to insert leaves the slice as the
#      replace left it, and a restore of what the replace returned puts the
#      slice back exactly — ids and stamps included — naming the slides it
#      dropped.
#
# It replays the migration series behind the shim, loads the sample seed, and
# calls the functions in the role and with the claims a deployed author or
# reader carries. Requires a local PostgreSQL server and permission to create a
# database — the stance of scripts/tests/update-touchpoint.test.sh.

set -Eeuo pipefail

export PGOPTIONS="${PGOPTIONS:---client-min-messages=warning}"

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
DATABASE_NAME="${1:-slice_writes_test}"
RERUN="bash scripts/tests/slice-writes.test.sh"
MIGRATION="supabase/migrations/21000304000000_a_slice_write_is_all_or_nothing.sql and 21000305000000_undoing_a_slice_replace_is_all_or_nothing.sql"
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
  echo "$source:$line: slice-writes command failed (exit $status)" >&2
  echo "Run: $RERUN" >&2
  exit "$status"
}
trap on_error ERR

# The sample seed's step slice: four slides, one cell each. Its first slide is
# given an authored image set below — a cell's frame and an upload — so that a
# rollback has a `slide_images` row to lose.
SERVICE='f0000000-0000-4000-8000-000000000010'
SLICE='f0000000-0000-4000-8000-000500020000'
SLIDE_1='f0000000-0000-4000-8000-000600020001'
CELL_1='f0000000-0000-4000-8000-210300040009'
CELL_2='f0000000-0000-4000-8000-210300050009'
CELL_3='f0000000-0000-4000-8000-210300070009'
MISSING_SLICE='f0000000-0000-4000-8000-000500999999'
UPLOAD="https://example.com/storage/v1/object/public/slices/$SLICE/$SLIDE_1/a.png"

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
update public.slides set shows_all_images = false where id = '$SLIDE_1';
insert into public.slide_images (slide_id, position, cell_id, image_url) values
  ('$SLIDE_1', 0, '$CELL_1', null),
  ('$SLIDE_1', 1, null, '$UPLOAD');
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
  echo "$MIGRATION: $1" >&2
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

# A call that must be refused, and refused for the stated reason — a refusal
# for some other cause (a typo in the call, a missing function) would pass a
# bare "it failed" check while proving nothing.
expect_refused() {
  local claim="$1" reason="$2" claims="$3" sql="$4" output
  if output="$(trap - ERR; as_caller "$claims" "$sql" 2>&1)"; then
    fail "$claim" "the call succeeded"
  fi
  if ! grep -q -- "$reason" <<<"$output"; then
    fail "$claim" "expected a refusal matching: $reason" "actual: $output"
  fi
}

# Everything a rollback could lose, ids and stamps included: a slice whose
# slides were deleted and re-inserted identically would still differ here.
slice_state() {
  owner "select coalesce(string_agg(concat_ws('|', s.id, s.position, s.cell_ids, s.cell_keys,
           coalesce(s.title, '∅'), coalesce(s.caption, '∅'), s.shows_all_images, s.created_at,
           (select coalesce(string_agg(concat_ws(':', i.id, i.position, coalesce(i.cell_id::text, '∅'),
                    coalesce(i.image_url, '∅')), ',' order by i.position), '')
              from public.slide_images i where i.slide_id = s.id)), E'\n' order by s.position), '')
         from public.slides s where s.slice_id = '$SLICE'"
}

slices_titled() {
  owner "select count(*) from public.slices where title = '$1'"
}

ORIGINAL="$(slice_state)"
expect_eq "the fixture did not set up an image set" "2" \
  "$(owner "select count(*) from public.slide_images where slide_id = '$SLIDE_1'")"

# ── 3. A replace that fails to insert leaves the slice as it was ───────────
#
# First, because it is the claim this migration exists for: the slices below
# would be rewritten by the passing calls after it.

expect_refused "a replace naming a cell that is not an id was accepted" \
  "Slide 2 names a cell that is not an id" "$AUTHOR_CLAIMS" \
  "select public.replace_slides('$SLICE', '[{\"cell_ids\": [\"$CELL_1\"]}, {\"cell_ids\": [\"c-3\"]}]'::jsonb)"
expect_eq "a refused replace deleted the slice's slides or their image sets" "$ORIGINAL" "$(slice_state)"

expect_refused "a replace with an image member that names nothing was accepted" \
  "slide_images_one_source" "$AUTHOR_CLAIMS" \
  "select public.replace_slides('$SLICE', '[{\"cell_ids\": [\"$CELL_1\"], \"images\": [{\"position\": 0}]}]'::jsonb)"
expect_eq "a replace refused by the image insert left the slice changed" "$ORIGINAL" "$(slice_state)"

# ── 4. Refused in a sentence: no slice, no list ─────────────────────────────

expect_refused "a replace on a slice that does not exist was accepted" \
  "That slice no longer exists" "$AUTHOR_CLAIMS" \
  "select public.replace_slides('$MISSING_SLICE', '[]'::jsonb)"
expect_refused "a replace with no list of slides was accepted" \
  "a list of slides" "$AUTHOR_CLAIMS" \
  "select public.replace_slides('$SLICE', '{}'::jsonb)"
expect_eq "a refused replace changed the slice" "$ORIGINAL" "$(slice_state)"

# ── 8. A reader changes nothing; anon cannot call either ────────────────────

expect_refused "a signed-in reader without the service claim replaced slides" \
  "cannot edit the blueprint" "$READER_CLAIMS" \
  "select public.replace_slides('$SLICE', '[]'::jsonb)"
expect_refused "a signed-in reader without the service claim created a slice" \
  "cannot edit the blueprint" "$READER_CLAIMS" \
  "select public.create_slice('$SERVICE', 'Reader slice', null, 'custom', null, '[]'::jsonb)"
expect_refused "a signed-in reader without the service claim restored slides" \
  "cannot edit the blueprint" "$READER_CLAIMS" \
  "select public.restore_slides('$SLICE', '[]'::jsonb)"
expect_eq "a reader's refused call changed the slice" "$ORIGINAL" "$(slice_state)"
expect_eq "a reader's refused create left a slice" "0" "$(slices_titled 'Reader slice')"

for call in \
  "replace_slides('$SLICE', '[]'::jsonb)" \
  "restore_slides('$SLICE', '[]'::jsonb)" \
  "create_slice('$SERVICE', 'Anon slice', null, 'custom', null, '[]'::jsonb)"; do
  if output="$(trap - ERR; psql -At -X -q -v ON_ERROR_STOP=1 -d "$DATABASE_NAME" 2>&1 <<SQL
begin;
set local role anon;
select public.$call;
commit;
SQL
)"; then
    fail "anon called public.$call"
  fi
  if ! grep -q "permission denied for function" <<<"$output"; then
    fail "anon was refused for the wrong reason" "actual: $output"
  fi
done
expect_eq "anon's refused call changed the slice" "$ORIGINAL" "$(slice_state)"

# ── 1 and 2. A replace lands whole and returns the inverse ─────────────────

RESULT="$(as_author "select public.replace_slides('$SLICE', '[
  {\"id\": \"$SLIDE_1\", \"cell_ids\": [\"$CELL_1\", \"$CELL_2\"], \"cell_keys\": [\"$CELL_1\", \"$CELL_2\"],
   \"title\": \"Arrive\", \"caption\": null, \"shows_all_images\": false,
   \"images\": [{\"position\": 0, \"cell_id\": null, \"image_url\": \"$UPLOAD\"}]},
  {\"cell_ids\": [\"$CELL_3\"], \"cell_keys\": [\"$CELL_3\"], \"title\": null, \"caption\": \"Then\", \"shows_all_images\": true}
]'::jsonb)")"

expect_eq "the new slides did not land in order" \
  "0|{$CELL_1,$CELL_2}|Arrive|∅|true
1|{$CELL_3}|∅|Then|false" \
  "$(owner "select string_agg(concat_ws('|', position, cell_ids, coalesce(title, '∅'),
            coalesce(caption, '∅'), (id = '$SLIDE_1')::text), E'\n' order by position)
            from public.slides where slice_id = '$SLICE'")"
expect_eq "the image set sent with a slide did not land on it" \
  "false|0:∅:$UPLOAD" \
  "$(owner "select concat_ws('|', s.shows_all_images::text, string_agg(concat_ws(':', i.position,
            coalesce(i.cell_id::text, '∅'), i.image_url), ','))
            from public.slides s join public.slide_images i on i.slide_id = s.id
           where s.id = '$SLIDE_1' group by s.shows_all_images")"

expect_eq "the result did not count the slides it wrote" "2" \
  "$(owner "select '$RESULT'::jsonb ->> 'slide_count'")"
expect_eq "previous is not the slides as they stood, in order" \
  "f0000000-0000-4000-8000-000600020001,f0000000-0000-4000-8000-000600020002,f0000000-0000-4000-8000-000600020003,f0000000-0000-4000-8000-000600020004" \
  "$(owner "select string_agg(p ->> 'id', ',' order by n)
            from jsonb_array_elements('$RESULT'::jsonb -> 'previous') with ordinality as e(p, n)")"
expect_eq "previous did not carry the first slide's image set" \
  "0:$CELL_1:∅,1:∅:$UPLOAD" \
  "$(owner "select string_agg(concat_ws(':', m ->> 'position', coalesce(m ->> 'cell_id', '∅'),
            coalesce(m ->> 'image_url', '∅')), ',' order by (m ->> 'position')::int)
            from jsonb_array_elements('$RESULT'::jsonb -> 'previous' -> 0 -> 'slide_images') m")"
expect_eq "previous did not carry the columns a verbatim restore writes back" \
  "f0000000-0000-4000-8000-000500020000|false" \
  "$(owner "select concat_ws('|', p ->> 'slice_id', p ->> 'shows_all_images')
            from (select '$RESULT'::jsonb -> 'previous' -> 0 as p) s")"

# ── 9. Undoing the replace is all-or-nothing too ───────────────────────────
#
# The ledger's revert writes `previous` back through `restore_slides`. A
# restore refused partway — here the last captured slide's image member names
# nothing — must leave the slice as the replace left it, not emptied.

REPLACED="$(slice_state)"
expect_refused "a restore whose image insert failed was accepted" \
  "slide_images_one_source" "$AUTHOR_CLAIMS" \
  "select public.restore_slides('$SLICE',
     jsonb_set('$RESULT'::jsonb -> 'previous', '{3,slide_images}', '[{\"position\": 0}]'::jsonb))"
expect_eq "a refused restore deleted the slice's slides or their image sets" "$REPLACED" "$(slice_state)"

expect_refused "a restore with a captured slide that has no id was accepted" \
  "Captured slide 1 has no id" "$AUTHOR_CLAIMS" \
  "select public.restore_slides('$SLICE', '[{\"cell_ids\": []}]'::jsonb)"
expect_refused "a restore on a slice that does not exist was accepted" \
  "That slice no longer exists" "$AUTHOR_CLAIMS" \
  "select public.restore_slides('$MISSING_SLICE', '[]'::jsonb)"
expect_refused "a restore with no list of slides was accepted" \
  "a list of slides" "$AUTHOR_CLAIMS" \
  "select public.restore_slides('$SLICE', '{}'::jsonb)"
expect_eq "a refused restore changed the slice" "$REPLACED" "$(slice_state)"

ADDED_SLIDE="$(owner "select id from public.slides where slice_id = '$SLICE' and position = 1")"
RESTORED="$(as_author "select public.restore_slides('$SLICE', '$RESULT'::jsonb -> 'previous')")"
expect_eq "a restore of previous did not put the slice back exactly" "$ORIGINAL" "$(slice_state)"
expect_eq "a restore did not name the slide it dropped" "[\"$ADDED_SLIDE\"]" \
  "$(owner "select '$RESTORED'::jsonb -> 'dropped'")"

# ── 5. A create lands the slice and its slides in one call ─────────────────

CREATED_ROW="$(as_author "select public.create_slice('$SERVICE', '  Caller view ', '  ', 'journey', ' Caller ',
  '[{\"cell_ids\": [\"$CELL_1\"], \"cell_keys\": [\"$CELL_1\"], \"title\": null, \"caption\": null, \"shows_all_images\": true},
    {\"cell_ids\": [\"$CELL_2\"], \"cell_keys\": [\"$CELL_2\"], \"title\": null, \"caption\": null, \"shows_all_images\": true}]'::jsonb)")"
NEW_SLICE="$(owner "select '$CREATED_ROW'::jsonb ->> 'id'")"
expect_eq "the created slice is not the row it returned" \
  "Caller view|∅|journey|Caller|human|$SERVICE" \
  "$(owner "select concat_ws('|', title, coalesce(summary, '∅'), kind, actor, authorship, service_id)
            from public.slices where id = '$NEW_SLICE'")"
expect_eq "the created slice's slides did not land with it" "0:{$CELL_1},1:{$CELL_2}" \
  "$(owner "select string_agg(concat_ws(':', position, cell_ids), ',' order by position)
            from public.slides where slice_id = '$NEW_SLICE'")"

# ── 6. A create whose slides fail leaves no slice behind ───────────────────

expect_refused "a create naming a cell that is not an id was accepted" \
  "Slide 2 names a cell that is not an id" "$AUTHOR_CLAIMS" \
  "select public.create_slice('$SERVICE', 'Half made', null, 'journey', null,
     '[{\"cell_ids\": [\"$CELL_1\"]}, {\"cell_ids\": [\"not-an-id\"]}]'::jsonb)"
expect_eq "a create whose slides failed left a slice row behind" "0" "$(slices_titled 'Half made')"

expect_refused "a create whose image insert failed was accepted" \
  "slide_images_one_source" "$AUTHOR_CLAIMS" \
  "select public.create_slice('$SERVICE', 'Half made', null, 'journey', null,
     '[{\"cell_ids\": [\"$CELL_1\"], \"images\": [{\"position\": 0}]}]'::jsonb)"
expect_eq "a create whose image insert failed left a slice row behind" "0" "$(slices_titled 'Half made')"

# ── 7. A blank title is refused ─────────────────────────────────────────────

expect_refused "a create with a blank title was accepted" \
  "A slice needs a title" "$AUTHOR_CLAIMS" \
  "select public.create_slice('$SERVICE', '   ', null, 'journey', null, '[]'::jsonb)"

echo "replace_slides / restore_slides / create_slice: 9 claims hold — whole replace, inverse, two rollbacks, sentence refusals, whole create, no half-made slice, blank title, guard, whole restore."
