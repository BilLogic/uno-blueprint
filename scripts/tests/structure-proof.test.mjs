import { expect, it } from 'vitest'
import { judge } from '../run-structure-db.mjs'

it('a structure proof without the generated core names the missing file and rerun command', async () => {
  const result = await judge([])
  expect(result.findings).toEqual(['supabase/generated/portable-core.generated.sql: the seed-load STACK has no generated core. Run npm run test:structure:db.'])
})
