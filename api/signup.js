// api/signup.js
import bcrypt from 'bcryptjs';
import { createClient } from '@supabase/supabase-js';
import { signSession } from './_session.js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const DISPOSABLE_DOMAINS = ['mailinator.com', 'tempmail.com', '10minutemail.com'];
const MAX_SIGNUPS_PER_IP_PER_HOUR = 6;

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { email, password, hp, loadedAt } = req.body;

    // Honeypot: bots auto-fill hidden fields
    if (hp) return res.status(400).json({ error: 'Signup failed. Try again.' });

    // Time-since-page-load check: reject submissions under 1.2s
    if (loadedAt && Date.now() - loadedAt < 1200) {
      return res.status(400).json({ error: 'Signup failed. Try again.' });
    }

    if (!email || !password || password.length < 8) {
      return res.status(400).json({ error: 'Valid email and 8+ character password required.' });
    }

    const domain = email.split('@')[1]?.toLowerCase();
    if (DISPOSABLE_DOMAINS.includes(domain)) {
      return res.status(400).json({ error: 'Please use a permanent email address.' });
    }

    // Rate limit by IP
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

    // Check existing
    const { data: existing } = await supabase
      .from('consumers')
      .select('id')
      .eq('email', email)
      .maybeSingle();

    if (existing) return res.status(400).json({ error: 'An account with this email already exists.' });

    const passwordHash = await bcrypt.hash(password, 10);

    const { error: insertError } = await supabase.from('consumers').insert({
      email,
      password_hash: passwordHash,
      tier: 'free',
      unlocks_used: 0,
      unlocks_reset: new Date().toISOString(),
    });

    if (insertError) throw insertError;

    const token = signSession(email);
    return res.status(200).json({ token, email, tier: 'free' });
  } catch (err) {
    console.error('Signup error:', err.message);
    return res.status(500).json({ error: 'Signup failed. Try again.' });
  }
}

