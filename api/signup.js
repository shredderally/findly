// api/signup.js
// Phase 1 of onboarding: account + bio/business info (Steps 1-2).
// Documents (Step 3) and the pledge (Step 4) are submitted via
// upload-verification.js AFTER this returns a token, since file uploads
// need an authenticated session to attach to.
import bcrypt from 'bcryptjs';
import { createClient } from '@supabase/supabase-js';
import { signSession } from './_session.js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const DISPOSABLE_DOMAINS = ['mailinator.com', 'tempmail.com', '10minutemail.com'];
const MAX_SIGNUPS_PER_IP_PER_HOUR = 6;
const GHANA_GPS_REGEX = /^[A-Z]{2}-\d{3,4}-\d{4}$/i;

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const {
      email, password, fullLegalName, phone, whatsapp,
      businessName, category, description, ghpostGps,
      hp, loadedAt,
    } = req.body;

    if (hp) return res.status(400).json({ error: 'Signup failed. Try again.' });
    if (loadedAt && Date.now() - loadedAt < 1200) {
      return res.status(400).json({ error: 'Signup failed. Try again.' });
    }

    if (!email || !password || password.length < 8) {
      return res.status(400).json({ error: 'Valid email and 8+ character password required.' });
    }
    if (!fullLegalName || !phone || !businessName || !category) {
      return res.status(400).json({ error: 'Full legal name, phone, business name, and category are required.' });
    }
    if (ghpostGps && !GHANA_GPS_REGEX.test(ghpostGps)) {
      return res.status(400).json({ error: 'GPS address format looks wrong — should be like GA-184-9008.' });
    }

    const domain = email.split('@')[1]?.toLowerCase();
    if (DISPOSABLE_DOMAINS.includes(domain)) {
      return res.status(400).json({ error: 'Please use a permanent email address.' });
    }

    // PERMANENT BLACKLIST CHECK — the core fraud-prevention rule.
    // A previously banned phone can never register again, full stop.
    const { data: blacklisted } = await supabase
      .from('banned_phones')
      .select('phone')
      .eq('phone', phone)
      .maybeSingle();

    if (blacklisted) {
      return res.status(403).json({ error: 'This phone number is not eligible to register.' });
    }

    const ip = req.headers['x-forwarded-for']?.split(',')[0] || req.socket.remoteAddress;
    const windowStart = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { count } = await supabase
      .from('rate_limits')
      .select('*', { count: 'exact', head: true })
      .eq('key', `signup:${ip}`)
      .gte('window_start', windowStart);

    if (count >= MAX_SIGNUPS_PER_IP_PER_HOUR) {
      return res.status(429).json({ error: 'Too many signups from this network. Try again later.' });
    }
    await supabase.from('rate_limits').insert({ key: `signup:${ip}`, window_start: new Date().toISOString() });

    const { data: existing } = await supabase.from('businesses').select('id').eq('email', email).maybeSingle();
    if (existing) return res.status(400).json({ error: 'An account with this email already exists.' });

    const passwordHash = await bcrypt.hash(password, 10);

    const { error: insertError } = await supabase.from('businesses').insert({
      email,
      password_hash: passwordHash,
      full_legal_name: fullLegalName,
      phone,
      whatsapp: whatsapp || null,
      business_name: businessName,
      category,
      description: description || null,
      ghpost_gps_address: ghpostGps || null,
      verification_status: 'pending',
      listing_active: false,
    });

    if (insertError) throw insertError;

    const token = signSession(email);
    return res.status(200).json({ token, email });
  } catch (err) {
    console.error('Signup error:', err.message);
    return res.status(500).json({ error: 'Signup failed. Try again.' });
  }
                                }
