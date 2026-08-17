/**
 * Assertions for src/lib/previewLogin.ts — the gate on the one route that
 * mints a session without asking GitHub anything.
 *
 *   npx tsx scripts/check-preview-login.ts
 *
 * Pure, no fixtures and no network, so it runs inside `npm run check`. It earns
 * that place the same way check-blob-namespace does: every case below that
 * returns `allowed: true` is a case where anyone holding the URL can become an
 * admin, and a deployment would not tell you it had happened. The property to
 * preserve is that **production never appears in that set**, whatever else is
 * set or misspelt around it.
 */
import { previewLoginDecision, sessionCookieNames } from "../src/lib/previewLogin"

let failures = 0
const SECRET = "s3cret-of-exactly-some-length"

function check(name: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) failures += 1
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${name}`)
  if (!ok) console.log(`          got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`)
}

const allow = (env: Record<string, string | undefined>, key?: string | null) =>
  previewLoginDecision(env, key ?? null).allowed

console.log("\nproduction is closed, and nothing reopens it")
check("production, no key", allow({ VERCEL_ENV: "production", NODE_ENV: "production" }), false)
check(
  "production, correct key — a mistake, not a key",
  allow({ VERCEL_ENV: "production", NODE_ENV: "production", PREVIEW_LOGIN_SECRET: SECRET }, SECRET),
  false
)
// The production test runs FIRST for this reason: an unbuilt production
// deployment must not fall through to the local-dev branch below.
check(
  "production with a dev NODE_ENV still closed",
  allow({ VERCEL_ENV: "production", NODE_ENV: "development" }),
  false
)

console.log("\nlocal and CI keep the door they depend on")
check("no VERCEL_ENV, unbuilt — local dev", allow({ NODE_ENV: "development" }), true)
check("no VERCEL_ENV, unbuilt — CI", allow({ NODE_ENV: "test" }), true)
check("nothing set at all", allow({}), true)

console.log("\na preview opens only on a matched secret")
const preview = { VERCEL_ENV: "preview", NODE_ENV: "production" }
check("no secret configured — fails closed", allow(preview), false)
check("secret configured, none supplied", allow({ ...preview, PREVIEW_LOGIN_SECRET: SECRET }), false)
check("wrong key", allow({ ...preview, PREVIEW_LOGIN_SECRET: SECRET }, "wrong"), false)
check(
  "right key of the wrong length",
  allow({ ...preview, PREVIEW_LOGIN_SECRET: SECRET }, SECRET + "x"),
  false
)
check("matching key", allow({ ...preview, PREVIEW_LOGIN_SECRET: SECRET }, SECRET), true)
check(
  "whitespace around the key is trimmed, not rejected",
  allow({ ...preview, PREVIEW_LOGIN_SECRET: SECRET }, `  ${SECRET}  `),
  true
)
check(
  "a secret of only whitespace is not a secret",
  allow({ ...preview, PREVIEW_LOGIN_SECRET: "   " }, "   "),
  false
)

console.log("\nan unrecognised deployment is not a preview")
check(
  "a built deployment with no VERCEL_ENV",
  allow({ NODE_ENV: "production", PREVIEW_LOGIN_SECRET: SECRET }, SECRET),
  false
)
check(
  "a misspelt VERCEL_ENV fails closed",
  allow({ VERCEL_ENV: "Preview", NODE_ENV: "production", PREVIEW_LOGIN_SECRET: SECRET }, SECRET),
  false
)

console.log("\nthe cookie next-auth will actually read back")
check("https takes the __Secure- prefix", sessionCookieNames(true), [
  "__Secure-next-auth.session-token",
  "__Secure-authjs.session-token",
])
check("http does not", sessionCookieNames(false), [
  "next-auth.session-token",
  "authjs.session-token",
])

console.log(
  failures === 0
    ? "\n[check-preview-login] all assertions passed\n"
    : `\n[check-preview-login] ${failures} FAILED\n`
)
process.exit(failures === 0 ? 0 : 1)
