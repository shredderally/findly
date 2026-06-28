# findly # — Build Log (v0)

## What it is
A local-services directory where the CONSUMER pays, not the business.

- Browsing listings is free (name, category, location, rating, verified badge)
- Seeing the actual contact (phone/WhatsApp/direct message) costs a credit
- Free tier: 1 contact unlock/month
- Pro tier: unlimited unlocks + saved providers + price-estimate tool

## Why this works (and why most directories fail)
Standard directories monetize the business side (pay-to-list, pay-to-rank).
Two problems with that model for an early, unfunded launch:
1. You need business buy-in BEFORE you have consumer traffic — chicken/egg.
2. Businesses game pay-to-rank, so quality drops, so consumers leave.

Charging the consumer for the unlock instead means:
- Businesses join for free (zero friction to get supply onto the platform)
- Revenue starts from day one, from the side you actually control distribution to
- The product's incentive stays aligned with "show the BEST match," not
  "show whoever paid most" — which is the actual trust problem in this market

## Stack (matches Applo's proven pattern)
React + Vite, Vercel (hosting + serverless functions), Supabase (Postgres + REST)

## Core mechanic — the money-critical endpoint
`api/unlock-contact.js`:
1. Verify session token (reuse `_session.js` exactly as built for Applo)
2. Look up consumer's tier + unlocks_used + unlocks_reset in DB
3. Free tier: block if unlocks_used >= 1 for current month
4. Pro tier: no block
5. On success: increment unlocks_used, log to `unlocks` table (abuse/analytics),
   return the listing's real contact info
6. On any failure: do NOT decrement/log — fail closed

## Database (Supabase)

### Table: consumers
| Column | Type | Notes |
|---|---|---|
| id | bigint identity | PK |
| email | text | |
| password_hash | text | bcrypt |
| tier | text | free / pro |
| unlocks_used | int8 | resets monthly for free tier |
| unlocks_reset | timestamptz | drives lazy monthly reset |

### Table: listings
| Column | Type | Notes |
|---|---|---|
| id | bigint identity | PK |
| business_name | text | |
| category | text | e.g. plumber, electrician, tutor, mover |
| location | text | neighborhood/city — start with Accra only |
| phone | text | the gated field |
| whatsapp | text | the gated field |
| description | text | |
| rating | numeric | |
| verified | boolean | manual verification flag, default false |
| created_at | timestamptz | |

### Table: unlocks (abuse prevention + analytics)
| Column | Type | Notes |
|---|---|---|
| id | bigint identity | PK |
| consumer_id | bigint | FK → consumers |
| listing_id | bigint | FK → listings |
| unlocked_at | timestamptz | |

RLS: enabled on all three, no public policies — service-role key only,
same posture as Applo post-hardening. Never repeat the original Applo
mistake of trusting client-submitted identity.

## Launch scope (v0 — don't overbuild)
- One city only: Accra
- 5 categories to start: plumber, electrician, AC repair/mover, tutor, mechanic
- Manually source the first 30-50 listings yourself (calls, WhatsApp groups,
  Facebook business pages) before opening public submission — empty
  directories don't convert, and "verified" only means something if you
  actually checked the first batch
- No business-facing dashboard yet — you edit listings directly in Supabase
  for v0, same as Applo's manual tier-upgrade pattern before automation

## Known open questions (resolve before writing more code)
1. Free businesses listed without consent — need an opt-out/claim flow
   eventually so businesses aren't surprised their number is being sold
   access to. Not a v0 blocker, but a real legal/trust issue once you scale
   past your own manually-sourced listings.
2. Payment rails: reuse Paystack (same as Applo) for the Pro subscription —
   no need to re-solve this.
3. Pricing: start at $2-3/mo or GHS equivalent — this is an impulse-tier
   purchase, not a considered one. Price like it.
   
