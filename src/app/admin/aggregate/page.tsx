import { getAggregateLoomData, getStaffViewer } from "@/actions/admin"
import CohortClothPanel from "@/components/admin/CohortClothPanel"
import { firstParam, resolveSectionId } from "@/lib/courses"
import type { LoomState } from "@/lib/types"

type AggregatePageSearchParams = {
  course?: string | string[]
  source?: string | string[]
  student?: string | string[]
  section?: string | string[]
}

export default async function AggregateLoomPage({ searchParams }: { searchParams: Promise<AggregatePageSearchParams> }) {
  const resolvedSearchParams = await searchParams
  // Viewer-aware: faculty resolve within their own courses (ruling 18).
  const { courseId } = await getStaffViewer(firstParam(resolvedSearchParams.course))

  if (!courseId) {
    return (
      <main>
        <h1>Cohort Graph</h1>
        <div className="card empty" style={{ marginTop: "20px" }}>
          <span className="cap">No courses yet — create one on the Courses tab</span>
        </div>
      </main>
    )
  }

  // The section still SCOPES the query; it no longer needs naming on screen.
  // The course strip above the canvas says which course and which section is
  // being shown, so the page repeating it was one more thing over the map
  // (TJ, 2026-08-22: "the course is visible").
  const sectionId = await resolveSectionId(courseId, firstParam(resolvedSearchParams.section))

  let concepts: LoomState["concepts"] = []
  let passages: LoomState["passages"] = []
  let edges: LoomState["edges"] = []
  let members: { id: string; name: string }[] = []
  let passagesUnavailable = false
  let aggregateUnavailable = false

  try {
    const aggregate = await getAggregateLoomData(
      courseId,
      sectionId,
      firstParam(resolvedSearchParams.source),
      firstParam(resolvedSearchParams.student)
    )
    concepts = aggregate.concepts
    passages = aggregate.passages
    edges = aggregate.edges
    members = aggregate.members
    passagesUnavailable = aggregate.passagesUnavailable
  } catch (error) {
    console.error("[AggregateLoomPage] Aggregate query failed", error)
    aggregateUnavailable = true
  }

  const state: LoomState = { concepts, passages, edges, links: [], maps: [], cloths: [], views: { cardTable: { positions: {}, bends: {} } } }
  const names = Object.fromEntries(members.map((member) => [member.id, member.name]))

  return (
    // THE MAP IS THE PAGE (TJ, 2026-08-22: "the map or graph needs to fill the
    // screen like a google map or other application, cad, where the drawing is
    // primary… you are treating the graph like an illustration for the text,
    // it is not. the text is annotations for a map").
    //
    // So this main takes no measure, no padding and no scroll of its own: it
    // is the viewport below the shell's bars, and everything that was page
    // furniture around the drawing — the h1, the subtitle, the read-out — now
    // floats ON the canvas as annotation. `.station-reading` is the same shape
    // for the same reason: with the text open the station IS the text.
    <main className="canvasfull">
      <CohortClothPanel
        state={state}
        names={names}
        aggregateUnavailable={aggregateUnavailable}
        passagesUnavailable={passagesUnavailable}
      />
    </main>
  )
}
