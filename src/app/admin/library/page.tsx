import {
  createSourceFromForm,
  deleteSource,
  getManageableSources,
  setSourceVisibility,
  updateSourceMetadata,
} from "@/actions/sources"
import Image from "next/image"

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
        <p className="hint" style={{ marginTop: "8px" }}>
          Upload the PDF first. Then review source reference, provenance, title, and optional description below.
        </p>
        <form action={createSourceFromForm} style={{ marginTop: "14px" }}>
          <div className="form-row">
            <span className="label">Title Override (Optional)</span>
            <input name="title" placeholder="Defaults to the PDF filename" />
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
                <div className="card" key={source.id} style={{ padding: "20px" }}>
                  <div style={{ display: "flex", gap: "18px", alignItems: "stretch", flexWrap: "wrap" }}>
                    <div
                      style={{
                        width: "140px",
                        minHeight: "160px",
                        alignSelf: "stretch",
                        border: "1px solid rgba(26,25,22,.14)",
                        borderRadius: "6px",
                        background: "linear-gradient(180deg, #f7f4ea 0%, #ece6d7 100%)",
                        overflow: "hidden",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        flex: "0 0 140px",
                        boxShadow: "0 12px 24px rgba(26,25,22,.09), 0 2px 6px rgba(26,25,22,.08)",
                        position: "relative",
                      }}
                    >
                      <div
                        aria-hidden="true"
                        style={{
                          position: "absolute",
                          inset: 0,
                          background: "linear-gradient(135deg, rgba(255,255,255,.32), rgba(255,255,255,0))",
                          pointerEvents: "none",
                        }}
                      />
                      <div style={{ width: "100%", height: "220px", position: "relative", zIndex: 1 }}>
                        <Image
                          alt={`Preview of ${source.title}`}
                          src={`/api/readings/${source.id}/cover`}
                          fill
                          unoptimized
                          sizes="140px"
                          style={{ objectFit: "cover", objectPosition: "top center" }}
                        />
                      </div>
                    </div>
                    <div style={{ flex: "1 1 340px", minWidth: "240px", display: "flex", flexDirection: "column", justifyContent: "space-between", gap: "12px" }}>
                      <div>
                        <div className="heading-with-info">
                          <h3 style={{ margin: "0 0 4px 0", fontSize: "16px" }}>{source.title}</h3>
                          <span className={`pill ${source.isVisible ? "beaten" : "loose"}`}>
                            {source.isVisible ? "Visible" : "Hidden"}
                          </span>
                        </div>
                        {source.author ? <p className="hint" style={{ margin: "0 0 12px 0" }}>{source.author}</p> : null}
                        {source.sourceReference ? (
                          <p className="hint" style={{ margin: source.author ? "-6px 0 12px 0" : "0 0 12px 0", fontSize: "13px" }}>
                            {source.sourceReference}
                          </p>
                        ) : null}
                        {source.isDescriptionVisible && source.description ? (
                          <p style={{ fontSize: "14px", lineHeight: "1.4", marginBottom: "16px" }}>
                            {source.description}
                          </p>
                        ) : null}
                      </div>

                      <form action={updateSourceMetadata} style={{ display: "grid", gap: "10px" }}>
                        <input type="hidden" name="sourceId" value={source.id} />
                        <div className="form-row">
                          <span className="label">Title</span>
                          <input name="title" defaultValue={source.title} required />
                        </div>
                        <div className="form-row">
                          <span className="label">Author</span>
                          <input name="author" defaultValue={source.author ?? ""} />
                        </div>
                        <div className="form-row">
                          <span className="label">Source Reference</span>
                          <input name="sourceReference" defaultValue={source.sourceReference ?? ""} placeholder="Bibliographic citation or canonical source reference" />
                        </div>
                        <div className="form-row">
                          <span className="label">Description</span>
                          <textarea name="description" defaultValue={source.description ?? ""} placeholder="Optional summary or note for approval" />
                        </div>
                        <label className="hint" style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                          <input type="checkbox" name="isDescriptionVisible" defaultChecked={source.isDescriptionVisible} />
                          Show description on library cards
                        </label>
                        <div className="form-row">
                          <span className="label">Metadata Provenance</span>
                          <textarea name="metadataProvenance" defaultValue={source.metadataProvenance ?? ""} placeholder="Where this metadata came from, e.g. email text, PDF front matter, manual review" />
                        </div>
                        <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                          <button className="btn mini" type="submit">Save Metadata</button>
                          <button className="btn ghost mini" type="submit" formAction={toggleVisibility}>
                            {source.isVisible ? "Hide" : "Reveal"}
                          </button>
                          <a className="btn ghost mini" href={`/api/readings/${source.id}?download=1`}>Download PDF</a>
                          <button className="btn mini" type="submit" formAction={removeSource}>Remove</button>
                        </div>
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