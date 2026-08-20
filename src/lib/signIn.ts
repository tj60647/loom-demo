/**
 * The sign-in decision, and how it is explained to the student.
 *
 * Everything here is pure — no database, no NextAuth, no React — so the rules
 * that admit somebody to a course can be asserted directly
 * (`npx tsx scripts/check-auth.ts`). auth.ts supplies the one database
 * predicate, `emailHasAppAccess`, and remains the gate; this module only
 * decides *which* address stands for the student and what to say when none
 * does.
 *
 * Two rules carry the whole thing:
 *
 *   1. Only an address GitHub reports as **verified** may identify anybody. A
 *      verified address is proof the person can read that mailbox; an
 *      unverified one is a string they typed into a settings page.
 *   2. When an account carries several verified addresses, the one the roster
 *      knows wins. A student whose GitHub primary is a personal gmail but who
 *      has added their course address should land in the course, not be told
 *      they were not invited.
 */

/** Where a student is sent when the roster, not GitHub, is the problem. */
export const ROSTER_CONTACT_EMAIL = "tjmcleish@berkeley.edu"

/**
 * Codes Loom raises itself, alongside NextAuth's own. Kept distinct from
 * `AccessDenied` because "GitHub told us nothing we can match on" and "we
 * matched you, and no course has invited that address" need different
 * instructions — the first is fixed in GitHub's settings, the second by email.
 */
export const SIGN_IN_ERROR = {
  noVerifiedEmail: "NoVerifiedEmail",
  notOnRoster: "NotOnRoster",
} as const

/** The one sentence a student needs before pressing the button. */
export const SIGN_IN_EXPLANATION =
  "sign in with the github account that carries the email address you registered for the course — loom matches you to your course by that address, not by your github username."

/**
 * The guest door, for someone invited to the course who has no GitHub account
 * and does not want one. Deliberately quiet: students have GitHub, and a
 * visible second option would only invite them to pick wrong.
 */
export const GUEST_SIGN_IN_EXPLANATION =
  "if you have been invited to the course, loom can email you a link that signs you in."

/** How long a mailed sign-in link stays good. */
export const GUEST_LINK_MAX_AGE_SECONDS = 24 * 60 * 60

/**
 * Lowercased and trimmed, or "" when the value could not be an email at all.
 * Every comparison in the sign-in path runs through this, on both sides, so
 * "Jane@Berkeley.EDU " on GitHub and "jane@berkeley.edu" on the roster are the
 * same person. Not RFC-complete — enough to refuse a value that could never
 * match a roster entry, and to keep junk out of the URLs and pages below.
 */
export function normalizeEmail(raw?: string | null): string {
  const trimmed = (raw ?? "").trim().toLowerCase()
  if (trimmed.length > 254) return ""
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed) ? trimmed : ""
}

/**
 * GitHub's per-account alias (`…@users.noreply.github.com`). It is never a
 * mailbox anyone can be reached at, so it can never be a roster address —
 * treat it as no address at all rather than let it become somebody's identity.
 */
export function isNoReplyAddress(email: string): boolean {
  return email.endsWith("@users.noreply.github.com")
}

/** One row of GitHub's `GET /user/emails`, as loosely as we dare trust it. */
export type GithubEmail = {
  email?: unknown
  primary?: unknown
  verified?: unknown
}

/**
 * The addresses on a GitHub account that may stand for a person, primary
 * first. Anything unverified is dropped — `verified` must be exactly `true`,
 * so a malformed or missing field fails closed.
 *
 * Primary first matters only for the failure case: when nothing on the account
 * matches the roster, the primary is the address worth naming back to the
 * student, because it is the one they think of as theirs.
 */
export function verifiedCandidates(payload: unknown): string[] {
  if (!Array.isArray(payload)) return []

  const primaries: string[] = []
  const others: string[] = []
  for (const row of payload as GithubEmail[]) {
    if (!row || typeof row !== "object") continue
    if (row.verified !== true) continue
    const email = normalizeEmail(typeof row.email === "string" ? row.email : null)
    if (!email || isNoReplyAddress(email)) continue
    ;(row.primary === true ? primaries : others).push(email)
  }

  return [...new Set([...primaries, ...others])]
}

