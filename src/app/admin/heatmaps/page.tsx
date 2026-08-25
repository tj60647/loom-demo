import { getAggregateLoomData, getStaffViewer } from "@/actions/admin"
import HeatmapReader from "@/components/admin/HeatmapReader"
import { db } from "@/db"
import { courseSources, sources } from "@/db/schema"
import { and, asc, eq } from "drizzle-orm"
import { firstParam, resolveSectionId } from "@/lib/courses"

type HeatmapsPageSearchParams = {
  course?: string | string[]
  section?: string | string[]
  source?: string | string[]
  student?: string | string[]
}

/**
 * HEATMAPS — where the cohort marked, on the page itself.
 *
 * The neighbour of the Cohort Graph and its complement (TJ, 2026-08-22): that
 * one is what the cohort MADE of the readings — concepts, threads, the weave —
 * and this one is where on the page they were reading when they made it.
 *
 * It is the reading station's Passages Overlay given a room of its own: the
 * same viewer, the same 1 page / 2 pages / Canvas control, the same staff
 * Overlay picker, with the scope strip above choosing the course, the section
 * and the reading.
 *
 * THE STUDENT PICKER IS A RULING CHANGE, made deliberately. Ruling 28 put
 * overlays at "Discussion Section · Cohort" and forbade anything that
 * resolves to one person; TJ added the picker on 2026-08-22 knowing that, and
 * docs/loom-model-build.md §Overlays now records the change with its date.
 *
 * It widens no access. Open Loom already lets a faculty member read one named
 * student's whole loom with their highlights on the page (`student-loom-open`,
 * 2026-08-21) — this is a second door onto work that door already opens. The
 * SECTION and COHORT bands keep their anonymity untouched: they still count
 * people and still name nobody, which is what stops a comparison becoming
 * surveillance. Only the third band names anyone, and only to staff who could
 * already look.
 */
export default async function HeatmapsPage({
  searchParams,
}: {
  searchParams: Promise<HeatmapsPageSearchParams>
}) {
  const resolved = await searchParams
  // Viewer-aware, exactly as the Cohort Graph resolves: an admin gets any
  // course, a faculty member their own (ruling 18).
  const { courseId } = await getStaffViewer(firstParam(resolved.course))

  if (!courseId) {
    return (
      <main>
        <h1>Heatmaps</h1>
        <p className="tasksub">No courses yet — create one on the Courses tab.</p>
      </main>
    )
  }

  /**
   * THE SECTION THE HEAT IS DRAWN FOR.
   *
   * This comment used to say the strip "is where it is chosen" for the
   * viewer's Overlay picker. That was false: the value was resolved here and
   * handed to nothing but the margin cards, so the picker went on comparing
   * against the whole cohort while the strip said Faculty (TJ, 2026-08-25:
   * "selecting a section seems to have no effect, why?"). It is passed to the
   * viewer now, and AdminNav's SCOPES declaration for this page is true again.
   */
  const sectionId = await resolveSectionId(courseId, firstParam(resolved.section))
  const studentId = firstParam(resolved.student) ?? null

  // Syllabus order, the same ordering the strip's picker uses, so "the first
  // reading" means the same thing in both places.
  const readings = await db
    .select({
      id: sources.id,
      title: sources.title,
      week: courseSources.week,
      position: courseSources.position,
      storageKey: sources.storageKey,
    })
    .from(courseSources)
    .innerJoin(sources, eq(sources.id, courseSources.sourceId))
    .where(and(eq(courseSources.courseId, courseId), eq(sources.isArchived, false)))
    .orderBy(asc(courseSources.week), asc(courseSources.position), asc(sources.title))

  const wanted = firstParam(resolved.source)
  // A heat map is of ONE reading — there is no page to draw for "all of them"
  // — so this falls back to the first rather than to nothing. The strip's
  // picker omits its "All readings" here for the same reason.
  const reading = readings.find((r) => r.id === wanted) ?? readings[0] ?? null

  /**
   * ONE STUDENT'S PASSAGES, AND ONLY WHEN ONE IS CHOSEN (TJ, 2026-08-23:
   * "make it available only when 1 student is selected").
   *
   * That single condition is what makes cards possible here at all. Asked of
   * the whole cohort, one reading is ~900 passages at the scale this is built
   * for — a wall rather than a margin. Asked of one person it is a few dozen,
   * which is what a margin is for.
   *
   * It also makes the tab coherent: with a student chosen the overlay is
   * already showing THEIR marks, so the heat says where they read and the
   * cards say what they made of it — two halves of one answer rather than two
   * unrelated layers.
   *
   * The same query the Cohort Graph runs (ruling 18, faculty read-side), so
   * this discloses nothing that /admin/aggregate did not already show.
   */
  const scope =
    studentId && reading
      ? await getAggregateLoomData(courseId, sectionId, reading.id, studentId)
      : null

  return (
    <main className="canvasfull heatpage">
      {/* A real <h1> for the document, costing the reader no room — the same
          treatment the Cohort Graph's heading takes, and for the same reason:
          the page is a reading, not a report about one. */}
      <h1 className="visually-hidden">Heatmaps</h1>

      {reading ? (
        reading.storageKey ? (
          <HeatmapReader
            sourceId={reading.id}
            title={reading.title}
            studentId={studentId}
            scopeSectionId={sectionId}
            scopePassages={scope?.passages ?? []}
            scopeConcepts={scope?.concepts ?? []}
          />
        ) : (
          <div className="card empty" style={{ margin: "20px" }}>
            <span className="cap">
              {reading.title} is a reference card with no PDF — there are no pages to lay heat on.
            </span>
          </div>
        )
      ) : (
        <div className="card empty" style={{ margin: "20px" }}>
          <span className="cap">
            No readings in this course yet — add one on the Courses tab.
          </span>
        </div>
      )}
    </main>
  )
}
