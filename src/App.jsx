import { useState, useEffect } from 'react';
import './index.css';

const CATEGORIES = ['plumber', 'electrician', 'AC repair', 'mover', 'tutor', 'mechanic'];

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    if (!file) return resolve(null);
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default function App() {
  const [view, setView] = useState('landing'); // landing | browse | signin | signup | dashboard
  const [step, setStep] = useState(1); // signup wizard step, 1-4
  const [token, setToken] = useState(localStorage.getItem('findly_token') || null);
  const [me, setMe] = useState(null);
  const [listings, setListings] = useState([]);
  const [category, setCategory] = useState('');
  const [authError, setAuthError] = useState('');
  const [loadedAt] = useState(Date.now());

  const [form, setForm] = useState({
    email: '', password: '', fullLegalName: '', phone: '', whatsapp: '',
    businessName: '', category: 'plumber', description: '', ghpostGps: '',
    profilePhoto: null, idDocFront: null, idDocBack: null, livenessSelfie: null, professionalLicense: null,
    pledgeAccepted: false,
  });

  useEffect(() => { if (token) refreshMe(); }, [token]);
  useEffect(() => { if (view === 'browse') runSearch(); }, [view, category]);

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

  async function handleSignin(e) {
    e.preventDefault();
    setAuthError('');
    try {
      const res = await fetch('/api/signin', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: form.email, password: form.password }),
      });
      const data = await res.json();
      if (!res.ok) { setAuthError(data.error); return; }
      localStorage.setItem('findly_token', data.token);
      setToken(data.token);
      setView('dashboard');
    } catch { setAuthError('Network error. Try again.'); }
  }

  // Step 1 -> 2 -> creates account (signup.js) -> Step 3 -> 4 -> uploads docs
  async function handleStep2Submit(e) {
    e.preventDefault();
    setAuthError('');
    try {
      const res = await fetch('/api/signup', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, hp: '', loadedAt }),
      });
      const data = await res.json();
      if (!res.ok) { setAuthError(data.error); return; }
      localStorage.setItem('findly_token', data.token);
      setToken(data.token);
      setStep(3);
    } catch { setAuthError('Network error. Try again.'); }
  }

  async function handleFinalSubmit(e) {
    e.preventDefault();
    setAuthError('');
    if (!form.pledgeAccepted) { setAuthError('You must accept the pledge to continue.'); return; }
    try {
      const [profilePhoto, idDocFront, idDocBack, livenessSelfie, professionalLicense] = await Promise.all([
        fileToBase64(form.profilePhoto), fileToBase64(form.idDocFront),
        fileToBase64(form.idDocBack), fileToBase64(form.livenessSelfie), fileToBase64(form.professionalLicense),
      ]);
      const res = await fetch('/api/upload-verification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ profilePhoto, idDocFront, idDocBack, livenessSelfie, professionalLicense, pledgeAccepted: true }),
      });
      const data = await res.json();
      if (!res.ok) { setAuthError(data.error); return; }
      await refreshMe();
      setView('dashboard');
    } catch { setAuthError('Upload failed. Try again.'); }
  }

  async function handleActivate() {
    try {
      const res = await fetch('/api/paystack-initialize', { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      if (data.authorization_url) window.location.href = data.authorization_url;
    } catch {}
  }

  function Header() {
    return (
      <div className="header-bar">
        <div className="header-logo" onClick={() => setView('landing')}>Findly</div>
        <div className="header-nav">
          <a onClick={() => setView('browse')}>Browse</a>
          {!token && (<><a onClick={() => setView('signin')}>Sign in</a>
            <button className="btn-nav-cta" onClick={() => { setStep(1); setView('signup'); }}>List your business</button></>)}
          {token && <button className="btn-nav-cta" onClick={() => setView('dashboard')}>My listing</button>}
        </div>
      </div>
    );
  }
  function Footer() { return <div className="footer-bar"><div>Powered by Northbound Holdings</div></div>; }
  function Stars({ rating, reviewCount }) {
    if (!reviewCount) return <span className="badge-new">NEW</span>;
    return <span className="rating">★ {rating.toFixed(1)} ({reviewCount})</span>;
  }
  function set(field) { return e => setForm({ ...form, [field]: e.target.value }); }
  function setFile(field) { return e => setForm({ ...form, [field]: e.target.files[0] }); }

  if (view === 'landing') return (
    <div className="app"><Header />
      <div className="hero">
        <h1>Get found by<br/><span className="accent">real, verified customers.</span></h1>
        <p>Every provider here is identity-checked. List your business — customers browse and contact you for free.</p>
        <button className="btn btn-clay" onClick={() => { setStep(1); setView('signup'); }}>List your business</button>
        <div style={{ marginTop: 12 }}><a style={{ color: 'var(--muted)', fontSize: 14, cursor: 'pointer' }} onClick={() => setView('browse')}>Or browse as a customer →</a></div>
      </div>
      <Footer />
    </div>
  );

  if (view === 'browse') return (
    <div className="app"><Header />
      <div className="search-bar" style={{ marginTop: 16 }}>
        <select value={category} onChange={e => setCategory(e.target.value)}>
          <option value="">All categories</option>
          {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>
      {listings.length === 0 && <div style={{ textAlign: 'center', color: 'var(--muted)', padding: '40px 20px' }}>No verified listings yet for this category.</div>}
      {listings.map(l => (
        <div className="listing" key={l.id}>
          <div className="listing-top">
            <div><div className="biz">{l.business_name}</div><div className="cat-loc">{l.category} · {l.ghpost_gps_address || '—'}</div></div>
            <span className="badge-verified">✓ ID VERIFIED</span>
          </div>
          <Stars rating={l.rating} reviewCount={l.review_count} />
          {l.description && <div className="desc">{l.description}</div>}
          <div className="contact-row"><span className="contact-revealed">{l.phone}{l.whatsapp ? ` · WhatsApp ${l.whatsapp}` : ''}</span></div>
        </div>
      ))}
      <Footer />
    </div>
  );

  if (view === 'signin') return (
    <div className="auth-pg"><div className="auth-c">
      <h2>Business sign in</h2><div className="sub">Manage your listing.</div>
      {authError && <div className="err-box">{authError}</div>}
      <form onSubmit={handleSignin}>
        <label className="field-label">Email</label>
        <input className="field-input" type="email" required value={form.email} onChange={set('email')} />
        <label className="field-label">Password</label>
        <input className="field-input" type="password" required value={form.password} onChange={set('password')} />
        <button className="btn btn-clay" style={{ width: '100%' }} type="submit">Sign in</button>
      </form>
      <div className="asw">No account? <a onClick={() => { setStep(1); setView('signup'); }}>List your business</a> · <a onClick={() => setView('landing')}>Back</a></div>
    </div></div>
  );

  if (view === 'signup') {
    return (
      <div className="auth-pg"><div className="auth-c" style={{ maxWidth: 440 }}>
        <div style={{ display: 'flex', gap: 6, marginBottom: 18 }}>
          {[1,2,3,4].map(n => <div key={n} style={{ flex: 1, height: 3, borderRadius: 2, background: n <= step ? 'var(--clay)' : 'var(--border)' }} />)}
        </div>
        {authError && <div className="err-box">{authError}</div>}

        {step === 1 && (
          <>
            <h2>Step 1 — Bio & contact</h2>
            <div className="sub">Your full legal name, not a business alias — this must match your ID.</div>
            <label className="field-label">Full legal name</label>
            <input className="field-input" required value={form.fullLegalName} onChange={set('fullLegalName')} />
            <label className="field-label">Profile photo (real photo, no avatars/logos)</label>
            <input className="field-input" type="file" accept="image/*" onChange={setFile('profilePhoto')} />
            <label className="field-label">Phone</label>
            <input className="field-input" required placeholder="+233..." value={form.phone} onChange={set('phone')} />
            <label className="field-label">WhatsApp (optional)</label>
            <input className="field-input" value={form.whatsapp} onChange={set('whatsapp')} />
            <label className="field-label">Email</label>
            <input className="field-input" type="email" required value={form.email} onChange={set('email')} />
            <label className="field-label">Password</label>
            <input className="field-input" type="password" required minLength={8} value={form.password} onChange={set('password')} />
            <button className="btn btn-clay" style={{ width: '100%' }}
              onClick={() => { if (form.fullLegalName && form.phone && form.email && form.password.length >= 8) setStep(2); else setAuthError('Fill in all required fields.'); }}>
              Continue
            </button>
          </>
        )}

        {step === 2 && (
          <>
            <h2>Step 2 — Business & location</h2>
            <label className="field-label">Business name</label>
            <input className="field-input" required value={form.businessName} onChange={set('businessName')} />
            <label className="field-label">Category</label>
            <select className="field-input" value={form.category} onChange={set('category')}>
              {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <label className="field-label">Description</label>
            <input className="field-input" placeholder="What you do, experience, etc." value={form.description} onChange={set('description')} />
            <label className="field-label">Ghana Post GPS address</label>
            <input className="field-input" placeholder="e.g. GA-184-9008" value={form.ghpostGps} onChange={set('ghpostGps')} />
            <button className="btn btn-clay" style={{ width: '100%' }} onClick={handleStep2Submit}>Continue</button>
          </>
        )}

        {step === 3 && (
          <>
            <h2>Step 3 — Identity verification</h2>
            <div className="sub">Ghana Card or Voter's ID required. This goes to a private, encrypted storage bucket — only used to verify you, never shown publicly.</div>
            <label className="field-label">ID — front</label>
            <input className="field-input" type="file" accept="image/*" required onChange={setFile('idDocFront')} />
            <label className="field-label">ID — back</label>
            <input className="field-input" type="file" accept="image/*" required onChange={setFile('idDocBack')} />
            <label className="field-label">Selfie holding your ID next to your face</label>
            <input className="field-input" type="file" accept="image/*" required onChange={setFile('livenessSelfie')} />
            <label className="field-label">Professional license (optional — specialized trades only)</label>
            <input className="field-input" type="file" accept="image/*" onChange={setFile('professionalLicense')} />
            <button className="btn btn-clay" style={{ width: '100%' }}
              onClick={() => { if (form.idDocFront && form.idDocBack && form.livenessSelfie) setStep(4); else setAuthError('ID front, back, and selfie are all required.'); }}>
              Continue
            </button>
          </>
        )}

        {step === 4 && (
          <>
            <h2>Step 4 — The pledge</h2>
            <div className="sub" style={{ marginBottom: 16 }}>
              Last step. Read carefully — this is binding.
            </div>
            <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: 14, color: 'var(--text)', marginBottom: 24 }}>
              <input type="checkbox" checked={form.pledgeAccepted} onChange={e => setForm({ ...form, pledgeAccepted: e.target.checked })} style={{ marginTop: 3 }} />
              <span>I understand that any verified report of scamming, fraud, or misrepresentation on this platform will result in immediate, permanent removal of my listing, permanent blacklisting of my phone number from this platform, and may be reported to local authorities.</span>
            </label>
            <button className="btn btn-clay" style={{ width: '100%' }} onClick={handleFinalSubmit}>Submit for review</button>
          </>
        )}
      </div></div>
    );
  }

  if (view === 'dashboard') {
    const status = me?.verification_status;
    const isLive = me?.listing_active && status === 'verified' && me?.listing_expires_at && new Date(me.listing_expires_at) > new Date();

    return (
      <div className="app"><Header />
        <div style={{ padding: '24px 20px' }}>
          <h2 style={{ fontFamily: 'var(--fd)', fontSize: 24 }}>Your listing</h2>

          {status === 'pending' && (
            <div className="upgrade-box"><p>Your documents are under review. This usually takes 1-2 days. You can activate payment now — your listing only goes live once both payment AND verification are complete.</p></div>
          )}
          {status === 'flagged' && (
            <div className="err-box">Your listing has been flagged pending investigation and is hidden from public search.</div>
          )}
          {status === 'banned' && (
            <div className="err-box">This account has been permanently banned for reported fraud.</div>
          )}

          <div className="listing" style={!isLive ? { filter: 'blur(1.5px)', opacity: 0.6 } : {}}>
            {me ? (<>
              <div className="listing-top">
                <div><div className="biz">{me.business_name}</div><div className="cat-loc">{me.category} · {me.ghpost_gps_address || '—'}</div></div>
                {status === 'verified' && <span className="badge-verified">✓ ID VERIFIED</span>}
              </div>
              <Stars rating={me.rating} reviewCount={me.review_count} />
              {me.description && <div className="desc">{me.description}</div>}
              <div className="contact-row"><span className="contact-revealed">{me.phone}</span></div>
            </>) : <div style={{ color: 'var(--muted)' }}>Loading...</div>}
          </div>

          {status === 'verified' && !isLive && (
            <div className="upgrade-box">
              <p>You're verified. Activate your listing to go live for 30 days.</p>
              <button className="btn btn-clay" onClick={handleActivate}>Activate listing — GHS 30</button>
            </div>
          )}
          {isLive && (
            <div style={{ textAlign: 'center', color: 'var(--gold)', fontFamily: 'var(--fm)', fontSize: 13, marginTop: 8 }}>
              Live until {new Date(me.listing_expires_at).toLocaleDateString()}
            </div>
          )}
        </div>
        <Footer />
      </div>
    );
  }

  return null;
}
  
