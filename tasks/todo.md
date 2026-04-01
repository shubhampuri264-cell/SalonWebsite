# Services/Team/Booking Load Fix

## Plan
- [x] Trace data loading paths for Services, Team, and Booking pages.
- [x] Identify common failure point and confirm root-cause hypothesis from code.
- [x] Add public API endpoints for `GET /api/services` and `GET /api/stylists` in Vercel functions.
- [x] Route client services/stylists fetches through API client instead of direct browser Supabase access.
- [x] Make API base URL safe for production when `VITE_API_BASE_URL` is unset or accidentally localhost.
- [x] Verify with typecheck/build.

## Review
- Root cause: public pages and booking step data used browser-side Supabase calls; any anon-key/RLS/env mismatch breaks Services, Team, and Booking together.
- Fix: moved public reads to serverless `/api/services` and `/api/stylists` backed by `supabaseAdmin`.
- Hardening: API client now defaults to same-origin in production and only uses `http://localhost:3001` automatically in development when not explicitly configured.
- Verification:
- `npm run typecheck` passed.
- `npm run build` passed (required escalation due sandbox `spawn EPERM` during Vite/esbuild startup).
