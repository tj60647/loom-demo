import { NextRequest, NextResponse } from "next/server"
import { VIEW_USER_COOKIE } from "@/lib/viewUser"

/**
 * Leave Open Loom: clear the selection and return to the Roster. No gate —
 * clearing a cookie takes nothing from anyone, and the sooner an
 * unauthorized or stale selection is gone the better. A document
 * navigation for the same provider-remount reason as enter/route.ts.
 */
export async function GET(req: NextRequest) {
  const res = NextResponse.redirect(new URL("/admin", req.url), 303)
  res.cookies.delete(VIEW_USER_COOKIE)
  return res
}
