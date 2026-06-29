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
  const [showPassword, setShowPassword] = useState(false);
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
    return (
      <div className="footer-bar">
        <div style={{ opacity: 0.8, fontSize: '13px' }}>Powered by Northbound Holdings</div>
      </div>
    ); 
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
      <div className="auth-pg" style={{ minHeight: 'calc(100vh - 140px)', padding: '40px 20px' }}>
        <div className="auth-c">
          <h2>Business sign in</h2><div className="sub">Manage your listing.</div>
          {authError && <div className="err-box">{authError}</div>}
          
          <form onSubmit={handleSignin}>
            <div style={{ marginBottom: 16 }}>
              <label className="field-label" style={{ display: 'block', marginBottom: 6 }}>Email</label>
              <input className="field-input" type="email" required value={form.email} onChange={set('email')} style={{ width: '100%', boxSizing: 'border-box' }} />
            </div>
            
            <div style={{ marginBottom: 24 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <label className="field-label" style={{ margin: 0 }}>Password</label>
                <span onClick={() => setShowPassword(!showPassword)} style={{ fontSize: 13, color: 'var(--accent)', cursor: 'pointer', fontWeight: 600 }}>
                  {showPassword ? "Hide" : "Show"}
                </span>
              </div>
              <input className="field-input" type={showPassword ? "text" : "password"} required value={form.password} onChange={set('password')} style={{ width: '100%', boxSizing: 'border-box' }} />
            </div>
            
            <button className="btn btn-clay" style={{ width: '100%' }} type="submit">Sign in</button>
          </form>
          
          <div className="asw" style={{ marginTop: 24, textAlign: 'center' }}>
            No account? <a onClick={() => { setStep(1); setView('signup'); setShowPassword(false); }}>List your business</a><br/>
            <a onClick={() => setView('landing')} style={{ display: 'inline-block', marginTop: 12 }}>← Back to home</a>
          </div>
        </div>
      </div>
      <Footer />
    </div>
  );

  if (view === 'signup') {
    return (
      <div className="app">
        <Header />
        <div className="auth-pg" style={{ minHeight: 'calc(100vh - 140px)', padding: '40px 20px' }}>
          <div className="auth-c" style={{ maxWidth: 440 }}>
            <div style={{ display: 'flex', gap: 6, marginBottom: 24 }}>
              {[1,2,3,4].map(n => <div key={n} style={{ flex: 1, height: 4, borderRadius: 2, background: n <= step ? 'var(--clay)' : 'var(--border)', transition: 'background 0.3s ease' }} />)}
            </div>
            
            {authError && <div className="err-box">{authError}</div>}

            {step === 1 && (
              <>
                <h2>Step 1 — Bio & contact</h2>
                <div className="sub" style={{ marginBottom: 24 }}>Your full legal name, not a business alias — this must match your ID.</div>
                
                <div style={{ marginBottom: 16 }}>
                  <label className="field-label" style={{ display: 'block', marginBottom: 6 }}>Full legal name</label>
                  <input className="field-input" required value={form.fullLegalName} onChange={set('fullLegalName')} style={{ width: '100%', boxSizing: 'border-box' }} />
                </div>
                
                <div style={{ marginBottom: 16 }}>
                  <label className="field-label" style={{ display: 'block', marginBottom: 6 }}>Profile photo (real photo, no avatars/logos)</label>
                  <input className="field-input" type="file" accept="image/*" onChange={setFile('profilePhoto')} style={{ width: '100%', boxSizing: 'border-box', padding: '8px' }} />
                </div>
                
                <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
                  <div style={{ flex: 1 }}>
                    <label className="field-label" style={{ display: 'block', marginBottom: 6 }}>Phone</label>
                    <input className="field-input" required placeholder="+233..." value={form.phone} onChange={set('phone')} style={{ width: '100%', boxSizing: 'border-box' }} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label className="field-label" style={{ display: 'block', marginBottom: 6 }}>WhatsApp <span style={{opacity: 0.6}}>(opt)</span></label>
                    <input className="field-input" value={form.whatsapp} onChange={set('whatsapp')} style={{ width: '100%', boxSizing: 'border-box' }} />
                  </div>
                </div>
                
                <div style={{ marginBottom: 16 }}>
                  <label className="field-label" style={{ display: 'block', marginBottom: 6 }}>Email</label>
                  <input className="field-input" type="email" required value={form.email} onChange={set('email')} style={{ width: '100%', boxSizing: 'border-box' }} />
                </div>
                
                <div style={{ marginBottom: 24 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                    <label className="field-label" style={{ margin: 0 }}>Password</label>
                    <span onClick={() => setShowPassword(!showPassword)} style={{ fontSize: 13, color: 'var(--accent)', cursor: 'pointer', fontWeight: 600 }}>
                      {showPassword ? "Hide" : "Show"}
                    </span>
                  </div>
                  <input className="field-input" type={showPassword ? "text" : "password"} required minLength={8} value={form.password} onChange={set('password')} style={{ width: '100%', boxSizing: 'border-box' }} />
                </div>
                
                <button className="btn btn-clay" style={{ width: '100%' }}
                  onClick={() => { if (form.fullLegalName && form.phone && form.email && form.password.length >= 8) setStep(2); else setAuthError('Fill in all required fields. Password must be 8+ characters.'); }}>
                  Continue
                </button>
              </>
            )}

            {step === 2 && (
              <>
                <h2>Step 2 — Business & location</h2>
                <div className="sub" style={{ marginBottom: 24 }}>Tell customers what you do and where to find you.</div>
                
                <div style={{ marginBottom: 16 }}>
                  <label className="field-label" style={{ display: 'block', marginBottom: 6 }}>Business name</label>
                  <input className="field-input" required value={form.businessName} onChange={set('businessName')} style={{ width: '100%', boxSizing: 'border-box' }} />
                </div>
                
                <div style={{ marginBottom: 16 }}>
                  <label className="field-label" style={{ display: 'block', marginBottom: 6 }}>Category</label>
                  <select className="field-input" value={form.category} onChange={set('category')} style={{ width: '100%', boxSizing: 'border-box', backgroundColor: '#fff' }}>
                    {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                
                <div style={{ marginBottom: 16 }}>
                  <label className="field-label" style={{ display: 'block', marginBottom: 6 }}>Description</label>
                  <textarea className="field-input" rows="3" placeholder="What you do, your experience, specialties..." value={form.description} onChange={set('description')} style={{ width: '100%', boxSizing: 'border-box', resize: 'vertical' }} />
                </div>
                
                <div style={{ marginBottom: 24 }}>
                  <label className="field-label" style={{ display: 'block', marginBottom: 6 }}>Ghana Post GPS address</label>
                  <input className="field-input" placeholder="e.g. GA-184-9008" value={form.ghpostGps} onChange={set('ghpostGps')} style={{ width: '100%', boxSizing: 'border-box' }} />
                </div>
                
                <div style={{ display: 'flex', gap: 12 }}>
                  <button className="btn" style={{ flex: 1, backgroundColor: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)' }} onClick={() => setStep(1)}>Back</button>
                  <button className="btn btn-clay" style={{ flex: 2 }} onClick={handleStep2Submit}>Continue</button>
                </div>
              </>
            )}

            {step === 3 && (
              <>
                <h2>Step 3 — Identity verification</h2>
                <div className="sub" style={{ marginBottom: 24 }}>Ghana Card or Voter's ID required. This goes to a private, encrypted storage bucket — never shown publicly.</div>
                
                <div style={{ marginBottom: 16 }}>
                  <label className="field-label" style={{ display: 'block', marginBottom: 6 }}>ID — front</label>
                  <input className="field-input" type="file" accept="image/*" required onChange={setFile('idDocFront')} style={{ width: '100%', boxSizing: 'border-box', padding: '8px' }} />
                </div>
                
                <div style={{ marginBottom: 16 }}>
                  <label className="field-label" style={{ display: 'block', marginBottom: 6 }}>ID — back</label>
                  <input className="field-input" type="file" accept="image/*" required onChange={setFile('idDocBack')} style={{ width: '100%', boxSizing: 'border-box', padding: '8px' }} />
                </div>
                
                <div style={{ marginBottom: 16 }}>
                  <label className="field-label" style={{ display: 'block', marginBottom: 6 }}>Selfie holding your ID next to your face</label>
                  <input className="field-input" type="file" accept="image/*" required onChange={setFile('livenessSelfie')} style={{ width: '100%', boxSizing: 'border-box', padding: '8px' }} />
                </div>
                
                <div style={{ marginBottom: 24 }}>
                  <label className="field-label" style={{ display: 'block', marginBottom: 6 }}>Professional license <span style={{opacity: 0.6}}>(specialized trades only)</span></label>
                  <input className="field-input" type="file" accept="image/*" onChange={setFile('professionalLicense')} style={{ width: '100%', boxSizing: 'border-box', padding: '8px' }} />
                </div>
                
                <button className="btn btn-clay" style={{ width: '100%' }}
                  onClick={() => { if (form.idDocFront && form.idDocBack && form.livenessSelfie) setStep(4); else setAuthError('ID front, back, and selfie are all required.'); }}>
                  Continue
                </button>
              </>
            )}

            {step === 4 && (
              <>
                <h2>Step 4 — The pledge</h2>
                <div className="sub" style={{ marginBottom: 24 }}>
                  Last step. Read carefully — this is binding.
                </div>
                
                <div style={{ padding: '16px', backgroundColor: '#fff5f5', borderLeft: '4px solid #ff4444', borderRadius: '4px', marginBottom: 24 }}>
                  <label style={{ display: 'flex', gap: 12, alignItems: 'flex-start', fontSize: 14, color: '#333', cursor: 'pointer' }}>
                    <input type="checkbox" checked={form.pledgeAccepted} onChange={e => setForm({ ...form, pledgeAccepted: e.target.checked })} style={{ marginTop: 4, transform: 'scale(1.2)' }} />
                    <span style={{ lineHeight: 1.5 }}>I understand that any verified report of scamming, fraud, or misrepresentation on this platform will result in immediate, permanent removal of my listing, permanent blacklisting of my phone number from this platform, and may be reported to local authorities.</span>
                  </label>
                </div>
                
                <div style={{ display: 'flex', gap: 12 }}>
                  <button className="btn" style={{ flex: 1, backgroundColor: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)' }} onClick={() => setStep(3)}>Back</button>
                  <button className="btn btn-clay" style={{ flex: 2, opacity: form.pledgeAccepted ? 1 : 0.6 }} disabled={!form.pledgeAccepted} onClick={handleFinalSubmit}>Submit for review</button>
                </div>
              </>
            )}
          </div>
        </div>
        <Footer />
      </div>
    );
  }

  i
