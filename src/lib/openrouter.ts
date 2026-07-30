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

const REQUEST_TIMEOUT_MS = 30_000

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
