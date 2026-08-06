import { Link } from 'react-router-dom';
import { Helmet } from '@dr.pogodin/react-helmet';
import { Scissors, Star, Clock, CalendarCheck, ArrowRight, MapPin } from 'lucide-react';
import Reveal from '@/components/Reveal';
import { SALON_INFO } from '@/utils/dates';

const SERVICE_GROUPS = [
  {
    label: 'Hair',
    title: 'Cuts & Color',
    desc: 'Precision cuts, balayage, highlights, and lived-in color built around you.',
  },
  {
    label: 'Threading',
    title: 'Brows & Face',
    desc: 'Clean, precise brow shaping and face threading — no wax, no pulling.',
  },
  {
    label: 'Skin',
    title: 'Facials & Waxing',
    desc: 'Facials, spa treatments, and waxing to keep your skin glowing.',
  },
  {
    label: 'Lashes',
    title: 'Lash & Brow Extensions',
    desc: 'Eyelash extensions and brow lifts for effortless, everyday definition.',
  },
];

/**
 * Five tiles exactly fill the mosaic: the first spans two rows, the other four
 * fill the remaining cells (2 cols x 2 rows on mobile, 3 cols x 2 rows from sm).
 * Adding a sixth would orphan it onto a half-empty row.
 */
const GALLERY_PREVIEW = [
  '/gallery/hair-1.jpg',
  '/gallery/hair-2.jpg',
  '/gallery/hair-3.jpg',
  '/gallery/salon-1.jpeg',
  '/gallery/hair-4.jpg',
];

const FEATURES = [
  { icon: Scissors, title: 'Expert Stylists', desc: 'A team specializing in color, cuts, and threading with years of experience.' },
  { icon: Star, title: 'Boutique Experience', desc: 'A warm, personal atmosphere where every client is the priority.' },
  { icon: CalendarCheck, title: 'Online Booking', desc: 'Book, reschedule, or cancel 24/7 — no phone calls needed.' },
  { icon: Clock, title: 'Open 7 Days', desc: 'Every day, 10am to 8pm — appointments and walk-ins welcome.' },
];

