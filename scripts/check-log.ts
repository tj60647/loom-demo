/**
 * Assertions for src/lib/log.ts — the shape every operational line carries.
 *
 * A plain script rather than a suite, following the `scripts/check-*` idiom
 * already here: run it, read the output, non-zero exit on failure.
 *
 *   npx tsx scripts/check-log.ts
 *
 * WHAT IS WORTH ASSERTING is not that logging logs. It is the three ways a log
 * line silently says nothing: a caught Error stringifying to `{}`, a circular
 * structure throwing inside the logger and taking the request with it, and a
 * level that does not reach the stream a reader filters on.
 */
import { clamp, CLAMP, log, logError, logInfo, logWarn } from "../src/lib/log"

let failures = 0

function check(name: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) failures += 1
  console.log(
    `${ok ? "  ok  " : "  FAIL"}  ${name}` +
      (ok ? "" : `\n          got  ${JSON.stringify(got)}\n          want ${JSON.stringify(want)}`)
  )
}

/** Capture what one call writes, and to which stream. */
function capture(run: () => void): { stream: string; line: Record<string, unknown> | null } {
  const real = { log: console.log, warn: console.warn, error: console.error }
  let stream = "none"
  let raw = ""
  console.log = (line: string) => { stream = "log"; raw = line }
  console.warn = (line: string) => { stream = "warn"; raw = line }
  console.error = (line: string) => { stream = "error"; raw = line }
  try {
    run()
  } finally {
    console.log = real.log
    console.warn = real.warn
    console.error = real.error
  }
  let line: Record<string, unknown> | null = null
  try {
    line = JSON.parse(raw) as Record<string, unknown>
  } catch {
    line = null
  }
  return { stream, line }
}

console.log("\nlog — every line is one JSON object with the same three keys")
const basic = capture(() => logInfo("auth.allowed", { email: "a@b.edu" }))
check("it parses as JSON", basic.line !== null, true)
check("it names the event", basic.line?.event, "auth.allowed")
check("it carries the level", basic.line?.level, "info")
check("it carries a timestamp", typeof basic.line?.at === "string", true)
check("the caller's fields survive", basic.line?.email, "a@b.edu")

console.log("\nlevels reach the stream a reader filters on")
check("info goes to log", capture(() => logInfo("x")).stream, "log")
check("warn goes to warn", capture(() => logWarn("x")).stream, "warn")
check("error goes to error", capture(() => logError("x")).stream, "error")

console.log("\nan Error says something")
/**
 * `JSON.stringify(new Error("boom"))` is `{}` — the single most common way a
 * log line ends up empty at exactly the moment it mattered.
 */
const thrown = capture(() => logError("ingest.failed", { cause: new Error("boom") }))
const cause = thrown.line?.cause as { message?: string; name?: string; stack?: unknown } | undefined
check("the message survives", cause?.message, "boom")
check("the name survives", cause?.name, "Error")
check("a few frames come with it", Array.isArray(cause?.stack), true)

console.log("\nthe logger never takes down the path it was watching")
/**
 * A circular structure throws inside JSON.stringify. The line must degrade to
 * the event alone rather than to an exception on a request that was otherwise
 * fine — the same rule recordEvent follows in src/lib/graphEvent.ts.
 */
const circular: Record<string, unknown> = { name: "loop" }
circular.self = circular
const survived = capture(() => log("warn", "weird.fields", { circular }))
check("it still emits the event", survived.line?.event, "weird.fields")
check("and says the fields were the problem", survived.line?.fieldsUnserializable, true)
check("on the right stream", survived.stream, "warn")

console.log("\na caller cannot spend the three reserved keys")
/**
 * The quietest failure of the lot: a field named `event` overwrote the event
 * name, so the line stayed valid JSON, plausible on screen, and unfindable by
 * the name it was logged under. The caller's value is kept under a prefix
 * rather than dropped — it was worth passing, it is just not the frame.
 * Copilot found this on #35.
 */
const collided = capture(() =>
  logWarn("ingest.failed", { event: "upload", level: "debug", at: "yesterday", file: "a.pdf" })
)
check("the event name is the logger's", collided.line?.event, "ingest.failed")
check("the level is the logger's", collided.line?.level, "warn")
check("the timestamp is the logger's", (collided.line?.at as string)?.startsWith("20"), true)
check("the caller's event survives, prefixed", collided.line?.caller_event, "upload")
check("so does their level", collided.line?.caller_level, "debug")
check("so does their timestamp", collided.line?.caller_at, "yesterday")
check("and their ordinary fields are untouched", collided.line?.file, "a.pdf")

console.log("\nforeign text is cut before it becomes a line")
/**
 * An upstream that answers with an HTML error page would otherwise put the
 * whole page in one log line — the case that took `auth.link-send-failed`'s
 * body through `clamp` (#35).
 */
check("a long string is cut to the limit", clamp("x".repeat(5_000)).length, CLAMP)
check("a short one is untouched", clamp("boom"), "boom")
check("a non-string is empty, never 'undefined'", clamp(undefined), "")
check("an object does not stringify itself in", clamp({ a: 1 }), "")

console.log(
  failures === 0
    ? "\n[check-log] all assertions passed\n"
    : `\n[check-log] ${failures} FAILED\n`
)
process.exit(failures === 0 ? 0 : 1)
