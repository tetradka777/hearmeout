import type { Metadata } from 'next';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getUserProfile } from '@/lib/userProfile';
import { ALBUMS } from '@/lib/data';

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
      <div className="rd">
        <div className="modalbg" style={{ position: 'fixed', inset: 0 }}>
          <div className="tile" style={{ textAlign: 'center' }}>
            <p className="muted">User not found</p>
            <a href="/" className="link">HearMeOut →</a>
          </div>
        </div>
      </div>
    );
  }

  const top4 = profile.top4Albums
    .map((id) => ALBUMS.find((a) => a.id === id))
    .filter((a): a is (typeof ALBUMS)[number] => !!a);

  return (
    <div className="rd pubwrap">
      <div className="wrap" style={{ maxWidth: 480, paddingTop: 40 }}>
        <div className="tile t-ink hero" style={{ textAlign: 'center' }}>
          <div className="dot" style={{ width: 88, height: 88, fontSize: 32, margin: '0 auto 14px', ...(profile.avatarUrl ? { backgroundImage: `url('${profile.avatarUrl}')`, backgroundSize: 'cover', backgroundPosition: 'center' } : {}) }}>
            {!profile.avatarUrl && profile.name[0]}
          </div>
          <h1 style={{ fontSize: 28 }}>{profile.name}</h1>
          <p className="muted">{profile.handle}</p>
          <div className="stats3" style={{ marginTop: 14 }}>
            <div><span className="num">{profile.stats.ratings}</span><small>ratings</small></div>
            <div><span className="num">{profile.stats.avg || '—'}</span><small>average</small></div>
            <div><span className="num">{profile.stats.reviews}</span><small>reviews</small></div>
          </div>
        </div>

        {profile.genres.length > 0 && (
          <div className="tile sec">
            <h3>Favorite genres</h3>
            <div className="stack" style={{ marginTop: 10 }}>
              {(() => {
                const maxPct = Math.max(1, ...profile.genres.map((g) => g.pct));
                return profile.genres.map((g) => (
                  <div className="row" key={g.g}>
                    <div className="g">{g.g}</div>
                    <div className="meter"><i style={{ width: `${(g.pct / maxPct) * 100}%` }} /></div>
                  </div>
                ));
              })()}
            </div>
          </div>
        )}

        {top4.length > 0 && (
          <div className="tile sec">
            <h3>Top albums</h3>
            <div className="t4" style={{ marginTop: 10 }}>
              {top4.map((a, i) => (
                <div key={a.id} className="cov" style={{ aspectRatio: '1', backgroundImage: a.cover ? `url('${a.cover}')` : undefined, backgroundSize: 'cover', backgroundPosition: 'center', position: 'relative' }}>
                  <span className="bdg">{i + 1}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div style={{ textAlign: 'center', marginTop: 30 }}>
          <a href="/" className="link">Rate your own music on HearMeOut →</a>
        </div>
      </div>
    </div>
  );
}
