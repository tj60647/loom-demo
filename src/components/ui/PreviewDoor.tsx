/**
 * The way into a preview deployment.
 *
 * A plain GET form, deliberately: it submits `key`, `as` and `next` as query
 * parameters, which is exactly the shape `/api/auth/test-login` already reads,
 * so this needs no client component, no fetch and no JavaScript at all. The
 * browser sends `Accept: text/html`, and the route answers a redirect into the
 * app rather than the JSON a script would get.
 *
 * It exists because the alternative — telling each person the URL and the key
 * and the order to visit them in — is a workflow that has to be re-explained
 * every time somebody new opens a branch. A form on the page they already
 * landed on does not.
 *
 * Rendered only where `VERCEL_ENV === "preview"`. On production this component
 * is never reached, and the route it posts to answers 403 there regardless.
 */
export default function PreviewDoor({
  callbackUrl,
  requiresKey = false,
}: {
  callbackUrl?: string
  requiresKey?: boolean
}) {
  return (
    <div
      className="empty"
      style={{
        marginTop: "22px",
        padding: "20px 22px",
        textAlign: "left",
        display: "flex",
        flexDirection: "column",
        gap: "12px",
      }}
    >
      <span className="cap" style={{ textTransform: "none" }}>
        <strong>This is a preview of work in progress.</strong> GitHub sign-in cannot work
        here — GitHub only returns people to one registered web address, and every preview
        has its own. {requiresKey ? "Use the team key instead." : "Pick who to be and open it."}
      </span>

      <form
        method="get"
        action="/api/auth/test-login"
        style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}
      >
        <input type="hidden" name="next" value={callbackUrl && callbackUrl.startsWith("/") ? callbackUrl : "/"} />
        {requiresKey && (
          <input
            name="key"
            type="password"
            required
            placeholder="team key"
            autoComplete="off"
            aria-label="Team key for this preview"
            style={{ flex: "1 1 220px", minWidth: "180px" }}
          />
        )}
        <select name="as" className="tinput" aria-label="Sign in as" defaultValue="">
          <option value="">as admin</option>
          <option value="testa">as a learner</option>
          <option value="faculty">as faculty</option>
        </select>
        <button className="btn" type="submit">
          Open this preview
        </button>
      </form>

      <span className="cap" style={{ textTransform: "none", fontSize: "12px" }}>
        {requiresKey
          ? "the key is shared with the team and can be rotated at any time. it works only on previews — production refuses it."
          : "previews carry the readings and the test accounts, and nobody's real work. this door exists only on previews — production refuses it."}
      </span>
    </div>
  )
}
