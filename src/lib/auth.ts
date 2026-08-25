import { NextAuthOptions, Profile } from "next-auth"
import GithubProvider from "next-auth/providers/github"
import { DrizzleAdapter } from "@auth/drizzle-adapter"
import { db } from "@/db"
import { allowedEmails, courseAllowedEmails, courseMemberships, sections, users } from "@/db/schema"
import { and, eq, inArray, isNull, sql } from "drizzle-orm"
import type { Adapter } from "next-auth/adapters"
import {
  decideSignIn,
  GUEST_LINK_MAX_AGE_SECONDS,
  guestLinkEmail,
  normalizeEmail,
  resolveIdentityEmail,
  SIGN_IN_ERROR,
  verifiedCandidates,
} from "@/lib/signIn"
import { recordAuthEvent } from "@/lib/authEvent"
import { clamp, logError, logInfo, logWarn } from "@/lib/log"

const ADMIN_FALLBACK_EMAILS = new Set([
  "tjm@tjmcleish.com",
  "tjmcleish@berkeley.edu",
])

export function isAdminUser(user?: { role?: string | null; email?: string | null }) {
  const email = user?.email?.toLowerCase().trim()
  return user?.role === "ADMIN" || (email ? ADMIN_FALLBACK_EMAILS.has(email) : false)
}

/**
 * May this email use the app at all? True when any course has invited it, any
 * active (non-removed) enrolment exists for it, it is on the legacy site-wide
 * allowlist, or it belongs to an admin.
 *
 * Invitation, enrolment and app access are distinct: an invitation admits you
 * once so you can enrol; after that your access rides on the membership. This
 * is the single source of truth for "can sign in" — the signIn callback gates
 * on it, the provider's email resolution consults it to pick which of a
 * student's verified addresses to sign them in as, and removeFromRoster
 * consults it to decide whether removing someone from their last course should
 * also revoke their live sessions.
 *
 * Normalizes its own argument: every caller lowercases already, but a single
 * missed `.toLowerCase()` anywhere would silently widen or narrow access, and
 * the roster columns are stored lowercased.
 */
export async function emailHasAppAccess(emailRaw: string): Promise<boolean> {
  const email = normalizeEmail(emailRaw)
  if (!email) return false

  if (isAdminUser({ email })) return true

  const invited = await db
    .select({ courseId: courseAllowedEmails.courseId })
    .from(courseAllowedEmails)
    .where(eq(courseAllowedEmails.email, email))
    .limit(1)
  if (invited.length > 0) return true

  // users.email keeps the provider's casing, so compare case-insensitively.
  const enrolled = await db
    .select({ userId: courseMemberships.userId })
    .from(courseMemberships)
    .innerJoin(users, eq(users.id, courseMemberships.userId))
    .where(and(sql`lower(${users.email}) = ${email}`, isNull(courseMemberships.removedAt)))
    .limit(1)
  if (enrolled.length > 0) return true

  const approved = await db
    .select({ email: allowedEmails.email })
    .from(allowedEmails)
    .where(eq(allowedEmails.email, email))
    .limit(1)
  return approved.length > 0
}

/**
 * The guest door: a mailed sign-in link, for someone invited to a course who
 * has no GitHub account. Open only where both variables are set — dev, CI and
 * any environment without mail configured carry GitHub alone, and the sign-in
 * page offers no door it cannot open.
 */
export function emailSignInConfigured() {
  return Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM)
}

/**
 * NextAuth's email provider, built by hand rather than imported.
 *
 * `next-auth/providers/email` requires nodemailer at module load — an optional
 * peer dependency this project does not install — and we would only be
 * replacing the one function that uses it. Everything security-bearing still
 * belongs to the library: it mints the 32-byte token, hashes it into
 * `verificationToken`, and expires it. This supplies the delivery and the
 * copy, and nothing else.
 */
// next-auth does not export ./providers as a subpath, so the union is reached
// through the options type that uses it.
type Provider = NonNullable<NextAuthOptions["providers"]>[number]

function guestEmailProvider(): Provider {
  return {
    id: "email",
    type: "email",
    name: "Email",
    from: process.env.EMAIL_FROM,
    maxAge: GUEST_LINK_MAX_AGE_SECONDS,
    // Read only by the nodemailer sendVerificationRequest we are replacing.
    server: "",
    options: {},
    async sendVerificationRequest({ identifier, url }: { identifier: string; url: string }) {
      const { subject, text, html } = guestLinkEmail(url)
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ from: process.env.EMAIL_FROM, to: identifier, subject, text, html }),
      })
      if (!res.ok) {
        // Resend's reason belongs in the logs, never on the guest's screen —
        // throwing here is what turns it into the EmailSignin page. The
        // address is already known to the roster, so logging it reveals
        // nothing the sender did not have.
        // CLAMPED: the body is Resend's, not ours, and an upstream that
        // answers with an HTML error page would put the whole page in one log
        // line (Copilot, #35). The status is the fact worth querying on; the
        // body is context, and 600 characters of it is enough to read.
        logError("auth.link-send-failed", {
          email: identifier,
          status: res.status,
          body: clamp(await res.text()),
        })
        throw new Error("could not send the sign-in link")
      }
    },
    // The union's EmailConfig types `server` against nodemailer, which is not
    // installed; the shape above is what parseProviders and the email route
    // actually read.
  } as unknown as Provider
}

