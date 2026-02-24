import { useEffect, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { Link } from 'react-router-dom';
import StylistCard from '@/components/StylistCard';
import { getStylists } from '@/api/stylists';
import type { Stylist } from '@luxe/shared';

export default function Team() {
  const [stylists, setStylists] = useState<Stylist[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getStylists()
      .then(setStylists)
      .catch((e) => setError(e.message));
  }, []);

  return (
    <>
      <Helmet>
        <title>Our Team | Luxe Threads</title>
        <meta
          name="description"
          content="Meet the talented stylists and threading specialists at Luxe Threads."
        />
      </Helmet>

      <div className="container mx-auto px-4 py-16 md:px-6">
        <div className="mb-12 text-center">
          <h1 className="font-serif text-4xl font-semibold md:text-5xl">Meet Our Team</h1>
          <p className="mt-4 max-w-xl mx-auto text-muted-foreground">
            Our talented stylists and threading specialists bring years of expertise and
            a passion for making every client look and feel their best.
          </p>
        </div>

        {error && (
          <p className="text-center text-destructive">
            Failed to load team members. Please refresh the page.
          </p>
        )}

        {!stylists && !error && (
          <div className="grid gap-6 sm:grid-cols-2">
            {[1, 2].map((i) => (
              <div key={i} className="h-96 animate-pulse rounded-xl bg-muted" />
            ))}
          </div>
        )}

        {stylists && (
          <div className="grid gap-8 sm:grid-cols-2 max-w-3xl mx-auto">
            {stylists.map((stylist) => (
              <StylistCard key={stylist.id} stylist={stylist} />
            ))}
          </div>
        )}

        <div className="mt-16 text-center">
          <Link
            to="/book"
            className="rounded-full bg-rose-500 px-8 py-3 text-base font-semibold text-white hover:bg-rose-600 transition-colors"
          >
            Book with Our Team
          </Link>
        </div>
      </div>
    </>
  );
}
