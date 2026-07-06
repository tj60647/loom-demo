import { NextAuthOptions } from "next-auth"
import GithubProvider from "next-auth/providers/github"
import { DrizzleAdapter } from "@auth/drizzle-adapter"
import { db } from "@/db"
import { allowedEmails, users } from "@/db/schema"
import { eq } from "drizzle-orm"
import type { Adapter } from "next-auth/adapters"

const ADMIN_FALLBACK_EMAILS = new Set([
  "tjm@tjmcleish.com",
  "tjmcleish@berkeley.edu",
])

export function isAdminUser(user?: { role?: string | null; email?: string | null }) {
  const email = user?.email?.toLowerCase().trim()
  return user?.role === "ADMIN" || (email ? ADMIN_FALLBACK_EMAILS.has(email) : false)
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
    async signIn({ user }) {
      const email = user.email?.toLowerCase().trim()
      if (!email) return false

      const approvedEmail = await db
        .select({ email: allowedEmails.email })
        .from(allowedEmails)
        .where(eq(allowedEmails.email, email))
        .limit(1)

      return approvedEmail.length > 0
    },
    async session({ session, user }) {
      if (session.user) {
        session.user.id = user.id;
        // Fetch role from the database
        const dbUser = await db.select().from(users).where(eq(users.id, user.id)).limit(1);
        session.user.role = dbUser[0]?.role || "USER";
      }
      return session;
    }
  }
}
