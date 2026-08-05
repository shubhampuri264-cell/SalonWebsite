# Icon Studio — Marketing & Advertising Plan

Written against the actual codebase, not a template. Every claim about the current state of the site
carries a `file:line` citation so you can verify it. Anything I could not find in the code is marked
`[TODO: owner to confirm]` rather than guessed.

---

## 0. The business, as the code describes it

| Fact | Value | Source |
| --- | --- | --- |
| Name | Icon Studio | `client/src/utils/dates.ts:43` |
| Address | 39-46 Queens Blvd, Sunnyside, NY 11104 | `client/src/utils/dates.ts:44` |
| Phone | (718) 255-6940 | `client/src/utils/dates.ts:45` |
| Email | sumipuri34@gmail.com (also the admin account) | `client/src/utils/dates.ts:46`, `supabase/migrations/005_sync_services_to_flyer.sql:26` |
| Instagram | https://www.instagram.com/sumilovestyle/ | `client/src/utils/dates.ts:47` |
| TikTok | https://www.tiktok.com/@sumi91_ | `client/src/utils/dates.ts:48` |
| Hours | 7 days/week, 10:00 AM – 8:00 PM | `packages/shared/src/constants.ts:33-41`, `client/src/utils/dates.ts:32-40` |
| Geo | lat 40.7435241, lng -73.9245996 | embedded in the Google Maps link at `client/src/pages/Location.tsx:47` |
| Positioning | "Boutique hair salon and threading studio in Sunnyside, Queens" | `client/src/components/layout/Footer.tsx:21` |
| Production domain | `[TODO: owner to confirm]` — the code reads it from the `CLIENT_URL` env var (`api/_lib/emails.ts:156`), it is not hardcoded anywhere |

**Team** (`server/src/scripts/seed.ts:21-40`):

- **Sumita Karki** — Hair Stylist, 10+ years. Specialties: Haircut & Style, Balayage, Color Correction, Blowout.
- **Sazana Aryal** — Threading & Facial Specialist. Specialties: Eyebrow Threading, Facial Threading, Upper Lip Threading, Full Face Threading.

**Booking flow.** Customers pick Service → Stylist (or "anyone") → Date/Time → Contact details, then the
booking POSTs to `/api/appointments` (`client/src/api/appointments.ts:4-13`), which calls the
`book_appointment` Postgres RPC (`api/appointments.ts:107`) and sends a confirmation email plus an owner
notification (`api/appointments.ts:136`). The customer lands on `/booking/confirmation`
(`client/src/components/BookingWizard/StepContact.tsx:70-73`). Slots snap to 30-minute intervals
(`packages/shared/src/constants.ts:30`) and appointments auto-confirm
(`supabase/migrations/008_auto_confirm_appointments.sql`).

### The price sheet, and what it means for marketing

Current active catalog after migrations 005 → 013:

**Hair** — Wash and Cut **$40**; Man/Children Haircut **$40**; Blowdry **$40–50**; Color Gloss **$40–50**;
Single Process Color **$70**; Highlights **$100–250**; Hair Botox **$100–200**; Balayage **$200–300**;
Keratin Treatment **$250–350**; Conditioner Treatments **$30**; Hair Cut and Color — consultation quote.
(`supabase/migrations/005_...sql:115-126`, `010_...sql:2-4`, `011_...sql:8-12`, `012_...sql:9-28`, `013_...sql:33-44`)

**Threading** — Lower Lip $5; Upper Lip $6; Chin $7; Forehead $7; Cheeks $7; Eyebrows $8; Threading $8;
Neck $10; Full Sides $12; Ears $12; Full Face $30; Full Face & Neck $35.
(`005_...sql:60-72`, `013_...sql:17-18,39`)

**Waxing** — Chin $7; Eyebrow $8; Full Sides $12; Under Arms $15; Half Arms $15; Half Legs $20;
Full Face $30; Full Arms $30; Bikini Line $30; Semi Brazilian $30; Full Face & Neck $35; Full Front $35;
Full Legs $40; Full Back $40; Full Brazilian $40; Brazilian Painless CBD $45; Full Body $150.
(`005_...sql:75-94`, `013_...sql:20-24`)

**Facials** — Facial $35; Herbal $60; Anti-Acne $65; Deep Cleansing $70; Repechage Seaweed $80;
Repechage Four Layer $80; Facial Bleach $20. (`005_...sql:44-46,97-103`, `013_...sql:29-31`)

**Special treatments** — Eyebrow Tinting $15; Eyelash Tinting $25; Hot Oil Hair Massage $25;
Eyelashes Cluster $35; Eyelashes Individual $70; Lash Lifting & Tint $70; Eyebrow Lamination $80;
Eyelashes Mink $125. (`005_...sql:49-53,106-112`, `013_...sql:19,21`)

**This price spread is the single most important input to the whole plan.** The ticket range is $5 to $350.
Any advertising you pay for must be aimed at the top of that range:

- A **Balayage** client at $250 who returns every 10 weeks is worth roughly **$1,300/year**. Paying $60 to
  acquire her is a 20x return.
- A **Keratin** client at $300 twice a year is worth ~$600/year. Paying $60 is a 10x return.
- An **eyebrow threading** client at $8 every 3 weeks is worth ~$140/year. You cannot profitably pay
  $3 per ad click for her — one click at NYC salon CPCs costs more than half the service.

So: **threading, waxing and facials are your retention and referral engine, not your paid-acquisition
target.** Advertise color, keratin, balayage, and lash extensions. Then upsell threading and facials to
people who are already in the chair — Sazana's chair is the profit multiplier on Sumita's clients and
vice versa, and the site already lets a customer pick either stylist.

---

## 1. Audit: what exists today vs. what is missing

### SEO — largely missing

| Item | Status | Evidence |
| --- | --- | --- |
| `<title>` + meta description in the shipped HTML | Present but generic; says "New York" not "Sunnyside, Queens" | `client/index.html:7-8` |
| Open Graph tags | **Missing from `index.html` entirely.** Only Home has partial OG via Helmet — `og:title` and `og:description`, **no `og:image`, no `og:url`, no `og:type`** | `client/index.html:1-20` (whole file, no OG); `client/src/pages/Home.tsx:59-63` |
| Twitter card tags | **Absent repo-wide** | no `twitter:` string anywhere in first-party code |
| `<link rel="canonical">` | **Absent repo-wide** | — |
| `robots.txt` | **Does not exist** | `client/public/` contains only `gallery/`, `location-salon.jpeg`, `salonpic.png` |
| `sitemap.xml` | **Does not exist** | same |
| JSON-LD structured data | **Absent repo-wide.** No `application/ld+json`, no `schema.org`, no `LocalBusiness`, no `HairSalon` anywhere | — |
| Per-page meta | react-helmet-async is installed and used on 10 pages (`client/src/main.tsx:4,17,21`); Home/Services/Team/Gallery/Location/Contact/Book have title+description; BookingConfirmation, CancelPage, CustomerProfile have **title only**; all 7 admin pages plus ResetPassword and the 404 have **no Helmet at all** | `client/src/pages/*.tsx`, `client/src/App.tsx:95-105` |
| Heading hierarchy | Good. Each public page has exactly one `<h1>` then `<h2>`/`<h3>` | e.g. `client/src/pages/Location.tsx:19,41,102` |
| Image alt text | Good — real descriptive alts, decorative elements correctly `aria-hidden` | `client/src/pages/Home.tsx:109,201`, `client/src/pages/Location.tsx:33` |

