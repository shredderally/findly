// api/reviews.js
// GET  ?business_id=...  → list published reviews for a business
// POST { business_id, reviewer_name, rating, comment, unlock_id? }
//      → submit a review. unlock_id is optional at launch (contacts are free).
//        If provided, it is validated against the unlocks table for integrity.

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

      if (!business_id || !reviewer_name || !rating) {
        return res.status(400).json({ error: 'Missing required fields.' });
      }
      const numericRating = Number(rating);
      if (!Number.isInteger(numericRating) || numericRating < 1 || numericRating > 5) {
        return res.status(400).json({ error: 'Rating must be 1–5.' });
      }
      if (reviewer_name.length > 80) {
        return res.status(400).json({ error: 'Name too long.' });
      }
      if (comment && comment.length > MAX_COMMENT_LENGTH) {
        return res.status(400).json({ error: `Review must be under ${MAX_COMMENT_LENGTH} characters.` });
      }

      // If an unlock_id was supplied, validate it matches this business.
      // At launch contacts are free so unlock_id may be omitted.
      if (unlock_id) {
        const { data: unlock } = await supabase
          .from('unlocks')
          .select('id')
          .eq('id', unlock_id)
          .eq('business_id', business_id)
          .eq('status', 'success')
          .maybeSingle();

        if (!unlock) {
          return res.status(403).json({ error: 'Invalid unlock reference.' });
        }
      }

      const { data: review, error: insertError } = await supabase
        .from('reviews')
        .insert({
          business_id,
          unlock_id: unlock_id || null,
          reviewer_name: reviewer_name.trim(),
          rating: numericRating,
          comment: comment?.trim() || null,
          status: 'published',
        })
        .select('id, reviewer_name, rating, comment, created_at')
        .single();

      if (insertError) throw insertError;

      return res.status(200).json({ review });
    } catch (err) {
      console.error('Review submit error:', err.message);
      return res.status(500).json({ error: 'Could not submit review.' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
