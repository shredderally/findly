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
  const [showPassword, setShowPassword] = useState(false); // New state for password toggle
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
          {!token && (<><a onClick={() => { setView('signin'); setShowPassword(false); }}>Sign in</a>
            <button className="btn-nav-cta" onClick={() => { setStep(1); setView('signup'); setShowPassword(false); }}>List your business</button></>)}
          {token && <button className="btn-nav-cta" onClick={() => setView('dashboard')}>My listing</button>}
        </div>
      </div>
    );
  }
  
  function Footer() { 
    return <div className="footer-bar"><div style={{ opacity: 0.8 }}>Powered by Northbound Holdings</div></div>; 
  }
  
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
        <button className="btn btn-clay" onClick={() => { setStep(1); setView('signup'); setShowPassword(false); }}>List your business</button>
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
    <div className="app">
      <Header />
      <div className="auth-pg" style={{ minHeight: 'calc(100vh - 120px)' }}>
        <div className="auth-c">
          <h2>Business sign in</h2><div className="sub">Manage your listing.</div>
          {authError && <div className="err-box">{authError}</div>}
          <form onSubmit={handleSignin}>
            <div style={{ marginBottom: 16 }}>
              <label className="field-label" style={{ display: 'block', marginBottom: 4 }}>Email</label>
              <input className="field-input" type="email" required value={form.email} onChange={set('email')} style={{ width: '100%', boxSizing: 'border-box' }} />
            </div>
            
            <div style={{ marginBottom: 20 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                <label className="field-label" style={{ margin: 0 }}>Password</label>
                <span onClick={() => setShowPassword(!showPassword)} style={{ fontSize: 13, color: 'var(--accent)', cursor: 'pointer', fontFamily: 'var(--fm)', fontWeight: 500 }}>
                  {showPassword ? "Hide" : "Show"}
                </span>
              </div>
              <input className="field-input" type={showPassword ? "text" : "password"} required value={form.password} onChange={set('password')} style={{ width: '100%', boxSizing: 'border-box' }} />
            </div>
            
            <button className="btn btn-clay" style={{ width: '100%' }} type="submit">Sign in</button>
          </form>
          <div className="asw" style={{ marginTop: 20 }}>No account? <a onClick={() => { setStep(1); setView('signup'); setShowPassword(false); }}>List your business</a> · <a onClick={() => setView('landing')}>Back</a></div>
        </div>
      </div>
      <Footer />
    </div>
  );

  if (view === 'signup') {
    return (
      <div className="app">
        <Header />
        <div className="auth-pg" style={{ minHeight: 'calc(100vh - 120px)' }}>
          <div
                                                                             
