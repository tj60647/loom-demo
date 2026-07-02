type AuthErrorPageProps = {
  searchParams?: Promise<{
    error?: string
  }>
}

export default async function AuthErrorPage({ searchParams }: AuthErrorPageProps) {
  const resolvedSearchParams = await searchParams
  const errorCode = resolvedSearchParams?.error
  const isAccessDenied = errorCode === "AccessDenied"

  return (
    <main>
      <div className="empty" style={{ marginTop: "100px", maxWidth: "680px", marginLeft: "auto", marginRight: "auto" }}>
        <h2>{isAccessDenied ? "Access not yet approved" : "Sign-in error"}</h2>
        <span className="cap" style={{ display: "block", marginTop: "10px", textTransform: "none" }}>
          {isAccessDenied
            ? (
              <>
                email tj at <a href="mailto:tjmcleish@berkeley.edu">tjmcleish@berkeley.edu</a> to be added.
              </>
            )
            : "Something went wrong during sign-in. Please try again."}
        </span>
        <div style={{ marginTop: "20px", display: "flex", justifyContent: "center", gap: "10px", flexWrap: "wrap" }}>
          <a href="/" className="btn">Back to Loom</a>
        </div>
      </div>
    </main>
  )
}
