import { getUserLoomDataAsAdmin } from "@/actions/admin"
import ClothMap from "@/components/svg/ClothMap"
import { normalizeCourseId } from "@/lib/courseConfig"

// In Next.js 15, route segment params are promises.
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
  const rawCourseId = Array.isArray(resolvedSearchParams.course)
    ? resolvedSearchParams.course[0]
    : resolvedSearchParams.course
  const courseId = normalizeCourseId(rawCourseId)
  const { concepts, bytes, edges } = await getUserLoomDataAsAdmin(resolvedParams.id, courseId)

  const state = { concepts, bytes, edges, read: "" }
  
  // Note: We use a simple read-only wrapper around ClothMap here
  return (
    <main>
      <h1>Student Loom (Read-Only)</h1>
      <div style={{ marginTop: "20px", marginBottom: "40px" }}>
        <div className="card">
          <div className="mapbar">
            <span className="label">The cloth</span>
            <span style={{ color: "var(--ink-soft)", fontSize: "13px" }}>
              {concepts.length} concepts, {edges.length} threads, {bytes.length} bytes.
            </span>
          </div>
          <div id="mapWrap">
            <ClothMap state={state as any} readSel={null} setReadSel={() => {}} />
          </div>
        </div>
      </div>
      
      <div className="two">
        <div className="card">
          <h2>Concepts</h2>
          <div className="scrollbox">
            {concepts.map(c => (
              <div key={c.id} className="crow">
                <div className="clabel">{c.label}</div>
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
                    {from?.label} <span className="v">{e.handle || "→"}</span> {to?.label}
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
