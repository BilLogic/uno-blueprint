import type { AgentSearchIndex } from '@/deploymentConfig'

/**
 * Turn a person's search question into a vector, with the person's OWN key.
 *
 * ── WHY THE KEY IS THE PERSON'S ───────────────────────────────────────────
 *
 * Meaning search needs two vectors in one space: the question, and every cell
 * already in the index. Those cannot come from one key, and this module only
 * ever does the first. The deployment's own bot, with a server-held
 * credential, embeds the cells; the template holds no such credential, builds
 * no index, and has no server to run one on. What it has is the key the person
 * is already chatting with, kept in their browser and sent to nobody but their
 * own provider — so the question's half of the pair is the half this code can
 * honestly do.
 *
 * The consequence is a hard constraint, not a preference: the model and the
 * size used here MUST be the ones the deployment's index was built with, which
 * is why every call takes an {@link AgentSearchIndex} entry rather than a model
 * name chosen locally. Mixing spaces does not degrade ranking gracefully — the
 * database is expected to raise `embedding model mismatch`.
 *
 * ── WHAT NEVER HAPPENS TO THE KEY ─────────────────────────────────────────
 *
 * It goes to the provider's own embedding endpoint and nowhere else: not to
 * the blueprint's database, not to the deployment, not into a log line, not
 * into the transcript, and not into a URL. Google's chat transport puts its
 * key in `?key=`, and this deliberately does NOT copy that: a query string is
 * carried in browser history, in proxy logs and in `Referer` headers, so the
 * key rides in `x-goog-api-key` instead. Changing that is a privacy
 * regression, and `embedQuestion.test.ts` fails if a key ever reaches a URL.
 *
 * ── EVERY FAILURE HERE IS AN EmbedQuestionError ────────────────────────────
 *
 * One exception type, thrown for every way this can fail — a rate limit, an
 * outage, a blocked host, a body that is not JSON, a vector of the wrong
 * width, a stall. That is not tidiness: the caller distinguishes "the meaning
 * arm could not run" (fall back to words and structure) from "the search
 * broke" (surface it), and the difference is THIS type. A `TypeError` escaping
 * from `fetch` because the person is offline would be read as the second and
 * would turn a bad connection into an empty blueprint.
 *
 * A caller's own abort is the one thing that passes through untouched: the
 * person pressed Stop, and a keyword search running after that is work nobody
 * asked for.
 */

/** The provider's own embedding endpoints. Header auth on both. */
const GOOGLE_BASE = 'https://generativelanguage.googleapis.com/v1beta'
const OPENAI_BASE = 'https://api.openai.com/v1'

/**
 * Google's task type for the QUESTION side of retrieval.
 *
 * Asymmetric on purpose: a question and the document that answers it are not
 * the same kind of text, and Gemini's embedding models place them accordingly.
 * The cells the deployment indexed must therefore have been embedded as
 * `RETRIEVAL_DOCUMENT` — the contract doc says so in as many words, because
 * getting this pair backwards produces an index that scores plausibly and
 * ranks badly, which is the failure nobody notices.
 */
const GOOGLE_TASK_TYPE = 'RETRIEVAL_QUERY'

/**
 * How long a question's embed may take before the words arm answers instead.
 *
 * There has to be a number. Without one, a provider endpoint that accepts the
 * connection and then stalls hangs the tool call for as long as the tab is
 * open, and the person sees a spinner rather than the keyword results they
 * could have had. Eight seconds is the same bound the deployment-side bot
 * puts on its own embed call.
 */
const TIMEOUT_MS = 8000

/**
 * A note on SCALE, because it is a real trap one layer down: Gemini's
 * embedding models return a normalized vector at their native width and an
 * UNNORMALIZED one when a smaller `outputDimensionality` is asked for — which
 * is every call here, since an index column is narrower than the model. That
 * is harmless for a function scoring with cosine distance, which normalizes as
 * it goes, and wrong for one scoring with inner product, which does not. The
 * contract doc tells a deployment to score with cosine for this reason.
 */

/**
 * A failed embed. Separate from a database error so the caller can tell "the
 * meaning arm could not run" from "the search itself broke" — the first falls
 * back to keyword and structural matching, the second surfaces.
 */
export class EmbedQuestionError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'EmbedQuestionError'
  }
}

/** Did this rejection come from the CALLER's abort rather than our own? */
function isCallerAbort(error: unknown, signal?: AbortSignal): boolean {
  return Boolean(signal?.aborted) && error instanceof Error && error.name === 'AbortError'
}

/**
 * Run one provider call under a deadline, with every failure normalized.
 *
 * The caller's signal and the deadline are two different aborts and must not
 * be confused: the first is the person pressing Stop and propagates, the
 * second is a stalled provider and becomes a fallback.
 */
