import {
  createSourceFromForm,
  deleteSource,
  getManageableSources,
  setSourceVisibility,
} from "@/actions/sources"

export default async function AdminLibraryPage() {
  const sources = await getManageableSources()

  return (
    <main>
      <h1>Library Manager</h1>
      <p className="tasksub" style={{ marginBottom: "20px" }}>
        Add readings, hide them from the student library, reveal them again, or remove them entirely.
      </p>

      <section className="card" style={{ marginBottom: "24px" }}>
        <h2>Add a Reading</h2>
        <form action={createSourceFromForm} style={{ marginTop: "14px" }}>
          <div className="form-row">
            <span className="label">Title</span>
            <input name="title" placeholder="e.g. Designing Engineers" required />
          </div>
          <div className="form-row" style={{ marginTop: "10px" }}>
            <span className="label">Author</span>
            <input name="author" placeholder="e.g. Bucciarelli" />
          </div>
          <div className="form-row" style={{ marginTop: "10px" }}>
            <span className="label">Description</span>
            <input name="description" placeholder="Short blurb" />
          </div>
          <div className="form-row" style={{ marginTop: "10px" }}>
            <span className="label">PDF File</span>
            <input name="file" type="file" accept="application/pdf" required />
          </div>
          <button className="btn mini" style={{ marginTop: "12px" }} type="submit">Upload Reading</button>
        </form>
      </section>

      <section>
        <div className="heading-with-info" style={{ marginBottom: "14px" }}>
          <h2>Current Library</h2>
          <span className="hint">{sources.length} reading(s)</span>
        </div>
        {sources.length === 0 ? (
          <div className="card empty">
            <span className="cap">No readings in the library yet</span>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
            {sources.map((source) => {
              const toggleVisibility = setSourceVisibility.bind(null, source.id, !source.isVisible)
              const removeSource = deleteSource.bind(null, source.id)

              return (
                <div className="card" key={source.id} style={{ padding: "18px 20px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: "16px", alignItems: "flex-start", flexWrap: "wrap" }}>
                    <div style={{ minWidth: "260px", flex: "1 1 420px" }}>
                      <div className="heading-with-info">
                        <h3 style={{ fontSize: "18px" }}>{source.title}</h3>
                        <span className={`pill ${source.isVisible ? "beaten" : "loose"}`}>
                          {source.isVisible ? "Visible" : "Hidden"}
                        </span>
                      </div>
                      {source.author ? <p className="hint" style={{ margin: "4px 0 10px 0" }}>{source.author}</p> : null}
                      {source.description ? <p style={{ margin: 0 }}>{source.description}</p> : null}
                    </div>
                    <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                      <form action={toggleVisibility}>
                        <button className="btn ghost mini" type="submit">
                          {source.isVisible ? "Hide" : "Reveal"}
                        </button>
                      </form>
                      <form action={removeSource}>
                        <button className="btn mini" type="submit">Remove</button>
                      </form>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </section>
    </main>
  )
}