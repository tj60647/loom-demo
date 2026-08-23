import JourneyNav from "@/components/ui/JourneyNav"

/**
 * The frame for a reference page — Workflows, Access.
 *
 * These pages used to be a bare `<main>`, so reaching one from the journey bar
 * made the bar itself disappear: the whole frame was replaced rather than the
 * work inside it (TJ, 2026-08-09: "the workflows tab should behave like the
 * others, change what is below, not replacing the frame").
 *
 * The first fix over-corrected. It gave them a `.scopebar` — a titled header
 * strip ABOVE the journey — which no other staff surface has, so arriving at
 * Workflows pushed the row you had just clicked in down the page (TJ,
 * 2026-08-09: "workflows and access tabs should not spawn a header above their
 * row, they should behave more like courses and readings, but without a
 * specific course").
 *
 * So the shape is Courses' and Readings' shape: **journey bar, then the page**.
 * The heading lives in the body with the content it names, as `/admin/courses`
 * puts its own `<h1>Courses</h1>` inside `<main>`. What is missing relative to
 * those pages is deliberate and is the "without a specific course" half —
 * there is no `AdminNav`, because a course/section picker on a page holding no
 * course data would be a control for a scope nothing here reads.
 *
 * Two things the scopebar version carried are gone with it:
 *
 *   - the "‹ library" back link, which was a second door to a room the journey
 *     bar's own 00 · Library already opens, directly below it. `Workbench`
 *     dropped its own for that exact reason (TJ, 2026-08-08).
 *   - the footer. When this was written Courses and Readings had none and this
 *     frame matched them; on 2026-08-21 the admin shell grew the workbench's
 *     identity footer (admin/layout.tsx), so the match is now broken the other
 *     way. Left off here deliberately: these pages are reference, not a place
 *     someone acts as themselves, and adding it is one line if that changes.
 *
 * No station is `active`: these are not steps on the student's arc. The bar is
 * there so you can leave, and so that where you are stays legible.
 */
export default function MetaPage({
  title,
  meta,
  children,
}: {
  title: string
  /** The one line under the heading — what the page is for. */
  meta: string
  children: React.ReactNode
}) {
  return (
    <>
      <JourneyNav active={null} />
      {/* A plain <main>: the base rule already makes it the scroll container
          and gives it the same padding the Library uses. The admin shell's
          extra `.adminshell`/`.adminbody` split exists only to pin AdminNav
          above the scroll, and there is nothing to pin here. */}
      <main>
        {/* A real <h1>. A reference page with no heading has no document
            structure for a screen reader — or for a test — to hold on to. */}
        <h1>{title}</h1>
        <p className="tasksub" style={{ marginBottom: "20px" }}>{meta}</p>
        {children}
      </main>
    </>
  )
}
