// api/unlock-contact.js
// POST { business_id }
// Free contact log — no payment required at launch.
// Returns phone + whatsapp and writes a zero-cost unlock record so
// the review system has an anchor (unlock_id) if needed later.

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { business_id } = req.body;
    if (!business_id) return res.status(400).json({ error: 'business_id required.' });

    const { data: biz, error: bizError } = await supabase
      .from('businesses')
      .select('id, phone, whatsapp')
      .eq('id', business_id)
      .eq('listing_active', true)
      .eq('verification_status', 'verified')
      .single();

    if (bizError || !biz) return res.status(404).json({ error: 'Listing not found.' });

    // Log a free unlock so the review form has an anchor reference
    const reference = `free_${business_id}_${Date.now()}`;
    const { data: unlock } = await supabase
      .from('unlocks')
      .insert({
        customer_id: null,
        business_id,
        amount_paid: 0,
        currency: 'GHS',
        payment_provider: 'free',
        payment_reference: reference,
        status: 'success',
      })
      .select('id')
      .single();

    return res.status(200).json({
      phone: biz.phone,
      whatsapp: biz.whatsapp,
      unlock_id: unlock?.id || null,
    });
  } catch (err) {
    console.error('Contact fetch error:', err.message);
    return res.status(500).json({ error: 'Could not load contact. Try again.' });
  }
}
