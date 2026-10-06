import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { cache } from 'react';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { pickLanguage, translate, type Language } from '@/lib/i18n';
import InviteClient, { type InviterInfo } from './InviteClient';

// Server half of /invite/[id]: resolves the inviter and the visitor's
// language for the <title>, the link preview and the first paint; the
// client half (InviteClient) handles the session and the add button.
const loadInviter = cache(async (id: string): Promise<InviterInfo | null> => {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const { data } = await supabaseAdmin().from('users').select('id, name, handle, avatar_url').eq('id', id).maybeSingle();
  return data ? { id: data.id, name: data.name, handle: data.handle, avatarUrl: data.avatar_url } : null;
});

async function requestLanguage(): Promise<Language> {
  return pickLanguage((await headers()).get('accept-language'));
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const [inviter, lang] = await Promise.all([loadInviter(id), requestLanguage()]);
  if (!inviter) return { title: 'HearMeOut' };
  const title = translate(lang, 'invite.title', { name: inviter.name });
  const description = translate(lang, 'invite.body', { name: inviter.name.split(' ')[0] });
  return { title, description, openGraph: { title, description }, twitter: { title, description } };
}

export default async function InvitePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [inviter, lang] = await Promise.all([loadInviter(id), requestLanguage()]);
  return <InviteClient id={id} initialInviter={inviter} initialLanguage={lang} />;
}
