import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'What we store — HearMeOut' };

// Plain server component, deliberately outside AppProvider/AppGate — same
// reasoning as /u/[handle]: a page a user might link to or read without
// being logged in, so it shouldn't depend on client-side auth state.
export default function PrivacyPage() {
  const ITEMS = [
    "We only store what the app itself needs: your name, e-mail, password (hashed — we never see it in plain text), your ratings and reviews, and your listening history if you connected Spotify or uploaded it yourself.",
    "We don't ask for or store your age, city, or phone number — none of that is needed to compare music taste.",
    "Your full profile (stats, rating history) is visible only to you and your friends, or when you switch it to open in settings. Anyone can find you by name, but only someone you've added as a friend can open your profile while it's closed.",
    "Album covers and track data come directly from Spotify and Deezer — we don't store or redistribute music files.",
    "You can delete your account at any time from settings — that erases everything listed above with no way to recover it.",
  ];
  return (
    <div className="rd">
      <div className="wrap" style={{ maxWidth: 640, paddingTop: 48 }}>
        <h1 className="big" style={{ fontSize: 'clamp(28px,5vw,48px)' }}>What we store</h1>
        <div className="bento">
          {ITEMS.map((text, i) => (
            <div className="tile" key={i}><p>{text}</p></div>
          ))}
        </div>
        <div style={{ marginTop: 30, textAlign: 'center' }}><a href="/" className="link">HearMeOut →</a></div>
      </div>
    </div>
  );
}
