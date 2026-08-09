/**
 * "View as student" — a lens a faculty member or admin can put on to see what
 * a student sees (TJ, 2026-08-09).
 *
 * A COOKIE rather than client state, for one reason: three of the differences
 * between a staff view and a student view are decided on the server, and a
 * client-only flag could not reach them.
 *
 *   - `/workflows` renders all three flows for staff and one for a student;
 *   - the Library query returns UNPUBLISHED readings to an admin
 *     (`courseSources.isVisible` is only applied to non-admins);
 *   - `getActiveCourse` is what tells every client surface it is staff at all.
 *
 * A URL param was the alternative and is worse: `/keep` is statically
 * prerendered and `useSearchParams` already forced a Suspense boundary once,
 * every `<Link>` would have to propagate it, and the plain `<a href>`
 * navigations in the header would drop it silently — a lens that falls off
 * halfway through a session is worse than no lens.
 *
 * **It can withhold, never grant.** Every use of it either hides a control or
 * NARROWS a query. Nothing is authorized by it and nothing is unlocked by it,
 * so a student who sets the cookie by hand gets exactly what they already had.
 * That is also why it is not httpOnly: the header toggle sets it directly, and
 * there is nothing here worth protecting from its owner.
 *
 * It is deliberately NOT a security boundary and must never become one — the
 * real gates (`requireAdmin`, `checkCourseFaculty`, `overlayViewer`,
 * `authorizeSourceAccess`, the `/admin` layout) all re-check for themselves and
 * none of them consult this.
 */
export const VIEW_AS_STUDENT_COOKIE = "loom_view_as_student"

// The cookie READ lives in viewAsServer.ts, not here. This module is imported
// by the header's toggle, which is a client component, and `next/headers` in a
// client bundle is a build error — the name has to travel without it.
