// api/_email.js
// Sends transactional email via Resend (resend.com).
// No npm install needed — pure fetch.
// Free tier: 3,000 emails/day, 100/month on free plan.
//
// Setup (one-time):
// 1. Sign up at resend.com
// 2. Add & verify your domain (or use onboarding@resend.dev for testing)
// 3. Add RESEND_API_KEY to Vercel env vars
// 4. Add RESEND_FROM to Vercel env vars e.g. "Findly <receipts@yourdomain.com>"

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const FROM = process.env.RESEND_FROM || 'Findly <onboarding@resend.dev>';

export async function sendEmail({ to, subject, html }) {
  if (!RESEND_API_KEY) {
    console.warn('RESEND_API_KEY not set — email skipped.');
    return null;
  }

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from: FROM, to: [to], subject, html }),
  });

  const data = await res.json();
  if (!res.ok) {
    console.error('Resend error:', data);
    return null;
  }
  return data;
}

// ─── Receipt templates ─────────────────────────────────────────────────────

export function listingActivationReceipt({ businessName, email, reference, amount, expiresAt }) {
  const date = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  const expiry = new Date(expiresAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

  return {
    to: email,
    subject: `Findly — Listing activated for ${businessName}`,
    html: `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#0F1410;font-family:'Helvetica Neue',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0F1410;padding:40px 0;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#1A2018;border-radius:14px;overflow:hidden;border:1px solid #2A3828;max-width:560px;width:100%;">

        <!-- Header -->
        <tr><td style="padding:32px 36px 24px;border-bottom:1px solid #2A3828;">
          <span style="font-size:28px;font-weight:700;color:#D4A24C;letter-spacing:-1px;">Findly</span>
          <span style="display:block;color:#6B7A67;font-size:12px;margin-top:4px;letter-spacing:0.06em;text-transform:uppercase;">Payment receipt</span>
        </td></tr>

        <!-- Body -->
        <tr><td style="padding:28px 36px;">
          <p style="margin:0 0 20px;color:#C7CCC3;font-size:15px;line-height:1.6;">
            Your listing for <strong style="color:#EDEFE9;">${businessName}</strong> is now live on Findly.
          </p>

          <!-- Receipt table -->
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#0F1410;border-radius:10px;overflow:hidden;margin-bottom:24px;">
            ${row('Date', date)}
            ${row('Reference', reference, true)}
            ${row('Amount', `GHS ${amount}`)}
            ${row('Plan', '1 listing · 30 days')}
            ${row('Active until', expiry)}
          </table>

          <p style="margin:0;color:#6B7A67;font-size:13px;line-height:1.6;">
            Customers can now find and unlock your contact information on Findly.<br>
            Your listing will expire on <strong style="color:#C7CCC3;">${expiry}</strong>. You'll receive a reminder before it lapses.
          </p>
        </td></tr>

        <!-- Footer -->
        <tr><td style="padding:20px 36px 28px;border-top:1px solid #2A3828;text-align:center;">
          <span style="color:#6B7A67;font-size:12px;">Findly · Northbound Holdings 2026</span><br>
          <span style="color:#3A4838;font-size:11px;margin-top:4px;display:block;">Questions? Reply to this email.</span>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`,
  };
}

export function contactUnlockReceipt({ email, businessName, reference, amount }) {
  const date = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

  return {
    to: email,
    subject: `Findly — Contact unlocked: ${businessName}`,
    html: `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#0F1410;font-family:'Helvetica Neue',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0F1410;padding:40px 0;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#1A2018;border-radius:14px;overflow:hidden;border:1px solid #2A3828;max-width:560px;width:100%;">

        <tr><td style="padding:32px 36px 24px;border-bottom:1px solid #2A3828;">
          <span style="font-size:28px;font-weight:700;color:#D4A24C;letter-spacing:-1px;">Findly</span>
          <span style="display:block;color:#6B7A67;font-size:12px;margin-top:4px;letter-spacing:0.06em;text-transform:uppercase;">Contact unlock receipt</span>
        </td></tr>

        <tr><td style="padding:28px 36px;">
          <p style="margin:0 0 20px;color:#C7CCC3;font-size:15px;line-height:1.6;">
            You unlocked the contact for <strong style="color:#EDEFE9;">${businessName}</strong>.
          </p>

          <table width="100%" cellpadding="0" cellspacing="0" style="background:#0F1410;border-radius:10px;overflow:hidden;margin-bottom:24px;">
            ${row('Date', date)}
            ${row('Reference', reference, true)}
            ${row('Amount', `GHS ${amount}`)}
            ${row('Provider', businessName)}
          </table>

          <p style="margin:0;color:#6B7A67;font-size:13px;line-height:1.6;">
            Keep this receipt as proof of payment. If you experience any issues with this provider, contact Findly support with the reference number above.
          </p>
        </td></tr>

        <tr><td style="padding:20px 36px 28px;border-top:1px solid #2A3828;text-align:center;">
          <span style="color:#6B7A67;font-size:12px;">Findly · Northbound Holdings 2026</span>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`,
  };
}

function row(label, value, mono = false) {
  return `
    <tr>
      <td style="padding:11px 16px;color:#6B7A67;font-size:13px;border-bottom:1px solid #1A2018;">${label}</td>
      <td style="padding:11px 16px;color:#EDEFE9;font-size:13px;text-align:right;border-bottom:1px solid #1A2018;${mono ? 'font-family:monospace;font-size:12px;' : ''}">${value}</td>
    </tr>`;
}

