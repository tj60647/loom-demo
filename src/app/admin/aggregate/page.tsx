import { getAggregateLoomData, getStaffViewer } from "@/actions/admin"
import CohortClothPanel from "@/components/admin/CohortClothPanel"
import { firstParam, getCourse, listSections, resolveSectionId } from "@/lib/courses"
import type { LoomState } from "@/lib/types"

type AggregatePageSearchParams = {
  course?: string | string[]
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

  const sectionId = await resolveSectionId(courseId, firstParam(resolvedSearchParams.section))
  const [course, courseSections] = await Promise.all([getCourse(courseId), listSections(courseId)])
  const sectionName = sectionId
    ? courseSections.find((section) => section.id === sectionId)?.name ?? null
    : null

  let concepts: LoomState["concepts"] = []
  let passages: LoomState["passages"] = []
  let edges: LoomState["edges"] = []
  let members: { id: string; name: string }[] = []
  let passagesUnavailable = false
  let aggregateUnavailable = false

  try {
    const aggregate = await getAggregateLoomData(courseId, sectionId)
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
    <main>
      <h1>Cohort Graph</h1>
      <p className="tasksub" style={{ marginBottom: "20px" }}>
        A macro view of concepts, passages, and threads across {course?.name ?? "this course"}
        {sectionName ? ` · ${sectionName}` : " · all sections"}.
        {sectionName ? "" : " Quilting happens per section — pick one in the nav to scope this graph."}
      </p>

      {aggregateUnavailable && (
        <p className="tasksub" style={{ marginBottom: "12px", color: "var(--red)" }}>
          Aggregate data is temporarily unavailable. Check recent migrations and server logs.
        </p>
      )}

      {passagesUnavailable && (
        <p className="tasksub" style={{ marginBottom: "12px", color: "var(--red)" }}>
          Passage records could not be loaded. The concept/thread graph is still shown.
        </p>
      )}
      
      <div style={{ marginTop: "20px", marginBottom: "40px" }}>
        <CohortClothPanel state={state} names={names} />
      </div>
    </main>
  )
}
