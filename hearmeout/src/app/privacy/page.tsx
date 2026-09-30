import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'What we store — HearMeOut' };

// Plain server component, deliberately outside AppProvider/AppGate — same
// reasoning as /u/[handle]: a page a user might link to or read without
// being logged in, so it shouldn't depend on client-side auth state.
export default function PrivacyPage() {
  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-legacy)', color: 'var(--text)', padding: '48px 20px' }}>
      <div style={{ maxWidth: 560, margin: '0 auto' }}>
        <div style={{ fontFamily: 'var(--font-space-grotesk),sans-serif', fontSize: 24, fontWeight: 700, marginBottom: 20 }}>
          What we store
        </div>
        <div style={{ fontSize: 14.5, lineHeight: 1.8, color: 'var(--text)' }}>
          <p style={{ marginBottom: 14 }}>We only store what the app itself needs: your name, e-mail, password (hashed — we never see it in plain text), your ratings and reviews, and your listening history if you connected Spotify or uploaded it yourself.</p>
          <p style={{ marginBottom: 14 }}>We don't ask for or store your age, city, or phone number — none of that is needed to compare music taste.</p>
          <p style={{ marginBottom: 14 }}>Your full profile (stats, rating history) is visible only to you and your friends, or when you switch it to open in settings. Anyone can find you by name, but only someone you've added as a friend can open your profile while it's closed.</p>
          <p style={{ marginBottom: 14 }}>Album covers and track data come directly from Spotify and Deezer — we don't store or redistribute music files.</p>
          <p style={{ marginBottom: 14 }}>You can delete your account at any time from settings — that erases everything listed above with no way to recover it.</p>
        </div>
        <div style={{ marginTop: 30, textAlign: 'center' }}>
          <a href="/" style={{ color: 'var(--lime)', fontSize: 13, fontFamily: 'var(--font-ibm-plex-mono),monospace' }}>HearMeOut →</a>
        </div>
      </div>
    </div>
  );
}
