import { getClassData } from "@/actions/admin"

export default async function AdminPage() {
  const users = await getClassData()

  return (
    <main>
      <h1>Class View</h1>
      <p style={{ marginBottom: "20px" }}>Select a student to view their loom.</p>
      
      <div className="two">
        {users.map(u => (
          <div key={u.id} className="card">
            <h2>{u.name}</h2>
            <div className="hint">{u.email}</div>
            <div style={{ marginTop: "10px" }}>
              <span className="pill beaten">{u.conceptsCount} concepts</span>
              <span className="pill loose" style={{ marginLeft: "10px" }}>{u.edgesCount} edges</span>
            </div>
            <a href={`/admin/user/${u.id}`} className="btn mini" style={{ display: "inline-block", marginTop: "15px" }}>View Loom</a>
          </div>
        ))}
      </div>
    </main>
  )
}
