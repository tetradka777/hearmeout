import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getUserProfile } from '@/lib/userProfile';
import { getCurrentUserId } from '@/lib/identity';

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  // Not an account id at all (a broken link): no lookup, no 500.
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const viewerId = await getCurrentUserId();
  const admin = supabaseAdmin();
  const profile = await getUserProfile(admin, id, viewerId);
  if (!profile) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  return NextResponse.json(profile);
}
