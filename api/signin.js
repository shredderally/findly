// api/signin.js
import bcrypt from 'bcryptjs';
import { createClient } from '@supabase/supabase-js';
import { signSession } from './_session.js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const MAX_FAILED_LOGINS = 6;
const WINDOW_MINUTES = 15;

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email and password required.' });

    const windowStart = new Date(Date.now() - WINDOW_MINUTES * 60 * 1000).toISOString();
    const { count } = await supabase
      .from('rate_limits')
      .select('*', { count: 'exact', head: true })
      .eq('key', `signin:${email}`)
      .gte('window_start', windowStart);

    if (count >= MAX_FAILED_LOGINS) {
      return res.status(429).json({ error: 'Too many attempts. Try again later.' });
    }

    // FIX: was querying 'consumers' (dropped table). Schema is 'businesses'.
    const { data: business } = await supabase
      .from('businesses')
      .select('id, password_hash, verification_status, listing_active')
      .eq('email', email)
      .maybeSingle();

    const genericError = { error: 'Invalid email or password.' };

    if (!business) {
      await supabase.from('rate_limits').insert({ key: `signin:${email}`, window_start: new Date().toISOString() });
      return res.status(401).json(genericError);
    }

    const valid = await bcrypt.compare(password, business.password_hash);
    if (!valid) {
      await supabase.from('rate_limits').insert({ key: `signin:${email}`, window_start: new Date().toISOString() });
      return res.status(401).json(genericError);
    }

    const token = signSession(email);
    return res.status(200).json({
      token,
      email,
      verification_status: business.verification_status,
      listing_active: business.listing_active,
    });
  } catch (err) {
    console.error('Signin error:', err.message);
    return res.status(500).json({ error: 'Sign in failed. Try again.' });
  }
}
