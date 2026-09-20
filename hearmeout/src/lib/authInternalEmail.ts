// Supabase Auth requires an email on every account even though this app's
// own signup only collects a nickname + password. Accounts created that way
// get a placeholder address under this domain instead of a real one — never
// shown to the user and never sent mail. Used to build it at signup and to
// hide it again wherever a real (claimed) email would otherwise be shown.
export const INTERNAL_EMAIL_DOMAIN = 'hearmeout.internal';

export function isInternalEmail(email: string | null | undefined): boolean {
  return !!email && email.toLowerCase().endsWith(`@${INTERNAL_EMAIL_DOMAIN}`);
}
