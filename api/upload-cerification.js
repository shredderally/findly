// api/upload-verification.js
// Handles Step 3 (ID documents + selfie) and Step 4 (pledge) of onboarding.
// Expects base64-encoded image data from the client — files go straight
// into the PRIVATE verification-docs bucket, never a public URL.
//
// FIX: was at root/upload-verification.js — Vercel only serves api/*.js as
// serverless functions. Frontend calls /api/upload-verification, which 404'd.
// Moved here so the route resolves correctly.

import { createClient } from '@supabase/supabase-js';
import { verifySession } from './_session.js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const BUCKET = 'verification-docs';
const MAX_BASE64_SIZE = 14 * 1024 * 1024; // ~10MB file + base64 overhead

async function uploadDoc(businessId, label, base64Data) {
  if (!base64Data) return null;
  if (base64Data.length > MAX_BASE64_SIZE) throw new Error(`${label} too large.`);

  const matches = base64Data.match(/^data:(image\/\w+);base64,(.+)$/);
  if (!matches) throw new Error(`${label} is not a valid image.`);

  const [, mimeType, data] = matches;
  const ext = mimeType.split('/')[1];
  const buffer = Buffer.from(data, 'base64');
  const path = `${businessId}/${label}.${ext}`;

  const { error } = await supabase.storage.from(BUCKET).upload(path, buffer, {
    contentType: mimeType,
    upsert: true,
  });
  if (error) throw error;
  return path;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.replace('Bearer ', '');
    const session = verifySession(token);
    if (!session) return res.status(401).json({ error: 'Invalid or expired session.' });

    const { data: business } = await supabase
      .from('businesses')
      .select('id')
      .eq('email', session.email)
      .single();
    if (!business) return res.status(404).json({ error: 'Account not found.' });

    const {
      profilePhoto, idDocFront, idDocBack, professionalLicense,
      pledgeAccepted,
    } = req.body;

    if (!pledgeAccepted) {
      return res.status(400).json({ error: 'You must accept the pledge to continue.' });
    }
    if (!idDocFront || !idDocBack) {
      return res.status(400).json({ error: 'Both ID front and back are required.' });
    }

    const profilePhotoPath = await uploadDoc(business.id, 'profile-photo', profilePhoto);
    const idFrontPath = await uploadDoc(business.id, 'id-front', idDocFront);
    const idBackPath = await uploadDoc(business.id, 'id-back', idDocBack);
    const licensePath = professionalLicense
      ? await uploadDoc(business.id, 'license', professionalLicense)
      : null;

    await supabase
      .from('businesses')
      .update({
        profile_photo_path: profilePhotoPath,
        id_front_path: idFrontPath,
        id_back_path: idBackPath,
        license_path: licensePath,
        pledge_accepted: true,
        pledge_accepted_at: new Date().toISOString(),
        // verification_status stays 'pending' — you review docs and flip manually.
      })
      .eq('id', business.id);

    return res.status(200).json({ status: 'submitted', message: 'Documents submitted for review.' });
  } catch (err) {
    console.error('Upload verification error:', err.message);
    return res.status(500).json({ error: err.message || 'Upload failed. Try again.' });
  }
}

