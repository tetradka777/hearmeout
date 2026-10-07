import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { cache } from 'react';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { pickLanguage, translate, type Language } from '@/lib/i18n';
import { previewImages } from '@/lib/siteMeta';
import InviteClient, { type InviterInfo } from './InviteClient';

// Server half of /invite/[id]: resolves the inviter and the visitor's
// language for the <title>, the link preview and the first paint; the
// client half (InviteClient) handles the session and the add button.
const loadInviter = cache(async (id: string): Promise<InviterInfo | null> => {
  // Old links carry the account id; new ones the invite code (migration 024).
  const byId = /^[0-9a-f-]{36}$/i.test(id);
  if (!byId && !/^[0-9a-z]{6,32}$/i.test(id)) return null;
  const { data } = await supabaseAdmin().from('users').select('id, name, handle, avatar_url').eq(byId ? 'id' : 'invite_code', id).maybeSingle();
  return data ? { id: data.id, name: data.name, handle: data.handle, avatarUrl: data.avatar_url } : null;
});

// No Accept-Language at all is a link-preview bot (Telegram, VK): Russian,
// like the site's own preview (lib/siteMeta.ts).
async function requestLanguage(): Promise<Language> {
  const header = (await headers()).get('accept-language');
  return header ? pickLanguage(header) : 'ru';
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const [inviter, lang] = await Promise.all([loadInviter(id), requestLanguage()]);
  if (!inviter) return { title: 'HearMeOut' };
  const title = translate(lang, 'invite.title', { name: inviter.name });
  const description = translate(lang, 'invite.body', { name: inviter.name.split(' ')[0] });
  // openGraph/twitter replace the layout's whole objects, so the preview
  // image has to be repeated here.
  const images = previewImages(lang === 'ru' ? 'ru' : 'en');
  return { title, description, openGraph: { title, description, images: images.og }, twitter: { card: 'summary_large_image', title, description, images: images.twitter } };
}

export default async function InvitePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [inviter, lang] = await Promise.all([loadInviter(id), requestLanguage()]);
  const host = (await headers()).get('host') ?? 'hearmeoutt.art';
  return <InviteClient id={id} initialInviter={inviter} initialLanguage={lang} host={host} />;
}
