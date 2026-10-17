#!/usr/bin/env python3
"""Where Uno starts, and the writes a session makes in a person's name.

`ub:init` runs this before anything else, so the entry state is read off the
business's database rather than guessed from the conversation.

Usage:
    python3 skills/init/scripts/init_state.py state [--profile <id>]
        # {entry, services, workspace_blueprint, profiles, changes_since_last_run}
    python3 skills/init/scripts/init_state.py contribute --profile <id> --cell <id> \
        --title <where it came from> [--note <their words>] [--proposed <cell content>]
        # evidence in the person's name, plus a suggested change when --proposed
    python3 skills/init/scripts/init_state.py approve --profile <id> --suggestion <id>
        # refused unless the profile may confirm
    python3 skills/init/scripts/init_state.py mark-run --profile <id>
        # stamps when Uno last ran with this person

Every command takes `--db-url <postgres url>`; without it the query runs on
the project this workspace is linked to (`supabase db query --linked`).
`contribute` and `approve` act AS the person: they set the request's claim to
the profile's login, so the database's own may-confirm check decides.

Entry state: `daily` when the database holds at least one service, else
`onboarding`. `workspace_blueprint` says whether `blueprint/*.json` exists
here, which is where an interrupted onboarding resumes.

Stdlib only. Exit 0 on success; 1 when the database refuses; 2 on bad usage.
"""
import argparse
import glob
import json
import subprocess
import sys


def literal(value):
    """A SQL string literal, or null."""
    if value is None:
        return "null"
    return "'" + str(value).replace("'", "''") + "'"


def entry_for(service_count):
    return "daily" if service_count > 0 else "onboarding"


STATE_SQL = """
select json_build_object(
  'services', (select coalesce(json_agg(json_build_object('id', s.id, 'name', s.name) order by s.name), '[]') from public.services s),
  'profiles', (select coalesce(json_agg(json_build_object(
      'id', p.id, 'name', p.display_name, 'stakeholder', st.name, 'kind', st.kind,
      'may_confirm', p.may_confirm, 'register', p.register,
      'last_run_at', p.last_run_at, 'can_sign_in', p.user_id is not null
    ) order by p.display_name), '[]')
    from public.profiles p join public.stakeholders st on st.id = p.stakeholder_id),
  'changes', {changes}
)::text
"""

CHANGES_SQL = """(select coalesce(json_agg(json_build_object(
      'at', c.at, 'author', c.author, 'fn', c.fn, 'label', c.label) order by c.at), '[]')
    from (select * from public.authoring_changes
           where at > coalesce((select last_run_at from public.profiles where id = {profile}), '-infinity')
           order by at desc limit 50) c)"""


def as_person(profile, statement):
    """Run `statement` with the request claim set to the profile's login."""
    return f"""
begin;
select set_config('request.jwt.claims',
  (select json_build_object('sub', p.user_id, 'role', 'authenticated')::text
     from public.profiles p where p.id = {literal(profile)} and p.user_id is not null),
  true);
select ({statement})::text;
commit;
"""


def run_sql(sql, db_url):
    if db_url:
        cmd = ["psql", "-X", "-q", "-At", "-v", "ON_ERROR_STOP=1", db_url, "-f", "-"]
        done = subprocess.run(cmd, input=sql, capture_output=True, text=True)
        if done.returncode != 0:
            raise RuntimeError(done.stderr.strip())
        lines = [line for line in done.stdout.splitlines() if line.strip()]
        return lines[-1] if lines else ""
    cmd = ["supabase", "db", "query", "--linked", "--agent=no", "-o", "json", sql]
    done = subprocess.run(cmd, capture_output=True, text=True)
    if done.returncode != 0:
        raise RuntimeError(done.stderr.strip())
    rows = json.loads(done.stdout)
    return list(rows[-1].values())[0] if rows else ""


def state(args):
    changes = CHANGES_SQL.format(profile=literal(args.profile)) if args.profile else "'[]'::json"
    found = json.loads(run_sql(STATE_SQL.format(changes=changes), args.db_url))
    return {
        "entry": entry_for(len(found["services"])),
        "services": found["services"],
        "workspace_blueprint": bool(glob.glob("blueprint/*.json")),
        "profiles": found["profiles"],
        "changes_since_last_run": found["changes"],
    }


def contribute(args):
    statement = (
        f"select public.record_contribution({literal(args.cell)}::uuid, {literal(args.title)}, "
        f"{literal(args.note)}, {literal(args.proposed)})"
    )
    return json.loads(run_sql(as_person(args.profile, statement), args.db_url))


def approve(args):
    statement = f"select public.approve_suggested_change({literal(args.suggestion)}::uuid)"
    return json.loads(run_sql(as_person(args.profile, statement), args.db_url))


def mark_run(args):
    sql = (
        f"update public.profiles set last_run_at = now() where id = {literal(args.profile)} "
        "returning json_build_object('id', id, 'last_run_at', last_run_at)::text;"
    )
    return json.loads(run_sql(sql, args.db_url))


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    sub = parser.add_subparsers(dest="command", required=True)
    for name in ("state", "contribute", "approve", "mark-run"):
        command = sub.add_parser(name)
        command.add_argument("--db-url")
        command.add_argument("--profile", required=name != "state")
        if name == "contribute":
            command.add_argument("--cell", required=True)
            command.add_argument("--title", required=True)
            command.add_argument("--note")
            command.add_argument("--proposed")
        if name == "approve":
            command.add_argument("--suggestion", required=True)
    args = parser.parse_args(argv)
    run = {"state": state, "contribute": contribute, "approve": approve, "mark-run": mark_run}[args.command]
    try:
        print(json.dumps(run(args), indent=2))
    except RuntimeError as refused:
        print(str(refused), file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
