#!/usr/bin/env node
/**
 * Render the generated sections of the agent-account document and hold it to
 * its sources. Which document, and where the ratchet baseline sits beside it,
 * come from `repo-config.mjs` — the generator is the same file in every
 * repository that carries it and the two docs trees agree on nothing.
 *
 * Usage — by path, because the npm alias is each repository's own and this
 * file is read from more than one. Where aliases exist they are
 * `agent-account` and `check:agent-account`.
 *
 *   node scripts/generate-agent-account.mjs           rewrite the generated sections
 *   node scripts/generate-agent-account.mjs --record  …and record the ratchet baseline
 *   node scripts/generate-agent-account.mjs --check   fail if the sections or the
 *                                                     ratchet have drifted
 *
 * The schema section comes from `public.schema_comments()` on a LIVE
 * database under the anon key, because pg_description is the source and
 * PostgREST exposes the catalog to no role except through that function.
 * Which relations an agent can read is probed the same way: a bare select
 * as anon.
 *
 * The relation inventory is DECLARED and then CORRECTED. `schemaDeclaration`
 * says where the declaration comes from — the deployment's own root first,
 * this package's copy last and only as a default — and every name in it is
 * then put to the database: a bare select says whether the relation is
 * readable, sealed, or simply not there, and a one-row select says which
 * columns it actually carries. Only the answers are rendered. So a deployment
 * whose schema legitimately differs from this package's gets an account of ITS
 * database, and running this on a red check cannot make the document less true
 * than it was.
 *
 * A relation the anon key is refused but a signed-in session reads is the
 * one answer a bare select cannot complete: it says "sealed" and no more. Its
 * columns come from `signedIn` in `repo-config.mjs`, the running repository's
 * own answer, from whatever it can read without a session — its migration
 * series, say — so no key beyond the anon one is needed. Its comments come from `schema_comments()` like every
 * other relation's. `signedIn: null` keeps such a relation a name in the
 * sealed list, which is all this generator could say before.
 *
 * The one-row select is how a column that carries no comment stays visible. It
 * returns real data; nothing but the key names is kept, and the key it uses is
 * the same one the browser holds.
 *
 * With no database configured this writes nothing, registers nothing, and
 * exits 0 — the template's bundled sample is the no-database path, and a
 * check that always skipped would read as an answer. It SAYS SO, though: the
 * sentence it printed was an ordinary log line among the other ordinary log
 * lines, so a `--check` run that held the document to nothing at all was
 * green in exactly the way a run that held it to a live catalog is. The skip
 * is correct and it is now also visible. Same stance as
 * `check-target-schema.mjs`, which asks a live target whether it was
 * migrated. A deployment that has a database runs this against it and
 * supplies the generated account as `agent.references.blueprint` on its
 * deployment config; the template's reference loader never imports that
 * file by path.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  classifyRelation,
  evaluate,
  entityKinds,
  reconcile,
  schemaDeclaration,
  tableColumns,
  vocabularySource,
} from './agent-account.mjs'
import { parseEnvFile } from './check-target-schema.mjs'
import { repoConfig } from './repo-config.mjs'
import { unverified } from './sweep.mjs'

/** The tree this script runs in: the working directory — never this file's location; `sweep.mjs` says why. */
const REPO_ROOT = process.cwd()
/** This repository's own document and baseline paths, and its signed-in source — see `repoConfig.agentAccount`. */
const PATHS = repoConfig.agentAccount
const DOC = resolve(REPO_ROOT, PATHS.document)
const BASELINE = resolve(REPO_ROOT, PATHS.baseline)

const PLACEHOLDER_KEY = 'your-anon-key'
const PLACEHOLDER_URL = 'YOUR_PROJECT'
const TIMEOUT_MS = 15_000

/**
 * The live database, or `null` when this checkout has none configured.
 *
 * Missing variables, the example-file placeholder key, and a URL that
 * still names `YOUR_PROJECT` are all the no-database path: the app runs
 * its bundled sample, and this generator has nothing to read comments from.
 *
 * @param {NodeJS.ProcessEnv} [env]
 * @param {Record<string, string>} [dotenv]
 * @returns {{ url: string, key: string } | null}
 */