**The crawlability problem.** This is a pure client-side Vite SPA. `client/vite.config.ts:6` loads only
`@vitejs/plugin-react` — there is no vite-plugin-ssr, no prerender plugin, no react-snap, no SSG step.
`vercel.json:5` sets `"framework": null`, and `vercel.json:6-8` rewrites every non-API path to
`/index.html`. So the raw HTML served for `/services`, `/location`, `/team` — every page — is the same
20-line shell at `client/index.html`, with `<div id="root">` empty and one generic title.

Googlebot does render JavaScript, so it will eventually see the Helmet tags. But rendering is a second,
delayed queue, and **Bing, Meta's link scraper, iMessage/WhatsApp previews, Yelp, Apple Maps, and most
AI crawlers do not run your JS at all.** Right now, when anyone shares your booking link in a text
message or an Instagram DM, the preview shows the generic index.html title with **no image**, because
`og:image` does not exist anywhere in the codebase. That is a real, daily conversion leak.

*Fix priority: get the LocalBusiness JSON-LD and OG tags into `client/index.html` itself (static, always
visible to every crawler). That is a 30-minute job and covers 80% of the gap. Full per-route
prerendering is a nice-to-have you can skip for now.*

### Analytics and conversion tracking — completely absent

There is **zero** analytics or ad-pixel code in this repository. I searched all of `client/`, `api/`,
`server/`, `client/index.html`, `client/vite.config.ts` and `vercel.json` for gtag, googletagmanager,
google-analytics, fbq, pixel, posthog, plausible, umami, mixpanel, segment, clarity, hotjar and
dataLayer. **No hits.** (The only near-matches are `analytics: false` at `api/_lib/ratelimit.ts:60,68,77,86,92,100`,
which is an Upstash rate-limiter option, not web analytics.)

Sentry **is** wired up (`client/src/sentry.ts:1-42`, `client/src/main.tsx:7,12`, `api/_lib/sentry.ts:1-73`),
but that is crash reporting. It tells you nothing about traffic, sources, or bookings.

**Consequence: you currently cannot answer "how many people visited the site this month and how many
booked."** Do not spend a dollar on ads before this is fixed — you would be buying traffic you cannot measure.

**The exact instrumentation point** for the key conversion event is
`client/src/components/BookingWizard/StepContact.tsx:70-73` — the moment `createAppointment()` resolves
and before `navigate('/booking/confirmation')`. Note there is no React Query mutation and no `onSuccess`
callback; it is a plain `await` inside `onSubmit`, so the tracking call goes right there. You already have
`selectedService` in scope at that point, which means you can send the service name and its price as the
conversion **value** — that is what lets Google and Meta optimize toward $300 keratin bookings instead of
$8 brow threading. Do not put tracking in `client/src/pages/BookingConfirmation.tsx` — that page reads
`location.state` and a refresh or a direct visit would double-count or misfire.

### Performance — the media is the problem, the code is fine

The JavaScript build is genuinely well done. `client/dist/assets/` totals **797 KB** across all chunks,
with deliberate manual chunking (`client/vite.config.ts:27-40`) and lazy-loaded routes
(`client/src/App.tsx:13-27`). Largest bundles: supabase 189 KB, react-core 175 KB, CSS 36 KB. No action needed.

The media is a different story — **`client/dist/` is 61 MB, of which `gallery/` alone is 55 MB:**

| File | Size | Referenced at |
| --- | --- | --- |
| `client/public/gallery/hair-video-2.mov` | **23.11 MB** | `client/src/pages/Gallery.tsx:42` |
| `client/public/gallery/hair-video-3.mov` | **21.72 MB** | `client/src/pages/Gallery.tsx:46` |
| `client/public/location-salon.jpeg` | **3.67 MB** | `client/src/pages/Location.tsx:31` |
| `client/public/gallery/hair-3.jpg` | 2.14 MB | `client/src/pages/Gallery.tsx` |
| `client/public/gallery/hair-1.jpg` | 1.52 MB | also the Home mosaic, `client/src/pages/Home.tsx:36` |
| `client/public/salonpic.png` | **1.06 MB** | `client/src/pages/Home.tsx:108` — this is the hero image and therefore your Largest Contentful Paint element |
| `client/public/gallery/hair-video-1.mov` | 0.77 MB | `client/src/pages/Gallery.tsx:38` |

Three separate problems:

1. **45 MB of `.mov` files.** Worse, all three are declared as `<source type="video/mp4">`
   (`client/src/pages/Gallery.tsx:38,42,46`). QuickTime `.mov` labelled as MP4 **will not play in Firefox
   or most non-Safari browsers.** Your gallery videos are broken for a large share of visitors *and*
   costing you 45 MB of bandwidth.
2. **A 1.06 MB PNG as the hero/LCP image.** On the Queens Blvd 4G that most of your customers are
   browsing on, this alone can push LCP past 4 seconds. Google Ads charges you more per click for slow
   landing pages (Quality Score), and mobile visitors abandon.
3. **Duplicate assets.** `salon-1..9.jpeg` and `screenshot-1..9.jpg` are byte-identical pairs, and both
   sets are listed and rendered in `client/src/pages/Gallery.tsx:17-36`. You are shipping and displaying
   the same nine photos twice.

`sharp` is already a root dependency (`package.json:24`) but no build script uses it. And `vercel.json`
has **no `headers` block at all** — no `Cache-Control`, no immutable caching for `/assets/*`, and no
security headers.

### Email — the infrastructure already exists, and this is your biggest hidden asset

You are already sending transactional email through **Resend** (`api/_lib/emails.ts:5,30-45`), with HTML
templates, HTML-escaping of user input (`api/_lib/emails.ts:56-63`), a dev override, and Sentry-reported
failures. Four emails ship today:

| Email | Trigger | Source |
| --- | --- | --- |
| "Your Icon Studio Appointment is Confirmed!" | immediately after a successful booking | `api/_lib/emails.ts:123-135`, called at `api/appointments.ts:136` |
| "New Booking: {name} — {datetime}" (to owner) | same moment, if `OWNER_EMAIL` is set | `api/_lib/emails.ts:170-182` |
| "Reminder: Your Icon Studio Appointment is Tomorrow" | daily cron at 13:00 UTC | `api/cron/reminders.ts:32-116`, scheduled at `vercel.json:9-14` |
| "Reset your Icon Studio password" | password reset request | `api/_lib/emails.ts:163-168` |

