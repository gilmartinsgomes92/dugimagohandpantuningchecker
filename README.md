# Dugimago Handpan Tuning Check

Browser-based handpan tuning analysis app built with React, Vite, and TypeScript.

## What it does

- Quick Tuning Check for fast note-by-note tuning results
- Certified Tuning Report flow with 3-strike aggregation
- Scale identification and ordered scale display
- Shareable result cards and certified report exports
- Verification flow for report IDs
- Optional account login and personal report history with Supabase
- Marketing-consent capture and subscription / report-credit account scaffolding

## Tech stack

- React 19
- Vite 7
- TypeScript
- React Router
- Supabase Auth + data storage
- Cloudflare Pages / Functions / D1 for report verification registry

## Local development

Install dependencies:

```bash
npm ci
```

Start the dev server:

```bash
npm run dev
```

Build for production:

```bash
npm run build
```

Run lint:

```bash
npm run lint
```

Run tests:

```bash
npm test -- --runInBand
```

## Environment variables

Create a `.env` file based on `env.example`:

```env
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your-supabase-publishable-anon-key
VITE_CERTIFIED_REPORTS_REQUIRE_ENTITLEMENT=false
VITE_WIX_BUY_CREDITS_URL=
VITE_WIX_PLAYER_PLAN_URL=
VITE_WIX_MAKER_PLAN_URL=
```

If the Supabase values are not set, the tuner still works, but login, account history, and monetization prep are skipped.

Leave `VITE_CERTIFIED_REPORTS_REQUIRE_ENTITLEMENT=false` during launch mode. Flip it to `true` only after your Wix checkout links, entitlement syncing, and credit logic are ready in production.

## Supabase schema

Run these SQL files in order against the same Supabase project used by `VITE_SUPABASE_URL`:

- `db/002_create_supabase_history_tables.sql`
- `db/003_prepare_marketing_and_billing.sql`

The second file adds:

- marketing consent fields on `profiles`
- report credits and plan status fields on `profiles`
- a `billing_events` audit table for credit usage and future Wix sync events

## Verification registry

The verification endpoints live in `functions/api/reports/` and expect a Cloudflare D1 binding named `CERT_REPORTS_DB`.

## Contact form

The contact and feedback form posts to Formspree from `src/pages/ContactFormPage.tsx`.

## Launch checklist

Before public launch, confirm all of these in production:

- Quick check works on iPhone Safari, iPhone Chrome, Mac Safari, and Mac Chrome
- Certified report flow saves and exports correctly
- Verify page can look up a real report ID
- Login, signup, password reset, and My Reports all work against the live Supabase project
- Form submissions arrive in the destination inbox
- Cloudflare Pages env vars and D1 binding are configured

## Notes

- Large audio-analysis code paths are intentionally kept in the client for responsiveness
- The current production build ships a single main client bundle; route-level lazy loading is a good next performance pass after launch
