// api/me.js — business profile + verification + listing status
import { createClient } from '@supabase/supabase-js';
import { verifySession } from './_session.js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.replace('Bearer ', '');
    const session = verifySession(token);
    if (!session) return res.status(401).json({ error: 'Invalid or expired session.' });

    const { data: business, error } = await supabase
      .from('businesses')
      .select(`
        email, full_legal_name, business_name, category, description, ghpost_gps_address,
        phone, whatsapp, rating, review_count, verification_status,
        pledge_accepted, listing_active, listing_expires_at
      `)
      .eq('email', session.email)
      .single();

    if (error || !business) return res.status(404).json({ error: 'Account not found.' });

    return res.status(200).json(business);
  } catch (err) {
    console.error('Me error:', err.message);
    return res.status(500).json({ error: 'Something went wrong.' });
  }
}
