import { addAllowedEmail, getAllowedEmails, getClassData, removeAllowedEmail } from "@/actions/admin"

export default async function AdminPage() {
  const [users, approvedEmails] = await Promise.all([getClassData(), getAllowedEmails()])

  return (
    <main>
      <h1>Class View</h1>
      <p style={{ marginBottom: "20px" }}>Select a student to view their loom.</p>

      <section className="card" style={{ marginBottom: "24px" }}>
        <h2>Approved Emails</h2>
        <p className="hint" style={{ marginTop: "6px" }}>
          Sign-in succeeds only when the GitHub email is present in the backend allowlist.
        </p>
        <form action={addAllowedEmail} className="quietrow" style={{ marginTop: "0", paddingTop: "0", borderTop: "none", alignItems: "stretch" }}>
          <input
            aria-label="Add approved email"
            name="email"
            type="email"
            placeholder="name@example.com"
            required
          />
          <button className="btn mini" type="submit">Add Email</button>
        </form>
        <div className="scrollbox" style={{ marginTop: "12px" }}>
          {approvedEmails.length === 0 ? (
            <div className="empty">
              <span className="cap">No approved emails yet</span>
            </div>
          ) : (
            approvedEmails.map(({ email }) => (
              <form
                key={email}
                action={removeAllowedEmail}
                className="quietrow"
                style={{ marginTop: "0", padding: "10px 12px", borderTop: "none", justifyContent: "space-between", alignItems: "center" }}
              >
                <input type="hidden" name="email" value={email} />
                <span style={{ fontFamily: "var(--mono)", fontSize: "13px", wordBreak: "break-word" }}>{email}</span>
                <button className="btn ghost mini" type="submit">Remove</button>
              </form>
            ))
          )}
        </div>
      </section>
      
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