**What is missing:** there is **no post-appointment email of any kind**. No review request, no rebooking
nudge, no thank-you, no win-back. Every email you send fires *before or on* the day of the appointment
(`api/cron/reminders.ts:45-57` queries tomorrow's confirmed appointments only). Nothing runs after.

**There is also no marketing opt-in anywhere.** No newsletter signup, no subscribe field, no marketing
consent checkbox. The only checkbox in the booking form is the cancellation-policy agreement
(`client/src/components/BookingWizard/StepContact.tsx:193-205`). So the emails you have collected are
**transactional-only with no consent to market to them** — legally you can send appointment-related mail
and a post-visit service follow-up, but a promotional blast to that list is a CAN-SPAM and
deliverability risk. Add the opt-in checkbox now so the list becomes usable later.

The Contact page form does not send email at all — it opens the visitor's mail client via `mailto:`
(`client/src/pages/Contact.tsx:22`). That silently fails for anyone using webmail without a configured
mail handler, which is most people on mobile.

### One hard constraint you need to know about

`api/` currently contains **11 serverless functions**, and your Vercel plan caps you at 12 — the last two
commits (`5e10be3`, `696ea56`) were spent getting under that limit. **You have exactly one function slot
left.** Every retention idea below is therefore designed to extend the *existing* cron
(`api/cron/reminders.ts`) rather than add new endpoints. Do not burn the last slot casually.

---

## 2. The plan, ordered by return per hour of effort

### Tier 1 — Free, do this first (Weeks 1–2)

#### 1.1 Google Business Profile — the single biggest lever, full stop

For a walk-in-friendly salon on Queens Blvd, **the Google Map pack outranks your website in importance
by a wide margin.** Someone standing on Queens Blvd searching "eyebrow threading near me" sees three map
results before they see a single website link. Getting into those three is worth more than everything
else in this document combined, and it costs nothing.

Your listing already exists — the code links to it (`client/src/pages/Location.tsx:47`, Google's place
name "Icon studios"). Claim and complete it at business.google.com.

Checklist, in order:

1. **Claim and verify** the listing. Verification is usually a postcard or video call; allow 1–2 weeks.
2. **Primary category: "Hair Salon."** Secondary categories: "Threading Service," "Waxing Hair Removal
   Service," "Facial Spa," "Eyelash Salon." Categories are the strongest single ranking factor in the
   map pack. Do not leave the secondaries empty.
3. **Name, address, phone must match the website character-for-character** — "Icon Studio",
   "39-46 Queens Blvd, Sunnyside, NY 11104", "(718) 255-6940". Google cross-checks this. If your GBP says
   "Icon Studios" (plural, as the maps link at `client/src/pages/Location.tsx:47` suggests) and the site
   says "Icon Studio", pick one and make them identical everywhere.
4. **Hours: Mon–Sun 10:00 AM – 8:00 PM**, matching `packages/shared/src/constants.ts:33-41`.
5. **Photos — this is where most salons lose.** Upload 25+ to start, then 3–5 new ones every week
   forever. Google's own data shows listings with 100+ photos get several times the direction requests of
   listings with fewer than 10. You already have usable material in `client/public/gallery/`. Categories
   to cover: exterior storefront (helps people find the door), interior/each station, the team, and above
   all **before-and-after client results**. Name the files descriptively before upload
   (`balayage-sunnyside-queens.jpg`, not `IMG_4471.jpg`).
6. **Add every service with its real price.** GBP has a Services section — fill in the full menu from
   section 0 above. This makes you eligible to appear for specific searches like "keratin treatment
   Sunnyside" rather than only generic "hair salon."
7. **Add the booking link.** GBP has a "Book online" / appointment URL field. Point it at
   `[TODO: owner to confirm production domain]/book`. This puts a Book button directly in your map
   listing — a booking with zero clicks to your site.
8. **Post weekly.** GBP Posts are free and almost nobody uses them. One post a week: a before/after, a
   slow-day offer, a seasonal note. Takes five minutes.
9. **Answer the Q&A section yourself.** You can ask and answer your own questions. Seed 5–8:
   "Do you take walk-ins?" (yes — `client/src/pages/Home.tsx:99`), "Do you do eyebrow threading?",
   "How much is a keratin treatment?", "Do you have parking?", "Are you open Sundays?" (yes, 10–8).

**Expected effect:** for a salon starting from an unoptimized listing, a fully completed profile with
weekly photos and a steady review flow typically moves you into the local 3-pack for mid-tail terms
within 60–90 days. It is the highest-ROI work available to you.

#### 1.2 Reviews — build the ask into the code you already have

Reviews are the second-strongest map-pack ranking factor and the strongest conversion factor. A salon
with 40 recent reviews at 4.8 beats one with 200 reviews from 2019.

**The mechanics matter more than the volume:**

- **Ask in person, at the chair, while she is still looking at her new hair.** That moment — the
  mirror, the phone already out for a selfie — converts far better than any email. Say: "If you love it,
  a Google review genuinely helps us. I'll text you the link." Then send it before she leaves.
- **Then reinforce by email 24 hours later.** This is where the codebase comes in.
- **Never offer a discount for a review.** Google removes them and can suspend the listing. You may
  offer a discount for a *referral*, which is different and allowed.
- **Reply to every review, good and bad, within 48 hours.** Replies are a ranking signal and, more
  importantly, prospects read how you handle criticism.

**What to build (roughly 2–3 hours of work, no new serverless function needed):**

Extend `api/cron/reminders.ts`. It already runs daily at 13:00 UTC (`vercel.json:9-14`), already
authenticates via `CRON_SECRET` (`api/cron/reminders.ts:16-30`), already queries appointments by date
with the service and stylist joined (`:47-57`), already loops-sends-and-flags (`:81-104`), and already
reports failures to Sentry with sensible fingerprints (`:98-113`). Add a second query in the same handler
for appointments where `appointment_date = yesterday` and `status = 'completed'`, and send a new
`sendFollowUpEmail()` added alongside the existing templates in `api/_lib/emails.ts`. You will need one
new boolean column, `followup_sent`, mirroring the existing `reminder_sent` pattern — a five-line
migration following the shape of the ones in `supabase/migrations/`.

The follow-up email should do exactly two things: (1) a one-click Google review link, and (2) a
"Book your next visit" button to `/book`. That single email is both your review engine and your
rebooking engine.

Get the review link from your GBP dashboard's "Ask for reviews" button — it gives you a short
`g.page/r/...` URL. `[TODO: owner to confirm — paste the short review URL here once GBP is claimed.]`
Do not hand-build this URL from the map link; get it from the dashboard so it is correct.

**Target: 4 new reviews per week.** At roughly a 10–15% ask-to-review conversion on the email plus a much
higher rate on in-person asks, that is very achievable and gets you to 50+ reviews in a quarter.

#### 1.3 Free local citations

One afternoon of work, then done. Create or claim, with **byte-identical name/address/phone**:

Apple Business Connect (Apple Maps — meaningful iPhone share in NYC), Bing Places, Yelp (salons live and
die on Yelp in NYC), Facebook Page, Instagram professional account with the address set, Nextdoor
Business (very strong in Sunnyside/Woodside specifically), and the free listings on Booksy/Vagaro/StyleSeat
if you want the directory traffic — though point their booking buttons at your own `/book` page so you
keep the customer relationship and pay no commission.

---

### Tier 2 — On-site fixes (Week 2, roughly one focused day of dev work)

Ordered by impact. All of these are small, contained edits.

#### 2.1 Add JSON-LD structured data to `client/index.html`

Currently absent repo-wide. Put it in `client/index.html` (not in a Helmet block) so it is in the raw HTML
every crawler receives without executing JavaScript. Paste this just before `</head>`, after line 14:

```html
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "HairSalon",
  "@id": "https://[TODO: owner to confirm domain]/#business",
  "name": "Icon Studio",
  "description": "A boutique hair salon and threading studio in Sunnyside, Queens. Precision cuts, balayage, color, eyebrow threading, waxing, facials and lash extensions. Open 7 days, walk-ins welcome.",
  "url": "https://[TODO: owner to confirm domain]/",
  "telephone": "+17182556940",
  "email": "sumipuri34@gmail.com",
  "image": "https://[TODO: owner to confirm domain]/salonpic.png",
  "logo": "https://[TODO: owner to confirm domain]/favicon.svg",
  "priceRange": "$$",
  "currenciesAccepted": "USD",
  "address": {
    "@type": "PostalAddress",
    "streetAddress": "39-46 Queens Blvd",
    "addressLocality": "Sunnyside",
    "addressRegion": "NY",
    "postalCode": "11104",
    "addressCountry": "US"
  },
  "geo": {
    "@type": "GeoCoordinates",
    "latitude": 40.7435241,
    "longitude": -73.9245996
  },
  "hasMap": "https://www.google.com/maps/place/Icon+studios/@40.7435241,-73.9271745,17z",
  "openingHoursSpecification": [{
    "@type": "OpeningHoursSpecification",
    "dayOfWeek": ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"],
    "opens": "10:00",
    "closes": "20:00"
  }],
  "areaServed": [
    { "@type": "Place", "name": "Sunnyside, Queens, NY" },
    { "@type": "Place", "name": "Woodside, Queens, NY" },
    { "@type": "Place", "name": "Long Island City, Queens, NY" },
    { "@type": "Place", "name": "Astoria, Queens, NY" }
  ],
  "sameAs": [
    "https://www.instagram.com/sumilovestyle/",
    "https://www.tiktok.com/@sumi91_"
  ],
  "employee": [
    { "@type": "Person", "name": "Sumita Karki", "jobTitle": "Hair Stylist" },
    { "@type": "Person", "name": "Sazana Aryal", "jobTitle": "Threading & Facial Specialist" }
  ],
  "makesOffer": [
    { "@type": "Offer", "itemOffered": { "@type": "Service", "name": "Balayage" },
      "priceSpecification": { "@type": "PriceSpecification", "minPrice": 200, "maxPrice": 300, "priceCurrency": "USD" } },
    { "@type": "Offer", "itemOffered": { "@type": "Service", "name": "Keratin Treatment" },
      "priceSpecification": { "@type": "PriceSpecification", "minPrice": 250, "maxPrice": 350, "priceCurrency": "USD" } },
    { "@type": "Offer", "itemOffered": { "@type": "Service", "name": "Highlights" },
      "priceSpecification": { "@type": "PriceSpecification", "minPrice": 100, "maxPrice": 250, "priceCurrency": "USD" } },
    { "@type": "Offer", "itemOffered": { "@type": "Service", "name": "Single Process Color" },
      "priceSpecification": { "@type": "PriceSpecification", "price": 70, "priceCurrency": "USD" } },
    { "@type": "Offer", "itemOffered": { "@type": "Service", "name": "Wash and Cut" },
      "priceSpecification": { "@type": "PriceSpecification", "price": 40, "priceCurrency": "USD" } },
    { "@type": "Offer", "itemOffered": { "@type": "Service", "name": "Eyebrow Threading" },
      "priceSpecification": { "@type": "PriceSpecification", "price": 8, "priceCurrency": "USD" } },
    { "@type": "Offer", "itemOffered": { "@type": "Service", "name": "Eyelashes - Mink" },
      "priceSpecification": { "@type": "PriceSpecification", "price": 125, "priceCurrency": "USD" } },
    { "@type": "Offer", "itemOffered": { "@type": "Service", "name": "Repechage Four Layer Facial" },
      "priceSpecification": { "@type": "PriceSpecification", "price": 80, "priceCurrency": "USD" } }
  ],
  "potentialAction": {
    "@type": "ReserveAction",
    "target": {
      "@type": "EntryPoint",
      "urlTemplate": "https://[TODO: owner to confirm domain]/book",
      "inLanguage": "en-US",
      "actionPlatform": [
        "http://schema.org/DesktopWebPlatform",
        "http://schema.org/MobileWebPlatform"
      ]
    },
    "result": { "@type": "Reservation", "name": "Book an appointment at Icon Studio" }
  }
}
</script>
```

**Deliberately omitted: `aggregateRating`.** Google's structured-data guidelines prohibit self-serving
review markup on a business's own page, and inventing a rating is both a policy violation and dishonest.
Your star rating comes from Google Business Profile, where it belongs.

Validate with Google's Rich Results Test after deploying.

#### 2.2 Fix the social preview and base meta in `client/index.html`

Currently `client/index.html:7-8` has a title and description, and nothing else — no OG image means every
shared link renders as a bare grey box. Replace/extend lines 7–8 with:

```html
<meta name="description" content="Icon Studio is a boutique hair salon and eyebrow threading studio at 39-46 Queens Blvd, Sunnyside, Queens. Balayage, keratin, color, threading, waxing, facials and lashes. Open 7 days, 10am-8pm. Book online." />
<link rel="canonical" href="https://[TODO: owner to confirm domain]/" />
<meta name="robots" content="index, follow, max-image-preview:large" />
<meta property="og:type" content="website" />
<meta property="og:site_name" content="Icon Studio" />
<meta property="og:title" content="Icon Studio | Hair Salon & Threading Studio in Sunnyside, Queens" />
<meta property="og:description" content="Precision cuts, balayage, color and expert eyebrow threading on Queens Blvd. Open 7 days. Book online in under two minutes." />
<meta property="og:url" content="https://[TODO: owner to confirm domain]/" />
<meta property="og:image" content="https://[TODO: owner to confirm domain]/og-image.jpg" />
<meta property="og:image:width" content="1200" />
<meta property="og:image:height" content="630" />
<meta property="og:locale" content="en_US" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="Icon Studio | Hair Salon & Threading Studio in Sunnyside, Queens" />
<meta name="twitter:description" content="Precision cuts, balayage, color and expert eyebrow threading on Queens Blvd. Open 7 days." />
<meta name="twitter:image" content="https://[TODO: owner to confirm domain]/og-image.jpg" />
```

Also change the `<title>` at `client/index.html:8` to include the neighbourhood:
`Icon Studio | Hair Salon & Threading Studio in Sunnyside, Queens`. "New York" (current text at
`client/index.html:7`) is far too broad to ever rank — you are competing with all of Manhattan.
"Sunnyside" and "Queens Blvd" are terms you can actually win.

You will need to create `client/public/og-image.jpg` at exactly 1200x630 — a good before/after or a clean
storefront shot with the name on it.

#### 2.3 Add `robots.txt` and `sitemap.xml`

Neither exists. Create `client/public/robots.txt`:

```
User-agent: *
Allow: /
Disallow: /admin
Disallow: /profile
Disallow: /auth
Disallow: /booking/cancel

Sitemap: https://[TODO: owner to confirm domain]/sitemap.xml
```

Create `client/public/sitemap.xml` listing the seven public routes from `client/src/App.tsx:81-87`:
`/`, `/services`, `/team`, `/gallery`, `/location`, `/book`, `/contact`. Everything under `/admin/*`
(`client/src/App.tsx:60-66`), `/profile`, `/auth/reset`, `/booking/*` stays out. Submit the sitemap in
Google Search Console and Bing Webmaster Tools.

Separately, the 404 element at `client/src/App.tsx:95-105` has no Helmet — add one with a
`noindex` robots meta.

#### 2.4 Install analytics and conversion tracking

**Google Analytics 4** — free, and required if you ever run Google Ads. Add the gtag snippet to
`client/index.html`, then fire the conversion at
`client/src/components/BookingWizard/StepContact.tsx:70-73`:

```ts
// after createAppointment() resolves, before navigate()
window.gtag?.('event', 'booking_complete', {
  currency: 'USD',
  value: selectedService.price_min,
  service_name: selectedService.name,
  stylist: stylistId,
});
```

Sending `value` is the important part — it is what teaches Google Ads that a keratin booking is worth
30x a brow threading. Mark `booking_complete` as a Key Event in GA4, then import it into Google Ads.

Also add SPA pageview tracking — because this is a client-side router, GA4's automatic pageviews will only
fire once on the initial load. A small `useEffect` on `useLocation()` in `client/src/App.tsx` fixes it.

**Meta Pixel** — add the base pixel to `client/index.html` and fire `fbq('track', 'Schedule', {...})` at
the same StepContact line. Do this even if you are not advertising on Meta yet: the pixel needs 30+ days
of history to build a useful lookalike audience, so installing it early is free optionality.

**Google Search Console** — free, non-negotiable. Verify the domain, submit the sitemap, and check the
Performance report monthly to see which queries you actually appear for.

Budget note: GA4, Search Console, Bing Webmaster and the Meta Pixel are all $0.

#### 2.5 Fix the media weight

Roughly half a day, and it improves both SEO and ad Quality Score.

1. **Convert the three `.mov` files to `.mp4` (H.264) plus a `.webm` fallback**, and fix the broken
   `type` attributes at `client/src/pages/Gallery.tsx:38,42,46`. A 23 MB `.mov` becomes roughly 2–3 MB as
   a properly encoded 1080p MP4 — a 90% reduction, and it will actually play in Firefox and Chrome.
   Cap gallery clips at 15–20 seconds; nobody watches longer, and those clips double as Instagram Reels.
2. **Convert `salonpic.png` (1.06 MB) to WebP** and add `fetchpriority="high"` at
   `client/src/pages/Home.tsx:107-112`. It is your LCP element. Target under 150 KB.
3. **Compress `location-salon.jpeg` (3.67 MB)** — should be under 200 KB at display size.
4. **Delete the duplicate `screenshot-*.jpg` set** and remove the duplicate entries from
   `client/src/pages/Gallery.tsx:17-36`.
5. **Add a `headers` block to `vercel.json`** (it has none today) with
   `Cache-Control: public, max-age=31536000, immutable` for `/assets/*` and `/gallery/*`.

`sharp` is already installed at `package.json:24` — a small build-step script can automate steps 2–3.

#### 2.6 Add a marketing opt-in checkbox

In `client/src/components/BookingWizard/StepContact.tsx`, next to the existing cancellation-policy
checkbox at lines 193-205, add an **unchecked-by-default** checkbox: "Send me occasional offers and salon
news." Store it as a boolean on the appointment or a new `marketing_consent` column. Without this, the
email addresses you are collecting are legally transactional-only and you cannot build a promotional list
on top of them. It costs 20 minutes now and unlocks everything in section 5 later.

#### 2.7 Content pages worth writing

Each of these is a page that can rank for a real search someone in Queens is typing:

- **A service page per money service**, not just the single `/services` list. `/services/balayage-queens`,
  `/services/keratin-treatment-sunnyside`, `/services/eyebrow-threading-sunnyside`. Each with photos,
  the real price, how long it takes, aftercare, and a Book button.
- **"Hair salon in Sunnyside, Queens"** — a proper local landing page naming the neighbourhood, the
  7 train, Queens Blvd, and the surrounding areas (Woodside, LIC, Astoria).
- **An FAQ page with `FAQPage` schema** — "Do you take walk-ins?", "How much is balayage?", "How long does
  keratin last?", "Do I need a consultation for color?". FAQ schema can win extra space in search results.

---

### Tier 3 — Paid advertising (start Week 5, only after Tier 1 and 2 are done)

**Do not start paid ads until analytics is live and the site loads fast.** Paying for clicks you cannot
measure, landing on a page with a 1 MB hero image, is how small businesses conclude "ads don't work."

#### 3.1 Google Ads — highest intent, start here

Someone typing "balayage near me" is ready to book today. That is the best traffic money can buy.

**Budget: start at $15–20/day ($450–600/month).** Below about $10/day the campaign cannot gather enough
data to optimize and you will conclude nothing. Above $30/day you will exhaust the searchable demand in a
single Queens neighbourhood and start paying for people in Manhattan who will never come.

**Realistic NYC salon economics** (these are typical ranges for the New York market; your actual numbers
will vary and you should replace these with real data after 30 days):

| Metric | Realistic range |
| --- | --- |
| Cost per click, generic salon terms ("hair salon near me") | $2–5 |
| Cost per click, high-value service terms ("balayage nyc", "keratin treatment queens") | $4–10 |
| Cost per click, branded ("icon studio sunnyside") | $0.30–1.00 |
| Landing page → booking conversion rate, with a good booking flow | 5–15% |
| **Resulting cost per booking** | **$30–90** |

Against a $250 balayage or a $300 keratin with a ~$1,300 annual value, a $60 cost per booking is
excellent. Against an $8 eyebrow threading, it is catastrophic. **This is why keyword selection is the
whole game.**

**Campaign structure — three campaigns, that is all:**

*Campaign 1: Local Services (the core, ~60% of budget).* Location targeting: a 3-mile radius around
39-46 Queens Blvd, set to "presence — people in this location" (NOT "presence or interest," which wastes
money on tourists searching from elsewhere). Ad schedule: Mon–Sun 9am–8pm, matching your hours
(`packages/shared/src/constants.ts:33-41`) plus an hour of lead time. Bidding: start Maximize Clicks with a
$4 cap for the first 3–4 weeks, then switch to Maximize Conversions once you have 15+ tracked bookings.

Ad groups and keywords (phrase and exact match — **avoid broad match entirely at this budget**, it will
burn your daily spend on irrelevant traffic within days):

| Ad group | Keywords | Landing page |
| --- | --- | --- |
| Balayage | "balayage queens", "balayage sunnyside", "balayage near me", "hair highlights queens" | `/services` (or the dedicated balayage page from 2.7) |
| Keratin / Smoothing | "keratin treatment queens", "keratin treatment near me", "hair smoothing nyc", "brazilian blowout queens" | dedicated page |
| Color | "hair color salon queens", "hair colorist sunnyside", "root touch up near me" | `/services` |
| Haircut | "haircut sunnyside", "hair salon sunnyside", "womens haircut queens" | `/` |
| Lashes | "eyelash extensions queens", "lash lift near me", "mink lashes queens" | `/services` |
| Brand defence | "icon studio sunnyside", "icon studios queens blvd" | `/` |

Note that "Brand defence" costs almost nothing and stops competitors bidding on your name.

**Negative keywords — add these on day one:** free, cheap, jobs, hiring, salary, school, course, training,
academy, license, wholesale, supply, products, near manhattan, brooklyn, bronx, barber, mens haircut
(unless you want the $40 Man/Children Haircut traffic), diy, at home, tutorial, how to.

**Ad extensions — free, and they roughly double your ad's real estate:** Location extension (links to your
GBP), Call extension with (718) 255-6940, Sitelinks to `/services`, `/gallery`, `/team`, `/book`, Price
extension with your real prices (Wash and Cut $40, Single Process Color $70, Balayage from $200), and a
Callout extension: "Open 7 Days", "Walk-Ins Welcome", "Book Online 24/7", "10+ Years Experience".

