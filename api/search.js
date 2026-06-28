// api/search.js
// PUBLIC endpoint — browsing listings is free, no session required.
// Deliberately returns NO contact info — that's the entire monetization
// wedge. phone/whatsapp only ever come back through unlock-contact.js.

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
      .from('listings')
      .select('id, business_name, category, location, description, rating, verified');
      // NOTE: phone and whatsapp deliberately excluded from this select

    if (category) query = query.eq('category', category);
    if (location) query = query.eq('location', location);

    const { data, error } = await query.order('verified', { ascending: false }).order('rating', { ascending: false });

    if (error) throw error;

    return res.status(200).json({ listings: data });
  } catch (err) {
    console.error('Search error:', err.message);
    return res.status(500).json({ error: 'Search failed.' });
  }
}

