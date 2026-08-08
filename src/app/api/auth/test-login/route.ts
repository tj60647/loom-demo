import { NextResponse } from 'next/server';
import { db } from '@/db';
import { users, sessions, courses, courseMemberships } from '@/db/schema';
import { asc, eq } from 'drizzle-orm';
import crypto from 'crypto';
import { ensureFacultySection } from '@/lib/courses';

// Non-production test backdoor: mints a session directly, bypassing OAuth.
//
// Three identities, so test data never lands on a real account:
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
} as const;

export async function GET(request: Request) {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Not allowed in production' }, { status: 403 });
  }

  const asParam = new URL(request.url).searchParams.get('as');
  const identity =
    asParam === 'testa' ? IDENTITIES.testa
    : asParam === 'faculty' ? IDENTITIES.faculty
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
    }
  }

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

  // 5. Return response with cookies. Different NextAuth/Auth.js versions
  // may read different cookie names, so set both in non-production test flow.
  const response = NextResponse.json({ success: true, userId, sessionToken });
  response.cookies.set('next-auth.session-token', sessionToken, {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure: false,
    expires,
  });
  response.cookies.set('authjs.session-token', sessionToken, {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure: false,
    expires,
  });

  return response;
}
