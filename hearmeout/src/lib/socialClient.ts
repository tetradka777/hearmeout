'use client';

import { useEffect, useState } from 'react';
import type { SocialSummary } from '@/app/api/social/route';
import type { ReactionKind } from './reactions';

// Comment counts and reactions for the cards on screen (migration 029).
// Targets asked for within a moment of each other go to the server in one
// request; answers are kept for this visit and updated in place when you
// react or comment.
const store = new Map<string, SocialSummary | null>();
const listeners = new Map<string, Set<() => void>>();
const pending = new Set<string>();
let timer: ReturnType<typeof setTimeout> | null = null;

const EMPTY: SocialSummary = { comments: 0, reactions: {}, mine: [] };

function emit(target: string) { listeners.get(target)?.forEach((fn) => fn()); }

async function flush() {
  timer = null;
  const targets = [...pending];
  pending.clear();
  for (let i = 0; i < targets.length; i += 40) {
    const chunk = targets.slice(i, i + 40);
    try {
      const res = await fetch('/api/social', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ targets: chunk }) });
      const data = res.ok ? await res.json() as Record<string, SocialSummary> : {};
      for (const t of chunk) store.set(t, data[t] ?? null);
    } catch {
      for (const t of chunk) store.delete(t);
    }
    chunk.forEach(emit);
  }
}

function request(target: string) {
  if (store.has(target) || pending.has(target)) return;
  pending.add(target);
  if (!timer) timer = setTimeout(flush, 60);
}

// null: not allowed / not available (no bar is shown); undefined: loading.
export function useSocial(target: string | null): SocialSummary | null | undefined {
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!target) return;
    const fn = () => setTick((n) => n + 1);
    const set = listeners.get(target) || new Set();
    set.add(fn);
    listeners.set(target, set);
    request(target);
    return () => { set.delete(fn); };
  }, [target]);
  return target ? store.get(target) : null;
}

export async function toggleReaction(target: string, kind: ReactionKind): Promise<boolean> {
  const before = store.get(target) ?? EMPTY;
  const had = before.mine.includes(kind);
  // Shown at once; put back if the server says no.
  const next: SocialSummary = {
    comments: before.comments,
    reactions: { ...before.reactions, [kind]: Math.max(0, (before.reactions[kind] || 0) + (had ? -1 : 1)) },
    mine: had ? before.mine.filter((k) => k !== kind) : [...before.mine, kind],
  };
  store.set(target, next);
  emit(target);
  const res = await fetch('/api/social/react', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ target, kind }) }).catch(() => null);
  if (!res?.ok) { store.set(target, before); emit(target); return false; }
  return true;
}

export function setCommentCount(target: string, n: number) {
  const s = store.get(target) ?? EMPTY;
  store.set(target, { ...s, comments: n });
  emit(target);
}

// Targets, built the same way everywhere.
export const socialKey = {
  review: (userId: string, albumId: string) => `review:${userId}:${albumId}`,
  play: (userId: string, albumId: string, at: string) => `play:${userId}:${albumId}:${localDay(at)}`,
  recap: (userId: string, period: string, start: string) => `recap:${userId}:${period}:${start.slice(0, 10)}`,
  award: (groupId: string, month: string, label: string) => `award:${groupId}:${month}:${label}`,
};

function localDay(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