export type IdentityResolution =
  /** This address is verified on GitHub and known to the roster. */
  | { status: "ok"; email: string }
  /** GitHub confirmed no usable address at all. */
  | { status: "no-verified-email"; email: null }
  /** Verified addresses exist; no course has invited any of them. */
  | { status: "not-on-roster"; email: string }

/**
 * Which verified address should stand for this person. `hasAppAccess` is
 * injected rather than imported so this stays testable without a database —
 * auth.ts passes the real `emailHasAppAccess`.
 */
export async function resolveIdentityEmail(
  candidates: string[],
  hasAppAccess: (email: string) => Promise<boolean>
): Promise<IdentityResolution> {
  if (candidates.length === 0) return { status: "no-verified-email", email: null }

  for (const email of candidates) {
    if (await hasAppAccess(email)) return { status: "ok", email }
  }

  return { status: "not-on-roster", email: candidates[0] }
}

/**
 * The address to show back to a student, or null. Runs the same normalization
 * as everything else, so whatever reaches a page is shaped like an email even
 * when somebody hand-writes the query string.
 */
export function displayEmail(raw?: string | null): string | null {
  return normalizeEmail(raw) || null
}

/**
 * Where a refused sign-in lands. Returned from the signIn callback, which
 * NextAuth uses verbatim as the redirect, so it stays a relative path.
 */
export function signInErrorUrl(code: string, email?: string | null): string {
  const params = new URLSearchParams({ error: code })
  const shown = displayEmail(email)
  if (shown) params.set("email", shown)
  return `/auth/error?${params.toString()}`
}

/**
 * The gate itself, for whichever provider asked.
 *
 * `true` admits; a string is the path NextAuth redirects the refusal to. Both
 * providers run this and nothing else, so "may this person use this course?"
 * has one answer and one place to read it: GitHub and a mailed link are two
 * ways of proving who you are, never two ways of being allowed in.
 *
 * For the email provider this runs twice — once before a link is sent (so an
 * address no course invited is never mailed at all) and again when it is
 * clicked.
 */
export async function decideSignIn(
  rawEmail: string | null | undefined,
  hasAppAccess: (email: string) => Promise<boolean>
): Promise<true | string> {
  const email = normalizeEmail(rawEmail)
  if (!email) return signInErrorUrl(SIGN_IN_ERROR.noVerifiedEmail)
  if (await hasAppAccess(email)) return true
  return signInErrorUrl(SIGN_IN_ERROR.notOnRoster, email)
}

/**
 * The mailed sign-in link, in Loom's voice rather than NextAuth's default
 * template. Pure so the copy can be asserted; the caller does the sending.
 *
 * The URL is escaped into the HTML even though NextAuth built it: it carries a
 * token and an address, and an unescaped `&` in an href is a broken link at
 * best.
 */
export function guestLinkEmail(url: string): { subject: string; text: string; html: string } {
  const href = url.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;")
  return {
    subject: "Your sign-in link for Loom",
    text:
      `Sign in to Loom:\n\n${url}\n\n` +
      `The link works once, and expires in 24 hours.\n` +
      `If you did not ask to sign in, you can ignore this — nobody can use the link but you.\n`,
    html:
      `<body style="font-family: Georgia, serif; color: #2b2b2b; background: #f2f0ea; padding: 32px;">` +
      `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width: 520px; margin: 0 auto; background: #fbfaf7; border: 1px solid #ddd8cc; border-radius: 4px;">` +
      `<tr><td style="padding: 28px;">` +
      `<h1 style="font-size: 21px; margin: 0 0 14px;">Sign in to Loom</h1>` +
      `<p style="font-size: 15px; line-height: 1.5; margin: 0 0 22px;">You asked for a link to sign in. It works once, and expires in 24 hours.</p>` +
      `<p style="margin: 0 0 22px;"><a href="${href}" style="display: inline-block; background: #2b2b2b; color: #fbfaf7; text-decoration: none; padding: 11px 18px; border-radius: 3px; font-family: monospace; font-size: 13px; letter-spacing: .06em; text-transform: uppercase;">Sign in</a></p>` +
      `<p style="font-size: 13px; line-height: 1.5; color: #6d6a63; margin: 0;">If you did not ask to sign in, you can ignore this — nobody can use the link but you.</p>` +
      `</td></tr></table></body>`,
  }
}

