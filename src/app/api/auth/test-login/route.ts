import { NextResponse } from 'next/server';
import { db } from '@/db';
import { users, sessions } from '@/db/schema';
import { eq } from 'drizzle-orm';
import crypto from 'crypto';

export async function GET() {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Not allowed in production' }, { status: 403 });
  }

  // 1. Find or create a test user
  const email = "tjm@tjmcleish.com";
  const dbUser = await db.select().from(users).where(eq(users.email, email)).limit(1);
  let userId = dbUser[0]?.id;

  if (!userId) {
    const newUser = await db.insert(users).values({
      name: "Test Admin",
      email: email,
      role: "ADMIN"
    }).returning();
    userId = newUser[0].id;
  }

  // 2. Generate a random session token
  const sessionToken = crypto.randomUUID();
  const expires = new Date();
  expires.setDate(expires.getDate() + 30); // 30 days from now

  // 3. Insert into sessions table
  await db.insert(sessions).values({
    sessionToken,
    userId,
    expires,
  });

  // 4. Return response with cookies. Different NextAuth/Auth.js versions
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
