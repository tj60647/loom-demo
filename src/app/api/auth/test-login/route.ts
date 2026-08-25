import { NextResponse } from 'next/server';
import { db } from '@/db';
import { users, sessions, courses, courseMemberships } from '@/db/schema';
import { asc, eq } from 'drizzle-orm';
import crypto from 'crypto';
import { ensureFacultySection } from '@/lib/courses';
import { isBranchPreview, previewLoginDecision, sessionCookieNames } from '@/lib/previewLogin';
import { logWarn } from "@/lib/log"

// Non-production test backdoor: mints a session directly, bypassing OAuth.
//
// Four identities, so test data never lands on a real account:
// - default          → the admin (tjm), for /admin surfaces.
// - ?as=testa        → "Test User A", a plain learner who OWNS all graph data
//                      the suite creates (captures, temp maps). Enrolled in the
//                      first course on the site so the shelf shows readings.
// - ?as=faculty      → "Test Faculty", a plain USER whose MEMBERSHIP in that
//                      course carries FACULTY (ruling 18) — the two roles are
//                      different things, and the read-side admin view turns on
//                      the membership one. Homed in the Faculty Section, the
//                      way setMemberRole and an invitation both home them.
const IDENTITIES = {
  admin: { email: 'tjm@tjmcleish.com', name: 'Test Admin', role: 'ADMIN', membership: null },
  testa: { email: 'test-user-a@loom.local', name: 'Test User A', role: 'USER', membership: 'LEARNER' },
  faculty: { email: 'test-faculty@loom.local', name: 'Test Faculty', role: 'USER', membership: 'FACULTY' },
  // - ?as=twocourse → "Test Two Courses", the ONLY identity holding two
  //   enrolments, for the course-switch spec. Dedicated on purpose: testa's
  //   single-course shelf is a fixture contract other specs assert against,
  //   and a mid-suite switch by testa would re-scope concurrent workers'
  //   shelves live. Its second course is created on demand below.
  twocourse: { email: 'test-two-courses@loom.local', name: 'Test Two Courses', role: 'USER', membership: 'LEARNER' },
} as const;

/**
 * Where to land after signing in. Same-origin paths only: a `next` that names
 * another host — or starts `//`, which a URL parser reads as one — would turn
 * this into an open redirect, and an open redirect on the one route that hands
 * out sessions is worth more to an attacker than the session is.
 */
function safeNext(raw: string | null): string {
  if (!raw || !raw.startsWith('/') || raw.startsWith('//')) return '/';
  return raw;
}

