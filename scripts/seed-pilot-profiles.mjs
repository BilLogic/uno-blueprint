#!/usr/bin/env node
/**
 * Seed the three pilot profiles on a test project, re-runnably.
 *
 * A pilot business starts with three people who talk to Uno: the consultant
 * running it (a partner, may confirm), the business owner (staff, may
 * confirm), and an employee who knows one part of the work well (staff,
 * contributes only). Their first names and login emails are real people's,
 * so they live in a gitignored file, `supabase/pilot/profiles.json`, shaped
 * like the committed `supabase/pilot/profiles.example.json`.
 *
 * Login accounts are created by a person in the Supabase dashboard. This seed
 * creates each person's stakeholder row (or keeps the one already named so),
 * creates or updates their profile under a fixed id, and links the profile to
 * the login account with the same email when one exists. Running it again
 * changes nothing, except to link an account created since.
 *
 * Never part of `supabase/seed.sql`, which is the template's sample.
 *
 *   node scripts/seed-pilot-profiles.mjs --test-project            # the linked project
 *   node scripts/seed-pilot-profiles.mjs --test-project --print    # the SQL, for psql
 *   node scripts/seed-pilot-profiles.mjs --test-project --file <people.json>
 */
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseEnv } from 'node:util'

/** The three pilot people: who each is in the business, and whether they may confirm. */
export const PILOT_ROLES = {
  consultant: {
    profileId: 'b0000000-0000-4000-8000-000000000001',
    stakeholder: 'Consultant',
    kind: 'partner',
    mayConfirm: true,
  },
  owner: {
    profileId: 'b0000000-0000-4000-8000-000000000002',
    stakeholder: 'Business owner',
    kind: 'staff',
    mayConfirm: true,
  },
  expert: {
    profileId: 'b0000000-0000-4000-8000-000000000003',
    stakeholder: 'Subject-matter expert',
    kind: 'staff',
    mayConfirm: false,
  },
}

export const PEOPLE_FILE = 'supabase/pilot/profiles.json'

const literal = (value) => `'${String(value).replace(/'/g, "''")}'`

/** The people file, checked: every role present with a name and an email, nothing else. */
export function readPeople(people) {
  if (!people || typeof people !== 'object' || Array.isArray(people)) {
    throw new Error('the people file is an object keyed by role: consultant, owner, expert')
  }
  for (const key of Object.keys(people)) {
    if (!(key in PILOT_ROLES)) throw new Error(`the people file names an unknown role "${key}"`)
  }
  return Object.fromEntries(Object.keys(PILOT_ROLES).map((role) => {
    const person = people[role]
    const name = typeof person?.name === 'string' ? person.name.trim() : ''
    const email = typeof person?.email === 'string' ? person.email.trim() : ''
    if (!name) throw new Error(`the people file gives no name for the ${role}`)
    if (!/^[^\s@]+@[^\s@]+$/.test(email)) throw new Error(`the people file gives no email for the ${role}`)
    return [role, { name, email, stakeholder: person.stakeholder?.trim() || PILOT_ROLES[role].stakeholder }]
  }))
}

/** One idempotent transaction that seeds the profiles for these people. */
export function pilotProfilesSql(people) {
  const checked = readPeople(people)
  const statements = Object.entries(PILOT_ROLES).map(([role, spec]) => {
    const person = checked[role]
    return `-- the ${role}
insert into public.stakeholders (name, kind) values (${literal(person.stakeholder)}, ${literal(spec.kind)})
  on conflict (name) do nothing;
do $kind$ begin
  if not exists (select from public.stakeholders where name = ${literal(person.stakeholder)}
    and kind in (${role === 'owner' ? "'staff', 'team'" : literal(spec.kind)})) then
    raise exception 'the ${role} stakeholder kind does not fit the role';
  end if;
end $kind$;
insert into public.profiles (id, stakeholder_id, display_name, may_confirm)
  select ${literal(spec.profileId)}, s.id, ${literal(person.name)}, ${spec.mayConfirm}
    from public.stakeholders s where s.name = ${literal(person.stakeholder)}
  on conflict (id) do update set
    stakeholder_id = excluded.stakeholder_id,
    display_name = excluded.display_name;
update public.profiles p set user_id = u.id
  from auth.users u
 where p.id = ${literal(spec.profileId)}
   and lower(u.email) = lower(${literal(person.email)})
   and p.user_id is distinct from u.id;`
  })
  return `begin;\n${statements.join('\n')}\ncommit;\n`
}

export function assertTestTarget(env, linked, optedIn) {
  if (!optedIn || !env.SUPABASE_PROJECT_REF || env.SUPABASE_PROJECT_REF !== linked.trim()) {
    throw new Error('Refusing pilot seed: set SUPABASE_PROJECT_REF in .env to the linked test project and pass --test-project.')
  }
}

function main(argv) {
  // Check before reading the people file or producing SQL, even with --print.
  try {
    assertTestTarget(parseEnv(readFileSync('.env', 'utf8')),
      readFileSync('supabase/.temp/project-ref', 'utf8'), argv.includes('--test-project'))
  } catch {
    console.error('Refusing pilot seed: set SUPABASE_PROJECT_REF in .env to the linked test project and pass --test-project.')
    process.exit(2)
  }
  const at = argv.indexOf('--file')
  const file = resolve(process.cwd(), at >= 0 ? argv[at + 1] : PEOPLE_FILE)
  let people
  try {
    people = JSON.parse(readFileSync(file, 'utf8'))
  } catch (error) {
    console.error(`could not read ${file}: ${error.message}. Copy supabase/pilot/profiles.example.json there and fill it in.`)
    process.exit(2)
  }
  const sql = pilotProfilesSql(people)
  if (argv.includes('--print')) {
    process.stdout.write(sql)
    return
  }
  const dir = mkdtempSync(join(tmpdir(), 'pilot-profiles-'))
  try {
    writeFileSync(join(dir, 'seed.sql'), sql)
    execFileSync('supabase', ['db', 'query', '--linked', '--agent=no', '-f', join(dir, 'seed.sql')], { stdio: 'inherit' })
    console.log('seeded the three pilot profiles on the linked project')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)

if (isMain) main(process.argv.slice(2))
