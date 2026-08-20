"use client"

import { SessionProvider } from "next-auth/react"
import { frontendState, frontendStudent } from "@/lib/frontendFixture"
import { LoomProvider } from "@/components/providers/LoomProvider"
import { ReadingsProvider } from "@/components/providers/ReadingsProvider"
import { DialogProvider } from "@/components/providers/DialogProvider"
import Header from "@/components/ui/Header"

export default function FrontendShell({ children }: { children: React.ReactNode }) {
  return <SessionProvider session={{ user: frontendStudent, expires: "2099-01-01T00:00:00.000Z" }}><LoomProvider frontendOnly initialState={frontendState()}><ReadingsProvider frontendOnly><DialogProvider><div className="app-shell"><Header deployEnv="stageit" frontendOnly />{children}</div></DialogProvider></ReadingsProvider></LoomProvider></SessionProvider>
}