export async function GET(request: Request) {
  const url = new URL(request.url);

  // Where this door is open, and on what terms, lives in one place — see
  // src/lib/previewLogin.ts. The key may travel as ?key= or as a header: the
  // query string is what a developer can actually paste, and the header is for
  // anything that would rather not put a secret in a URL (and therefore in the
  // deployment's request logs).
  const decision = previewLoginDecision(
    process.env,
    url.searchParams.get('key') ?? request.headers.get('x-preview-login')
  );
  if (!decision.allowed) {
    // The reason is logged, never returned: on a public preview URL the
    // difference between "no secret configured" and "key does not match" is a
    // hint, and 403 with nothing in it is the same answer to every prod.
    logWarn("preview-login.refused", { why: decision.why });
    return NextResponse.json({ error: 'Not allowed' }, { status: 403 });
  }

  // On a branch preview the fallback is the learner, never the admin.
  //
  // The key gates entry; it does not reduce authority. A preview URL is public
  // and its key is shared by a whole team, so the bare URL — the one that gets
  // pasted into chat and bookmarked — must not be the one that hands out an
  // ADMIN session. That matters here more than the synthetic database suggests:
  // the blob store is shared with production (deployments.md invariant 4) and
  // deleting a reading deletes production's copy of the file.
  //
  // `?as=admin` still reaches it, because reviewing an admin surface on a
  // preview is a real need and the door is already keyed. What changes is that
  // admin is now something you ask for, not something you land on. Locally
  // nothing moves: the suite's default storage state is still the admin.
  const asParam = url.searchParams.get('as');
  const identity =
    asParam === 'testa' ? IDENTITIES.testa
    : asParam === 'faculty' ? IDENTITIES.faculty
    : asParam === 'twocourse' ? IDENTITIES.twocourse
    : asParam === 'admin' ? IDENTITIES.admin
    : isBranchPreview() ? IDENTITIES.testa
    : IDENTITIES.admin;

  // 1. Find or create the user
  const dbUser = await db.select().from(users).where(eq(users.email, identity.email)).limit(1);
  let userId = dbUser[0]?.id;

  if (!userId) {
    const newUser = await db.insert(users).values({
      name: identity.name,
      email: identity.email,
      role: identity.role,
    }).returning();
    userId = newUser[0].id;
  }

  // 2. A learner needs an enrolment or the shelf is empty (membership is the
  //    learner-side authorization boundary). Mirrors events.signIn, including
  //    reinstatement if a previous run's removal test soft-removed them.
  //    The role is re-set on conflict, not left alone: a run that promoted or
  //    demoted this account would otherwise leak into the next one, and the
  //    faculty specs would pass or fail on residue rather than on the gate.
  if (identity.membership) {
    const course = await db.select().from(courses).orderBy(asc(courses.createdAt)).limit(1);
    if (course[0]) {
      // Faculty are homed in the Faculty Section; a learner's placement is left
      // exactly as it was. seed-demo places Test User A in "Section 1" and the
      // Overlays compare within it, so writing a section here would silently
      // unplace them and the section band would go empty for the wrong reason.
      const faculty = identity.membership === 'FACULTY';
      const sectionId = faculty ? await ensureFacultySection(course[0].id) : null;
      await db
        .insert(courseMemberships)
        .values({ courseId: course[0].id, userId, role: identity.membership, sectionId })
        .onConflictDoUpdate({
          target: [courseMemberships.courseId, courseMemberships.userId],
          set: {
            removedAt: null,
            role: identity.membership,
            ...(faculty ? { sectionId } : {}),
          },
        });

      // The two-course identity's second enrolment, in a fixture course
      // created on demand — created NOW, so its createdAt is newer than every
      // seeded course and the suite's oldest-course dependencies
      // (tests/admin-course-param.spec.ts pins the first course;
      // tests/signed-out-reading.spec.ts rides the oldest's readings) keep
      // holding. No course_source rows on purpose: an empty second shelf is
      // what lets the switch spec SEE the re-scope.
      if (identity === IDENTITIES.twocourse) {
        let second = (
          await db.select().from(courses).where(eq(courses.slug, 'e2e-second-course')).limit(1)
        )[0];
        second ??= (
          await db
            .insert(courses)
            .values({
              slug: 'e2e-second-course',
              name: 'Second Course (e2e)',
              term: '',
              description: 'Fixture for tests/course-switch.spec.ts; carries no readings on purpose.',
            })
            .returning()
        )[0];
        await db
          .insert(courseMemberships)
          .values({ courseId: second.id, userId, role: 'LEARNER' })
          .onConflictDoUpdate({
            target: [courseMemberships.courseId, courseMemberships.userId],
            set: { removedAt: null, role: 'LEARNER' },
          });
      }
    }
  }

  // Selection residue is a leak of the same kind the role reset above guards
  // against: a previous run's course switch (selectedAt, migration 0027)
  // would land every later sign-in as this account in the wrong course — and
  // Playwright workers run in parallel. Every backdoor session starts from
  // "never switched", whichever identity it is.
  await db
    .update(courseMemberships)
    .set({ selectedAt: null })
    .where(eq(courseMemberships.userId, userId));

  // 3. Generate a random session token
  const sessionToken = crypto.randomUUID();
  const expires = new Date();
  expires.setDate(expires.getDate() + 30); // 30 days from now

  // 4. Insert into sessions table
  await db.insert(sessions).values({
    sessionToken,
    userId,
    expires,
  });

  // 5. Return the session cookie under the name next-auth will read back.
  //    Over https that is the `__Secure-` spelling, and a `__Secure-` cookie
  //    the browser will only keep if it is also marked secure — which is why
  //    the old unconditional `secure: false` made this door useless on any
  //    deployment: the cookie was set, and then never looked at.
  const isHttps =
    (request.headers.get('x-forwarded-proto') ?? url.protocol.replace(':', '')) === 'https';

  // A person gets taken into the app; a script gets the JSON it has always
  // had. The suite only reads `response.ok()` and the cookies, so this is
  // invisible to it — but on a preview the alternative is a page of raw JSON
  // and a human wondering whether it worked, next to a GitHub button that
  // cannot work and looks like the way in. `?next=` chooses the landing page.
  const wantsHtml = (request.headers.get('accept') ?? '').includes('text/html');
  const response = wantsHtml
    ? NextResponse.redirect(new URL(safeNext(url.searchParams.get('next')), url))
    : NextResponse.json({ success: true, userId, sessionToken });

  for (const name of sessionCookieNames(isHttps)) {
    response.cookies.set(name, sessionToken, {
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
      secure: isHttps,
      expires,
    });
  }

  return response;
}
