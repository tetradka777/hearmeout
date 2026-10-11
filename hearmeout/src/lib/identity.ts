import { createHmac, timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';
import { supabaseAdmin } from './supabaseAdmin';

export const IDENTITY_COOKIE = 'hmo_uid';

// Session cookie = "<userId>.<HMAC-SHA256(userId)>", signed with
// SESSION_SECRET. It used to hold the bare user id, which the server
// trusted as-is — and user ids are public (every /invite/<id> link), so
// anyone could set the cookie to someone else's id and act as them.
// A cookie without a valid signature (including every old unsigned one)
// now reads as "signed out".
//
// "Sign out on all devices": the cookie also carries the account's
// session_version (migration 027) — "<userId>.<version>.<HMAC(userId.version)>"
// — and stops being valid once that number is raised. A two-part cookie
// from before is version 0, so nobody was signed out by the change. The
// current version is read from the database, kept for a minute per user;
// without the migration every account is version 0.
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

const VERSION_TTL_MS = 60 * 1000;
const versionCache = new Map<string, { at: number; v: number }>();

export async function sessionVersion(userId: string): Promise<number> {
  const hit = versionCache.get(userId);
  if (hit && Date.now() - hit.at < VERSION_TTL_MS) return hit.v;
  const { data, error } = await supabaseAdmin().from('users').select('session_version').eq('id', userId).maybeSingle();
  const v = !error && typeof data?.session_version === 'number' ? data.session_version : 0;
  versionCache.set(userId, { at: Date.now(), v });
  return v;
}

export function forgetSessionVersion(userId: string): void {
  versionCache.delete(userId);
}

export async function getCurrentUserId(): Promise<string | null> {
  const key = secret();
  if (!key) {
    console.error('SESSION_SECRET is missing or shorter than 32 characters — every request is treated as signed out.');
    return null;
  }
  const value = (await cookies()).get(IDENTITY_COOKIE)?.value;
  if (!value) return null;
  const parts = value.split('.');
  if (parts.length !== 2 && parts.length !== 3) return null;
  const userId = parts[0];
  const version = parts.length === 3 ? Number(parts[1]) : 0;
  if (!userId || !Number.isInteger(version) || version < 0) return null;
  const signed = parts.length === 3 ? `${userId}.${version}` : userId;
  const given = Buffer.from(parts[parts.length - 1]);
  const expected = Buffer.from(sign(signed, key));
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  if (version !== (await sessionVersion(userId))) return null;
  return userId;
}

export async function setCurrentUserId(userId: string) {
  const key = secret();
  if (!key) throw new Error('SESSION_SECRET is missing or shorter than 32 characters');
  const cookieStore = await cookies();
  const version = await sessionVersion(userId);
  cookieStore.set(IDENTITY_COOKIE, `${userId}.${version}.${sign(`${userId}.${version}`, key)}`, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 365,
    path: '/',
  });
}
