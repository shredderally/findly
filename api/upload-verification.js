// api/upload-verification.js
// Step 4: The Pledge — marks pledge_accepted = true and completes signup.
//
// ID documents are NOT uploaded here. After a provider signs up, you contact
// them directly (WhatsApp/email) to collect Ghana Card photos manually before
// flipping verification_status to 'verified' in Supabase. This eliminates
// the base64 file upload size limit that was causing "Upload failed" on mobile.

import { createClient } from '@supabase/supabase-js';
import { verifySession } from './_session.js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.replace('Bearer ', '');
    const session = verifySession(token);
    if (!session) return res.status(401).json({ error: 'Invalid or expired session. Please sign in again.' });

    const { pledgeAccepted } = req.body;
    if (!pledgeAccepted) {
      return res.status(400).json({ error: 'You must accept the pledge to continue.' });
    }

    const { data: business, error: findError } = await supabase
      .from('businesses')
      .select('id')
      .eq('email', session.email)
      .single();

    if (findError || !business) {
      return res.status(404).json({ error: 'Account not found. Please sign in again.' });
    }

    const { error: updateError } = await supabase
      .from('businesses')
      .update({
        pledge_accepted: true,
        pledge_accepted_at: new Date().toISOString(),
      })
      .eq('id', business.id);

    if (updateError) throw updateError;

    return res.status(200).json({
      status: 'submitted',
      message: 'Pledge accepted. Your application is under review.',
    });
  } catch (err) {
    console.error('Upload verification error:', err.message);
    return res.status(500).json({ error: 'Submission failed. Try again.' });
  }
}
