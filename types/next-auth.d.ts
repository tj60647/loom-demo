import { DefaultSession, DefaultUser } from "next-auth"

declare module "next-auth" {
  interface Session {
    user: {
      id: string
      role: string
      isAdmin: boolean
    } & DefaultSession["user"]
  }

  interface User extends DefaultUser {
    id: string
    role: string
    isAdmin: boolean
  }
}
