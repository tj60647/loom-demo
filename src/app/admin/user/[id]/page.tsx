import { getStaffViewer, getUserLoomDataAsAdmin } from "@/actions/admin"
import ReadOnlyClothMap from "@/components/svg/ReadOnlyClothMap"
import { firstParam } from "@/lib/courses"
import type { LoomState } from "@/lib/types"
import ConceptName from "@/components/ui/ConceptName"
import ThreadCard from "@/components/cards/ThreadCard"

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
            {/* THE SHARED CARD (docs/thread-card.md). Hand-rolled here until
                2026-08-18, and wrong in three ways at once: it put `→` inside
                the SOLID `.v` pill — the cloth's mark for a beaten thread — so
                every unlabelled thread on this page read as labelled; it left
                the ends unbolded, which no other drawing did; and it printed
                the sentence without quotation marks. All three go with the
                hand-rolling.

                `state.links` is `[]` on this route (built above from what
                `getUserLoomDataAsAdmin` returns), which is exactly the input
                that makes `labelOf` fall back to the legacy `handle` — the
                same label this page was already showing, resolved by the one
                function that decides what a label is. */}
            {edges.map((e) => (
              <ThreadCard
                key={e.id}
                thread={e}
                from={concepts.find((c) => c.id === e.fromId)}
                to={concepts.find((c) => c.id === e.toId)}
                links={state.links}
              />
            ))}
          </div>
        </div>
      </div>
    </main>
  )
}
