// api/paystack-initialize.js
// Initializes a Paystack payment for a business to activate their listing
// for 30 days. Called from the dashboard "Activate listing" button.
// Business must be verified before activation is offered.
//
// PRICING: launch price GHS 50/mo (crossed out from GHS 100/mo standard rate).
// Update LISTING_PRICE_KOBO when the launch window ends.
//
// NOTE: this is a one-time charge per 30-day cycle, not a Paystack subscription
// plan. If a fixed Paystack Payment Link is set up later (recurring billing,
// no code change needed per cycle), set PAYSTACK_PAYMENT_LINK_URL in env and
// this function will redirect there instead of calling the Initialize API.

import { createClient } from '@supabase/supabase-js';
import { verifySession } from './_session.js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const LISTING_PRICE_KOBO = 50 * 100; // GHS 50.00 launch price (standard rate: GHS 100.00)
const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET_KEY;
const PAYMENT_LINK_URL = process.env.PAYSTACK_PAYMENT_LINK_URL; // optional, set later

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.replace('Bearer ', '');
    const session = verifySession(token);
    if (!session) return res.status(401).json({ error: 'Invalid or expired session.' });

    const { data: business } = await supabase
      .from('businesses')
      .select('id, email, business_name, verification_status')
      .eq('email', session.email)
      .single();

    if (!business) return res.status(404).json({ error: 'Account not found.' });

    if (business.verification_status !== 'verified') {
      return res.status(403).json({ error: 'Your account must be verified before activating a listing.' });
    }

    // If a fixed Paystack Payment Link has been configured, use it directly —
    // no Initialize API call needed. Set this later once you create the link
    // in the Paystack dashboard for recurring/simpler billing.
    if (PAYMENT_LINK_URL) {
      return res.status(200).json({ authorization_url: PAYMENT_LINK_URL });
    }

    const reference = `listing_${business.id}_${Date.now()}`;

    const paystackRes = await fetch('https://api.paystack.co/transaction/initialize', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${PAYSTACK_SECRET}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email: business.email,
        amount: LISTING_PRICE_KOBO,
        currency: 'GHS',
        reference,
        callback_url: `${process.env.APP_URL}/dashboard?activated=true`,
        metadata: {
          business_id: business.id,
          business_name: business.business_name,
          type: 'listing_activation',
        },
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
  } catch (err) {
    console.error('Paystack initialize error:', err.message);
    return res.status(500).json({ error: 'Payment initialization failed. Try again.' });
  }
                  }
    
