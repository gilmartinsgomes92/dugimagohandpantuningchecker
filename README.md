# Dugimago Handpan Tuning Check

Browser-based handpan tuning analysis app built with React, Vite, and TypeScript.

## What it does

- Quick Tuning Check for fast note-by-note tuning results
- Certified Tuning Report flow with 3-strike aggregation
- Scale identification and ordered scale display
- Shareable result cards and certified report exports
- Verification flow for report IDs
- Optional account login and personal report history with Supabase

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
```

If these values are not set, the tuner still works, but login and personal history features are skipped.

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
- Route-level lazy loading is enabled to reduce the initial bundle for first-time visitors