*Campaign 2: Performance Max, local (~25% of budget), only after month 2.* Feed it your real photos and
the gallery videos. PMax needs conversion data to work, so it is pointless until Campaign 1 has produced
30+ tracked bookings.

*Campaign 3: Do not run Display or YouTube.* At this budget they are a waste.

**What to expect:** month 1 is data collection — expect a high cost per booking ($80–120) and do not panic.
Month 2, after adding negatives and pausing the worst keywords, expect $50–80. Month 3, with conversion
bidding running, $35–60. If you are still above $100 per booking at month 3, the problem is almost always
the landing page or the keyword set, not the budget.

#### 3.2 Meta and Instagram Ads — salons are a visual business, this matters

Google captures people already looking. Meta creates demand from people who were not looking — which for a
before-and-after business is genuinely powerful. A dramatic balayage transformation video stops the scroll
in a way that a text ad never will.

**Budget: $10–15/day ($300–450/month)** to start, alongside or after Google.

**Realistic NYC numbers:**

| Metric | Realistic range |
| --- | --- |
| CPM (cost per 1,000 impressions), NYC local | $10–25 |
| Cost per click | $0.70–2.00 |
| Cost per booking, well-targeted local video | $20–60 |

Meta is typically *cheaper* per booking than Google but the traffic is lower intent, so more of those
bookings are one-time visitors. Use both.

