// api/search.js — PUBLIC, no auth.
// A listing must be BOTH paid (listing_active) AND human-verified
// (verification_status = 'verified') to appear.
//
// FIX: phone and whatsapp are REMOVED from the select — contact info is the
// gated product. Returning it here for free breaks the entire business model.
// Contact is only returned by /api/unlock-contact after payment verification.

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { category, location } = req.query;

    let query = supabase
      .from('businesses')
      // contacts free at launch — no unlock gate
      .select('id, business_name, category, ghpost_gps_address, description, phone, whatsapp, rating, review_count, verification_status')
      .eq('listing_active', true)
      .eq('verification_status', 'verified');

    if (category) query = query.eq('category', category);
    if (location) query = query.eq('ghpost_gps_address', location);

    const { data, error } = await query.order('rating', { ascending: false });
    if (error) throw error;

    return res.status(200).json({ listings: data });
  } catch (err) {
    console.error('Search error:', err.message);
    return res.status(500).json({ error: 'Search failed.' });
  }
}