export default function Home() {
  return (
    <>
      {/*
        Title and description mirror the static tags in client/index.html, which
        already describe this page. Duplicating them keeps the browser tab and
        the JS-rendered head consistent; the og:* tags are deliberately NOT
        repeated here, since Helmet appends rather than replaces the static ones
        and a second, differently-worded og:title only confuses link scrapers.
      */}
      <Helmet>
        <title>Icon Studio | Hair Salon &amp; Threading Studio in Sunnyside, Queens</title>
      </Helmet>

      {/* Hero */}
      <section className="overflow-hidden">
        <div className="container mx-auto grid items-center gap-10 px-4 py-16 md:px-6 lg:grid-cols-[1.05fr_0.95fr] lg:gap-16 lg:py-24">
          {/* Copy */}
          <div>
            <div className="animate-rise" style={{ animationDelay: '40ms' }}>
              <span className="eyebrow">Hair &amp; Thread Salon · Sunnyside, NYC</span>
            </div>
            <h1
              className="animate-rise mt-6 text-5xl font-semibold leading-[1.03] text-foreground md:text-6xl lg:text-7xl"
              style={{ animationDelay: '120ms' }}
            >
              Where style meets{' '}
              <em className="italic text-rose-500">artistry</em>.
            </h1>
            <p
              className="animate-rise mt-6 max-w-md text-lg leading-relaxed text-muted-foreground"
              style={{ animationDelay: '200ms' }}
            >
              A boutique salon and threading studio in the heart of New York — precision cuts,
              lived-in color, and brows shaped to the millimeter.
            </p>
            <div
              className="animate-rise mt-8 flex flex-col gap-3 sm:flex-row"
              style={{ animationDelay: '280ms' }}
            >
              <Link to="/book" className="btn-primary">Book an appointment</Link>
              <Link to="/services" className="btn-ghost">View services</Link>
            </div>
            <div className="animate-rise mt-9 max-w-xs" style={{ animationDelay: '360ms' }}>
              <div className="hairline" />
              <p className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
                <Clock className="h-4 w-4 text-gold-600" aria-hidden="true" />
                Open 7 days · 10am–8pm · walk-ins welcome
              </p>
            </div>
          </div>

          {/* Storefront photo — treated to tame the signage + hide the map watermark */}
          <div className="animate-rise" style={{ animationDelay: '220ms' }}>
            <div className="relative aspect-4/5 overflow-hidden rounded-3xl shadow-[0_30px_60px_-24px_rgba(78,36,39,0.5)] sm:aspect-5/4 lg:aspect-4/5">
              <img
                src="/salonpic.jpg"
                alt="Icon Studio storefront in Sunnyside, Queens"
                className="h-full w-full object-cover object-top"
                loading="eager"
              />
              {/* warm wash to harmonize the loud banner with the brand */}
              <div className="pointer-events-none absolute inset-0 bg-linear-to-t from-[#4E2427]/55 via-transparent to-transparent" aria-hidden="true" />
              <div className="pointer-events-none absolute inset-0 bg-rose-500/10 mix-blend-multiply" aria-hidden="true" />
              {/* address chip — also covers the map watermark corner */}
              <div className="absolute bottom-4 right-4 flex items-center gap-2 rounded-xl border border-gold-500/40 bg-background/95 px-3.5 py-2.5 shadow-lg backdrop-blur-sm">
                <MapPin className="h-4 w-4 shrink-0 text-gold-600" aria-hidden="true" />
                <span className="text-xs font-medium leading-tight text-foreground">
                  39-46 Queens Blvd<br />Sunnyside, Queens
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Offerings strip */}
      <div className="border-y border-gold-500/20 bg-accent">
        <div className="container mx-auto flex flex-wrap justify-center gap-x-8 gap-y-3 px-4 py-4 text-xs uppercase tracking-[0.16em] text-muted-foreground md:px-6">
          {['Balayage', 'Precision Cuts', 'Brow Threading', 'Facials', 'Lash Extensions'].map((t) => (
            <span key={t} className="flex items-center gap-2.5">
              <span className="h-1.5 w-1.5 rounded-full bg-gold-500" aria-hidden="true" />
              {t}
            </span>
          ))}
        </div>
      </div>

      {/* Services preview */}
      <section className="container mx-auto px-4 py-20 md:px-6">
        <Reveal>
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <span className="eyebrow">The Menu</span>
              <h2 className="mt-3 text-3xl font-semibold md:text-4xl">Signature services</h2>
            </div>
            <Link to="/services" className="group inline-flex items-center gap-1.5 text-sm font-medium text-rose-700">
              View full menu
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" aria-hidden="true" />
            </Link>
          </div>
        </Reveal>
        <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {SERVICE_GROUPS.map((s, i) => (
            <Reveal key={s.title} delay={i * 80}>
              <Link
                to="/services"
                className="card-lux card-lux--interactive group flex h-full flex-col p-6"
              >
                <span className="text-[11px] font-medium uppercase tracking-[0.16em] text-gold-700">{s.label}</span>
                <h3 className="mt-2.5 text-xl font-semibold">{s.title}</h3>
                <p className="mt-2 flex-1 text-sm leading-relaxed text-muted-foreground">{s.desc}</p>
                <span className="mt-5 inline-flex items-center gap-1.5 text-sm font-medium text-rose-700">
                  Explore
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" aria-hidden="true" />
                </span>
              </Link>
            </Reveal>
          ))}
        </div>
      </section>

      {/* Gallery preview */}
      <section className="bg-accent/60 py-20">
        <div className="container mx-auto px-4 md:px-6">
          <Reveal>
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <span className="eyebrow">Our Work</span>
                <h2 className="mt-3 text-3xl font-semibold md:text-4xl">Recent transformations</h2>
              </div>
              <Link to="/gallery" className="group inline-flex items-center gap-1.5 text-sm font-medium text-rose-700">
                See the gallery
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" aria-hidden="true" />
              </Link>
            </div>
          </Reveal>
          <Reveal className="mt-10">
            {/* Fixed row heights — without them the rows size to the intrinsic
                image height and the mosaic blows out to several thousand px. */}
            <div className="grid auto-rows-[132px] grid-cols-2 gap-3 sm:auto-rows-[150px] sm:grid-cols-3 sm:gap-4 lg:auto-rows-[210px]">
              {GALLERY_PREVIEW.map((src, i) => (
                <Link
                  key={src}
                  to="/gallery"
                  className={`group relative overflow-hidden rounded-2xl ${i === 0 ? 'col-span-2 row-span-2 sm:col-span-1 sm:row-span-2' : ''}`}
                >
                  <img
                    src={src}
                    alt="Icon Studio hair and threading work"
                    loading="lazy"
                    className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                  />
                  <div className="absolute inset-0 bg-rose-900/0 transition-colors duration-300 group-hover:bg-rose-900/20" aria-hidden="true" />
                </Link>
              ))}
            </div>
          </Reveal>
        </div>
      </section>

      {/* Features */}
      <section className="container mx-auto px-4 py-20 md:px-6">
        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map(({ icon: Icon, title, desc }, i) => (
            <Reveal key={title} delay={i * 90}>
              <div className="text-center">
                <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full border border-gold-500/30 bg-rose-50">
                  <Icon className="h-6 w-6 text-rose-600" aria-hidden="true" />
                </div>
                <h3 className="text-lg font-semibold">{title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{desc}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="container mx-auto px-4 pb-24 md:px-6">
        <Reveal>
          <div className="relative overflow-hidden rounded-3xl border border-gold-500/40 bg-linear-to-b from-white to-[#F9F1EA] px-6 py-16 text-center">
            <span className="eyebrow eyebrow--center">Your chair is waiting</span>
            <h2 className="mx-auto mt-4 max-w-2xl text-3xl font-semibold md:text-4xl">
              Ready for your transformation?
            </h2>
            <p className="mt-3 text-muted-foreground">
              Book online in under two minutes — reschedule or cancel anytime.
            </p>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Link to="/book" className="btn-primary">Book your appointment</Link>
              <a href={`tel:${SALON_INFO.phone}`} className="btn-ghost">Call {SALON_INFO.phone}</a>
            </div>
          </div>
        </Reveal>
      </section>
    </>
  );
}
