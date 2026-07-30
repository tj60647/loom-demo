import { getAggregateLoomData } from "@/actions/admin"
import ReadOnlyClothMap from "@/components/svg/ReadOnlyClothMap"
import { firstParam, getCourse, listSections, resolveCourseId, resolveSectionId } from "@/lib/courses"
import type { LoomState } from "@/lib/types"

type AggregatePageSearchParams = {
  course?: string | string[]
  section?: string | string[]
}

export default async function AggregateLoomPage({ searchParams }: { searchParams: Promise<AggregatePageSearchParams> }) {
  const resolvedSearchParams = await searchParams
  const courseId = await resolveCourseId(firstParam(resolvedSearchParams.course))

  if (!courseId) {
    return (
      <main>
        <h1>Cohort Map</h1>
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
  let bytes: LoomState["bytes"] = []
  let edges: LoomState["edges"] = []
  let bytesUnavailable = false
  let aggregateUnavailable = false

  try {
    const aggregate = await getAggregateLoomData(courseId, sectionId)
    concepts = aggregate.concepts
    bytes = aggregate.bytes
    edges = aggregate.edges
    bytesUnavailable = aggregate.bytesUnavailable
  } catch (error) {
    console.error("[AggregateLoomPage] Aggregate query failed", error)
    aggregateUnavailable = true
  }

  const state: LoomState = { concepts, bytes, edges, read: "", views: { cardTable: { positions: {}, bends: {} } } }

  return (
    <main>
      <h1>Cohort Map</h1>
      <p className="tasksub" style={{ marginBottom: "20px" }}>
        A macro view of concepts, bytes, and threads across {course?.name ?? "this course"}
        {sectionName ? ` · ${sectionName}` : " · all sections"}.
        {sectionName ? "" : " Quilting happens per section — pick one in the nav to scope this map."}
      </p>

      {aggregateUnavailable && (
        <p className="tasksub" style={{ marginBottom: "12px", color: "var(--red)" }}>
          Aggregate data is temporarily unavailable. Check recent migrations and server logs.
        </p>
      )}

      {bytesUnavailable && (
        <p className="tasksub" style={{ marginBottom: "12px", color: "var(--red)" }}>
          Byte records could not be loaded. The concept/thread map is still shown.
        </p>
      )}
      
      <div style={{ marginTop: "20px", marginBottom: "40px" }}>
        <div className="card">
          <div className="mapbar">
            <span className="label">The collective cloth</span>
            <span style={{ color: "var(--ink-soft)", fontSize: "13px" }}>
              {concepts.length} concepts, {edges.length} threads, {bytes.length} bytes.
            </span>
          </div>
          <div id="mapWrap">
            <ReadOnlyClothMap state={state} />
          </div>
        </div>
      </div>
    </main>
  )
}
