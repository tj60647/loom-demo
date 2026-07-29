import { addAllowedEmail, getAllowedEmails, getClassData, removeAllowedEmail } from "@/actions/admin"
import { assignMemberSection } from "@/actions/courses"
import { firstParam, getCourse, listSections, resolveCourseId, resolveSectionId } from "@/lib/courses"

type AdminPageSearchParams = {
  course?: string | string[]
  section?: string | string[]
}

export default async function AdminPage({ searchParams }: { searchParams: Promise<AdminPageSearchParams> }) {
  const resolved = await searchParams
  const courseId = await resolveCourseId(firstParam(resolved.course))

  if (!courseId) {
    return (
      <main>
        <h1>Learners</h1>
        <div className="card empty" style={{ marginTop: "20px" }}>
          <span className="cap">No courses yet — create one on the Courses tab</span>
        </div>
      </main>
    )
  }

  const sectionId = await resolveSectionId(courseId, firstParam(resolved.section))
  const [course, courseSections, users, approvedEmails] = await Promise.all([
    getCourse(courseId),
    listSections(courseId),
    getClassData(courseId, sectionId),
    getAllowedEmails(courseId),
  ])

  const sectionName = sectionId
    ? courseSections.find((section) => section.id === sectionId)?.name ?? null
    : null
  const sectionById = new Map(courseSections.map((section) => [section.id, section.name]))

  return (
    <main>
      <h1>Learners</h1>
      <p style={{ marginBottom: "20px" }}>
        {course?.name}
        {sectionName ? ` · ${sectionName}` : " · all sections"}. Select a learner to view their loom.
      </p>

      <section className="card" style={{ marginBottom: "24px" }}>
        <h2>Allowed Sign-in Emails</h2>
        <p className="hint" style={{ marginTop: "6px" }}>
          Sign-in succeeds only when the GitHub email is on this list. Learners are enrolled in
          the course on first sign-in, into the section chosen here.
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
          {courseSections.length > 0 ? (
            <select name="sectionId" className="tinput" aria-label="Assign to section" style={{ flex: "0 0 auto", minWidth: "150px" }}>
              <option value="">No section</option>
              {courseSections.map((section) => (
                <option key={section.id} value={section.id}>{section.name}</option>
              ))}
            </select>
          ) : null}
          <button className="btn mini" type="submit">Add Email</button>
        </form>
        <div className="scrollbox" style={{ marginTop: "12px" }}>
          {approvedEmails.length === 0 ? (
            <div className="empty">
              <span className="cap">No allowed emails yet</span>
            </div>
          ) : (
            approvedEmails.map(({ email, sectionId: preassigned }) => (
              <form
                key={email}
                action={removeAllowedEmail}
                className="quietrow"
                style={{ marginTop: "0", padding: "10px 12px", borderTop: "none", justifyContent: "space-between", alignItems: "center" }}
              >
                <input type="hidden" name="courseId" value={courseId} />
                <input type="hidden" name="email" value={email} />
                <span style={{ fontFamily: "var(--mono)", fontSize: "13px", wordBreak: "break-word" }}>{email}</span>
                {preassigned ? (
                  <span className="pill beaten">{sectionById.get(preassigned) ?? "Section"}</span>
                ) : null}
                <button className="btn ghost mini" type="submit">Remove</button>
              </form>
            ))
          )}
        </div>
      </section>

      {users.length === 0 ? (
        <div className="card empty">
          <span className="cap">
            {sectionName ? `No learners in ${sectionName} yet` : "No learners enrolled yet"}
          </span>
        </div>
      ) : (
        <div className="two">
          {users.map(u => (
            <div key={u.id} className="card">
              <h2>{u.name}</h2>
              <div className="hint">{u.email}</div>
              <div style={{ marginTop: "10px" }}>
                <span className="pill beaten">{u.conceptsCount} concepts</span>
                <span className="pill loose" style={{ marginLeft: "10px" }}>{u.edgesCount} edges</span>
                {u.sectionName ? (
                  <span className="pill beaten" style={{ marginLeft: "10px" }}>{u.sectionName}</span>
                ) : (
                  <span className="pill loose" style={{ marginLeft: "10px" }}>Unassigned</span>
                )}
              </div>

              {courseSections.length > 0 ? (
                <form action={assignMemberSection} className="quietrow" style={{ marginTop: "12px" }}>
                  <input type="hidden" name="courseId" value={courseId} />
                  <input type="hidden" name="userId" value={u.id} />
                  <select name="sectionId" className="tinput" defaultValue={u.sectionId ?? ""} aria-label={`Section for ${u.name}`}>
                    <option value="">No section</option>
                    {courseSections.map((section) => (
                      <option key={section.id} value={section.id}>{section.name}</option>
                    ))}
                  </select>
                  <button className="btn ghost mini" type="submit">Assign</button>
                </form>
              ) : null}

              <a
                href={`/admin/user/${u.id}?course=${encodeURIComponent(courseId)}`}
                className="btn mini"
                style={{ display: "inline-block", marginTop: "15px" }}
              >
                Open Loom
              </a>
            </div>
          ))}
        </div>
      )}
    </main>
  )
}
