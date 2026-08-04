/**
 * Minimal OpenRouter chat-completions client.
 *
 * Deliberately tiny and dependency-free: the only model call Loom makes is the
 * extraction-quality judge in `readingScore.ts`, and that call must be optional
 * — every caller has to keep working when no key is configured. So this module
 * never throws on a missing key; `isJudgeConfigured()` reports availability and
 * callers record the result as unscored instead.
 *
 * Env:
 *   OPENROUTER_API_KEY  required to enable the judge; absent = judging is off
 *   LOOM_JUDGE_MODEL    optional model override (see DEFAULT_JUDGE_MODEL)
 */

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"

// Opus, deliberately. A cheaper tier looks tempting because the output is just
// three fields, but the judge is the only thing in the pipeline that catches
// what the deterministic checks structurally cannot — sparse OCR substitutions
// ("chat" for "that"), and reading order. Those are exactly the judgements a
// weaker model gets wrong, and a judge that misses them is worse than no judge,
// because it converts an unscored dimension into a confident wrong number.
// Ruled 2026-07-29: do not downgrade this to Haiku.
const DEFAULT_JUDGE_MODEL = "anthropic/claude-opus-5"

// Milliseconds. Both of these are passed straight to AbortSignal.timeout(), and
// both were off by a factor of a thousand — this one at `30` aborted every judge
// call after 30ms, which is before a TLS handshake completes, so the judge had
// silently stopped running and every score was heuristics-only with `structure`
// abstaining. Measured, not deduced: a live call failed at 35ms with
// TimeoutError. Keep the `_000` when editing either of these.
const REQUEST_TIMEOUT_MS = 30_000

/**
 * Transcribing an image takes materially longer than judging a page of text —
 * the model is reading, not skimming — so this gets its own, longer budget
 * rather than quietly inheriting the judge's.
 *
 * Set above the slowest reading actually observed (`qwen/qwen3.8-max` at 184s on
 * a full page) rather than at a round number, because the point of the cap is to
 * stop a hung reader from taking the whole request down, not to decide which
 * readers are worth their latency — that is open item 2, and TJ's call. It sits
 * under the 300s `maxDuration` on the admin page so that a stuck reader is
 * dropped by this timeout and the panel still returns, instead of the platform
 * killing the function and losing the readers that did answer.
 */
const VISION_TIMEOUT_MS = 240_000

export function isJudgeConfigured() {
  return Boolean(process.env.OPENROUTER_API_KEY)
}

export function judgeModelName() {
  return process.env.LOOM_JUDGE_MODEL || DEFAULT_JUDGE_MODEL
}

type ChatCompletionResponse = {
  choices?: { message?: { content?: string } }[]
}

/**
 * Sends one system+user exchange and returns the assistant text.
 * Throws on a missing key, transport error, non-2xx, or empty completion — the
 * caller decides whether that is fatal (it isn't, for scoring).
 */
export async function requestChatCompletion({
  system,
  message,
  model = judgeModelName(),
  maxTokens = 500,
}: {
  system: string
  message: string
  model?: string
  maxTokens?: number
}): Promise<string> {
  const apiKey = process.env.OPENROUTER_API_KEY
  if (!apiKey) throw new Error("OPENROUTER_API_KEY is not set")

  const response = await fetch(OPENROUTER_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      // Deterministic-as-possible: the same PDF should not drift between runs.
      temperature: 0,
      max_tokens: maxTokens,
      messages: [
        { role: "system", content: system },
        { role: "user", content: message },
      ],
    }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  })

  if (!response.ok) {
    const detail = await response.text().catch(() => "")
    throw new Error(`OpenRouter ${response.status}: ${detail.slice(0, 200)}`)
  }

  const payload = (await response.json()) as ChatCompletionResponse
  const content = payload.choices?.[0]?.message?.content
  if (!content) throw new Error("OpenRouter returned an empty completion")
  return content
}

/**
 * The readers who transcribe a damaged region, one call each.
 *
 * Chosen for capability, not price. A transcription that is cheap and wrong
 * costs more than one that is dear and right: it becomes the text of a course
 * reading, gets quoted by a student, and is discovered — if ever — long after
 * the crop has been forgotten. Reading small type in a low-resolution
 * photograph is close to the hardest thing a vision model is asked to do, and
 * it is exactly where a weak model degrades into confident invention.
 *
 * Four DIFFERENT frontier families rather than one model sampled four times.
 * That distinction is the whole value of the vote: the same model asked twice
 * makes the same mistake twice, so its agreement measures sampling noise rather
 * than independent confirmation. These four were trained separately, so when
 * they agree on a word it is because the word is legible.
 *
 * Because independence comes from the models rather than from sampling, NO
 * temperature is sent — which also makes a run repeatable, and means a
 * disagreement always reflects a real difference of reading rather than a
 * dice roll.
 *
 * Every entry is verified against the OpenRouter registry on three points, and
 * all three are easy to get wrong from the model name alone:
 *
 *   1. `text+image+file->text`. Several plausible-looking models are image
 *      GENERATORS (`->text+image`) — Nano Banana and GPT-5 Image among them —
 *      and would be the wrong tool entirely.
 *   2. Whether `temperature` is accepted. It is not universal:
 *      `openai/gpt-5.4-pro` and `anthropic/claude-sonnet-5` reject it, and a
 *      request carrying it fails.
 *   3. `max_tokens` vs `max_completion_tokens`. The OpenAI pro family and
 *      several Anthropic models take the latter; sending the wrong spelling
 *      fails. This cannot be inferred and so is recorded per model.
 *
 * Re-check all three against the registry when changing this list.
 */
