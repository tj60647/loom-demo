import { addAllowedEmail, getAllowedEmails, getClassData, removeAllowedEmail } from "@/actions/admin"
import { normalizeCourseId } from "@/lib/courseConfig"

type AdminPageSearchParams = {
  course?: string | string[]
}

export default async function AdminPage({ searchParams }: { searchParams: Promise<AdminPageSearchParams> }) {
  const resolvedSearchParams = await searchParams
  const rawCourseId = Array.isArray(resolvedSearchParams.course)
    ? resolvedSearchParams.course[0]
    : resolvedSearchParams.course
  const courseId = normalizeCourseId(rawCourseId)

  const [users, approvedEmails] = await Promise.all([getClassData(courseId), getAllowedEmails(courseId)])

  return (
    <main>
      <h1>Learners</h1>
      <p style={{ marginBottom: "20px" }}>Select a learner to view their loom.</p>

      <section className="card" style={{ marginBottom: "24px" }}>
        <h2>Allowed Sign-in Emails</h2>
        <p className="hint" style={{ marginTop: "6px" }}>
          Sign-in succeeds only when the GitHub email is present in the backend allowlist.
        </p>
        <form action={addAllowedEmail} className="quietrow" style={{ marginTop: "0", paddingTop: "0", borderTop: "none", alignItems: "stretch" }}>
          <input type="hidden" name="courseId" value={courseId} />
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
              <span className="cap">No allowed emails yet</span>
            </div>
          ) : (
            approvedEmails.map(({ email }) => (
              <form
                key={email}
                action={removeAllowedEmail}
                className="quietrow"
                style={{ marginTop: "0", padding: "10px 12px", borderTop: "none", justifyContent: "space-between", alignItems: "center" }}
              >
                <input type="hidden" name="courseId" value={courseId} />
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
            <a href={`/admin/user/${u.id}?course=${encodeURIComponent(courseId)}`} className="btn mini" style={{ display: "inline-block", marginTop: "15px" }}>Open Loom</a>
          </div>
        ))}
      </div>
    </main>
  )
}