**Campaign structure:**

1. **Cold local awareness/traffic** — radius targeting 3–5 miles around 39-46 Queens Blvd, women 22–55,
   interests: hair care, beauty salons, hair coloring, Sephora/Ulta, plus broad (Meta's algorithm often
   beats manual interest targeting once the pixel has data). Creative: **before/after Reels, 9:16
   vertical, 7–15 seconds, hook in the first 1.5 seconds.** Objective: Traffic to `/book` initially,
   switching to Conversions once the pixel has 50+ `Schedule` events.
2. **Retargeting** — anyone who visited the site or started the booking wizard but did not finish. This is
   the highest-ROI Meta audience by a wide margin, often 3–5x the cold audience. Your booking flow is four
   steps (`client/src/components/BookingWizard/BookingWizard.tsx:70-73`), which means there is meaningful
   drop-off to recapture. Add a `begin_checkout`-equivalent event when someone reaches the contact step so
   you can build this audience precisely.
3. **Lookalike, month 3+** — 1% lookalike of your booking-completers, still constrained to the local radius.

**Creative rules that actually determine performance:**

- **Before/after outperforms everything else.** Not close.
- **Vertical video beats static images roughly 2:1** for salon advertising.
- **Show the price.** "Balayage from $200" filters out the tyre-kickers and improves cost per booking even
  though it lowers click volume.