export const VISION_READERS = [
  // Anthropic frontier — registry createdAt 2026-07-24, the newest here.
  { model: "anthropic/claude-opus-5", tokenParam: "max_completion_tokens" as const },
  // Alibaba's frontier. Replaced openai/gpt-5.6-sol-pro, which was measured on
  // a real region drawing 20,069 input tokens against the others' ~1,200 for the
  // same image, taking 158s to their 24-44s, and costing $0.585 of a $0.74
  // region — 79% of the spend for the same 0.3% garble as the cheapest reader.
  { model: "qwen/qwen3.8-max", tokenParam: "max_tokens" as const },
  // Google's newest available multimodal. Note there is no 3.6 Pro in the
  // registry — the Pro line stops at the 3.1 preview, which is four months
  // older, so the newer Flash is the better reader despite the tier name.
  { model: "google/gemini-3.6-flash", tokenParam: "max_tokens" as const },
  // A fourth family, deliberately outside the big three so its mistakes are
  // uncorrelated with theirs — which is the only reason a panel beats one good
  // reader.
  { model: "x-ai/grok-4.5", tokenParam: "max_tokens" as const },
  // Fifth, and the reason the count is odd: the vote is decided by a majority,
  // and an even panel can tie. Measured on a real region at $0.0078 and 33s
  // against Grok's $0.0070 and 25s, with 0.7% garble against 0.3% — and it
  // returned the longest transcription of the five, which counts for something
  // on a task where running out of room is a real failure mode.
  { model: "thinkingmachines/inkling-small", tokenParam: "max_tokens" as const },
]

/**
 * The same exchange, with an image attached.
 *
 * `maxTokens` defaults far higher than the text path's, and higher again than
 * the obvious guess. Measured: at 4,000 the two reasoning models in the panel
 * both ran out mid-sentence on a newspaper column and returned unterminated
 * JSON, which parsed as nothing — so the panel silently lost half its readers
 * and the vote quietly weakened. A reasoning model's budget also has to cover
 * its reasoning tokens, which is why the slowest reader returned the least text.
 */
export async function requestVisionCompletion({
  system,
  message,
  imageBase64,
  imageType = "image/png",
  model = judgeModelName(),
  maxTokens = 16000,
  tokenParam = "max_tokens",
}: {
  system: string
  message: string
  imageBase64: string
  imageType?: string
  model?: string
  maxTokens?: number
  /** Which spelling this model accepts. See VISION_READERS. */
  tokenParam?: "max_tokens" | "max_completion_tokens"
}): Promise<{
  text: string
  usage: { promptTokens: number | null; completionTokens: number | null; costUsd: number | null }
}> {
  const apiKey = process.env.OPENROUTER_API_KEY
  if (!apiKey) throw new Error("OPENROUTER_API_KEY is not set")

  const response = await fetch(OPENROUTER_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      // No temperature: see VISION_READERS. Sending it would fail against
      // several vision models and would buy nothing the panel does not already
      // provide.
      [tokenParam]: maxTokens,
      // Ask the API what the call actually cost rather than deriving it from a
      // price table here. Prices move, models are re-tiered, and a table in this
      // repo would quietly report yesterday's number as today's fact.
      usage: { include: true },
      messages: [
        { role: "system", content: system },
        {
          role: "user",
          content: [
            { type: "text", text: message },
            { type: "image_url", image_url: { url: `data:${imageType};base64,${imageBase64}` } },
          ],
        },
      ],
    }),
    signal: AbortSignal.timeout(VISION_TIMEOUT_MS),
  })

  if (!response.ok) {
    const detail = await response.text().catch(() => "")
    throw new Error(`OpenRouter ${model} ${response.status}: ${detail.slice(0, 200)}`)
  }

  const payload = (await response.json()) as ChatCompletionResponse & {
    usage?: { prompt_tokens?: number; completion_tokens?: number; cost?: number }
  }
  const content = payload.choices?.[0]?.message?.content
  if (!content) throw new Error(`OpenRouter ${model} returned an empty completion`)

  return {
    text: content,
    usage: {
      promptTokens: payload.usage?.prompt_tokens ?? null,
      completionTokens: payload.usage?.completion_tokens ?? null,
      // Null rather than zero when the API does not report it: a missing cost
      // is not a free call, and a total that quietly treats it as one would
      // understate what this feature spends.
      costUsd: payload.usage?.cost ?? null,
    },
  }
}