export type SignInMessage = {
  title: string
  /** What happened and what to do about it. No implementation detail. */
  body: string
  /** Whether the way out is to write to the course rather than to retry. */
  contact: boolean
  /** Whether trying again could plausibly work. */
  retry: boolean
}

/**
 * One message table for both screens: `/auth/error` for the codes that end a
 * sign-in, `/auth/signin` for the ones NextAuth bounces back to the button.
 * Neither screen invents copy of its own, so the two cannot drift.
 */
export function signInMessage(code?: string | null, email?: string | null): SignInMessage {
  const shown = displayEmail(email)

  switch (code) {
    case SIGN_IN_ERROR.noVerifiedEmail:
      return {
        title: "GitHub sent no confirmed email address",
        body:
          "Loom finds your course by email address, and GitHub gave us none it has confirmed. " +
          "In GitHub, open Settings → Emails, add the address you registered for the course, " +
          "and click the link GitHub emails you. Then sign in again.",
        contact: true,
        retry: true,
      }

    case SIGN_IN_ERROR.notOnRoster:
      return {
        title: "That email is not on a course roster",
        body: shown
          ? `GitHub signed you in as ${shown}, and no course has invited that address. ` +
            "If your course knows you by a different email, add it to your GitHub account and " +
            "confirm it — it does not have to be your primary address — then sign in again. " +
            "Otherwise ask to be added to the roster."
          : "No course has invited the email address on your GitHub account. Add the address you " +
            "registered for the course to GitHub and confirm it, then sign in again — or ask to " +
            "be added to the roster.",
        contact: true,
        retry: true,
      }

    // NextAuth's own refusal, still reachable from any other gate.
    case "AccessDenied":
      return {
        title: "Access not yet approved",
        body:
          "Your GitHub account signed in, but it is not on a Loom course roster yet. " +
          "Ask to be added, naming the email address on your GitHub account.",
        contact: true,
        retry: false,
      }

    // A Loom user with this email already exists that GitHub did not create —
    // seeded, or made by hand. The adapter will not silently adopt it.
    case "OAuthAccountNotLinked":
      return {
        title: "That email already belongs to a Loom account",
        body:
          "Loom already has an account for this email address that was not created through GitHub, " +
          "so it cannot be joined to your GitHub login automatically. Ask for the two to be linked.",
        contact: true,
        retry: false,
      }

    case "Configuration":
      return {
        title: "Sign-in is not configured correctly",
        body: "This one is ours, not yours. Nothing you can change will fix it — please report it.",
        contact: true,
        retry: false,
      }

    // A mailed link that has expired, been used already, or been asked for
    // again since (asking twice invalidates the first).
    case "Verification":
      return {
        title: "That sign-in link no longer works",
        body:
          "Sign-in links can be used once, and expire after a day. Asking for a new one also " +
          "retires the old one, so use the most recent email. Start again below.",
        contact: false,
        retry: true,
      }

    // Resend refused the send, or the mail configuration is wrong. Nothing the
    // guest can do about either.
    case "EmailSignin":
      return {
        title: "The sign-in link could not be sent",
        body:
          "Loom could not get the email out. Check the address for a typo and try once more — " +
          "if it fails again, the fault is ours and needs reporting.",
        contact: true,
        retry: true,
      }

    case "SessionRequired":
      return {
        title: "Please sign in to continue",
        body: "That page needs a signed-in account.",
        contact: false,
        retry: true,
      }

    case undefined:
    case null:
    case "":
      return {
        title: "Sign in to Loom",
        body: SIGN_IN_EXPLANATION,
        contact: false,
        retry: true,
      }

    // OAuthSignin, OAuthCallback, OAuthCreateAccount, Callback, and anything
    // NextAuth adds later. Never name the code — it tells a student nothing.
    default:
      return {
        title: "Sign-in did not finish",
        body:
          "GitHub and Loom could not complete the handshake. Try once more. " +
          "If it keeps happening, report it and say roughly when you tried.",
        contact: true,
        retry: true,
      }
  }
}
