// api/unlock-contact.js
// POST { business_id, payment_reference }
// Verifies a Paystack payment reference, then returns the business's
// real contact info (phone + whatsapp). Logs the unlock for abuse tracking.
//
// Flow:
//   1. Client calls /api/unlock-contact with business_id
//      (no payment_reference yet) → server initializes Paystack transaction,
//      returns { authorization_url, reference }
//   2. Client redirects user to authorization_url
//   3. After payment, Paystack redirects to /unlock-success?ref=REFERENCE
//   4. Client calls /api/unlock-contact with { business_id, payment_reference }
//      → server verifies payment, returns { phone, whatsapp }

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const UNLOCK_PRICE_KOBO = 200 * 100; // GHS 2.00 in kobo (Paystack uses kobo)
const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET_KEY;

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { business_id, payment_reference } = req.body;
    if (!business_id) return res.status(400).json({ error: 'business_id required.' });

    // --- PHASE 1: Initialize payment (no reference yet) ---
    if (!payment_reference) {
      // Verify business exists and is visible
      const { data: biz } = await supabase
        .from('businesses')
        .select('id, business_name')
        .eq('id', business_id)
        .eq('listing_active', true)
        .eq('verification_status', 'verified')
        .maybeSingle();

      if (!biz) return res.status(404).json({ error: 'Listing not found.' });

      const reference = `unlock_${business_id}_${Date.now()}`;

      const paystackRes = await fetch('https://api.paystack.co/transaction/initialize', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${PAYSTACK_SECRET}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          amount: UNLOCK_PRICE_KOBO,
          currency: 'GHS',
          reference,
          callback_url: `${process.env.APP_URL}/unlock-success`,
          metadata: { business_id, business_name: biz.business_name },
        }),
      });

      const paystackData = await paystackRes.json();
      if (!paystackData.status) {
        throw new Error(paystackData.message || 'Paystack initialization failed.');
      }

      return res.status(200).json({
        authorization_url: paystackData.data.authorization_url,
        reference: paystackData.data.reference,
      });
    }

    // --- PHASE 2: Verify payment and return contact ---
    // Verify with Paystack — never trust client-submitted payment status
    const verifyRes = await fetch(
      `https://api.paystack.co/transaction/verify/${encodeURIComponent(payment_reference)}`,
      { headers: { Authorization: `Bearer ${PAYSTACK_SECRET}` } }
    );

    const verifyData = await verifyRes.json();

    if (!verifyData.status || verifyData.data?.status !== 'success') {
      return res.status(402).json({ error: 'Payment not confirmed.' });
    }

    // Guard: amount must match unlock price exactly
    if (verifyData.data.amount < UNLOCK_PRICE_KOBO) {
      return res.status(402).json({ error: 'Payment amount insufficient.' });
    }

    // Guard: reference should not already be used (replay attack prevention)
    const { count: alreadyUsed } = await supabase
      .from('unlocks')
      .select('*', { count: 'exact', head: true })
      .eq('payment_reference', payment_reference);

    if (alreadyUsed > 0) {
      // Reference already used — still return the contact (idempotent, not an error)
      const { data: biz } = await supabase
        .from('businesses')
        .select('phone, whatsapp')
        .eq('id', business_id)
        .single();
      return res.status(200).json({ phone: biz.phone, whatsapp: biz.whatsapp });
    }

    // Fetch and return contact info
    const { data: biz } = await supabase
      .from('businesses')
      .select('phone, whatsapp')
      .eq('id', business_id)
      .eq('listing_active', true)
      .eq('verification_status', 'verified')
      .single();

    if (!biz) return res.status(404).json({ error: 'Listing not found.' });

    // Log unlock — customer_id is null for v0 (no customer account system yet)
    await supabase.from('unlocks').insert({
      customer_id: null,
      business_id,
      amount_paid: UNLOCK_PRICE_KOBO / 100,
      currency: 'GHS',
      payment_provider: 'paystack',
      payment_reference,
      status: 'success',
    });

    return res.status(200).json({ phone: biz.phone, whatsapp: biz.whatsapp });
  } catch (err) {
    console.error('Unlock error:', err.message);
    return res.status(500).json({ error: 'Unlock failed. Try again.' });
  }
}
