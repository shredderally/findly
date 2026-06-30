// api/_session.js
// Signs/verifies HMAC session tokens. Underscore prefix = Vercel treats this
// as a private helper, NOT a public route. Do not rename.
//
// Reused directly from Applo's hardened pattern. Key fix already baked in:
// email+expiry are base64url-encoded as ONE JSON blob before signing, so the
// payload can never contain a "." — meaning there's exactly one unambiguous
// delimiter when splitting payload.signature. (Applo's original bug: joining
// email.expiry.signature with "." broke for every real email address, since
// virtually all emails contain a dot in the domain.)

import crypto from 'crypto';

const SECRET = process.env.SESSION_SECRET;
const EXPIRY_DAYS = 7;

export function signSession(email) {
  if (!SECRET) throw new Error('SESSION_SECRET is not set');

  const expiry = Date.now() + EXPIRY_DAYS * 24 * 60 * 60 * 1000;
  const payloadObj = { email, expiry };
  const payload = Buffer.from(JSON.stringify(payloadObj)).toString('base64url');

  const signature = crypto
    .createHmac('sha256', SECRET)
    .update(payload)
    .digest('hex');

  return `${payload}.${signature}`;
}

export function verifySession(token) {
  if (!SECRET) throw new Error('SESSION_SECRET is not set');
  if (!token || typeof token !== 'string') return null;

  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [payload, signature] = parts;

  const expectedSig = crypto
    .createHmac('sha256', SECRET)
    .update(payload)
    .digest('hex');

  // Constant-time comparison to avoid timing attacks
  const sigBuffer = Buffer.from(signature, 'hex');
  const expectedBuffer = Buffer.from(expectedSig, 'hex');
  if (sigBuffer.length !== expectedBuffer.length) return null;
  if (!crypto.timingSafeEqual(sigBuffer, expectedBuffer)) return null;

  let decoded;
  try {
    decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  } catch {
    return null;
  }

  if (!decoded.email || !decoded.expiry) return null;
  if (Date.now() > decoded.expiry) return null; // expired

  return { email: decoded.email };
}

