/**
 * Assertions for the sign-in gate: who GitHub says you are, and whether the
 * roster lets you in.
 *
 *   npx tsx scripts/check-auth.ts          pure rules, no database
 *   npx tsx scripts/check-auth.ts --db     also exercises the real SQL
 *
 * GitHub itself cannot be driven from a test, so what is asserted here is
 * everything on Loom's side of the callback: the shape of GitHub's email
 * payload in, the decision out. The one step left uncovered — that GitHub
 * really does return the payload we parse — is the manual smoke test in
 * docs/deployments.md ("The one gate CI cannot close").
 *
 * --db writes to whatever LOOM_ENV_FILE points at (default .env.local). It
 * creates a throwaway course, invite and user under a `check-auth-…` slug and
 * deletes them again in a finally, touching nothing that was already there.
 * It is out of `npm run check` for that reason.
 */
import {
  decideSignIn,
  displayEmail,
  guestLinkEmail,
  isNoReplyAddress,
  normalizeEmail,
  resolveIdentityEmail,
  SIGN_IN_ERROR,
  signInErrorUrl,
  signInMessage,
  verifiedCandidates,
} from "../src/lib/signIn"

let failures = 0
function check(name: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) failures += 1
  console.log(`${ok ? "  ok  " : "  FAIL"}  ${name}${ok ? "" : `  got ${JSON.stringify(got)} want ${JSON.stringify(want)}`}`)
}

const email = (address: string, extra: Record<string, unknown> = {}) => ({
  email: address,
  primary: false,
  verified: true,
  ...extra,
})

/** A roster: the set of addresses some course has invited or enrolled. */
const roster = (...invited: string[]) => {
  const set = new Set(invited)
  return async (candidate: string) => set.has(candidate)
}
const NOBODY = roster()

