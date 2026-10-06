// The "no friends yet" screen shows these five real, always-seeded accounts
// (seeded by migration 025) as example profiles so a first-time user can try the
// friend-comparison feature before they've added anyone real. They're
// excluded from name/handle search and can't send or receive friend
// requests (see filters in api/users/search and api/friends), but their
// profile — stats, genres, match score, shared ratings — is open to
// everyone, unlike a real account's, since there's no privacy to protect
// here: it's fixture data, not a person.
// Seeded by supabase/migration_025_demo_profiles.sql (same ids).
export const DEMO_PROFILES: readonly { id: string; name: string; handle: string; avatarUrl: null }[] = [
  { id: '546a1107-5b9d-421c-bf66-feb979e78c9f', name: 'mira', handle: 'demo_mira', avatarUrl: null },
  { id: 'b9fa30ea-848d-4a4e-90f3-82cca01c9809', name: 'daniil', handle: 'demo_daniil', avatarUrl: null },
  { id: '810af81d-38e0-4c4b-ac82-9adc1c2665f7', name: 'ilya', handle: 'demo_ilya', avatarUrl: null },
  { id: 'd4fd8251-a76c-4d9d-bff4-1816611b40e4', name: 'noa', handle: 'demo_noa', avatarUrl: null },
  { id: '0a6c4ca3-ed24-43ef-953f-de9f63923e7c', name: 'lena', handle: 'demo_lena', avatarUrl: null },
];

export const DEMO_ACCOUNT_IDS: readonly string[] = DEMO_PROFILES.map((p) => p.id);

export function isDemoAccountId(id: string | null | undefined): boolean {
  return !!id && DEMO_ACCOUNT_IDS.includes(id);
}