- **Refresh creative every 2–3 weeks.** Local audiences are small and fatigue fast — you are showing the
  same ad to the same few thousand people in Sunnyside.
- **Run the same 4–6 creatives you post organically.** Your best-performing organic Reel is your best ad.
  Boost proven winners rather than making ads from scratch.

#### 3.3 What not to spend money on

Yelp Ads (expensive, aggressive sales calls, poor measurability for a salon this size), Groupon (attracts
discount-hunters who never rebook and destroys your price anchoring — a $99 keratin Groupon customer will
never pay $300), printed flyers without a tracked code, and any "SEO agency" charging under $500/month.

---

### Tier 4 — Organic social (ongoing, 2–3 hours/week)

You already have both accounts: Instagram `@sumilovestyle` and TikTok `@sumi91_`
(`client/src/utils/dates.ts:47-48`), linked from the footer and both the Contact and Location pages
(`client/src/components/layout/Footer.tsx:24-43`, `client/src/pages/Contact.tsx:139-158`).

**What actually performs for hair and beauty, in rough order:**

1. **Before/after transformation reveals.** Same lighting, same angle, same spot in the salon. The reveal
   should land within the first 3 seconds — do not build to it, social audiences do not wait.
2. **Satisfying process clips.** Foil placement, the balayage paint, the blow-dry reveal, threading in
   close-up. Threading is unusually good short-form content because most people have never seen the
   technique up close.
3. **Colour-correction saves.** "She came in with box dye from three years ago." These get shared.
4. **Price/menu explainers.** "What $200 vs $300 actually gets you at balayage." Builds trust and
   pre-qualifies enquiries.
5. **Team content.** Sumita's 10 years of experience and Sazana's threading precision
   (`server/src/scripts/seed.ts:22-39`) are genuine credentials — put faces to them. People book a person,
   not a salon.

**Cadence that is sustainable for a two-stylist shop:**

- **4–5 Reels/TikToks per week.** This is the only number that matters — the algorithm rewards volume of
  short video. Everything else is optional.
- **Daily Stories** — 2–3 frames. Chair availability today, a finished look, a poll. Stories are where you
  convert existing followers into bookings.
- **1–2 carousel posts per week** for the grid.
- **Batch-film.** Shoot every client's before/after during the week (with permission), then edit all of it
  in one 90-minute block on your slowest morning. Do not try to post daily in real time; you will stop
  after two weeks.

