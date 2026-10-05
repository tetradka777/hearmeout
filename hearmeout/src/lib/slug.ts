// Spaces become "_", so "_" is a legal handle character — it must also
// survive when typed directly (it used to be stripped, turning a typed
// "test_account1" into "@testaccount1").
export function slugifyHandle(name: string): string {
  const base = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9а-яё_\s-]/gi, '')
    .replace(/\s+/g, '_')
    .slice(0, 24);
  return base || 'user';
}

// Case-insensitive exact match for a handle via PostgREST .ilike(): "_" and
// "%" are LIKE wildcards, so they're escaped — otherwise "@a_b" would also
// match "@axb", and two matches make .maybeSingle() return nothing.
export function handleIlikePattern(rawHandle: string): string {
  const handle = rawHandle.trim().startsWith('@') ? rawHandle.trim() : `@${rawHandle.trim()}`;
  return handle.replace(/[\\%_]/g, (c) => `\\${c}`);
}