// These scripts compile to CJS, where top-level await is unavailable, so the
// whole run lives in main().
async function main() {
  console.log("\nnormalization — one spelling of an address, on both sides of every comparison")

  check("case is folded", normalizeEmail("Jane.Doe@Berkeley.EDU"), "jane.doe@berkeley.edu")
  check("surrounding whitespace is dropped", normalizeEmail("  jane@berkeley.edu\n"), "jane@berkeley.edu")
  check("a missing address is not an address", normalizeEmail(null), "")
  check("neither is a bare username", normalizeEmail("jane"), "")
  check("nor a domainless string", normalizeEmail("jane@localhost"), "")
  check("nor one with an interior space", normalizeEmail("jane doe@berkeley.edu"), "")
  check("nor 300 characters of it", normalizeEmail(`${"a".repeat(300)}@berkeley.edu`), "")
  check("github's alias is recognised", isNoReplyAddress("1234+jane@users.noreply.github.com"), true)

  console.log("\nwhat github returns — only a confirmed address may stand for a person")

  check(
    "a verified primary is a candidate",
    verifiedCandidates([email("jane@berkeley.edu", { primary: true })]),
    ["jane@berkeley.edu"]
  )
  check(
    "an unverified address is not, however primary",
    verifiedCandidates([email("jane@berkeley.edu", { primary: true, verified: false })]),
    []
  )
  check(
    "and a missing verified flag fails closed",
    verifiedCandidates([{ email: "jane@berkeley.edu", primary: true }]),
    []
  )
  check(
    "github's noreply alias is not a mailbox anyone can be reached at",
    verifiedCandidates([email("1234+jane@users.noreply.github.com", { primary: true })]),
    []
  )
  check(
    "the primary comes first, so it is the one named back to the student",
    verifiedCandidates([email("second@berkeley.edu"), email("primary@gmail.com", { primary: true })]),
    ["primary@gmail.com", "second@berkeley.edu"]
  )
  check(
    "duplicates collapse under normalization",
    verifiedCandidates([email("Jane@Berkeley.edu", { primary: true }), email("jane@berkeley.edu")]),
    ["jane@berkeley.edu"]
  )
  check("a payload that is not a list yields nothing", verifiedCandidates({ message: "Bad credentials" }), [])
  check("neither does an empty one", verifiedCandidates([]), [])

  console.log("\nthe decision — which verified address signs this student in")

  check(
    "an invited student signs in on the address the course knows",
    await resolveIdentityEmail(["jane@berkeley.edu"], roster("jane@berkeley.edu")),
    { status: "ok", email: "jane@berkeley.edu" }
  )

  // The commonest real shape: GitHub set up years ago on a personal address,
  // the course address added afterwards. Matching only the primary would tell a
  // properly invited student they were not invited.
  check(
    "a course address added alongside a personal primary still matches",
    await resolveIdentityEmail(["jane@gmail.com", "jane@berkeley.edu"], roster("jane@berkeley.edu")),
    { status: "ok", email: "jane@berkeley.edu" }
  )
  check(
    "the roster's spelling and github's need not agree on case",
    await resolveIdentityEmail(
      verifiedCandidates([email("Jane@Berkeley.EDU", { primary: true })]),
      roster("jane@berkeley.edu")
    ),
    { status: "ok", email: "jane@berkeley.edu" }
  )
  check(
    "a student nobody invited is refused, and told which address we saw",
    await resolveIdentityEmail(["jane@gmail.com", "jane@berkeley.edu"], NOBODY),
    { status: "not-on-roster", email: "jane@gmail.com" }
  )
  check(
    "an account with no confirmed address is refused differently",
    await resolveIdentityEmail([], roster("jane@berkeley.edu")),
    { status: "no-verified-email", email: null }
  )

  // The whole point of checking `verified`: an unverified address is a string
  // somebody typed, so pasting a classmate's must not open their course.
  check(
    "an unverified address does not admit anyone, even one that is on the roster",
    await resolveIdentityEmail(
      verifiedCandidates([email("jane@berkeley.edu", { primary: true, verified: false })]),
      roster("jane@berkeley.edu")
    ),
    { status: "no-verified-email", email: null }
  )

  // A returning student: the adapter hands the signIn callback our stored row,
  // so the address gated on is the one already enrolled.
  check(
    "an enrolled student signs in again on their stored address",
    await resolveIdentityEmail(["jane@berkeley.edu"], roster("jane@berkeley.edu")),
    { status: "ok", email: "jane@berkeley.edu" }
  )
  check(
    "an address whose access has ended is refused like any stranger",
    await resolveIdentityEmail(["jane@berkeley.edu"], NOBODY),
    { status: "not-on-roster", email: "jane@berkeley.edu" }
  )

  console.log("\nthe gate — one answer, whichever door asked")

  // GitHub and the mailed link are two proofs of identity, not two grants of
  // access: both providers call decideSignIn and nothing else.
  check(
    "an invited address is admitted",
    await decideSignIn("jane@berkeley.edu", roster("jane@berkeley.edu")),
    true
  )
  check(
    "  however it is spelled",
    await decideSignIn("  Jane@Berkeley.EDU ", roster("jane@berkeley.edu")),
    true
  )
  check(
    "an uninvited address is refused, and named back",
    await decideSignIn("stranger@gmail.com", roster("jane@berkeley.edu")),
    "/auth/error?error=NotOnRoster&email=stranger%40gmail.com"
  )
  check(
    "a missing address is refused before anything else",
    await decideSignIn(null, roster("jane@berkeley.edu")),
    "/auth/error?error=NoVerifiedEmail"
  )
  // NextAuth runs this at the *send* step for the email provider, so a refusal
  // here is also what stops Loom mailing a link to someone nobody invited.
  check(
    "so no link is ever mailed to an address off the roster",
    typeof (await decideSignIn("stranger@gmail.com", NOBODY)),
    "string"
  )
  check(
    "a guest the roster knows is admitted by the same rule as a student",
    await decideSignIn("hugh@example.com", roster("hugh@example.com")),
    true
  )

  console.log("\nthe mailed link itself")

  const LINK = "http://localhost:3100/api/auth/callback/email?callbackUrl=%2F&token=abc&email=a%40b.c"
  const mail = guestLinkEmail(LINK)
  check("the plain-text part carries the link verbatim", mail.text.includes(LINK), true)
  check("the html part escapes the ampersands in the href", mail.html.includes("&amp;token=abc"), true)
  check("  so no raw & survives inside the href", /href="[^"]*[^&]&(?!amp;|quot;|lt;)/.test(mail.html), false)
  check("it says the link is single-use", mail.text.includes("works once"), true)
  check("and tells an unexpected recipient they can ignore it", mail.text.includes("ignore"), true)
  check("the subject names Loom", mail.subject.includes("Loom"), true)

  console.log("\nwhat the student is told — a way forward, and no implementation detail")

  check(
    "no confirmed email points at github's settings",
    signInMessage(SIGN_IN_ERROR.noVerifiedEmail).title,
    "GitHub sent no confirmed email address"
  )
  check(
    "  and can be retried once they have fixed it",
    signInMessage(SIGN_IN_ERROR.noVerifiedEmail).retry,
    true
  )
  check(
    "not on the roster names the address we matched on",
    signInMessage(SIGN_IN_ERROR.notOnRoster, "jane@gmail.com").body.includes("jane@gmail.com"),
    true
  )
  check(
    "  and is a different message from the one above",
    signInMessage(SIGN_IN_ERROR.notOnRoster).title !== signInMessage(SIGN_IN_ERROR.noVerifiedEmail).title,
    true
  )
  check(
    "an existing non-github account explains itself rather than looping",
    signInMessage("OAuthAccountNotLinked").retry,
    false
  )
  check(
    "an unrecognised code still gets a way forward, and never quotes the code",
    signInMessage("OAuthCallback").body.includes("OAuthCallback"),
    false
  )
  check("  and offers the button again", signInMessage("OAuthCallback").retry, true)
  check("no code at all is the plain invitation to sign in", signInMessage(undefined).title, "Sign in to Loom")
  check(
    "a spent or expired link says so, and offers another go",
    [signInMessage("Verification").title, signInMessage("Verification").retry],
    ["That sign-in link no longer works", true]
  )
  check(
    "a link that could not be sent is our fault, not the guest's",
    [signInMessage("EmailSignin").title, signInMessage("EmailSignin").contact],
    ["The sign-in link could not be sent", true]
  )

  // The error page echoes ?email= back. It is the student's own address, but the
  // query string is anybody's to write, so it goes out through the same
  // normalization it came in on.
  check("a hand-written ?email= that is not an address is not echoed", displayEmail("<script>alert(1)</script>"), null)
  check("nor is an empty one", displayEmail(""), null)
  check("a real one survives, folded", displayEmail("Jane@Berkeley.EDU"), "jane@berkeley.edu")
  check(
    "the refusal url carries the code and the address, encoded",
    signInErrorUrl(SIGN_IN_ERROR.notOnRoster, "jane+loom@berkeley.edu"),
    "/auth/error?error=NotOnRoster&email=jane%2Bloom%40berkeley.edu"
  )
  check(
    "and omits the address when there is none to name",
    signInErrorUrl(SIGN_IN_ERROR.noVerifiedEmail),
    "/auth/error?error=NoVerifiedEmail"
  )

  if (process.argv.includes("--db")) await checkRoster()

  console.log(
    failures === 0 ? "\n[check-auth] all assertions passed\n" : `\n[check-auth] ${failures} FAILED\n`
  )
  process.exit(failures === 0 ? 0 : 1)
}

