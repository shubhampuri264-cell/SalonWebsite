# Owner Dashboard Upgrade

## Plan
- [x] Review existing admin auth and appointment management flows.
- [x] Add owner login UX support for username or email + password.
- [x] Add appointment board improvements (quick date filters, search, summary cards, one-click status actions).
- [x] Add CSV export for filtered appointment list.
- [x] Verify with typecheck/build.

## Review
- Owner login now accepts username or email plus password; username can map to owner email using `VITE_OWNER_USERNAME` + `VITE_OWNER_EMAIL`.
- Owner appointments view now shows full contact details (`name`, `email`, `phone`), appointment `date/time`, notes, and direct `Email`/`Call` actions.
- Added quick filters (All/Today/Tomorrow/This Week), search, summary cards, one-click status actions, and CSV export.
- Verification:
- `npm run typecheck -w client` passed.
- `npm run build -w client` fails in this sandbox with Vite/esbuild `spawn EPERM` (environment limitation, not a code type error).