export const authOptions: NextAuthOptions = {
  adapter: DrizzleAdapter(db) as Adapter,
  pages: {
    // GitHub is the door for everyone the roster knows, and the guest email
    // link (built above, when mail is configured) is folded away — so our own
    // page is one button and a fold, where NextAuth's built-in is a provider
    // list. It also catches the retryable OAuth codes, which NextAuth bounces
    // to the sign-in route rather than to pages.error.
    signIn: "/auth/signin",
    error: "/auth/error",
    verifyRequest: "/auth/verify",
  },
  providers: [
    GithubProvider({
      clientId: process.env.GITHUB_ID || "",
      clientSecret: process.env.GITHUB_SECRET || "",
      // `user:email` and nothing more. GET /user returns the public profile we
      // actually use (id, login, name, avatar) for a token of any scope, so
      // the provider's default `read:user` only adds a student's private
      // profile data — which we neither read nor want to be holding.
      authorization: { params: { scope: "user:email" } },
      userinfo: {
        url: "https://api.github.com/user",
        /**
         * Which of a student's GitHub addresses signs them in.
         *
         * The stock provider consults /user/emails only when the public
         * profile email is null, and then takes `primary ?? first` *without
         * looking at `verified`*. Both are wrong for a roster gate: an
         * unverified address — a string typed into a settings page — could
         * become somebody's identity, and a student whose primary is personal
         * would never be matched on the course address they did add.
         *
         * So: always ask, keep only what GitHub has confirmed, and prefer the
         * confirmed address the roster already knows. signIn below still
         * decides whether they may come in; this decides only who they are.
         */
        async request({ client, tokens }): Promise<Profile> {
          const profile = (await client.userinfo(tokens.access_token!)) as Record<string, unknown>

          let candidates: string[] = []
          const res = await fetch("https://api.github.com/user/emails", {
            headers: {
              Authorization: `Bearer ${tokens.access_token}`,
              Accept: "application/vnd.github+json",
            },
          })
          if (res.ok) {
            candidates = verifiedCandidates(await res.json())
          } else {
            // Deliberately no fall back to the public profile email: it is not
            // labelled with its verification state here, and an ambiguous
            // address must not authorize anybody. The student gets the
            // "no confirmed email" screen; this line is how we tell the two
            // causes apart afterwards.
            logWarn("auth.emails-fetch-failed", { status: res.status, statusText: res.statusText })
          }

          const resolution = await resolveIdentityEmail(candidates, emailHasAppAccess)
          /**
           * HOW MANY CONFIRMED ADDRESSES GITHUB OFFERED, said here because
           * here is the only place that knows. It is the number a refusal
           * most wants — "GitHub confirmed two addresses for them and the
           * roster knew neither" is the whole diagnosis — and it cannot ride
           * to the signIn callback, whose `user` is the provider's four
           * mapped fields.
           *
           * The addresses themselves are not logged. A person's other
           * identities are not ours to keep, and the count answers the
           * question.
           */
          logInfo("auth.identity", {
            candidates: candidates.length,
            outcome: resolution.status,
            email: resolution.email ?? "",
          })
          profile.email = resolution.email

          // The full GitHub profile, not just Profile's four fields — the
          // provider's own profile() still reads id, login and avatar_url off it.
          return profile as unknown as Profile
        },
      },
    }),
    ...(emailSignInConfigured() ? [guestEmailProvider()] : []),
  ],
  callbacks: {
    // Pure check, no writes. For a first-time OAuth user, `user` here is the
    // provider profile — user.id is GitHub's id, not ours, because our row
    // does not exist yet. Enrolment therefore lives in events.signIn below,
    // which fires after the adapter has created the real user. For a returning
    // user the adapter has already matched the GitHub account id, so `user` is
    // our row and the email gated on is the one Loom stored, not whatever
    // GitHub happens to say today.
    //
    // Still the single gate — emailHasAppAccess decides, exactly as before.
    // Returning a path instead of `false` only changes which explanation the
    // student reads; NextAuth treats any string as "refused, redirect here".
    //
    // The guest provider runs this too, and once *before* any mail goes out
    // (NextAuth calls it with email.verificationRequest at the send step), so
    // an address no course invited never receives a link. Both doors, one gate.
    async signIn({ user, account, email }) {
      const verdict = await decideSignIn(user.email, emailHasAppAccess)
      /**
       * THE GUEST DOOR ASKS TWICE, so it must not be written down twice.
       *
       * NextAuth calls this once at the SEND step (`email.verificationRequest`
       * is true, and the comment above says why that is deliberate: an
       * uninvited address never receives a link) and again when the link is
       * CLICKED. Both evaluate the same address and reach the same verdict, so
       * recording both would put two rows differing only in `at` against one
       * sign-in, and the Sign-ins tab would read as somebody trying twice.
       *
       * The SEND step is the one kept, because it is the one that can be
       * refused: a refusal there ends the flow and no click ever follows, so
       * skipping it would lose exactly the decision worth having. The click
       * that follows an allowed send tells us nothing the send did not.
       *
       * Unreachable today — the guest provider is registered only where
       * RESEND_API_KEY and EMAIL_FROM are both set (`emailSignInConfigured`),
       * which is no environment yet. Fixed while the code is in hand rather
       * than left for whoever turns that door on.
       */
      const alreadyRecordedAtSend = account?.provider === "email" && !email?.verificationRequest
      /**
       * RECORDED HERE RATHER THAN INSIDE `decideSignIn`, which stays pure —
       * scripts/check-auth.ts exercises it with an injected predicate and no
       * database, and a gate that writes cannot be checked that way.
       *
       * How many addresses GitHub confirmed is NOT recorded here, though it is
       * the number a refusal most wants: the provider's own `profile()` maps
       * four fields and drops anything the userinfo override adds, so it never
       * reaches `user`. It goes to the operational log from the override
       * itself, where it is known — `auth.identity`.
       */
      if (!alreadyRecordedAtSend) await recordAuthEvent({
        email: normalizeEmail(user.email) || String(user.email ?? ""),
        outcome:
          verdict === true
            ? "allowed"
            : verdict.includes(SIGN_IN_ERROR.noVerifiedEmail)
              ? "no-verified-email"
              : "not-on-roster",
        provider: account?.provider ?? "",
        /**
         * Only worth carrying where the address is empty, which is the
         * `no-verified-email` refusal: GitHub confirmed nothing, so without a
         * name the row is anonymous and six refusals cannot be told from one
         * person trying six times. Everywhere else the address IS the name.
         */
        handle: normalizeEmail(user.email) ? "" : (user.name ?? "").slice(0, 120),
      })
      return verdict
    },
    async session({ session, user }) {
      if (session.user) {
        session.user.id = user.id;
        // Fetch role from the database
        const dbUser = await db.select().from(users).where(eq(users.id, user.id)).limit(1);
        session.user.role = dbUser[0]?.role || "USER";
        session.user.isAdmin = isAdminUser({
          role: session.user.role,
          email: session.user.email,
        });
      }
      return session;
    }
  },
  events: {
    // The adapter has created (or found) the real user by now, so user.id is
    // ours. Exported below rather than inlined here so the idempotency
    // assertion in scripts/check-auth.ts exercises this code and not a copy of
    // it — a duplicated upsert would pass its own test forever.
    async signIn({ user }) {
      if (!user.id) return
      await enrolInvitedCourses(user.id, user.email)
    },
  },
}

