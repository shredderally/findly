// api/me.js
// Silent session refresh — same role as Applo's me.js: keeps the client's
// cached tier/unlock data in sync with whatever's actually true in the DB
// (e.g. after you manually upgrade someone's tier in Supabase).

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

    const { data: consumer, error } = await supabase
      .from('consumers')
      .select('email, tier, unlocks_used, unlocks_reset')
      .eq('email', session.email)
      .single();

    if (error || !consumer) return res.status(404).json({ error: 'Account not found.' });

    return res.status(200).json(consumer);
  } catch (err) {
    console.error('Me error:', err.message);
    return res.status(500).json({ error: 'Something went wrong.' });
  }
  }
