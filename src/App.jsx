import { useState, useEffect } from 'react';
import './index.css';

const CATEGORIES = [
  "AC Technician", "Architect", "Auto Electrician", "Baker", "Barber", "Borehole Digger", "Cabinet Maker", "Cake Decorator", "Carpenter", "Car Washer", "Caregiver", "Caterer", "CCTV Camera Installer", "Contractor", "Courier", "Delivery Rider", "DJ", "Domestic Cleaner", "Draughtsman", "Driving School Instructor", "Dry Cleaner", "DSTV Installer", "Electrician", "Electronic Repairer", "Event Decorator", "Event Planner", "Fabricator", "Fashion Designer", "Fumigation Specialist", "Generator Repairer", "Graphic Designer", "Gym Instructor", "Hairdresser", "Home Tutor", "Interior Designer", "Laptop Repairer", "Laundryman", "Mason", "Massage Therapist", "Master of Ceremonies (MC)", "Mechanic", "Music Instructor", "Nail Technician", "Office Cleaner", "Painter", "Pest Control Specialist", "Phone Repairer", "Photographer", "Physiotherapist", "Plumber", "POP Ceiling Designer", "Post-Construction Cleaner", "Private Driver", "Private Nurse", "Quantity Surveyor", "Seamstress", "Site Supervisor", "Social Media Manager", "Spa Worker", "Tailor", "Tiler", "Towing Service", "Translator", "Video Editor", "Videographer", "Web Developer", "Welder"
];

