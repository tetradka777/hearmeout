import { createHmac, timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';

export const IDENTITY_COOKIE = 'hmo_uid';

// Session cookie = "<userId>.<HMAC-SHA256(userId)>", signed with
// SESSION_SECRET. It used to hold the bare user id, which the server
// trusted as-is — and user ids are public (every /invite/<id> link), so
// anyone could set the cookie to someone else's id and act as them.
// A cookie without a valid signature (including every old unsigned one)
// now reads as "signed out".
function secret(): string | null {
  const s = process.env.SESSION_SECRET;
  return s && s.length >= 32 ? s : null;
}

function sign(userId: string, key: string): string {
  return createHmac('sha256', key).update(userId).digest('base64url');
}

// Signup/login check this before touching the database, so a missing
// SESSION_SECRET fails cleanly instead of creating an account nobody can
// sign in to.
export function hasSessionSecret(): boolean {
  return secret() !== null;
}

export async function getCurrentUserId(): Promise<string | null> {
  const key = secret();
  if (!key) {
    console.error('SESSION_SECRET is missing or shorter than 32 characters — every request is treated as signed out.');
    return null;
  }
  const value = (await cookies()).get(IDENTITY_COOKIE)?.value;
  if (!value) return null;
  const dot = value.lastIndexOf('.');
  if (dot <= 0) return null;
  const userId = value.slice(0, dot);
  const given = Buffer.from(value.slice(dot + 1));
  const expected = Buffer.from(sign(userId, key));
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  return userId;
}

export async function setCurrentUserId(userId: string) {
  const key = secret();
  if (!key) throw new Error('SESSION_SECRET is missing or shorter than 32 characters');
  const cookieStore = await cookies();
  cookieStore.set(IDENTITY_COOKIE, `${userId}.${sign(userId, key)}`, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 365,
    path: '/',
  });
}
