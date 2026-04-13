import { useEffect, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { Link } from 'react-router-dom';
import ServiceCard from '@/components/ServiceCard';
import { getServices } from '@/api/services';
import { SERVICE_CATEGORY_LABELS } from '@luxe/shared';
import type { Service, ServiceCategory } from '@luxe/shared';

export default function Services() {
  const [grouped, setGrouped] = useState<Record<ServiceCategory, Service[]> | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getServices()
      .then(setGrouped)
      .catch((e) => setError(e.message));
  }, []);

  return (
    <>
      <Helmet>
        <title>Services | Icon Studio</title>
        <meta
          name="description"
          content="Browse our full menu of hair and threading services including balayage, highlights, eyebrow threading, and more."
        />
      </Helmet>

      <div className="container mx-auto px-4 py-16 md:px-6">
        {/* Header */}
        <div className="mb-12 text-center">
          <h1 className="font-serif text-4xl font-semibold md:text-5xl">Our Services</h1>
          <p className="mt-4 max-w-xl mx-auto text-muted-foreground">
            From precision cuts and vibrant color to expert threading, we offer a full range
            of salon services for every look.
          </p>
        </div>

        {error && (
          <p className="text-center text-destructive">
            Failed to load services. Please refresh the page.
          </p>
        )}

        {!grouped && !error && (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-36 animate-pulse rounded-xl bg-muted" />
            ))}
          </div>
        )}

        {grouped && (
          <div className="space-y-14">
            {(Object.keys(SERVICE_CATEGORY_LABELS) as ServiceCategory[]).map((cat) => {
              const services = grouped[cat];
              if (!services?.length) return null;
              return (
                <section key={cat}>
                  <h2 className="mb-6 font-serif text-2xl font-semibold text-rose-600">
                    {SERVICE_CATEGORY_LABELS[cat]}
                  </h2>
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {services.map((service) => (
                      <ServiceCard key={service.id} service={service} />
                    ))}
                  </div>
                </section>
              );
            })}
          </div>
        )}

        <div className="mt-16 text-center">
          <Link
            to="/book"
            className="rounded-full bg-rose-500 px-8 py-3 text-base font-semibold text-white hover:bg-rose-600 transition-colors"
          >
            Book a Service
          </Link>
        </div>
      </div>
    </>
  );
}
