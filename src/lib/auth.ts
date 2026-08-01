import { NextAuthOptions } from "next-auth"
import GithubProvider from "next-auth/providers/github"
import { DrizzleAdapter } from "@auth/drizzle-adapter"
import { db } from "@/db"
import { allowedEmails, courseAllowedEmails, courseMemberships, users } from "@/db/schema"
import { and, eq, isNull, sql } from "drizzle-orm"
import type { Adapter } from "next-auth/adapters"

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
 * on it, and removeFromRoster consults it to decide whether removing someone
 * from their last course should also revoke their live sessions.
 */
export async function emailHasAppAccess(email: string): Promise<boolean> {
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

export const authOptions: NextAuthOptions = {
  adapter: DrizzleAdapter(db) as Adapter,
  pages: {
    error: "/auth/error",
  },
  providers: [
    GithubProvider({
      clientId: process.env.GITHUB_ID || "",
      clientSecret: process.env.GITHUB_SECRET || "",
    }),
  ],
  callbacks: {
    // Pure check, no writes. For a first-time OAuth user, `user` here is the
    // provider profile — user.id is GitHub's id, not ours, because our row
    // does not exist yet. Enrolment therefore lives in events.signIn below,
    // which fires after the adapter has created the real user.
    async signIn({ user }) {
      const email = user.email?.toLowerCase().trim()
      if (!email) return false
      return emailHasAppAccess(email)
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
    // Enrolment on sign-in: every course that invited this email gets a
    // membership, placed in whichever section the invitation pre-assigned.
    // Runs on every sign-in and is idempotent; for someone previously removed
    // and re-invited, the conflict branch clears removedAt to reinstate them
    // (keeping their old section — the invitation's section only applies to a
    // fresh enrolment, so it can never undo an instructor's manual placement).
    async signIn({ user }) {
      const email = user.email?.toLowerCase().trim()
      if (!email || !user.id) return

      const courseInvites = await db
        .select({
          courseId: courseAllowedEmails.courseId,
          sectionId: courseAllowedEmails.sectionId,
        })
        .from(courseAllowedEmails)
        .where(eq(courseAllowedEmails.email, email))
      if (courseInvites.length === 0) return

      const role = isAdminUser({ email }) ? "INSTRUCTOR" : "LEARNER"
      await db
        .insert(courseMemberships)
        .values(
          courseInvites.map((invite) => ({
            courseId: invite.courseId,
            userId: user.id,
            sectionId: invite.sectionId,
            role,
          }))
        )
        .onConflictDoUpdate({
          target: [courseMemberships.courseId, courseMemberships.userId],
          set: { removedAt: null },
        })
    },
  },
}
