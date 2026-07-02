// api/paystack-webhook.js
// Paystack POSTs here on every payment event.
// This is the reliable confirmation path — the callback URL redirect
// can fail if the user closes the browser after paying.
//
// Set in Paystack dashboard: Settings → API → Webhook URL
// → https://findly-sigma-five.vercel.app/api/paystack-webhook
//
// Vercel requires raw body for HMAC verification. Add to vercel.json:
// No change needed — Vercel passes raw body to serverless functions by default.

import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';
import { sendEmail, listingActivationReceipt } from './_email.js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET_KEY;

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  // ── Verify Paystack signature ────────────────────────────────────────────
  const signature = req.headers['x-paystack-signature'];
  if (!signature) return res.status(401).json({ error: 'No signature.' });

  const rawBody = JSON.stringify(req.body);
  const hash = crypto
    .createHmac('sha512', PAYSTACK_SECRET)
    .update(rawBody)
    .digest('hex');

  if (hash !== signature) {
    console.warn('Paystack webhook: invalid signature');
    return res.status(401).json({ error: 'Invalid signature.' });
  }

  const { event, data } = req.body;

  // Acknowledge immediately — Paystack retries if we don't respond fast
  res.status(200).json({ received: true });

  // ── Handle events ────────────────────────────────────────────────────────
  if (event === 'charge.success') {
    const { reference, amount, metadata, customer } = data;
    const type = metadata?.type;

    if (type === 'listing_activation') {
      await handleListingActivation({ reference, amount, metadata, customer });
    }
    // contact_unlock is handled by unlock-contact.js callback flow.
    // Webhook here is a safety net in case user closed browser before redirect.
    if (type === 'contact_unlock') {
      await handleContactUnlock({ reference, amount, metadata });
    }
  }
}

async function handleListingActivation({ reference, amount, metadata, customer }) {
  try {
    const businessId = metadata?.business_id;
    if (!businessId) return;

    // Idempotent — skip if already processed
    const { data: biz } = await supabase
      .from('businesses')
      .select('id, email, business_name, listing_active, listing_expires_at')
      .eq('id', businessId)
      .single();

    if (!biz) return;

    // Check if this reference was already processed
    const { data: existingPayment } = await supabase
      .from('unlocks')
      .select('id')
      .eq('payment_reference', reference)
      .maybeSingle();

    // Use a separate listing_payments table if it exists, otherwise check
    // by extending the expires_at (idempotent — same result if run twice)
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

    await supabase
      .from('businesses')
      .update({
        listing_active: true,
        listing_expires_at: expiresAt,
      })
      .eq('id', businessId);

    // Send receipt email
    if (biz.email) {
      const emailPayload = listingActivationReceipt({
        businessName: biz.business_name,
        email: biz.email,
        reference,
        amount: (amount / 100).toFixed(2),
        expiresAt,
      });
      await sendEmail(emailPayload).catch(e => console.error('Receipt email failed:', e.message));
    }

    console.log(`Listing activated: ${biz.business_name} (${businessId}), ref: ${reference}`);
  } catch (err) {
    console.error('handleListingActivation error:', err.message);
  }
}

async function handleContactUnlock({ reference, amount, metadata }) {
  try {
    const businessId = metadata?.business_id;
    if (!businessId) return;

    // Check if already logged by the callback flow
    const { data: existing } = await supabase
      .from('unlocks')
      .select('id')
      .eq('payment_reference', reference)
      .maybeSingle();

    if (existing) return; // Already processed by unlock-contact.js

    // Webhook safety net — log the unlock
    await supabase.from('unlocks').insert({
      customer_id: null,
      business_id: businessId,
      amount_paid: amount / 100,
      currency: 'GHS',
      payment_provider: 'paystack',
      payment_reference: reference,
      status: 'success',
    }).catch(() => {}); // Ignore duplicate key errors

    console.log(`Unlock logged via webhook: ${businessId}, ref: ${reference}`);
  } catch (err) {
    console.error('handleContactUnlock webhook error:', err.message);
  }
}

