import { createCellSearchIndexer } from '../uno-tools/server.generated.js'

const configured = Deno.env.get('BLUEPRINT_EMBEDDING_PROVIDER') === 'google'
  && Deno.env.get('BLUEPRINT_EMBEDDING_MODEL') === 'gemini-embedding-001'
  && Deno.env.get('BLUEPRINT_EMBEDDING_DIMENSIONS') === '768'

Deno.serve(createCellSearchIndexer({
  url: Deno.env.get('SUPABASE_URL')!,
  publishableKey: Deno.env.get('SUPABASE_ANON_KEY')!,
  apiKey: configured ? Deno.env.get('BLUEPRINT_EMBEDDING_API_KEY') : undefined,
}))
