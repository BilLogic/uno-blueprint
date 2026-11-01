#!/usr/bin/env node
/** Snapshot the derived write schemas inside the transactional gateway migration. */
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { buildToolServer } from './build-tool-server.mjs'
await buildToolServer()
const { serverWriteContracts, SERVICE_REQUIRED } = await import(pathToFileURL(resolve('supabase/functions/uno-tools/server.generated.js')))
const file = 'supabase/migrations/21000326000000_a_slice_may_cross_services_and_be_shared_by_a_link.sql'
const before = readFileSync(file, 'utf8')
const ir = JSON.parse(readFileSync('references/ir-schema.json', 'utf8'))
const contracts = serverWriteContracts()
function closeObjects(schema) {
  if (!schema || typeof schema !== 'object') return
  if (schema.type === 'object' && schema.properties) schema.additionalProperties = false
  for (const value of Object.values(schema)) if (value && typeof value === 'object') {
    if (Array.isArray(value)) value.forEach(closeObjects)
    else closeObjects(value)
  }
}
for (const contract of Object.values(contracts)) {
  closeObjects(contract)
  if (contract.properties.lane_role) contract.properties.lane_role = { ...contract.properties.lane_role, enum: ir.$defs.lane.properties.role.enum.filter(value => value !== null) }
  if (contract.properties.at_position) Object.assign(contract.properties.at_position, { type: ir.$defs.lane.properties.row.type, minimum: ir.$defs.lane.properties.row.minimum })
  if (contract.properties.step_count) Object.assign(contract.properties.step_count, { type: 'integer', minimum: ir.$defs.scenario.properties.steps.minItems })
}
const block = `-- BEGIN DERIVED WRITE CONTRACTS\ncreate or replace function public.agent_write_contracts() returns jsonb\nlanguage sql immutable set search_path = pg_catalog, pg_temp\nas $contracts$ select '${JSON.stringify(contracts).replaceAll("'", "''")}'::jsonb $contracts$;\n-- END DERIVED WRITE CONTRACTS`
let after = before.replace(/-- BEGIN DERIVED WRITE CONTRACTS[\s\S]*?-- END DERIVED WRITE CONTRACTS/, block)
const refusal = `-- BEGIN DERIVED SERVICE REFUSAL
create or replace function public.agent_service_required_message() returns text
language sql immutable set search_path = pg_catalog, pg_temp
as $message$ select '${SERVICE_REQUIRED.replaceAll("'", "''")}'::text $message$;
revoke all on function public.agent_service_required_message() from public;
-- END DERIVED SERVICE REFUSAL`
after = after.replace(/-- BEGIN DERIVED SERVICE REFUSAL[\s\S]*?-- END DERIVED SERVICE REFUSAL/, refusal)
if (process.argv.includes('--check')) {
  if (before !== after) { console.error('The gateway write contracts differ from the tool definitions.'); process.exitCode = 1 }
} else writeFileSync(file, after)
