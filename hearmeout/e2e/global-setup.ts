import { createHmac } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

// Signs the session cookie for the test account @123 with SESSION_SECRET
// from .env.local (the same signature the server checks, lib/identity) and
// saves it as Playwright's storage state. A two-part cookie is session
// version 0, valid until someone uses "Sign out on all devices" on @123.
export const TEST_USER_ID = 'caca09e0-a983-4e43-8260-4c9d9cd2e1dc';

function envValue(name: string): string | undefined {
  const file = path.join(__dirname, '..', '.env.local');
  if (!fs.existsSync(file)) return process.env[name];
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const i = line.indexOf('=');
    if (i > 0 && line.slice(0, i).trim() === name) return line.slice(i + 1).trim().replace(/^"|"$/g, '');
  }
  return process.env[name];
}

export default async function globalSetup() {
  const secret = envValue('SESSION_SECRET');
  if (!secret || secret.length < 32) throw new Error('SESSION_SECRET (32+ characters) is needed in .env.local for the e2e tests');
  const value = `${TEST_USER_ID}.${createHmac('sha256', secret).update(TEST_USER_ID).digest('base64url')}`;
  const state = {
    cookies: [{ name: 'hmo_uid', value, domain: '127.0.0.1', path: '/', expires: -1, httpOnly: true, secure: false, sameSite: 'Lax' as const }],
    origins: [],
  };
  const dir = path.join(__dirname, '.auth');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'user.json'), JSON.stringify(state));
}