**Converting profile visits into bookings — the part most salons get wrong:**

- **Put the booking URL directly in the Instagram bio link.** Not a link-in-bio aggregator with six
  options — one link, straight to `[TODO: owner to confirm domain]/book`. Every extra tap loses roughly
  half the traffic. If you must use a landing page, keep "Book Now" as the first and largest item.
- **Set the Instagram account to a Professional/Business account** with the real address so the "Directions"
  and "Call" action buttons appear.
- **Instagram's native "Book Now" action button** can link to your booking page — turn it on.
- **Put the address and "Book online" in the bio text itself**, not just the link:
  `39-46 Queens Blvd, Sunnyside | Open 7 days 10-8 | Book below`.
- **Reply to every comment and DM within a few hours.** Meta weights engagement heavily, and a DM enquiry
  is a booking that has already raised its hand.
- **Add a UTM tag to the bio link** (`?utm_source=instagram&utm_medium=bio`) so GA4 can actually attribute
  bookings to social. Without this you will never know if the 3 hours a week is paying off.
- **Local hashtags beat big ones.** `#sunnysideQueens #queensbLvd #woodsideNY #queenshairstylist
  #sunnysidenyc` will reach 200 relevant local people; `#hair` reaches nobody.

**Ask every happy client to tag you.** A tagged post from a real client is worth more than anything you
can post yourself, and it costs nothing.

---

### Tier 5 — Retention (this is where the actual money is)

Acquiring a new colour client costs $30–90. Getting an existing one to rebook costs the price of an email.
For a salon, **retention beats acquisition on every measure**, and it is where your existing codebase gives
you an unfair advantage — the Resend infrastructure, templates, cron scheduler and appointment data are
already built and working.

Honest effort estimates, in build order:

#### 5.1 Post-appointment follow-up + review request — 2-3 hours, biggest win

Covered in 1.2 above. Extends `api/cron/reminders.ts`, adds one email template to `api/_lib/emails.ts`
alongside the existing four, and one `followup_sent` boolean column following the `reminder_sent` pattern
at `api/cron/reminders.ts:87-90`. **No new serverless function** — important, given you have one slot left
of twelve. Do this first.

#### 5.2 Rebooking reminders — 3-4 hours, highest revenue impact

The single highest-value automation for a salon. Colour clients need a root touch-up every 6–8 weeks;
keratin every 3–4 months; threading every 2–3 weeks. Most simply forget, then eventually go somewhere else.

Build: extend the same daily cron to query appointments where `status = 'completed'` and
`appointment_date` is exactly N days ago, where N depends on the service category — 45 days for `hair`,
21 days for `threading`, 30 days for `waxing`. The `services` table already carries `category`
(`supabase/migrations/005_sync_services_to_flyer.sql:60`, categories defined at
`packages/shared/src/constants.ts:3`), so the data you need is already there. Email: "It's about time for
your next touch-up — book here." One click to `/book`.

Realistic effect: a well-run rebooking email typically converts 15–25% of lapsed clients. For a salon
doing even 20 colour clients a month, that is several thousand dollars a year for one afternoon of work.

#### 5.3 Referral program — 1-2 hours of code, ongoing manual effort

"Bring a friend, you both get $20 off." For a business where a colour client is worth $1,300/year, a $40
total cost to acquire a referred client is outstanding — and referred clients retain far better than
ad-acquired ones.

The honest version: you do not need to build a referral system. Print cards, hand them out, track them in
a spreadsheet. **Do the manual version for three months first.** Only build software for it if the volume
justifies it. A proper implementation (referral codes, attribution, discount application at booking) is a
1–2 day build plus a schema change, and most salons never reach the volume where that pays for itself.

#### 5.4 Birthday offers — 2-3 hours, but requires a schema change

You do not currently collect date of birth. The booking form captures name, email, phone and notes only
(`client/src/components/BookingWizard/StepContact.tsx:60-65`). You would need an optional DOB field, a new
column, and a cron branch. Modest payoff — a birthday email typically converts 10–20%, but on a small list
that is a handful of bookings a year. **Do this last, if at all.**

#### 5.5 Loyalty program — do not build this

A punch-card style loyalty system is a genuine multi-day build (points ledger, redemption, admin UI,
edge cases around cancellations and refunds) and the returns for a two-stylist salon do not justify it.
A physical punch card costs $30 at a print shop and works just as well. **Recommendation: skip the
software entirely.**

#### 5.6 Fix the two gaps that are quietly costing you

- **Cancellation emails are not sent on the live path.** `api/appointments.ts:148-172` (the cancel handler)
  sends nothing, even though a `sendCancellationConfirmation` template exists in the legacy Express service
  at `server/src/services/emailService.ts:118`. A cancellation is a perfect moment to say "sorry we missed
  you — here's a link to rebook." Roughly 1 hour to wire up.
- **The Contact form does not actually send anything.** `client/src/pages/Contact.tsx:22` builds a
  `mailto:` link and hands off to the visitor's mail client. On mobile, and for anyone using webmail
  without a registered handler, **that message is simply lost**. You have Resend already configured
  (`api/_lib/emails.ts:30-45`) — but note that a proper contact endpoint would consume your last
  serverless function slot, so either fold it into an existing handler or accept the tradeoff knowingly.

---

## 3. Measurement

### Instrument these events

| Event | Where | Why |
| --- | --- | --- |
| `page_view` (SPA-aware) | `useLocation()` effect in `client/src/App.tsx` | React Router means auto-pageviews only fire once |
| `begin_booking` | `client/src/components/BookingWizard/BookingWizard.tsx` step 1 | funnel entry |
| `select_service` | step 1 → 2 transition | tells you which services drive interest vs. bookings |
| `select_datetime` | step 3 → 4 transition | reveals whether availability is the drop-off point |
| **`booking_complete`** (the key conversion, with `value` = service price) | **`client/src/components/BookingWizard/StepContact.tsx:70-73`** | the only event that matters for ad optimization |
| `booking_error` | `StepContact.tsx:74-82` | the 409 "slot just taken" path is a silent revenue leak worth watching |
| `call_click` | `tel:` links at `client/src/pages/Home.tsx:243`, `Location.tsx:58`, `Footer.tsx:85` | many local customers call instead of booking |
| `directions_click` | the maps link at `client/src/pages/Location.tsx:47` | strong local intent signal |

### The metrics that matter

| Metric | How to get it | Healthy target |
| --- | --- | --- |
| **Cost per booking** (by channel) | ad spend / `booking_complete` events | $30–90 Google, $20–60 Meta |
| **Booking conversion rate** | `booking_complete` / sessions | 3–8% for a local salon site |
| **Funnel drop-off** | step events above | if step 3 (date/time) is the biggest drop, you have an availability problem, not a marketing problem |
| **No-show rate** | count `status = 'no_show'` in the appointments table (status defined at `packages/shared/src/constants.ts:5-11`) | under 10%; above that, add a same-day SMS |
| **Rebooking rate** | % of clients with 2+ completed appointments in 90 days | 40%+ is good for a salon |
| **New vs. returning clients** | distinct `client_email` in appointments | you want a steady flow of both |
| **Average ticket** | avg `price_min` of booked services | rising = your upsell is working |
| **Client LTV** | avg ticket x visits/year | colour client ~$1,000-1,300; threading-only ~$140 |
| **Google Business Profile actions** | GBP Insights: calls, directions, website clicks | should trend up every month |
| **Review count and rating** | GBP | +4/week target, keep rating above 4.7 |