/**
 * The four rules emailHasAppAccess is made of, and the enrolment upsert, run
 * against real tables — the parts that are SQL predicates rather than
 * decisions, and so cannot be asserted with a fake.
 */
async function checkRoster() {
  // Imported here, not at the top, so the pure run above needs neither a
  // database nor next-auth.
  const { db, databaseLabel } = await import("../src/db")
  const { emailHasAppAccess, enrolInvitedCourses, isAdminUser } = await import("../src/lib/auth")
  const { courseAllowedEmails, courseMemberships, courses, sections, users } = await import("../src/db/schema")
  const { and, eq } = await import("drizzle-orm")

  console.log(`\nthe roster itself — ${databaseLabel()}`)

  const stamp = `check-auth-${Date.now()}`
  const learner = `${stamp}@loom.check`
  let courseId = ""
  let userId = ""
  let facultyUserId = ""

  try {
    courseId = (
      await db
        .insert(courses)
        .values({ slug: stamp, name: "Auth check (temporary)", term: "check" })
        .returning({ id: courses.id })
    )[0].id
    // Mixed case on purpose: users.email keeps whatever the provider sent, and
    // every read of it has to cope with that.
    userId = (
      await db
        .insert(users)
        .values({ name: "Auth check", email: learner.toUpperCase() })
        .returning({ id: users.id })
    )[0].id

    check("an address no course knows has no access", await emailHasAppAccess(learner), false)
    check("nor does an empty one", await emailHasAppAccess(""), false)

    await db.insert(courseAllowedEmails).values({ courseId, email: learner })
    check("an invitation admits the address", await emailHasAppAccess(learner), true)
    check("  however the student's github spells it", await emailHasAppAccess(learner.toUpperCase()), true)

    const memberships = () =>
      db
        .select()
        .from(courseMemberships)
        .where(and(eq(courseMemberships.courseId, courseId), eq(courseMemberships.userId, userId)))

    await enrolInvitedCourses(userId, learner.toUpperCase())
    const afterFirst = await memberships()
    check("first sign-in enrols the student in the course that invited them", afterFirst.length, 1)
    check("  as a learner, not an instructor", afterFirst[0]?.role, "LEARNER")

    await enrolInvitedCourses(userId, learner)
    const afterSecond = await memberships()
    check("signing in again enrols them no further", afterSecond.length, 1)
    check("  and leaves the membership active", afterSecond[0]?.removedAt, null)

    // What removeFromRoster does: the invitation goes, the membership is only
    // soft-removed. Access must ride on the membership until then.
    await db
      .delete(courseAllowedEmails)
      .where(and(eq(courseAllowedEmails.courseId, courseId), eq(courseAllowedEmails.email, learner)))
    check("an enrolled student keeps access once the invitation is spent", await emailHasAppAccess(learner), true)

    await db
      .update(courseMemberships)
      .set({ removedAt: new Date() })
      .where(and(eq(courseMemberships.courseId, courseId), eq(courseMemberships.userId, userId)))
    check("a removed student, with no invitation left, has none", await emailHasAppAccess(learner), false)

    await db.insert(courseAllowedEmails).values({ courseId, email: learner })
    await enrolInvitedCourses(userId, learner)
    const reinstated = await memberships()
    check("re-inviting them reinstates the one membership they had", reinstated.length, 1)
    check("  by clearing the removal, not by making a second row", reinstated[0]?.removedAt, null)

    // An invitation addressed to the Faculty Section enrols as FACULTY
    // (ruling 18). Fresh enrolment only: the learner above, re-invited to any
    // section, keeps the role they already have — asserted implicitly by the
    // reinstatement checks never touching role.
    const facultySectionId = (
      await db
        .insert(sections)
        .values({ courseId, slug: "faculty", name: "Faculty Section" })
        .returning({ id: sections.id })
    )[0].id
    const facultyEmail = `${stamp}-faculty@loom.check`
    facultyUserId = (
      await db
        .insert(users)
        .values({ name: "Auth check faculty", email: facultyEmail })
        .returning({ id: users.id })
    )[0].id
    await db
      .insert(courseAllowedEmails)
      .values({ courseId, email: facultyEmail, sectionId: facultySectionId })
    await enrolInvitedCourses(facultyUserId, facultyEmail)
    const facultyRows = await db
      .select()
      .from(courseMemberships)
      .where(and(eq(courseMemberships.courseId, courseId), eq(courseMemberships.userId, facultyUserId)))
    check("a Faculty Section invitation enrols as faculty", facultyRows[0]?.role, "FACULTY")
    check("  homed in that section", facultyRows[0]?.sectionId, facultySectionId)

    // The admin gets in on the fallback list alone, with no roster row anywhere.
    const admin = "tjm@tjmcleish.com"
    check("the admin is recognised without a roster row", isAdminUser({ email: admin }), true)
    check("  and may sign in", await emailHasAppAccess(admin), true)
    check("  however github spells it", await emailHasAppAccess(" TJM@TJMcLeish.com "), true)
  } finally {
    if (userId) await db.delete(users).where(eq(users.id, userId))
    if (facultyUserId) await db.delete(users).where(eq(users.id, facultyUserId))
    if (courseId) await db.delete(courses).where(eq(courses.id, courseId))
  }
}

main()
