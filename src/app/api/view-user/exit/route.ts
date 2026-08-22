import { NextRequest, NextResponse } from "next/server"
import { VIEW_USER_COOKIE } from "@/lib/viewUser"

/**
 * Leave Open Loom: clear the selection and return to the Roster — to the
 * COURSE's roster, the one Open Loom was entered from. No gate — clearing a
 * cookie takes nothing from anyone, and the sooner an unauthorized or stale
 * selection is gone the better. A document navigation for the same
 * provider-remount reason as enter/route.ts.
 *
 * The course is already in the cookie: enter/route.ts stores
 * "userId:courseId" so every later read re-authorizes the same pin. This
 * route used to delete that cookie without reading it and redirect to a bare
 * /admin, where getStaffViewer → resolveCourseId falls through to the first
 * live course — so leaving a student's loom silently moved the admin to
 * another course's roster (TJ, 2026-08-22: "the roster page seems to not
 * remember the 'course' i am in when i 'open loom' on a participant and then
 * exit").
 *
 * Read as a selection, never as authorization: the id goes into a query
 * param that /admin re-resolves through its own gate, exactly as if it had
 * been typed. A tampered cookie can therefore only name a course the
 * viewer's own gate will accept or replace.
 */
export async function GET(req: NextRequest) {
  const courseId = req.cookies.get(VIEW_USER_COOKIE)?.value.split(":")[1]
  const back = new URL("/admin", req.url)
  if (courseId) back.searchParams.set("course", courseId)

  const res = NextResponse.redirect(back, 303)
  res.cookies.delete(VIEW_USER_COOKIE)
  return res
}