You already have the data for no-show rate, rebooking rate and average ticket **sitting in the
appointments table right now** — the admin dashboard (`client/src/pages/admin/AdminOverview.tsx`) would be
the natural place to surface them, and that is a far cheaper source of truth than any analytics tool.

### Monthly review checklist (30 minutes, first Monday of each month)

1. Google Business Profile Insights: calls, direction requests, website clicks — up or down vs. last month?
2. New reviews this month (target: 16+). Every review replied to?
3. GA4: sessions, `booking_complete` count, conversion rate. Which channel drove the most bookings?
4. Google Ads: cost per booking. Pause any keyword that has spent 3x your target CPA with zero bookings.
   Add any junk search terms to negatives.
5. Meta Ads: cost per booking, and creative frequency — if frequency is above 3, swap the creative.
6. Search Console: which queries are you appearing for? Any page ranking on page 2 that a small content
   tweak could push to page 1?
7. From the database: no-show rate, rebooking rate, average ticket.
8. PageSpeed Insights on the homepage — is LCP still under 2.5s?
9. Pick **one** thing to change for next month. One. Not five.

---

## 4. 90-day rollout

Sequenced so that nothing depends on something that has not been built yet, and so no money is spent
before it can be measured.

### Month 1 — Foundation (no ad spend)

**Week 1 — Google Business Profile.** Claim and verify. Set primary and secondary categories. Match NAP
exactly to `client/src/utils/dates.ts:43-45`. Set hours to Mon–Sun 10–8. Upload 25+ photos. Add the full
service menu with real prices. Add the booking link. Seed 8 Q&As. Also: create Apple Business Connect,
Bing Places, Yelp and Nextdoor listings.
*Effort: 4–6 hours. Cost: $0.*

**Week 2 — On-site technical.** JSON-LD block into `client/index.html` (section 2.1). OG/Twitter/canonical
meta plus the new title (section 2.2). Create the 1200x630 `og-image.jpg`. Add `robots.txt` and
`sitemap.xml`. Verify Google Search Console and Bing Webmaster, submit the sitemap. Add the marketing
opt-in checkbox to `StepContact.tsx`.
*Effort: 4–6 hours dev. Cost: $0.*

**Week 3 — Analytics and speed.** Install GA4 with SPA pageview tracking and the `booking_complete`
conversion at `StepContact.tsx:70-73` with `value`. Install the Meta Pixel with the `Schedule` event.
Convert the three `.mov` files to MP4/WebM and fix the `type` attributes at `Gallery.tsx:38,42,46`.
Convert `salonpic.png` to WebP with `fetchpriority="high"`. Compress `location-salon.jpeg`. Delete the
duplicate `screenshot-*` set. Add cache headers to `vercel.json`.
*Effort: 6–8 hours dev. Cost: $0.*

**Week 4 — Reviews and social ramp-up.** Ship the post-appointment follow-up email (section 5.1, extending
`api/cron/reminders.ts`). Start asking every client in person. Begin posting 4 Reels/week. Set both social
profiles to Professional, fix the bio link to point directly at `/book` with UTM tags.
*Effort: 3 hours dev + 3 hours/week ongoing. Cost: $0.*

**End of month 1 target: GBP verified and fully populated, 10+ new reviews, analytics live and recording
bookings, homepage LCP under 2.5s.**

### Month 2 — First paid traffic

**Week 5.** Launch Google Ads Campaign 1 (Local Services) at $15/day. Three ad groups only to start:
Balayage, Keratin, Haircut. Phrase and exact match. Full negative keyword list on day one. All extensions
enabled.
*Cost: ~$450/month.*

**Week 6.** First optimization pass. Read the Search Terms report — this is the most important 20 minutes
of the month. Add negatives for everything irrelevant. Pause keywords with 30+ clicks and zero bookings.
Keep posting 4 Reels/week. Keep asking for reviews.

**Week 7.** Launch Meta/Instagram at $10/day, using your two best-performing organic Reels as the creative.
Cold local radius targeting plus a retargeting audience of site visitors.
*Cost: ~$300/month additional.*

**Week 8.** Build the rebooking reminder automation (section 5.2). Write the first two dedicated service
pages: balayage and keratin (section 2.7). First full monthly review using the checklist above.

**End of month 2 target: 25+ reviews, first tracked bookings attributed to paid channels, cost per
booking under $90 and trending down.**

### Month 3 — Optimize and compound

**Week 9.** Switch Google Ads to Maximize Conversions bidding if you have 15+ tracked bookings. Add the
Colour and Lashes ad groups. Refresh Meta creative.

**Week 10.** Ship the remaining service pages and the FAQ page with `FAQPage` schema. Wire up the missing
cancellation email (section 5.6).

**Week 11.** Add a Meta lookalike audience from booking-completers. Consider Performance Max if Campaign 1
has 30+ conversions. Start the manual referral card program.

**Week 12.** Full review. Calculate real cost per booking by channel, rebooking rate, no-show rate and
average ticket from the appointments table. Decide where month 4's budget goes based on actual numbers
rather than assumptions.

**End of month 3 target: 45+ reviews, ranking in the local 3-pack for at least one mid-tail term, cost per
booking $35–60, rebooking automation running.**

### Total investment

| | Month 1 | Month 2 | Month 3 |
| --- | --- | --- | --- |
| Ad spend | $0 | ~$600 | ~$750–900 |
| Dev time | ~20 hours | ~8 hours | ~8 hours |
| Owner time (social, reviews, GBP) | ~6 hrs/week | ~4 hrs/week | ~4 hrs/week |

Nothing in month 1 costs money. If you only ever do month 1, you will still see meaningful improvement —
Google Business Profile plus reviews plus a fast site with correct structured data is genuinely most of
local salon marketing.

---

## 5. Honest summary of what is already good

It is worth saying plainly: this is a well-built site. The booking flow is clean and fast, the code is
security-conscious (HTML escaping at `api/_lib/emails.ts:56-63`, constant-time cron auth at
`api/cron/reminders.ts:16-30`, rate limiting in `api/_lib/ratelimit.ts`), error monitoring is wired up on
both client and server, the JS bundle is small and properly chunked, headings and alt text are correct,
and transactional email works.

**The gap is not engineering quality. It is that the site is invisible to crawlers and social scrapers,
unmeasured, and weighed down by 55 MB of media.** Those three things, plus a claimed Google Business
Profile and a steady flow of reviews, are what stand between this site and a meaningful number of
bookings. Almost all of it is free.
