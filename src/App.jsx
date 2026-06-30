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
  const [view, setView] = useState('landing');
  const [step, setStep] = useState(1);
  const [token, setToken] = useState(localStorage.getItem('findly_token') || null);
  const [me, setMe] = useState(null);
  const [listings, setListings] = useState([]);
  const [category, setCategory] = useState('');
  const [authError, setAuthError] = useState('');
  const [loadedAt] = useState(Date.now());
  // unlockedContacts: { [business_id]: { phone, whatsapp, unlockId } }
  const [unlockedContacts, setUnlockedContacts] = useState({});
  const [unlockingId, setUnlockingId] = useState(null);
  const [expandedReviews, setExpandedReviews] = useState(null); // business_id currently showing reviews
  const [reviewsCache, setReviewsCache] = useState({}); // { [business_id]: [reviews] }
  const [reviewForm, setReviewForm] = useState({ reviewerName: '', rating: 5, comment: '' });
  const [reviewSubmitting, setReviewSubmitting] = useState(false);
  const [shareCopiedId, setShareCopiedId] = useState(null);

  async function shareListing(business) {
    const url = `${window.location.origin}/?biz=${business.id}`;
    const shareData = {
      title: `${business.business_name} on Findly`,
      text: `Found ${business.business_name} (${business.category}) on Findly — ID-verified local providers in Ghana.`,
      url,
    };
    if (navigator.share) {
      try { await navigator.share(shareData); } catch {} // user cancelled — not an error
    } else {
      try {
        await navigator.clipboard.writeText(url);
        setShareCopiedId(business.id);
        setTimeout(() => setShareCopiedId(null), 2000);
      } catch {}
    }
  }

  async function shareApp() {
    const url = window.location.origin;
    const shareData = {
      title: 'Findly — Find people who show up.',
      text: 'ID-verified local service providers in Ghana. No more guessing who you\'re calling.',
      url,
    };
    if (navigator.share) {
      try { await navigator.share(shareData); } catch {}
    } else {
      try {
        await navigator.clipboard.writeText(url);
        setShareCopiedId('app');
        setTimeout(() => setShareCopiedId(null), 2000);
      } catch {}
    }
  }

  async function toggleReviews(businessId) {
    if (expandedReviews === businessId) { setExpandedReviews(null); return; }
    setExpandedReviews(businessId);
    if (!reviewsCache[businessId]) {
      try {
        const res = await fetch(`/api/reviews?business_id=${businessId}`);
        const data = await res.json();
        setReviewsCache(prev => ({ ...prev, [businessId]: data.reviews || [] }));
      } catch {}
    }
  }

  async function submitReview(businessId) {
    const unlockId = unlockedContacts[businessId]?.unlockId;
    if (!unlockId) return;
    setReviewSubmitting(true);
    try {
      const res = await fetch('/api/reviews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          business_id: businessId,
          unlock_id: unlockId,
          reviewer_name: reviewForm.reviewerName || 'Anonymous',
          rating: reviewForm.rating,
          comment: reviewForm.comment,
        }),
      });
      const data = await res.json();
      if (!res.ok) { alert(data.error); return; }
      setReviewsCache(prev => ({ ...prev, [businessId]: [data.review, ...(prev[businessId] || [])] }));
      setUnlockedContacts(prev => ({ ...prev, [businessId]: { ...prev[businessId], reviewed: true } }));
      setReviewForm({ reviewerName: '', rating: 5, comment: '' });
    } catch { alert('Could not submit review. Try again.'); }
    finally { setReviewSubmitting(false); }
  }

  const [form, setForm] = useState({
    email: '', password: '', fullLegalName: '', phone: '', whatsapp: '',
    businessName: '', category: 'plumber', description: '', ghpostGps: '',
    profilePhoto: null, idDocFront: null, idDocBack: null,
    livenessSelfie: null, professionalLicense: null,
    pledgeAccepted: false,
  });

  useEffect(() => { if (token) refreshMe(); }, [token]);
  useEffect(() => { if (view === 'browse') runSearch(); }, [view, category]);

  // Check if returning from a Paystack unlock callback
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const ref = params.get('ref');
    const bizId = params.get('business_id');
    if (ref && bizId) {
      window.history.replaceState({}, '', '/');
      completeUnlock(bizId, ref);
      setView('browse');
    }
  }, []);

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
        fileToBase64(form.idDocBack), fileToBase64(form.livenessSelfie),
        fileToBase64(form.professionalLicense),
      ]);
      const res = await fetch('/api/upload-verification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          profilePhoto, idDocFront, idDocBack, livenessSelfie,
          professionalLicense, pledgeAccepted: true,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setAuthError(data.error); return; }
      await refreshMe();
      setView('dashboard');
    } catch { setAuthError('Upload failed. Try again.'); }
  }

  // Unlock flow: initialize payment → redirect to Paystack
  async function handleUnlock(businessId) {
    setUnlockingId(businessId);
    try {
      const res = await fetch('/api/unlock-contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ business_id: businessId }),
      });
      const data = await res.json();
      if (!res.ok) { alert(data.error || 'Unlock failed.'); return; }
      // Redirect to Paystack — Paystack will redirect back with ?ref=...&business_id=...
      const callbackUrl = `${window.location.origin}/?ref=${data.reference}&business_id=${businessId}`;
      window.location.href = data.authorization_url + `&callback_url=${encodeURIComponent(callbackUrl)}`;
    } catch { alert('Network error. Try again.'); }
    finally { setUnlockingId(null); }
  }

  // Called on return from Paystack with a reference
  async function completeUnlock(businessId, reference) {
    try {
      const res = await fetch('/api/unlock-contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ business_id: businessId, payment_reference: reference }),
      });
      const data = await res.json();
      if (res.ok) {
        setUnlockedContacts(prev => ({
          ...prev,
          [businessId]: { phone: data.phone, whatsapp: data.whatsapp, unlockId: data.unlock_id },
        }));
      }
    } catch {}
  }

  async function handleActivate() {
    try {
      const res = await fetch('/api/paystack-initialize', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
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
          <button className="btn-share-app" onClick={shareApp} title="Share Findly">
            {shareCopiedId === 'app' ? 'Copied!' : '↗ Share'}
          </button>
          {!token && (
            <>
              <a onClick={() => setView('signin')}>Sign in</a>
              <button className="btn-nav-cta" onClick={() => { setStep(1); setView('signup'); }}>
                List your business
              </button>
            </>
          )}
          {token && (
            <button className="btn-nav-cta" onClick={() => setView('dashboard')}>My listing</button>
          )}
        </div>
      </div>
    );
  }

  function Footer() {
    return (
      <div className="footer-bar">
        <div className="footer-links">
          <a href="/terms.html" target="_blank" rel="noopener noreferrer">Terms</a>
          <span className="footer-dot">·</span>
          <a href="/privacy.html" target="_blank" rel="noopener noreferrer">Privacy Policy</a>
        </div>
        <div className="footer-brand">Findly, powered by Northbound Holdings</div>
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
    <div className="app">
      <div className="landing-hero">
        <div className="landing-logo">Findly</div>
        <p className="landing-tagline">Find people who show up.</p>
        <p className="landing-sub">Every provider is identity-verified before they go live. No ghost numbers. No scammers.</p>

        <div className="teaser-card">
          <div className="biz">Kofi's AC Repair</div>
          <div className="cat">AC repair · Accra</div>
          <div className="unlock-hint">🔒 Unlock contact — GHS 2</div>
        </div>

        <div className="landing-actions">
          <button className="btn btn-clay" onClick={() => setView('browse')}>
            Browse providers
          </button>
          <button className="btn btn-outline" onClick={() => { setStep(1); setView('signup'); }}>
            List your business
          </button>
          <button className="btn-text-link" onClick={() => setView('signin')}>
            Sign in to my listing
          </button>
        </div>

        <div className="pricing-teaser" style={{ marginTop: 28 }}>
          <span className="price-old">GHS 100/mo</span>
          <span className="price-new">GHS 50/mo</span>
          <span className="price-badge">LAUNCH PRICE</span>
        </div>
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
      {listings.length === 0 && (
        <div style={{ textAlign: 'center', color: 'var(--muted)', padding: '40px 20px' }}>
          No verified listings yet for this category.
        </div>
      )}
      {listings.map(l => {
        const unlocked = unlockedContacts[l.id];
        const reviewsOpen = expandedReviews === l.id;
        const reviews = reviewsCache[l.id] || [];
        return (
          <div className="listing" key={l.id}>
            <div className="listing-top">
              <div>
                <div className="biz">{l.business_name}</div>
                <div className="cat-loc">{l.category} · {l.ghpost_gps_address || '—'}</div>
              </div>
              <span className="badge-verified">✓ ID VERIFIED</span>
            </div>
            <div className="rating-row">
              <Stars rating={l.rating} reviewCount={l.review_count} />
              {l.review_count > 0 && (
                <a className="reviews-toggle" onClick={() => toggleReviews(l.id)}>
                  {reviewsOpen ? 'Hide reviews' : `See ${l.review_count} review${l.review_count === 1 ? '' : 's'}`}
                </a>
              )}
            </div>
            {l.description && <div className="desc">{l.description}</div>}

            {/* contact is gated — only shown after payment */}
            <div className="contact-row">
              {unlocked ? (
                <span className="contact-revealed">
                  {unlocked.phone}{unlocked.whatsapp ? ` · WhatsApp ${unlocked.whatsapp}` : ''}
                </span>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span className="contact-blurred">+233 XX XXX XXXX</span>
                  <button
                    className="btn-unlock"
                    onClick={() => handleUnlock(l.id)}
                    disabled={unlockingId === l.id}
                  >
                    {unlockingId === l.id ? 'Loading...' : '🔒 Unlock — GHS 2'}
                  </button>
                </div>
              )}
              <button className="btn-share-listing" onClick={() => shareListing(l)} title="Share this provider">
                {shareCopiedId === l.id ? 'Copied!' : '↗'}
              </button>
            </div>

            {/* Review form — only visible to someone who actually unlocked this contact */}
            {unlocked && !unlocked.reviewed && (
              <div className="review-form">
                <div className="review-form-label">How was it? Leave a review</div>
                <div className="star-input">
                  {[1, 2, 3, 4, 5].map(n => (
                    <span
                      key={n}
                      className={n <= reviewForm.rating ? 'star-filled' : 'star-empty'}
                      onClick={() => setReviewForm({ ...reviewForm, rating: n })}
                    >★</span>
                  ))}
                </div>
                <input
                  className="field-input"
                  placeholder="Your name (or leave blank)"
                  value={reviewForm.reviewerName}
                  onChange={e => setReviewForm({ ...reviewForm, reviewerName: e.target.value })}
                />
                <textarea
                  className="field-input"
                  placeholder="What was your experience?"
                  rows={3}
                  value={reviewForm.comment}
                  onChange={e => setReviewForm({ ...reviewForm, comment: e.target.value })}
                />
                <button
                  className="btn btn-clay"
                  style={{ width: '100%' }}
                  disabled={reviewSubmitting}
                  onClick={() => submitReview(l.id)}
                >
                  {reviewSubmitting ? 'Submitting...' : 'Post review'}
                </button>
              </div>
            )}
            {unlocked?.reviewed && <div className="review-thanks">Thanks for your review.</div>}

            {reviewsOpen && (
              <div className="reviews-list">
                {reviews.length === 0 && <div className="review-empty">No reviews yet.</div>}
                {reviews.map(r => (
                  <div className="review-item" key={r.id}>
                    <div className="review-item-top">
                      <span className="review-name">{r.reviewer_name}</span>
                      <span className="review-stars">{'★'.repeat(r.rating)}{'☆'.repeat(5 - r.rating)}</span>
                    </div>
                    {r.comment && <div className="review-comment">{r.comment}</div>}
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
      <Footer />
    </div>
  );

  if (view === 'signin') return (
    <div className="auth-pg"><div className="auth-c">
      <h2>Business sign in</h2>
      <div className="sub">Manage your listing.</div>
      {authError && <div className="err-box">{authError}</div>}
      <form onSubmit={handleSignin}>
        <label className="field-label">Email</label>
        <input className="field-input" type="email" required value={form.email} onChange={set('email')} />
        <label className="field-label">Password</label>
        <input className="field-input" type="password" required value={form.password} onChange={set('password')} />
        <button className="btn btn-clay" style={{ width: '100%' }} type="submit">Sign in</button>
      </form>
      <div className="asw">
        No account?{' '}
        <a onClick={() => { setStep(1); setView('signup'); }}>List your business</a>
        {' · '}
        <a onClick={() => setView('landing')}>Back</a>
      </div>
    </div></div>
  );

  if (view === 'signup') {
    return (
      <div className="auth-pg"><div className="auth-c" style={{ maxWidth: 440 }}>
        <div style={{ display: 'flex', gap: 6, marginBottom: 18 }}>
          {[1,2,3,4].map(n => (
            <div key={n} style={{
              flex: 1, height: 3, borderRadius: 2,
              background: n <= step ? 'var(--clay)' : 'var(--border)',
            }} />
          ))}
        </div>
        {authError && <div className="err-box">{authError}</div>}

        {step === 1 && (
          <>
            <h2>Step 1 — Bio & contact</h2>
            <div className="sub">Your full legal name — must match your ID.</div>
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
            <button
              className="btn btn-clay" style={{ width: '100%' }}
              onClick={() => {
                if (form.fullLegalName && form.phone && form.email && form.password.length >= 8)
                  setStep(2);
                else
                  setAuthError('Fill in all required fields.');
              }}
            >
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
            <div className="sub">Ghana Card or Voter's ID required. Goes to private encrypted storage — never shown publicly.</div>
            <label className="field-label">ID — front</label>
            <input className="field-input" type="file" accept="image/*" required onChange={setFile('idDocFront')} />
            <label className="field-label">ID — back</label>
            <input className="field-input" type="file" accept="image/*" required onChange={setFile('idDocBack')} />
            <label className="field-label">Selfie holding your ID next to your face</label>
            <input className="field-input" type="file" accept="image/*" required onChange={setFile('livenessSelfie')} />
            <label className="field-label">Professional license (optional — specialized trades only)</label>
            <input className="field-input" type="file" accept="image/*" onChange={setFile('professionalLicense')} />
            <button
              className="btn btn-clay" style={{ width: '100%' }}
              onClick={() => {
                if (form.idDocFront && form.idDocBack && form.livenessSelfie)
                  setStep(4);
                else
                  setAuthError('ID front, back, and selfie are all required.');
              }}
            >
              Continue
            </button>
          </>
        )}

        {step === 4 && (
          <>
            <h2>Step 4 — The pledge</h2>
            <div className="sub" style={{ marginBottom: 16 }}>Last step. Read carefully — this is binding.</div>
            <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: 14, color: 'var(--text)', marginBottom: 24 }}>
              <input
                type="checkbox"
                checked={form.pledgeAccepted}
                onChange={e => setForm({ ...form, pledgeAccepted: e.target.checked })}
                style={{ marginTop: 3 }}
              />
              <span>I understand that any verified report of scamming, fraud, or misrepresentation on this platform will result in immediate, permanent removal of my listing, permanent blacklisting of my phone number, and may be reported to local authorities.</span>
            </label>
            <button className="btn btn-clay" style={{ width: '100%' }} onClick={handleFinalSubmit}>
              Submit for review
            </button>
          </>
        )}
      </div></div>
    );
  }

  if (view === 'dashboard') {
    const status = me?.verification_status;
    // FIX: listing_expires_at now exists on businesses table
    const isLive = me?.listing_active
      && status === 'verified'
      && me?.listing_expires_at
      && new Date(me.listing_expires_at) > new Date();

    return (
      <div className="app"><Header />
        <div style={{ padding: '24px 20px' }}>
          <h2 style={{ fontFamily: 'var(--fd)', fontSize: 24 }}>Your listing</h2>

          {status === 'pending' && (
            <div className="upgrade-box">
              <p>Your documents are under review. This usually takes 1-2 days. You can activate payment now — your listing only goes live once both payment AND verification are complete.</p>
            </div>
          )}
          {status === 'flagged' && (
            <div className="err-box">Your listing has been flagged pending investigation and is hidden from public search.</div>
          )}
          {status === 'banned' && (
            <div className="err-box">This account has been permanently banned for reported fraud.</div>
          )}

          <div className="listing" style={!isLive ? { filter: 'blur(1.5px)', opacity: 0.6 } : {}}>
            {me ? (
              <>
                <div className="listing-top">
                  <div>
                    <div className="biz">{me.business_name}</div>
                    <div className="cat-loc">{me.category} · {me.ghpost_gps_address || '—'}</div>
                  </div>
                  {status === 'verified' && <span className="badge-verified">✓ ID VERIFIED</span>}
                </div>
                <Stars rating={me.rating} reviewCount={me.review_count} />
                {me.description && <div className="desc">{me.description}</div>}
                <div className="contact-row"><span className="contact-revealed">{me.phone}</span></div>
              </>
            ) : (
              <div style={{ color: 'var(--muted)' }}>Loading...</div>
            )}
          </div>

          {status === 'verified' && !isLive && (
            <div className="upgrade-box">
              <p>You're verified. Activate your listing to go live for 30 days.</p>
              <div className="price-row">
                <span className="price-old">GHS 100/mo</span>
                <span className="price-new">GHS 50/mo</span>
                <span className="price-badge">LAUNCH PRICE</span>
              </div>
              <button className="btn btn-clay" onClick={handleActivate}>Activate listing — GHS 50</button>
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
