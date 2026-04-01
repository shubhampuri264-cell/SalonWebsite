import { Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { Scissors, Star, Clock, CalendarCheck } from 'lucide-react';

const FEATURES = [
  {
    icon: Scissors,
    title: 'Expert Stylists',
    desc: 'Our team specializes in color, cuts, and threading with years of experience.',
  },
  {
    icon: Star,
    title: 'Premium Experience',
    desc: 'A warm, boutique atmosphere where every client feels like a priority.',
  },
  {
    icon: Clock,
    title: 'Online Booking',
    desc: 'Book, reschedule, or cancel your appointment 24/7 — no phone calls needed.',
  },
  {
    icon: CalendarCheck,
    title: 'Flexible Hours',
    desc: 'Open Monday through Saturday to fit your schedule.',
  },
];

export default function Home() {
  return (
    <>
      <Helmet>
        <title>Icon Studio | Hair Salon & Threading Studio NYC</title>
        <meta
          name="description"
          content="Icon Studio is a boutique hair salon and eyebrow threading studio in New York City. Book online 24/7."
        />
        <meta property="og:title" content="Icon Studio | Hair Salon & Threading Studio" />
        <meta
          property="og:description"
          content="Boutique salon offering precision cuts, balayage, and eyebrow threading in NYC. Book your appointment today."
        />
      </Helmet>

      {/* Hero */}
      <section className="relative overflow-hidden bg-gradient-to-br from-rose-50 via-white to-amber-50">
        <div className="container mx-auto flex min-h-[80vh] flex-col items-center justify-center px-4 py-20 text-center md:px-6">
          <span className="mb-4 rounded-full border border-rose-200 bg-rose-50 px-4 py-1 text-xs font-medium uppercase tracking-widest text-rose-600">
            Hair Salon & Threading Studio
          </span>
          <h1 className="font-serif text-5xl font-semibold leading-tight text-foreground md:text-7xl">
            Where Style{' '}
            <em className="italic text-rose-500">Meets</em>
            <br />
            Artistry
          </h1>
          <p className="mt-6 max-w-xl text-lg text-muted-foreground">
            Icon Studio is a boutique salon and threading studio in the heart of New York City,
            offering precision cuts, vibrant color, and expert threading services.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link
              to="/book"
              className="rounded-full bg-rose-500 px-8 py-3 text-base font-semibold text-white shadow-md transition-all hover:bg-rose-600 hover:shadow-lg"
            >
              Book Now
            </Link>
            <Link
              to="/services"
              className="rounded-full border border-rose-200 px-8 py-3 text-base font-medium text-rose-700 transition-colors hover:bg-rose-50"
            >
              View Services
            </Link>
          </div>
        </div>

        {/* Decorative circles */}
        <div
          className="pointer-events-none absolute -top-24 -right-24 h-96 w-96 rounded-full bg-rose-100/40"
          aria-hidden="true"
        />
        <div
          className="pointer-events-none absolute -bottom-16 -left-16 h-64 w-64 rounded-full bg-amber-100/40"
          aria-hidden="true"
        />
      </section>

      {/* Features grid */}
      <section className="container mx-auto px-4 py-20 md:px-6">
        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map(({ icon: Icon, title, desc }) => (
            <div key={title} className="text-center">
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-rose-100">
                <Icon className="h-6 w-6 text-rose-600" aria-hidden="true" />
              </div>
              <h3 className="font-serif text-lg font-semibold">{title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA band */}
      <section className="bg-rose-500 py-16 text-white">
        <div className="container mx-auto px-4 text-center md:px-6">
          <h2 className="font-serif text-3xl font-semibold md:text-4xl">
            Ready for your transformation?
          </h2>
          <p className="mt-3 text-rose-100">
            Book your appointment online in under 2 minutes.
          </p>
          <Link
            to="/book"
            className="mt-8 inline-block rounded-full bg-white px-8 py-3 text-base font-semibold text-rose-600 shadow-md transition-all hover:shadow-lg hover:bg-rose-50"
          >
            Book Your Appointment
          </Link>
        </div>
      </section>
    </>
  );
}
