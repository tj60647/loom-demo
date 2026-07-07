import { getAggregateLoomData } from "@/actions/admin"
import ClothMap from "@/components/svg/ClothMap"
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
  const { concepts, bytes, edges, bytesUnavailable } = await getAggregateLoomData(courseId)

  const state: LoomState = { concepts, bytes, edges, read: "" }
  
  return (
    <main>
      <h1>Cohort Map</h1>
      <p className="tasksub" style={{ marginBottom: "20px" }}>A macro view of concepts, bytes, and threads across the current learner group.</p>

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
            <ClothMap state={state} readSel={null} setReadSel={() => {}} />
          </div>
        </div>
      </div>
    </main>
  )
}
