import { PRODUCTION_ORIGIN, showWrongSiteHint } from "@/lib/signIn"

/**
 * The callout for somebody refused at the wrong site.
 *
 * Rendered with every refused sign-in on a deployment that is not confirmed
 * production — /auth/error always, /auth/signin only when it is showing a
 * bounced error. A production user who signs in at the tester site is refused
 * by the dev roster, not by GitHub, and every other sentence on those screens
 * tells them to repair a roster problem they do not have. This one names the
 * actual repair.
 *
 * Loud on purpose (TJ, 2026-08-21: "it needs to be visually distinct.
 * different color button, different color background … 'this is loom's
 * development site' in bold and larger. the same color palette, but more bold
 * and danger"). Danger here is ochre, not red: globals.css reserves --red for
 * the one selected thing, and ochre is already the palette's attention accent.
 * So: an ochre-washed box, a 2px ochre border, the headline in the display
 * face, and the one ochre button in the app — every other .btn is ink, which
 * is what makes this one read as "you are somewhere else".
 *
 * A server component on purpose: showWrongSiteHint reads VERCEL_ENV, which is
 * server-side only — the same rule the sign-in page states for its own door
 * decision. Copy lives here once, so the two screens cannot drift.
 */
export default function WrongSiteHint() {
  if (!showWrongSiteHint()) return null

  return (
    <aside
      style={{
        marginTop: "24px",
        background: "color-mix(in srgb, var(--ochre) 14%, var(--paper))",
        border: "2px solid var(--ochre)",
        borderRadius: "3px",
        padding: "18px 20px",
      }}
    >
      <strong
        style={{
          display: "block",
          fontFamily: "var(--display)",
          fontSize: "21px",
          fontWeight: 700,
          color: "var(--ochre)",
        }}
      >
        This is Loom&rsquo;s development site
      </strong>
      <span style={{ display: "block", marginTop: "8px", fontSize: "15px", lineHeight: 1.5, color: "var(--ink)" }}>
        If you are looking for Loom, sign in here:
      </span>
      <a
        href={`${PRODUCTION_ORIGIN}/auth/signin`}
        className="btn"
        style={{
          display: "inline-block",
          marginTop: "12px",
          background: "var(--ochre)",
          color: "#fff",
        }}
      >
        sign in at loom.aroughidea.com
      </a>
    </aside>
  )
}
