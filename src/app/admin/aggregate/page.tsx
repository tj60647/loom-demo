import { getAggregateLoomData } from "@/actions/admin"
import ClothMap from "@/components/svg/ClothMap"

export default async function AggregateLoomPage() {
  const { concepts, bytes, edges } = await getAggregateLoomData()

  const state = { concepts, bytes, edges, read: "" }
  
  return (
    <main>
      <h1>Aggregate View</h1>
      <p className="tasksub" style={{ marginBottom: "20px" }}>A macro view of all concepts, bytes, and threads from all students combined.</p>
      
      <div style={{ marginTop: "20px", marginBottom: "40px" }}>
        <div className="card">
          <div className="mapbar">
            <span className="label">The collective cloth</span>
            <span style={{ color: "var(--ink-soft)", fontSize: "13px" }}>
              {concepts.length} concepts, {edges.length} threads, {bytes.length} bytes.
            </span>
          </div>
          <div id="mapWrap">
            <ClothMap state={state as any} readSel={null} setReadSel={() => {}} />
          </div>
        </div>
      </div>
    </main>
  )
}