export function credentials(env = process.env, dotenv = {}) {
  const url = env.VITE_SUPABASE_URL ?? dotenv.VITE_SUPABASE_URL
  const key = env.VITE_SUPABASE_ANON_KEY ?? dotenv.VITE_SUPABASE_ANON_KEY
  if (!url || !key) return null
  if (key === PLACEHOLDER_KEY) return null
  if (url.includes(PLACEHOLDER_URL)) return null
  return { url: url.replace(/\/$/, ''), key }
}

/**
 * One PostgREST call as the anon key.
 *
 * @param {string} url
 * @param {string} key
 * @param {string} path
 * @param {RequestInit} [init]
 */
export async function rest(url, key, path, init = {}) {
  const response = await fetch(`${url}/rest/v1/${path}`, {
    ...init,
    signal: AbortSignal.timeout(TIMEOUT_MS),
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      ...init.headers,
    },
  })
  const text = await response.text()
  let body = null
  try {
    body = JSON.parse(text)
  } catch {
    body = text
  }
  return { status: response.status, ok: response.ok, body }
}

/** @param {unknown} body */
export const postgrest = (body) =>
  body && typeof body === 'object' && body.message
    ? `${body.code ?? 'error'}: ${body.message}${body.details ? ` — ${body.details}` : ''}`
    : JSON.stringify(body).slice(0, 300)

/**
 * `.env` values, ignoring a missing file — the environment may carry them.
 *
 * @returns {Record<string, string>}
 */
function readDotenv() {
  try {
    return parseEnvFile(readFileSync(resolve(REPO_ROOT, '.env'), 'utf8'))
  } catch {
    return {}
  }
}

/**
 * What the database says about every relation the declaration or the catalog
 * names.
 *
 * One bare select per relation answers whether it is there at all, and a
 * one-row select answers which columns it carries. A relation that holds no
 * rows cannot answer the second question that way, so each declared column is
 * put to it on its own: PostgREST answers `42703` for a column that is not
 * there and 200 for one that is. Commented columns need no probe — a comment
 * hangs off an attribute that exists — and `reconcile` adds them. Only the
 * row's keys carry the relation's own column order, so only that path claims
 * `order: 'table'`; the rest is sorted where it is rendered.
 *
 * @param {{ url: string, key: string }} target
 * @param {Map<string, string[]>} declared
 * @param {{ relation: string, column_name: string | null }[]} comments
 * @param {Map<string, string[]>} signedInColumns
 * @returns {Promise<Map<string, { status: string, columns?: string[], order?: 'table' }>>}
 */
async function probeRelations(target, declared, comments, signedInColumns) {
  const names = new Set([...declared.keys(), ...comments.map((row) => row.relation), ...signedInColumns.keys()])
  const probed = new Map()
  for (const name of [...names].sort()) {
    const probe = await rest(target.url, target.key, `${name}?select=*&limit=1`)
    const status = classifyRelation(probe)
    if (status === 'unknown') {
      throw new Error(
        `${target.url} answered ${probe.status} for ${name} — ${postgrest(probe.body)}. ` +
          `An account is only worth rendering from answers it understands.`,
      )
    }
    if (status !== 'readable') {
      probed.set(name, { status })
      continue
    }
    const row = Array.isArray(probe.body) ? probe.body[0] : null
    if (row) {
      probed.set(name, { status, columns: Object.keys(row), order: 'table' })
      continue
    }
    const columns = []
    for (const column of new Set([...(declared.get(name) ?? []), ...(signedInColumns.get(name) ?? [])])) {
      const held = await rest(target.url, target.key, `${name}?select=${column}&limit=0`)
      if (held.ok) columns.push(column)
    }
    probed.set(name, { status, columns })
  }
  return probed
}

/**
 * The columns of each signed-in-only relation, from the running repository's
 * own source, or an empty map when it names none.
 *
 * @param {null | ((input: { root: string, declared: Map<string, string[]> }) => Map<string, string[]> | Promise<Map<string, string[]>>)} source
 * @param {Map<string, string[]>} declared
 * @param {string} [root]
 * @returns {Promise<Map<string, string[]>>}
 */
