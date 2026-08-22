# Icon Studio

[![CI](https://github.com/shubhampuri264-cell/SalonWebsite/actions/workflows/ci.yml/badge.svg)](https://github.com/shubhampuri264-cell/SalonWebsite/actions/workflows/ci.yml)

**A booking platform built from scratch for a salon owner with no technical background, and now the system that runs the business.**

[Live site](https://iconht.studio/) · [Two-minute demo](https://www.youtube.com/watch?v=nKB7OJ09o9g)

![Icon Studio](client/public/og-image.jpg)

Customers browse services, pick a stylist and book a slot without creating an
account. The owner manages services, stylists, pricing, hours and blocked days
from an admin dashboard, and never has to call me to change a price. Reminder
and follow-up email runs on a daily cron. An optional AI assistant, Iris, sits
on top of the same booking API and can book, cancel and reschedule in
conversation.

---

## Why this exists

**The problem.** The owner was running bookings on phone calls and a paper
diary. Double bookings happened, no-shows left no record, and every schedule
change meant somebody had to be reached. The thing being wasted was not money,
it was her time, in fifteen minute pieces all day.

**The constraint that shaped everything.** She has no technical background and
no interest in acquiring one. If the system needed me in the loop to change a
price or add a stylist, it would fail the first week I got busy with something
else. Whatever I built had to be fully operable by somebody who was never going
to read documentation.

**What I tried first, and threw away.**

1. First cut was a booking form writing straight to the database, with the
   service list hardcoded. It worked on day one and made me the bottleneck for
   every price change she wanted after that.
2. So I pulled services, stylists, hours and pricing out into data and built an
   admin UI over the top. That roughly doubled the build, and it is the only
   reason the system still runs without me in it.
3. Requirements turned out to be the harder half. She described her business,
   not software, so asking her to specify features produced nothing usable. I
   switched to building small pieces and showing them to her instead. Almost
   every correction that mattered came from her reacting to something real on a
   screen.

**What shipped.** A booking platform in production, currently running a real
business, with the owner handling day to day operations herself.

**What I would do next.** There is no automated reminder flow for no-shows, so
they are recorded rather than prevented. It is the one feature she asked for
that I cut to ship on time, and it is the first thing I would add. Cutting it
was the right call for the deadline and it is still the biggest gap in the
product.

---

## Design decisions worth calling out

**Rate limiters fail closed, not open.** If Upstash Redis credentials are
missing in production, every rate-limited endpoint returns 503 rather than
quietly running unprotected. A misconfiguration should be loud.

**Double booking is prevented in the database, not the UI.** Migration
`016_prevent_double_booking.sql` puts the constraint where two concurrent
requests cannot slip past it. Client-side validation is a convenience, never
the guarantee.

**Iris runs on Supabase Edge, not Vercel.** The Vercel Hobby plan caps a
project at 12 serverless functions and all 12 were in use by the booking path.
Adding chat there would have meant merging two existing endpoints and putting
the flow that actually makes money at risk for a feature that does not.

**Iris degrades, the site does not.** With `CHAT_ENABLED=false` or no Anthropic
key, free-text chat stops and the structured menu still books, cancels,
reschedules and quotes prices. The assistant is an addition, never a
replacement.

**`INTERNAL_API_TOKEN` authenticates the service, never the customer.** All
chat traffic arrives from Supabase egress IPs, which would otherwise share one
rate-limit bucket. The token picks the right bucket. Every endpoint that
touches a booking still requires that customer's own Bearer token.

---

## Stack

| Layer | Choice |
|---|---|
| Client | React 19, TypeScript, Vite, Tailwind, Radix UI, Zustand, React Hook Form + Zod |
| API | Vercel serverless functions (TypeScript) under `api/` |
| Database | Supabase Postgres, SQL migrations, row-level security |
| Auth | Supabase Auth. Owner email doubles as the admin authorisation check |
| Email | Resend, for confirmations, owner notifications, reminders and follow-ups |
| AI assistant | Supabase Edge Function (Deno), Claude Sonnet with a Haiku classifier |
| Rate limiting | Upstash Redis |
| Errors | Sentry, separate DSNs for client and server |
| Hosting | Vercel |

---

## Repository layout

```
api/            Vercel serverless functions
  _lib/         auth, booking, business hours, email, rate limiting, Sentry
  admin/        owner-only: appointments, services, blocked slots
  customer/     customer account routes
  cron/         daily reminder job
client/         React app (Vite)
packages/shared Types shared between client and API
server/         Standalone Express server (legacy dev path)
supabase/
  migrations/   Ordered SQL, with a rollback/ directory
  functions/chat  Iris, the AI assistant (Deno)
evals/          Prompt evaluation harness for Iris
scripts/        Migration status, OG image and banner generation
```

---

## Running it locally

Requires **Node 24** (see `.nvmrc`) and a Supabase project.

```bash
npm install
cp .env.example .env      # then fill it in, see the comments in that file
```

Apply the SQL in `supabase/migrations/` in filename order to your Supabase
project, then:

```bash
npm run dev        # client + server
npm run dev:full   # client + `vercel dev`, which is what production actually runs
```

`dev:full` is the honest one. It serves the `api/` functions the same way
Vercel does, so relative `/api` paths behave in dev exactly as they do in
production.

### Checks

```bash
npm run typecheck   # client, server and api/, three tsconfigs
npm run lint        # ESLint over client, server, api, shared
npm run test        # Vitest
npm run test:edge   # Deno tests for the Iris edge function
npm run test:all    # both suites
npm run eval        # prompt evals for Iris
```

CI runs typecheck, lint and tests on every pull request and every push to
`main`.

---

## Environment

`.env.example` is the reference and is commented in detail, including which of
the three places each key belongs in (Vercel, Supabase function secrets, or the
client bundle). Two things worth repeating here:

- Do not wrap values in quotes. `dotenv` strips them locally and Vercel does
  not, so a quoted value behaves differently in production than on your laptop.
- `NODE_ENV` is deliberately absent from the template. Setting it makes
  `vite build` bundle the development build of React into production.

Never commit a filled-in `.env`.