export default function App() {
  const [view, setView] = useState('landing'); // landing | browse | signin | signup
  const [token, setToken] = useState(localStorage.getItem('findly_token') || null);
  const [me, setMe] = useState(null);
  const [listings, setListings] = useState([]);
  const [category, setCategory] = useState('');
  const [unlocked, setUnlocked] = useState({}); // listingId -> { phone, whatsapp }
  const [upgradePrompt, setUpgradePrompt] = useState(false);
  const [authError, setAuthError] = useState('');
  const [authForm, setAuthForm] = useState({ email: '', password: '' });
  const [showPassword, setShowPassword] = useState(false);
  const [loadedAt] = useState(Date.now());

  useEffect(() => {
    if (token) refreshMe();
  }, [token]);

  useEffect(() => {
    if (view === 'browse') runSearch();
  }, [view, category]);

  async function refreshMe() {
    try {
      const res = await fetch('/api/me', { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) setMe(await res.json());
    } catch {}
  }

  async function runSearch() {
    const params = new URLSearchParams();
    if (category) params.set('category', category);
    const res = await fetch(`/api/search?${params}`);
    const data = await res.json();
    setListings(data.listings || []);
  }

  async function handleAuth(e, mode) {
    e.preventDefault();
    setAuthError('');
    try {
      const body = mode === 'signup' ? { ...authForm, hp: '', loadedAt } : authForm;
      const res = await fetch(`/api/${mode}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) { setAuthError(data.error || 'Something went wrong.'); return; }
      localStorage.setItem('findly_token', data.token);
      setToken(data.token);
      setView('browse');
    } catch {
      setAuthError('Network error. Try again.');
    }
  }

  async function handleUnlock(listingId) {
    if (!token) { setView('signup'); return; }
    setUpgradePrompt(false);
    try {
      const res = await fetch('/api/unlock-contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ listingId }),
      });
      const data = await res.json();
      if (res.status === 402) { setUpgradePrompt(true); return; }
      if (!res.ok) return;
      setUnlocked(prev => ({ ...prev, [listingId]: data }));
      refreshMe();
    } catch {}
  }

  function Stars({ rating, reviewCount }) {
    if (!reviewCount || reviewCount === 0) return <span className="badge-new">NEW</span>;
    return <span className="rating">★ {rating.toFixed(1)} ({reviewCount})</span>;
  }

  // ---------- VIEW ROUTER ----------
  switch (view) {
    case 'landing':
      return (
        <div className="app">
          <div className="hero">
            <h1>Find people<br/>who <span className="accent">actually show up.</span></h1>
            <p>Browse vetted local plumbers, electricians, tutors and more — free. See their real number when you're ready.</p>
            <div className="teaser-card">
              <div className="biz">Kofi's Electrical</div>
              <div className="cat-loc">Electrician · East Legon</div>
              <div className="phone">+233 •• ••• ••••</div>
              <div className="unlock-hint">1 free unlock this month →</div>
            </div>
            <button className="btn btn-clay" onClick={() => setView('browse')}>Start browsing</button>
          </div>
        </div>
      );

    case 'browse':
      return (
        <div className="app">
          <div style={{ padding: '20px 20px 0' }}>
            <div style={{ fontFamily: 'var(--fd)', fontSize: 22, fontWeight: 600 }}>Findly</div>
          </div>
          <div className="search-bar" style={{ marginTop: 16 }}>
            <select value={category} onChange={e => setCategory(e.target.value)}>
              <option value="">All categories</option>
              {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>

          {upgradePrompt && (
            <div className="upgrade-box">
              <p>You've used your free unlock this month. Upgrade for unlimited.</p>
              <button className="btn btn-clay">Upgrade to Pro</button>
            </div>
          )}

          {listings.length === 0 && (
            <div style={{ textAlign: 'center', color: 'var(--muted)', padding: '40px 20px' }}>
              No listings yet for this category.
            </div>
          )}

          {listings.map(l => (
            <div className="listing" key={l.id}>
              <div className="listing-top">
                <div>
                  <div className="biz">{l.business_name}</div>
                  <div className="cat-loc">{l.category} · {l.location}</div>
                </div>
                {l.verified ? <span className="badge-verified">✓ VERIFIED</span> : null}
              </div>
              <Stars rating={l.rating} reviewCount={l.review_count} />
              {l.description && <div className="desc">{l.description}</div>}
              <div className="contact-row">
                {unlocked[l.id] ? (
                  <span className="contact-revealed">{unlocked[l.id].phone}</span>
                ) : (
                  <span className="contact-blurred">+233 •• ••• ••••</span>
                )}
                {!unlocked[l.id] && (
                  <button className="btn-unlock" onClick={() => handleUnlock(l.id)}>Unlock contact</button>
                )}
              </div>
            </div>
          ))}

          {me && (
            <div style={{ textAlign: 'center', color: 'var(--muted)', fontSize: 12, fontFamily: 'var(--fm)', padding: '8px 20px 24px' }}>
              {me.tier === 'free' ? `${me.unlocks_used}/1 free unlocks used this month` : 'Pro · unlimited unlocks'}
            </div>
          )}
        </div>
      );

    case 'signin':
      return (
        <div className="auth-pg">
          <div className="auth-c">
            <h2>Sign in</h2>
            <div className="sub">Pick up your unlocks where you left off.</div>
            {authError && <div className="err-box">{authError}</div>}
            <form onSubmit={e => handleAuth(e, 'signin')}>
              <label className="field-label">Email</label>
              <input className="field-input" type="email" required
                value={authForm.email} onChange={e => setAuthForm({ ...authForm, email: e.target.value })} />
              
              <label className="field-label">Password</label>
              <div style={{ position: 'relative' }}>
                <input className="field-input" type={showPassword ? "text" : "password"} required
                  value={authForm.password} onChange={e => setAuthForm({ ...authForm, password: e.target.value })} 
                  style={{ width: '100%', paddingRight: '50px', boxSizing: 'border-box' }} />
                <span 
                  onClick={() => setShowPassword(!showPassword)} 
                  style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', fontSize: '12px', color: 'var(--accent)', cursor: 'pointer', fontFamily: 'var(--fm)' }}
                >
                  {showPassword ? "Hide" : "Show"}
                </span>
              </div>
              
              <button className="btn btn-clay" style={{ width: '100%', marginTop: '16px' }} type="submit">Sign in</button>
            </form>
            <div className="asw">No account? <a onClick={() => { setView('signup'); setShowPassword(false); }}>Create one</a> · <a onClick={() => setView('landing')}>Back</a></div>
          </div>
        </div>
      );

    case 'signup':
      return (
        <div className="auth-pg">
          <div className="auth-c">
            <h2>Create your account</h2>
            <div className="sub">Free to browse. 1 free unlock every month.</div>
            {authError && <div className="err-box">{authError}</div>}
            <form onSubmit={e => handleAuth(e, 'signup')}>
              <label className="field-label">Email</label>
              <input className="field-input" type="email" required
                value={authForm.email} onChange={e => setAuthForm({ ...authForm, email: e.target.value })} />
              
              <label className="field-label">Password</label>
              <div style={{ position: 'relative' }}>
                <input className="field-input" type={showPassword ? "text" : "password"} required minLength={8}
                  value={authForm.password} onChange={e => setAuthForm({ ...authForm, password: e.target.value })} 
                  style={{ width: '100%', paddingRight: '50px', boxSizing: 'border-box' }} />
                <span 
                  onClick={() => setShowPassword(!showPassword)} 
                  style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', fontSize: '12px', color: 'var(--accent)', cursor: 'pointer', fontFamily: 'var(--fm)' }}
                >
                  {showPassword ? "Hide" : "Show"}
                </span>
              </div>
              
              <button className="btn btn-clay" style={{ width: '100%', marginTop: '16px' }} type="submit">Create free account</button>
            </form>
            <div className="asw">Have an account? <a onClick={() => { setView('signin'); setShowPassword(false); }}>Sign in</a> · <a onClick={() => setView('landing')}>Back</a></div>
          </div>
        </div>
      );

    default:
      return null;
  }
}
