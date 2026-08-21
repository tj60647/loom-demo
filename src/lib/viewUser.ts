/**
 * "Open Loom" — the faculty mode that reads one student's ENTIRE loom,
 * read-only (TJ, 2026-08-20): their Library, their readings with their
 * highlights and rail cards, their Linking, Knowledge Graph and Vocabulary,
 * navigated with the app's own journey bar rather than a purpose-built
 * summary page.
 *
 * A cookie, for the same reasons the "view as student" lens is one (see
 * src/lib/viewAs.ts): the owner of the data being read is decided on the
 * server, and a URL param would have to survive every <Link> and plain <a>
 * in the app or fall off silently mid-journey.
 *
 * THE CRITICAL DIFFERENCE FROM THAT LENS: viewAs withholds and never grants,
 * so its cookie can be honest client state. This cookie names another
 * person's data, so it can only ever SELECT a target — it authorizes
 * nothing. resolveLoomOwner (viewUserServer.ts) is the one place the
 * selection is honoured, and only after re-checking, per request, that the
 * session user is staff for a course the target actively belongs to — the
 * same gate shape as getUserLoomDataAsAdmin, target-membership check
 * included (the open-work 0.3 lesson: gate the target, not just the
 * course). A student who sets this cookie by hand selects a target the
 * resolver will refuse, and reads their own loom exactly as before.
 *
 * Mutations never consult it. Every write derives its owner from the
 * session, so even a control that escaped hiding writes to the viewer's own
 * loom, never the student's.
 */
export const VIEW_USER_COOKIE = "loom_view_user"

// The cookie READ and the authorization live in viewUserServer.ts, not
// here — this module is importable from client components (the floating
// menu's exit control), and `next/headers` in a client bundle is a build
// error.
