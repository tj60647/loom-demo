/**
 * "no github account?", answered with the way to get one — not a door.
 *
 * The landing used to link this phrase to /auth/signin, where the guest
 * email form renders only when RESEND_API_KEY and EMAIL_FROM are set. They
 * are set in no environment (data-environments.md, "Open gaps"), so the
 * click landed on a page whose only addition was the button the reader had
 * just declined. What a person without a GitHub account actually needs is
 * a GitHub account: they are free, and the roster gate never cared which
 * username they pick — only which verified email the account carries
 * (resolveIdentityEmail in src/lib/signIn.ts).
 *
 * If the guest email door is ever configured, /auth/signin grows the
 * mailed-link form (GuestEmailSignIn) in this fold's place, and this
 * component is where the landing should learn to mention it — from here
 * that is a server question a client component cannot ask.
 */
export default function NoGithubAccountHelp() {
  return (
    <details style={{ marginTop: "26px", textAlign: "center" }}>
      <summary className="cap" style={{ cursor: "pointer", textTransform: "none" }}>
        no github account?
      </summary>
      <p
        className="cap"
        style={{
          marginTop: "14px",
          textTransform: "none",
          maxWidth: "460px",
          marginLeft: "auto",
          marginRight: "auto",
        }}
      >
        a github account is free. create one at{" "}
        <a href="https://github.com/signup" target="_blank" rel="noopener noreferrer">
          github.com/signup
        </a>
        , signing up with the email address your course invited — loom finds your
        course by that address, so the username can be anything you like. then come
        back and sign in with github.
      </p>
    </details>
  )
}
