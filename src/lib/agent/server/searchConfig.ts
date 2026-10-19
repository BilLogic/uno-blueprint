import type { ToolContext } from '@/lib/agent/tools/definition'

/** The model and width must describe an index the deployment actually holds. */
export function serverSearchConfig(env: (name: string) => string | undefined): ToolContext['meaning'] {
  const apiKey = env('BLUEPRINT_EMBEDDING_API_KEY')
  const model = env('BLUEPRINT_EMBEDDING_MODEL')
  const dimensions = Number(env('BLUEPRINT_EMBEDDING_DIMENSIONS'))
  const provider = env('BLUEPRINT_EMBEDDING_PROVIDER') ?? 'openai'
  if (!apiKey || !model || !Number.isInteger(dimensions) || dimensions < 1 ||
    (provider !== 'openai' && provider !== 'google')) return null
  return { apiKey, index: { provider, model, dimensions } }
}
