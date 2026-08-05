# Rollback migrations

Down-migrations that revert specific forward migrations in `supabase/migrations/`.
These are kept here (not in the parent folder) so they aren't accidentally applied
as forward migrations by anyone scanning the directory in order.

## When to apply

Only when fix-forward isn't viable — e.g. a forward migration caused a hard
regression that can't be patched with another forward migration in time.

## Reversibility limits

Down-migrations revert **schema**, not **data**. Anything the forward migration
deleted/transformed is gone. Specifically:

- **017.down**: destroys every promotion the owner has written — wording, dates
  and history. To merely stop offers showing, run
  `UPDATE public.promotions SET is_active = FALSE;` instead; it has the same
  customer-visible effect and loses nothing.
- **014.down**: restores the migration-008 function body verbatim. If a
  migration above 014 also replaced `book_appointment`, running this reverts
  that too — check for later definitions first.
- **008.down**: cannot restore which rows were originally `pending` before the
  backfill — it only reverts the RPC default going forward.
- **007.down**: only safe to run alongside `006.down`. In isolation it kills
  live bookings (service_role can no longer call the RPC).
- **006.down**: re-opens security holes that 006 closed. Run only as a last
  resort.

## Procedure

1. Identify which forward migration introduced the regression.
2. Open `supabase/migrations/rollback/<n>_*.down.sql`.
3. Read the WARNING block at the top — confirm the listed side effects are
   acceptable.
4. Paste into Supabase Dashboard → SQL Editor and run.
5. Run the verification queries at the bottom of the file.
6. Once the cause is fixed, write a NEW forward migration to re-apply the
   intent — don't re-run the original `n_*.sql` file.

## Application-layer rollback

Code rollbacks are handled by Vercel:
**Dashboard → Deployments → previous successful deploy → Promote to Production**.
This is separate from DB rollback and usually faster.
