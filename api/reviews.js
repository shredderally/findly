// api/reviews.js
// GET  ?business_id=...           -> list published reviews for a business
// POST { business_id, unlock_id, reviewer_name, rating, comment }
//      -> submit a review. Only allowed if unlock_id points to a real,
//         successful unlock for that exact business — this is the entire
//         fraud-prevention mechanism. No account system, no captcha needed:
//         you can't review a business you never paid to unlock.

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const MAX_COMMENT_LENGTH = 600;

export default async function handler(req, res) {
  if (req.method === 'GET') {
    try {
      const { business_id } = req.query;
      if (!business_id) return res.status(400).json({ error: 'business_id required.' });

      const { data, error } = await supabase
        .from('reviews')
        .select('id, reviewer_name, rating, comment, created_at')
        .eq('business_id', business_id)
        .eq('status', 'published')
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;
      return res.status(200).json({ reviews: data });
    } catch (err) {
      console.error('Reviews fetch error:', err.message);
      return res.status(500).json({ error: 'Could not load reviews.' });
    }
  }

  if (req.method === 'POST') {
    try {
      const { business_id, unlock_id, reviewer_name, rating, comment } = req.body;

      if (!business_id || !unlock_id || !reviewer_name || !rating) {
        return res.status(400).json({ error: 'Missing required fields.' });
      }
      const numericRating = Number(rating);
      if (!Number.isInteger(numericRating) || numericRating < 1 || numericRating > 5) {
        return res.status(400).json({ error: 'Rating must be 1-5.' });
      }
      if (reviewer_name.length > 80) {
        return res.status(400).json({ error: 'Name too long.' });
      }
      if (comment && comment.length > MAX_COMMENT_LENGTH) {
        return res.status(400).json({ error: `Review must be under ${MAX_COMMENT_LENGTH} characters.` });
      }

      // The integrity check: unlock must exist, be successful, and match
      // this exact business. Without this, anyone could fabricate a review.
      const { data: unlock } = await supabase
        .from('unlocks')
        .select('id, business_id, status')
        .eq('id', unlock_id)
        .eq('business_id', business_id)
        .eq('status', 'success')
        .maybeSingle();

      if (!unlock) {
        return res.status(403).json({ error: 'Reviews can only be left after unlocking a verified contact.' });
      }

      const { data: review, error: insertError } = await supabase
        .from('reviews')
        .insert({
          business_id,
          unlock_id,
          reviewer_name: reviewer_name.trim(),
          rating: numericRating,
          comment: comment?.trim() || null,
          status: 'published',
        })
        .select('id, reviewer_name, rating, comment, created_at')
        .single();

      if (insertError) {
        // Unique index on unlock_id — one review per unlock
        if (insertError.code === '23505') {
          return res.status(409).json({ error: 'You already reviewed this business.' });
        }
        throw insertError;
      }

      return res.status(200).json({ review });
    } catch (err) {
      console.error('Review submit error:', err.message);
      return res.status(500).json({ error: 'Could not submit review.' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}

