import { getStaffViewer, getUserLoomDataAsAdmin } from "@/actions/admin"
import ReadOnlyClothMap from "@/components/svg/ReadOnlyClothMap"
import { firstParam } from "@/lib/courses"
import type { LoomState } from "@/lib/types"
import ConceptName from "@/components/ui/ConceptName"
import { conceptNameText } from "@/lib/conceptName"

// Route segment params and searchParams are promises (Next 16 async request APIs).
type UserLoomSearchParams = {
  course?: string | string[]
}

export default async function UserLoomPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<UserLoomSearchParams>
}) {
  const resolvedParams = await params
  const resolvedSearchParams = await searchParams
  // Viewer-aware: faculty resolve within their own courses (ruling 18).
  const { courseId } = await getStaffViewer(firstParam(resolvedSearchParams.course))
  const { concepts, passages, edges } = await getUserLoomDataAsAdmin(resolvedParams.id, courseId)

  const state: LoomState = { concepts, passages, edges, links: [], maps: [], cloths: [], views: { cardTable: { positions: {}, bends: {} } } }
  
  // Note: We use a simple read-only wrapper around ClothMap here
  return (
    <main>
      <h1>Student Loom (Read-Only)</h1>
      <div style={{ marginTop: "20px", marginBottom: "40px" }}>
        <div className="card">
          <div className="mapbar">
            <span className="label">The cloth</span>
            <span style={{ color: "var(--ink-soft)", fontSize: "13px" }}>
              {concepts.length} concepts, {edges.length} threads, {passages.length} passages.
            </span>
          </div>
          <div id="mapWrap">
            <ReadOnlyClothMap state={state} />
          </div>
        </div>
      </div>
      
      <div className="two">
        <div className="card">
          <h2>Concepts</h2>
          <div className="scrollbox">
            {concepts.map(c => (
              <div key={c.id} className="crow">
                <div className="clabel"><ConceptName concept={c} /></div>
              </div>
            ))}
          </div>
        </div>
        <div className="card">
          <h2>Threads</h2>
          <div className="scrollbox">
            {edges.map(e => {
              const from = concepts.find(c => c.id === e.fromId)
              const to = concepts.find(c => c.id === e.toId)
              return (
                <div key={e.id} className="thread">
                  <div className="trip">
                    {from ? conceptNameText(from) : "?"} <span className="v">{e.handle || "→"}</span> {to ? conceptNameText(to) : "?"}
                  </div>
                  <div className="sent">{e.sentence}</div>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </main>
  )
}
