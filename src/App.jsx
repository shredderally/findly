import { useState, useEffect } from 'react';
import './index.css';

const CATEGORIES = [
  'AC Repair & Installation','Accounting & Bookkeeping','Agriculture & Farming','Architecture & Drafting','Auto Detailing & Car Wash',
  'Baking & Pastry','Barbing & Grooming','Block & Brick Laying','Branding & Identity Design',
  'Carpentry & Furniture Making','Catering & Event Food','Child Care & Babysitting','Cleaning & Janitorial','Computer Repairs & Servicing','Construction & Building','Content Writing & Copywriting','Courier & Dispatch',
  'Data Entry & Processing','Decoration & Event Styling','Drone Photography & Videography','Driving Instruction',
  'Electrical Work & Installation','Embroidery & Fabric Work','Event Planning & Management',
  'Fashion Design & Tailoring','Food Vending & Catering','Freelance Photography','Freelance Videography & Editing','Fumigation & Pest Control',
  'Generator Repair & Maintenance','Graphic Design',
  'Hair Dressing & Braiding','Home Security Installation','Home Tutoring','House Help & Domestic Work',
  'Interior Design & Decoration','IT Support & Network Setup',
  'Jewellery Making & Sales',
  'Landscaping & Lawn Care','Language Translation','Laundry & Dry Cleaning','Legal Services & Notary','Logistics & Haulage',
  'Makeup & Beauty Services','Masonry & Plastering','Mechanic & Auto Repair','Mobile Money (MoMo) Agent','Moving & Relocation','Music Production & Recording',
  'Nursing & Home Care',
  'Online Research & Data',
  'Painting & Decorating','Personal Shopping & Errands','Personal Training & Fitness','Phone Repair & Accessories','Photography (Events)','Plumbing & Pipe Work','Printing & Branding',
  'Real Estate Agency','Roofing & Waterproofing',
  'Security Guard Services','Social Media Management','Solar Installation & Maintenance','Sound & Lighting (Events)',
  'Tailoring & Alterations','Tile & Floor Laying','Tractor & Farm Equipment','Transcription Services','Transportation & Ride Service',
  'Upholstery & Foam Work',
  'Video Editing (Remote)','Virtual Assistant (Remote)','Vulcanising & Tyre Repair',
  'Web & App Development','Wedding Planning','Welding & Metal Fabrication','Window & Aluminium Works',
];

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
  const [showPassword, setShowPassword] = useState(false);

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
    professionalLicense: null,
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
      if (!res.ok) {
        // Account was created but session signing failed (usually missing SESSION_SECRET env var)
        if (data.accountCreated) {
          setAuthError('Account created. Please sign in to continue your setup.');
          setView('signin');
          return;
        }
        setAuthError(data.error);
        return;
      }
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
      const [profilePhoto, idDocFront, idDocBack, professionalLicense] = await Promise.all([
        fileToBase64(form.profilePhoto), fileToBase64(form.idDocFront),
        fileToBase64(form.idDocBack), fileToBase64(form.professionalLicense),
      ]);
      const res = await fetch('/api/upload-verification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          profilePhoto, idDocFront, idDocBack,
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
        <div className="footer-brand-row">
          <span className="footer-findly">Findly</span>
          <span className="footer-dot">·</span>
          <span className="footer-company">Northbound Holdings 2026</span>
        </div>
        <div className="footer-links">
          <a onClick={() => setView('terms')} style={{ cursor: 'pointer' }}>Terms</a>
          <span className="footer-dot">·</span>
          <a onClick={() => setView('privacy')} style={{ cursor: 'pointer' }}>Privacy Policy</a>
        </div>
      </div>
    );
  }

  function Stars({ rating, reviewCount }) {
    if (!reviewCount) return <span className="badge-new">NEW</span>;
    return <span className="rating">★ {rating.toFixed(1)} ({reviewCount})</span>;
  }

  function set(field) { return e => setForm({ ...form, [field]: e.target.value }); }
  function setFile(field) { return e => setForm({ ...form, [field]: e.target.files[0] }); }

  const [landingTab, setLandingTab] = useState('signup'); // 'signup' | 'signin'

  const TESTIMONIALS = [
    { name: 'Abena M.', text: 'Found a plumber in 10 minutes. Showed up same day. The verified badge actually meant something.', stars: 5 },
    { name: 'Kwame T.', text: 'Listed my electrical business on a Friday. Had three calls by Monday. Worth every pesewa.', stars: 5 },
    { name: 'Esi A.', text: 'No more calling numbers that don\'t pick up. Everyone here is real.', stars: 4 },
  ];

  if (view === 'landing') return (
    <div className="app lp">

      {/* ── Hero ── */}
      <div className="lp-hero">
        <div className="lp-logo">Findly</div>
        <p className="lp-sub">Find people who show up.</p>
        <button className="btn-share-app lp-share" onClick={shareApp}>
          {shareCopiedId === 'app' ? '✓ Copied' : '↗ Share Findly'}
        </button>
      </div>

      {/* ── Two path cards (the oval split from your sketch) ── */}
      <div className="lp-paths">
        <div className="lp-path-card lp-path-provider" onClick={() => { setStep(1); setView('signup'); }}>
          <div className="lp-path-icon">🔨</div>
          <div className="lp-path-title">List your<br />business</div>
          <div className="lp-path-hint">Providers</div>
        </div>
        <div className="lp-path-card lp-path-customer" onClick={() => setView('browse')}>
          <div className="lp-path-icon">🔍</div>
          <div className="lp-path-title">Find a<br />provider</div>
          <div className="lp-path-hint">Customers</div>
        </div>
      </div>

      {/* ── Sign up / Sign in tab row ── */}
      <div className="lp-auth-section">
        <div className="lp-tabs">
          <button
            className={`lp-tab ${landingTab === 'signup' ? 'lp-tab-active' : ''}`}
            onClick={() => setLandingTab('signup')}
          >Sign up</button>
          <button
            className={`lp-tab ${landingTab === 'signin' ? 'lp-tab-active' : ''}`}
            onClick={() => setLandingTab('signin')}
          >Sign in</button>
        </div>

        {landingTab === 'signup' && (
          <div className="lp-tab-body">
            <p className="lp-tab-desc">For service providers. List your business and get found by verified customers.</p>
            <button className="btn btn-clay" style={{ width: '100%' }} onClick={() => { setStep(1); setView('signup'); }}>
              Create listing
            </button>
          </div>
        )}
        {landingTab === 'signin' && (
          <div className="lp-tab-body">
            <p className="lp-tab-desc">Already listed? Manage your profile and see your stats.</p>
            <button className="btn btn-outline" style={{ width: '100%' }} onClick={() => setView('signin')}>
              Sign in to my listing
            </button>
          </div>
        )}
      </div>

      {/* ── Pricing box ── */}
      <div className="lp-pricing">
        <div className="lp-pricing-col lp-pricing-provider">
          <div className="lp-pricing-label">Providers</div>
          <div className="lp-pricing-amount">
            <span className="price-old">GHS 100</span>
            <span className="price-new">GHS 50</span>
            <span className="lp-pricing-period">/mo · 1 listing</span>
          </div>
          <div className="price-badge" style={{ alignSelf: 'flex-start' }}>LAUNCH PRICE</div>
        </div>
        <div className="lp-pricing-divider" />
        <div className="lp-pricing-col lp-pricing-customer">
          <div className="lp-pricing-label">Customers</div>
          <div className="lp-pricing-amount">
            <span className="price-new">GHS 2</span>
            <span className="lp-pricing-period">per unlock</span>
          </div>
          <div className="lp-pricing-free">Browse free, pay only to reveal contact</div>
        </div>
      </div>

      {/* ── Testimonials ── */}
      <div className="lp-testimonials">
        <div className="lp-section-label">What people say</div>
        {TESTIMONIALS.map((t, i) => (
          <div className="lp-testimonial" key={i}>
            <div className="lp-t-stars">{'★'.repeat(t.stars)}{'☆'.repeat(5 - t.stars)}</div>
            <div className="lp-t-text">"{t.text}"</div>
            <div className="lp-t-name">— {t.name}</div>
          </div>
        ))}
      </div>

      {/* ── Footer ── */}
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

            {/* contacts are free at launch */}
            <div className="contact-row">
              <span className="contact-revealed">
                {l.phone}{l.whatsapp ? ` · WA: ${l.whatsapp}` : ''}
              </span>
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
        <div className="pw-wrap">
          <input className="field-input pw-input" type={showPassword ? 'text' : 'password'} required value={form.password} onChange={set('password')} />
          <button type="button" className="pw-eye" onClick={() => setShowPassword(v => !v)}>
            {showPassword ? '🙈' : '👁️'}
          </button>
        </div>
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
            <label className="field-label">Password (min 8 characters)</label>
            <div className="pw-wrap">
              <input className="field-input pw-input" type={showPassword ? 'text' : 'password'} required minLength={8} value={form.password} onChange={set('password')} />
              <button type="button" className="pw-eye" onClick={() => setShowPassword(v => !v)}>
                {showPassword ? '🙈' : '👁️'}
              </button>
            </div>
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
            <div style={{ display: 'flex', gap: 10 }}>
              <button className="btn-back" onClick={() => setStep(1)}>← Back</button>
              <button className="btn btn-clay" style={{ flex: 1 }} onClick={handleStep2Submit}>Continue</button>
            </div>
          </>
        )}

        {step === 3 && (
          <>
            <h2>Step 3 — Identity verification</h2>
            <div className="sub">Ghana Card or Voter's ID required. Both sides needed. Stored privately — never shown publicly.</div>
            <label className="field-label">ID — front</label>
            <input className="field-input" type="file" accept="image/*" required onChange={setFile('idDocFront')} />
            <label className="field-label">ID — back</label>
            <input className="field-input" type="file" accept="image/*" required onChange={setFile('idDocBack')} />
            <label className="field-label">Professional license (optional — specialized trades only)</label>
            <input className="field-input" type="file" accept="image/*" onChange={setFile('professionalLicense')} />
            <button
              className="btn btn-clay" style={{ width: '100%' }}
              onClick={() => {
                if (form.idDocFront && form.idDocBack)
                  setStep(4);
                else
                  setAuthError('Both ID front and back are required.');
              }}
            >
              Continue
            </button>
            <button className="btn-back" style={{ width: '100%', marginTop: 8 }} onClick={() => setStep(2)}>← Back</button>
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
            <button className="btn-back" style={{ width: '100%', marginTop: 8 }} onClick={() => setStep(3)}>← Back</button>
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


  if (view === 'terms') return (
    <div className="app">
      <div className="legal-header">
        <button className="btn-back" onClick={() => setView('landing')}>← Back</button>
        <span className="legal-logo">Findly</span>
      </div>
      <div className="legal-body">
        <h1>Terms of Service</h1>
        <p className="legal-meta">Operated by Northbound Holdings · Last updated June 2026</p>

        <h2>1. What Findly is</h2>
        <p>Findly is a directory connecting customers in Ghana with identity-verified local service providers. Browsing and viewing contacts is free. Providers pay a monthly listing fee to appear in search.</p>

        <h2>2. Provider verification</h2>
        <p>Providers submit a government-issued ID during signup. Verification confirms identity only — it is not a guarantee of work quality, licensing, or insurance. Use your own judgment before engaging any provider.</p>

        <h2>3. The provider pledge</h2>
        <p>Providers agree at signup that any verified report of scamming, fraud, or misrepresentation results in immediate permanent removal of their listing, permanent blacklisting of their phone number, and potential reporting to local authorities.</p>

        <h2>4. Payments</h2>
        <p>All payments are processed through Paystack. Listing fees are non-refundable once a listing has gone live, except where required by law or at Findly's discretion in cases of platform error.</p>

        <h2>5. No liability for third-party conduct</h2>
        <p>Findly is a directory, not a party to any agreement between a customer and a provider. Findly is not responsible for the quality, safety, or legality of services rendered by listed providers.</p>

        <h2>6. Account suspension</h2>
        <p>Findly may suspend or remove any account at its discretion, including for fraud, abuse, or violation of these terms.</p>

        <h2>7. Changes</h2>
        <p>These terms may be updated as the platform evolves. Continued use after changes are posted constitutes acceptance.</p>

        <h2>8. Contact</h2>
        <p>Questions can be directed to Northbound Holdings through the contact details listed on the Findly platform.</p>
      </div>
      <Footer />
    </div>
  );

  if (view === 'privacy') return (
    <div className="app">
      <div className="legal-header">
        <button className="btn-back" onClick={() => setView('landing')}>← Back</button>
        <span className="legal-logo">Findly</span>
      </div>
      <div className="legal-body">
        <h1>Privacy Policy</h1>
        <p className="legal-meta">Operated by Northbound Holdings · Last updated June 2026</p>

        <h2>1. What we collect</h2>
        <p>Customers browsing listings: no account or personal data required. Providers signing up: full legal name, phone, WhatsApp (optional), email, business details, and a government-issued ID (front and back). Payment data is processed by Paystack and never stored on Findly's servers.</p>

        <h2>2. Why we collect it</h2>
        <p>Identity documents are used solely to verify that a provider is a real, accountable person before their listing goes live. Documents are reviewed manually and never displayed publicly or shared with other users.</p>

        <h2>3. Where it's stored</h2>
        <p>Identity documents are stored in a private, access-restricted storage bucket. They are never given a public URL and are accessible only to Findly's verification team.</p>

        <h2>4. Data Protection Act compliance</h2>
        <p>Northbound Holdings is in the process of registering with the Ghana Data Protection Commission as required for platforms collecting government ID data. Registration is being completed as the platform scales beyond its initial launch phase.</p>

        <h2>5. Who sees what</h2>
        <p>Public search results show business name, category, location, and rating — and phone/WhatsApp at launch while the platform builds volume. Findly never sells contact data in bulk.</p>

        <h2>6. Data retention and deletion</h2>
        <p>Providers may request account and document deletion by contacting Northbound Holdings directly. Banned phone numbers are retained indefinitely as part of the platform's fraud-prevention blacklist.</p>

        <h2>7. Third parties</h2>
        <p>Payments are processed by Paystack under their own privacy policy. Findly does not share provider or customer data with any other third party.</p>

        <h2>8. Changes</h2>
        <p>This policy may be updated as the platform evolves. Material changes will be reflected here with an updated date.</p>
      </div>
      <Footer />
    </div>
  );

  return null;
}
