import { getAggregateLoomData } from "@/actions/admin"
import ReadOnlyClothMap from "@/components/svg/ReadOnlyClothMap"
import { normalizeCourseId } from "@/lib/courseConfig"
import type { LoomState } from "@/lib/types"

type AggregatePageSearchParams = {
  course?: string | string[]
}

export default async function AggregateLoomPage({ searchParams }: { searchParams: Promise<AggregatePageSearchParams> }) {
  const resolvedSearchParams = await searchParams
  const rawCourseId = Array.isArray(resolvedSearchParams.course)
    ? resolvedSearchParams.course[0]
    : resolvedSearchParams.course
  const courseId = normalizeCourseId(rawCourseId)
  let concepts: LoomState["concepts"] = []
  let bytes: LoomState["bytes"] = []
  let edges: LoomState["edges"] = []
  let bytesUnavailable = false
  let aggregateUnavailable = false

  try {
    const aggregate = await getAggregateLoomData(courseId)
    concepts = aggregate.concepts
    bytes = aggregate.bytes
    edges = aggregate.edges
    bytesUnavailable = aggregate.bytesUnavailable
  } catch (error) {
    console.error("[AggregateLoomPage] Aggregate query failed", error)
    aggregateUnavailable = true
  }

  const state: LoomState = { concepts, bytes, edges, read: "" }
  
  return (
    <main>
      <h1>Cohort Map</h1>
      <p className="tasksub" style={{ marginBottom: "20px" }}>A macro view of concepts, bytes, and threads across the current learner group.</p>

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
