import type { Metadata } from 'next';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getUserProfile } from '@/lib/userProfile';
import { ALBUMS } from '@/lib/data';
import { accentMix } from '@/lib/accentGradient';

// Plain server component, deliberately outside AppProvider/AppGate — this
// is the one page in the app reachable without logging in, so a rating
// profile can be shared as a link. What an anonymous visitor sees here
// (open teaser vs. locked stub) is decided by the owner's own is_open_profile
// setting in getUserProfile, same as in-app viewing — going private closes
// this page too, not just search.
async function loadProfile(handle: string) {
  const normalized = handle.startsWith('@') ? handle : `@${handle}`;
  const admin = supabaseAdmin();
  const { data: user } = await admin.from('users').select('id').eq('handle', normalized).maybeSingle();
  if (!user) return null;
  return getUserProfile(admin, user.id, null);
}

export async function generateMetadata({ params }: { params: Promise<{ handle: string }> }): Promise<Metadata> {
  const { handle } = await params;
  const profile = await loadProfile(handle);
  if (!profile) return { title: 'HearMeOut' };
  return {
    title: `${profile.name} — HearMeOut`,
    description: `${profile.stats.ratings} ratings, ${profile.stats.avg || '—'} average on HearMeOut`,
  };
}

export default async function PublicProfilePage({ params }: { params: Promise<{ handle: string }> }) {
  const { handle } = await params;
  const profile = await loadProfile(handle);

  if (!profile) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-legacy)', color: 'var(--text)' }}>
        <div style={{ textAlign: 'center' }}>
          <p style={{ fontSize: 15, color: 'var(--muted)' }}>User not found</p>
          <a href="/" style={{ color: 'var(--lime)' }}>HearMeOut →</a>
        </div>
      </div>
    );
  }

  const top4 = profile.top4Albums
    .map((id) => ALBUMS.find((a) => a.id === id))
    .filter((a): a is (typeof ALBUMS)[number] => !!a);

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-legacy)', color: 'var(--text)', padding: '40px 20px' }}>
      <div style={{ maxWidth: 480, margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <div
            className="avatar-lg"
            style={{
              width: 88, height: 88, margin: '0 auto 14px',
              ...(profile.avatarUrl ? { backgroundImage: `url('${profile.avatarUrl}')`, backgroundSize: 'cover', backgroundPosition: 'center' } : {}),
            }}
          />
          <div style={{ fontFamily: 'var(--font-space-grotesk),sans-serif', fontSize: 22, fontWeight: 700 }}>{profile.name}</div>
          <div className="profile-joined">{profile.handle}</div>
        </div>

        <div className="stat-grid" style={{ marginBottom: 26 }}>
          <div className="box"><div className="v">{profile.stats.ratings}</div><div className="l">RATINGS</div></div>
          <div className="box"><div className="v">{profile.stats.avg || '—'}</div><div className="l">AVERAGE</div></div>
          <div className="box"><div className="v">{profile.stats.reviews}</div><div className="l">REVIEWS</div></div>
        </div>

        {profile.genres.length > 0 && (
          <>
            <div className="section-head"><h2>Favorite genres</h2></div>
            <div style={{ marginBottom: 26 }}>
              {(() => {
                const maxPct = Math.max(1, ...profile.genres.map((g) => g.pct));
                return profile.genres.map((g) => (
                  <div className="genre-row" key={g.g}>
                    <div className="name">{g.g}</div>
                    <div className="track"><div className="fill" style={{ width: `${g.pct}%`, background: accentMix(g.pct / maxPct) }} /></div>
                  </div>
                ));
              })()}
            </div>
          </>
        )}

        {top4.length > 0 && (
          <>
            <div className="section-head"><h2>Top albums</h2></div>
            <div className="top4-grid" style={{ marginBottom: 26 }}>
              {top4.map((a, i) => (
                <div key={a.id} className="art" style={{ backgroundImage: a.cover ? `url('${a.cover}')` : undefined, backgroundSize: 'cover', backgroundPosition: 'center', position: 'relative' }}>
                  <span className="rank">{String(i + 1).padStart(2, '0')}</span>
                </div>
              ))}
            </div>
          </>
        )}

        <div style={{ textAlign: 'center', marginTop: 30 }}>
          <a href="/" style={{ color: 'var(--lime)', fontSize: 13, fontFamily: 'var(--font-ibm-plex-mono),monospace' }}>Rate your own music on HearMeOut →</a>
        </div>
      </div>
    </div>
  );
}