async function attempt<T>(
  what: string,
  signal: AbortSignal | undefined,
  run: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  // Checked BEFORE anything is sent, because `addEventListener('abort')` never
  // fires on a signal that is already aborted — and one is reachable here: the
  // dispatcher awaits a scope read over the network between the loop's own
  // abort check and this call. Without this, Stop would still send the
  // person's key to their provider and then run the keyword search too.
  if (signal?.aborted) throw new DOMException('aborted', 'AbortError')
  const controller = new AbortController()
  const abort = () => controller.abort()
  signal?.addEventListener('abort', abort)
  let timedOut = false
  const timer = setTimeout(() => {
    timedOut = true
    controller.abort()
  }, TIMEOUT_MS)
  try {
    return await run(controller.signal)
  } catch (error) {
    if (isCallerAbort(error, signal)) throw error
    if (timedOut) throw new EmbedQuestionError(`${what} timed out`)
    if (error instanceof EmbedQuestionError) throw error
    // Offline, DNS, TLS, a blocked host, a body that is not JSON: the meaning
    // arm could not run, which is all the caller needs to know.
    throw new EmbedQuestionError(
      `${what} failed: ${error instanceof Error ? error.name : 'unknown error'}`,
    )
  } finally {
    clearTimeout(timer)
    signal?.removeEventListener('abort', abort)
  }
}

/**
 * The width check, and why it is here rather than left to the database.
 *
 * A deployment that lists 768 while its index column holds 1536 gets a
 * pgvector error naming the widths — which is neither the `embedding model
 * mismatch` the fallback watches for nor anything a person can act on, so the
 * whole search would fail on a configuration slip. Caught here, it is a failed
 * embed like any other and the words arm still answers.
 */
function checkedVector(
  what: string,
  values: number[] | undefined,
  index: AgentSearchIndex,
): number[] {
  if (!values?.length) throw new EmbedQuestionError(`${what} returned no vector`)
  if (values.length !== index.dimensions)
    throw new EmbedQuestionError(
      `${what} returned ${values.length} dimensions, not the ${index.dimensions} the index holds`,
    )
  return values
}

async function embedWithGoogle(
  question: string,
  index: AgentSearchIndex,
  apiKey: string,
  signal?: AbortSignal,
  fetcher: typeof fetch = fetch,
): Promise<number[]> {
  const what = 'google embed'
  return attempt(what, signal, async (inner) => {
    const response = await fetcher(
      `${GOOGLE_BASE}/models/${encodeURIComponent(index.model)}:embedContent`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          // NOT `?key=` — see the module header.
          'x-goog-api-key': apiKey,
        },
        body: JSON.stringify({
          model: `models/${index.model}`,
          content: { parts: [{ text: question }] },
          taskType: GOOGLE_TASK_TYPE,
          outputDimensionality: index.dimensions,
        }),
        signal: inner,
      },
    )
    if (!response.ok) throw new EmbedQuestionError(`${what} ${response.status}`)
    const body = (await response.json()) as { embedding?: { values?: number[] } }
    return checkedVector(what, body.embedding?.values, index)
  })
}

async function embedWithOpenAi(
  question: string,
  index: AgentSearchIndex,
  apiKey: string,
  signal?: AbortSignal,
  fetcher: typeof fetch = fetch,
): Promise<number[]> {
  const what = 'openai embed'
  return attempt(what, signal, async (inner) => {
    const response = await fetcher(`${OPENAI_BASE}/embeddings`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: index.model,
        input: question,
        // The listed size, always sent: OpenAI's default is the model's full
        // width, and an index built at 768 cannot score a 1536-wide question.
        dimensions: index.dimensions,
      }),
      signal: inner,
    })
    if (!response.ok) throw new EmbedQuestionError(`${what} ${response.status}`)
    const body = (await response.json()) as {
      data?: Array<{ embedding?: number[] }>
    }
    return checkedVector(what, body.data?.[0]?.embedding, index)
  })
}

/**
 * Embed one question for one index entry, or throw {@link EmbedQuestionError}.
 *
 * Anthropic never reaches here — it has no embedding model, so it is never a
 * listed index provider and `agentSearchPlan` does not offer the tool to a
 * person holding only an Anthropic key. The exhaustive switch keeps that true
 * by construction rather than by comment.
 */
export async function embedQuestion(input: {
  question: string
  index: AgentSearchIndex
  apiKey: string
  signal?: AbortSignal
  fetch?: typeof fetch
}): Promise<number[]> {
  const { question, index, apiKey, signal } = input
  if (!apiKey) throw new EmbedQuestionError('no key for the question')
  switch (index.provider) {
    case 'google':
      return embedWithGoogle(question, index, apiKey, signal, input.fetch)
    case 'openai':
      return embedWithOpenAi(question, index, apiKey, signal, input.fetch)
  }
}
