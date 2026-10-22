import { expect, it } from 'vitest'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { judge } from '../generate-blueprint-validator.mjs'

it('a stale bundled rule names its file and the regeneration command in the swept tree', () => {
  const root = mkdtempSync(join(tmpdir(), 'validation-rules-'))
  try {
    mkdirSync(join(root, 'references'))
    mkdirSync(join(root, 'src/lib/agent/validation'), { recursive: true })
    writeFileSync(join(root, 'references/ir-schema.json'), '{"type":"object","description":"prose"}')
    writeFileSync(join(root, 'src/lib/agent/validation/ir-schema.generated.json'), '{}')
    expect(judge(['--check'], root).findings).toEqual(['src/lib/agent/validation/ir-schema.generated.json: bundled rules differ from references/ir-schema.json. Run npm run generate:validation-rules.'])
    expect(judge([], root).count).toBe(1)
    expect(judge(['--check'], root).findings).toBeUndefined()
  } finally { rmSync(root, { recursive: true, force: true }) }
})