/**
 * Enrolment on sign-in: every course that invited this email gets a
 * membership, placed in whichever section the invitation pre-assigned.
 *
 * Runs on every sign-in and is idempotent; for someone previously removed and
 * re-invited, the conflict branch clears removedAt to reinstate them (keeping
 * their old section — the invitation's section only applies to a fresh
 * enrolment, so it can never undo an instructor's manual placement).
 */
export async function enrolInvitedCourses(userId: string, emailRaw?: string | null) {
  const email = normalizeEmail(emailRaw)
  if (!email || !userId) return

  const courseInvites = await db
    .select({
      courseId: courseAllowedEmails.courseId,
      sectionId: courseAllowedEmails.sectionId,
    })
    .from(courseAllowedEmails)
    .where(eq(courseAllowedEmails.email, email))
  if (courseInvites.length === 0) return

  // An invitation addressed to a course's Faculty Section enrols as FACULTY
  // (ruling 18): that section IS the faculty roster, so pre-assigning it is
  // how an instructor invites faculty. Matched by the slug ensureFacultySection
  // mints — not imported from lib/courses, which imports from this file.
  const facultySectionIds = new Set(
    (
      await db
        .select({ id: sections.id })
        .from(sections)
        .where(
          and(
            eq(sections.slug, "faculty"),
            inArray(sections.courseId, courseInvites.map((invite) => invite.courseId))
          )
        )
    ).map((row) => row.id)
  )

  const baseRole = isAdminUser({ email }) ? "INSTRUCTOR" : "LEARNER"
  await db
    .insert(courseMemberships)
    .values(
      courseInvites.map((invite) => ({
        courseId: invite.courseId,
        userId,
        sectionId: invite.sectionId,
        role:
          invite.sectionId && facultySectionIds.has(invite.sectionId)
            ? "FACULTY"
            : baseRole,
      }))
    )
    .onConflictDoUpdate({
      target: [courseMemberships.courseId, courseMemberships.userId],
      set: { removedAt: null },
    })
}
