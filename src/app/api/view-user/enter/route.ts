import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth/next"
import { authOptions } from "@/lib/auth"
import { authorizeViewTarget } from "@/lib/viewUserServer"
import { VIEW_USER_COOKIE } from "@/lib/viewUser"

/**
 * Enter Open Loom: set the selection cookie and land on the student's
 * Library. A plain GET on purpose — the roster's "Open Loom" is an anchor,
 * and a document navigation (not a client route change) is what makes
 * LoomProvider and ReadingsProvider mount fresh and read the new owner;
 * both key their fetch effects on the session, which does not change here.
 *
 * The gate runs BEFORE the cookie is set, so a refused target bounces back
 * to the roster with nothing stored — but the cookie is still only a
 * selection: every read re-authorizes through resolveViewTarget on its own.
 */
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const targetId = req.nextUrl.searchParams.get("user")
  const target = await authorizeViewTarget(session?.user?.id, targetId)

  if (!target) {
    return NextResponse.redirect(new URL("/admin", req.url), 303)
  }

  const res = NextResponse.redirect(new URL("/", req.url), 303)
  res.cookies.set(VIEW_USER_COOKIE, target.userId, {
    path: "/",
    sameSite: "lax",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
  })
  return res
}
