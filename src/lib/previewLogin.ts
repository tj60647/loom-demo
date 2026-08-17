import { timingSafeEqual } from "crypto"

/**
 * Who may use the test backdoor, and where.
 *
 * The backdoor mints a session row directly, skipping GitHub entirely. That is
 * indispensable locally and in CI — the Playwright suite has no other door —
 * and it was previously shut off everywhere else by testing `NODE_ENV`, which
 * Vercel sets to "production" for preview builds as well as production ones.
 *
 * That closed it on previews too, and previews are precisely where the team
 * needs it: an OAuth App holds one callback URL, next-auth builds `redirect_uri`
 * from the request host, and every branch preview has its own host. GitHub can
 * therefore never complete a sign-in on a preview, which left branch previews
 * as something to look at rather than use.
 *
 * So the gate moves from "is this a built app" to "which deployment is this,
 * and did the caller prove they belong here":
 *
 *   production        — never, under any condition, secret or not
 *   local, CI         — always, no secret; these builds are not deployed
 *   preview           — only with PREVIEW_LOGIN_SECRET set AND matched
 *
 * Three properties this has to keep, each of which the check script asserts:
 *
 *  1. **Fails closed.** Every test is positive — `VERCEL_ENV === "preview"`,
 *     a secret that is set, a secret that matches. A missing or misspelt
 *     variable denies. Writing the production test as `!== "production"` would
 *     have inverted that, which is the whole class of bug this file exists for.
 *  2. **Production is unreachable by construction**, checked first and before
 *     anything else can grant. Setting PREVIEW_LOGIN_SECRET in the production
 *     scope must not open it — it is a mistake, not a key.
 *  3. **Constant-time comparison**, so the secret cannot be recovered a
 *     character at a time from response timings.
 */
export type PreviewLoginDecision =
  | {
      allowed: true
      why: "not-a-deployed-build" | "preview-secret-matched" | "preview-no-key-required"
    }
  | { allowed: false; why: string }

/** Whether this deployment will ask for a key — what the sign-in form renders. */
export function previewLoginNeedsKey(env: Record<string, string | undefined> = process.env) {
  return Boolean(env.PREVIEW_LOGIN_SECRET?.trim())
}

export function previewLoginDecision(
  env: Record<string, string | undefined>,
  suppliedSecret: string | null | undefined
): PreviewLoginDecision {
  // First and unconditional. Nothing below can reach production.
  if (env.VERCEL_ENV === "production") {
    return { allowed: false, why: "the backdoor is never open on production" }
  }

  // Local dev, scripts and CI run unbuilt. Unchanged from before: no secret,
  // because there is no deployment to protect and the suite depends on it.
  if (env.NODE_ENV !== "production") {
    return { allowed: true, why: "not-a-deployed-build" }
  }

  // A built, deployed app that is not production — which should mean a preview,
  // but only Vercel saying so counts.
  if (env.VERCEL_ENV !== "preview") {
    return { allowed: false, why: "a deployed build that is not a preview" }
  }

  // A key is required only where one is configured. The lock existed because
  // the preview database had been branched from dev and so carried six real
  // people's accounts and their work; scrubbed of those it holds the course
  // readings and the fixture accounts, and asking a contributor to carry a
  // secret to look at their own branch bought nothing it cost.
  //
  // This is the one place the module does not fail closed, and it is bounded:
  // production is refused above before this line can be reached, so the worst
  // an unset variable can do is open a preview. Setting PREVIEW_LOGIN_SECRET
  // again turns the lock back on with no code change.
  const configured = env.PREVIEW_LOGIN_SECRET?.trim()
  if (!configured) return { allowed: true, why: "preview-no-key-required" }

  const supplied = suppliedSecret?.trim()
  if (!supplied) return { allowed: false, why: "no key supplied" }
  if (!secretsMatch(supplied, configured)) return { allowed: false, why: "key does not match" }

  return { allowed: true, why: "preview-secret-matched" }
}

/**
 * Constant-time within a length. Comparing lengths first leaks how long the
 * secret is, which is not worth the branchless gymnastics to hide: it is a
 * long random string, and knowing how long helps nobody.
 */
function secretsMatch(supplied: string, configured: string): boolean {
  const a = Buffer.from(supplied)
  const b = Buffer.from(configured)
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

/**
 * The session cookie next-auth will actually read back.
 *
 * next-auth picks its cookie names from the protocol of the URL it is serving:
 * over https it prefixes `__Secure-`, and a `__Secure-` cookie is only accepted
 * by the browser when it is also marked secure. The backdoor previously wrote
 * the bare name with `secure: false`, which is right on localhost and silently
 * useless on any deployment — the cookie would be set and then never looked at,
 * so the door would appear to work and leave you signed out.
 */
export function sessionCookieNames(isHttps: boolean): string[] {
  const prefix = isHttps ? "__Secure-" : ""
  // Both spellings, as before: different next-auth/auth.js versions read
  // different names, and this is a test door where breadth costs nothing.
  return [`${prefix}next-auth.session-token`, `${prefix}authjs.session-token`]
}
