import { NextAuthOptions } from "next-auth"
import GithubProvider from "next-auth/providers/github"
import GoogleProvider from "next-auth/providers/google"
import { DrizzleAdapter } from "@auth/drizzle-adapter"
import { db } from "@/db"
import { users } from "@/db/schema"
import { eq } from "drizzle-orm"
import type { Adapter } from "next-auth/adapters"

const ALLOWED_EMAILS = [
  "john@zerowidth.ai",
  "caseysimone@berkeley.edu",
  "hugh@dubberly.com",
  "kevinma1515@berkeley.edu",
  "kosa@berkeley.edu",
  "maxkreminski@gmail.com",
  "mkremins@berkeley.edu",
  "shm.almeda@berkeley.edu",
  "sophiawliu@berkeley.edu",
  "tjm@tjmcleish.com",
  "tjmcleish@berkeley.edu"
  // Add your own email here if it's not already in the list!
]

export const authOptions: NextAuthOptions = {
  adapter: DrizzleAdapter(db) as Adapter,
  providers: [
    GithubProvider({
      clientId: process.env.GITHUB_ID || "",
      clientSecret: process.env.GITHUB_SECRET || "",
    }),
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID || "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
    }),
  ],
  callbacks: {
    async signIn({ user }) {
      const email = user.email?.toLowerCase().trim()
      if (!email) return false

      // Shared allowlist for all providers (GitHub + Google).
      return ALLOWED_EMAILS.includes(email)
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