export async function resolveSignedIn(source, declared, root = REPO_ROOT) {
  if (source === null) return new Map()
  if (typeof source !== 'function') {
    throw new Error(
      'repo-config.mjs agentAccount.signedIn is neither null nor a function — it names this ' +
        'repository\'s signed-in-only relations and their columns, or says it has none.',
    )
  }
  const answer = await source({ root, declared })
  if (!(answer instanceof Map) || [...answer.values()].some((columns) => !Array.isArray(columns))) {
    throw new Error('repo-config.mjs agentAccount.signedIn must answer a Map of relation name to column names.')
  }
  return answer
}

async function main() {
  const check = process.argv.includes('--check')
  const record = process.argv.includes('--record')
  const target = credentials(process.env, readDotenv())
  if (!target) {
    unverified(
      check ? 'the agent account against its catalog' : 'the agent account',
      'no database is configured, so nothing was read: not the catalog\'s column ' +
        'comments, not which relations the anon role can actually select, and not ' +
        'the prohibition ratchet. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY ' +
        '(not the example placeholders) to render an account from a connected catalog.',
    )
    console.log(
      'no database configured — nothing to generate. The agent reference list stays ' +
        'this package\'s own.',
    )
    return
  }

  const vocabulary = vocabularySource(REPO_ROOT, existsSync)
  const declaration = schemaDeclaration(REPO_ROOT, existsSync)
  const kinds = entityKinds(readFileSync(vocabulary.path, 'utf8'))
  const declared = tableColumns(readFileSync(declaration.path, 'utf8'))

  const comments = await rest(target.url, target.key, 'rpc/schema_comments', { method: 'POST', body: '{}' })
  if (!comments.ok || !Array.isArray(comments.body) || comments.body.length === 0) {
    throw new Error(
      `could not read the catalog's comments from ${target.url} — ${postgrest(comments.body)}. ` +
        `public.schema_comments() is the route; nothing here is rendered from memory.`,
    )
  }

  const signedInColumns = await resolveSignedIn(PATHS.signedIn, declared)
  const probed = await probeRelations(target, declared, comments.body, signedInColumns)
  const { columns, readable, signedIn, notes } = reconcile({ declared, probed, comments: comments.body, signedInColumns })

  const doc = readFileSync(DOC, 'utf8')
  const baseline = existsSync(BASELINE) ? JSON.parse(readFileSync(BASELINE, 'utf8')) : null
  const { next, current, failures } = evaluate({
    doc,
    kinds,
    sources: { columns, comments: comments.body, readable, signedIn },
    baseline,
    check,
    record,
    paths: PATHS,
  })

  if (!check) {
    writeFileSync(DOC, next)
    console.log(`wrote ${DOC.slice(REPO_ROOT.length + 1)}`)
  }

  if (record) {
    writeFileSync(BASELINE, `${JSON.stringify(current, null, 2)}\n`)
    console.log(`recorded ${BASELINE.slice(REPO_ROOT.length + 1)}`)
  }

  console.log(
    `vocabulary: ${kinds.length} kinds from the ${vocabulary.owner}'s panelTerms.ts · ` +
      `schema: ${readable.size} readable relation(s) and ${signedIn.size} signed-in only, ` +
      `of ${columns.size}, declared by the ` +
      `${declaration.owner} · column comments: ${current.columnComments.described} of ` +
      `${current.columnComments.of} · prohibitions: ${current.prohibitions}`,
  )
  for (const note of notes) console.log(`  · ${note}`)
  if (notes.length > 0) {
    console.log(
      `  The account above is this database's either way — these are the lines to fold into ` +
        `deployment/types/database.ts, so the next run has fewer relations to ask about.`,
    )
  }
  for (const failure of failures) console.error(`::error::agent account — ${failure}`)
  if (failures.length > 0) process.exitCode = 1
  else console.log('ok — the account agrees with its sources and the ratchet holds')
}

const isMain =
  process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)

if (isMain) {
  main().catch((error) => {
    console.error(`::error::agent account: ${error.message}`)
    process.exitCode = 1
  })
}
