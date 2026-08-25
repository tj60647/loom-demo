/**
 * ONE LINE PER EVENT, SHAPED TO BE QUERIED RATHER THAN READ.
 *
 * TJ, 2026-08-24, after a student could not sign in and the logs could not say
 * who: "we need better logging then, correct? overall all the logs seem sparse
 * and difficult to interpret."
 *
 * WHAT WAS SPARSE ABOUT THEM. Surveyed the same day: 49 `console` calls across
 * src/, 40 of them carrying an ad-hoc `[tag]` prefix, and every one of them
 * about a FAILURE. Nothing recorded a decision the system made while working
 * exactly as designed — which is most of what you want to know afterwards. A
 * refused sign-in is not an error; it is the gate doing its job, and it left no
 * trace at all.
 *
 * The other half was shape. Free prose cannot be filtered: "who was refused
 * yesterday" is a question about fields, and `console.warn("[auth] refused: " +
 * why)` has no fields. Vercel attaches console output to the request that
 * produced it (each row in `vercel logs --json` carries its own `logs[]`), so a
 * line that arrives as JSON becomes something you can search on rather than
 * something you have to read.
 *
 * WHAT THIS IS NOT. Not pino, not winston. In a serverless function the process
 * is gone before a transport is worth configuring, and the platform already
 * does collection, correlation and retention. All that is missing is the shape,
 * which is twenty lines.
 *
 * Not durable either. Vendor runtime logs age out, and anything you will want
 * next week — who was refused, who was invited, who was removed — belongs in a
 * row you own. This is the operational half; see the audit records for the
 * other.
 */

export type LogLevel = "info" | "warn" | "error"

/**
 * The fields every line carries, so a query can rely on them existing.
 *
 * `event` is a dotted name — `auth.refused`, `ingest.failed` — for the same
 * reason `graph_event.kind` is (`concept.create`, `passage.capture`): a
 * vocabulary you can group by beats a sentence you have to match.
 */
export type LogFields = Record<string, unknown>

/**
 * WHY LEVELS ARE DEFINED HERE RATHER THAN LEFT TO TASTE. The 49 calls this
 * replaces used 28 warns and 21 errors more or less interchangeably, which
 * makes the level useless as a filter — the first thing anyone reaches for.
 *
 *   error  a person has to act; something is broken and stays broken
 *   warn   handled and degraded — a fallback ran, a retry saved it
 *   info   a business event worth counting, working as designed
 */
const method: Record<LogLevel, (line: string) => void> = {
  info: (line) => console.log(line),
  warn: (line) => console.warn(line),
  error: (line) => console.error(line),
}

/**
 * An Error is not JSON — `JSON.stringify(new Error("x"))` is `{}`, which is the
 * single most common way a log line ends up saying nothing. Unwrapped here so
 * a caller can pass the caught thing directly and still get a message.
 */
function plain(value: unknown): unknown {
  if (value instanceof Error) {
    return { name: value.name, message: value.message, stack: value.stack?.split("\n").slice(0, 4) }
  }
  return value
}

/**
 * Emit one line.
 *
 * NEVER THROWS. A logger that can fail is a logger that takes down the path it
 * was watching — the same reason `recordEvent` swallows its own errors
 * (src/lib/graphEvent.ts). A circular structure in a caller's fields is a bug
 * worth knowing about, not worth a 500.
 */
export function log(level: LogLevel, event: string, fields: LogFields = {}): void {
  try {
    const shaped: Record<string, unknown> = { at: new Date().toISOString(), level, event }
    for (const [key, value] of Object.entries(fields)) shaped[key] = plain(value)
    method[level](JSON.stringify(shaped))
  } catch {
    // Last resort: say what happened without the fields that broke it, so the
    // event is still on the record.
    try {
      method[level](JSON.stringify({ at: new Date().toISOString(), level, event, fieldsUnserializable: true }))
    } catch {
      /* nothing left to try, and a log line is not worth an exception */
    }
  }
}

export const logInfo = (event: string, fields?: LogFields) => log("info", event, fields)
export const logWarn = (event: string, fields?: LogFields) => log("warn", event, fields)
export const logError = (event: string, fields?: LogFields) => log("error", event, fields)
