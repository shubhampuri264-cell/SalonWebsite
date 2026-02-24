import { useEffect, useState } from 'react';
import StylistCard from '@/components/StylistCard';
import { getStylists } from '@/api/stylists';
import { useBookingStore } from '@/store/bookingStore';
import { Users } from 'lucide-react';
import { cn } from '@/utils/cn';
import type { Stylist } from '@luxe/shared';

export default function StepStylist() {
  const [stylists, setStylists] = useState<Stylist[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { selectedStylist, setStylist, nextStep, prevStep } = useBookingStore();

  useEffect(() => {
    getStylists()
      .then(setStylists)
      .catch((e) => setError(e.message));
  }, []);

  const handleSelect = (choice: Stylist | 'anyone') => {
    setStylist(choice);
    nextStep();
  };

  return (
    <div>
      <h2 className="font-serif text-2xl font-semibold">Choose a Stylist</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Select a preferred stylist, or let us assign whoever is available.
      </p>

      {error && (
        <p className="mt-4 text-destructive text-sm">
          Failed to load stylists. Please refresh.
        </p>
      )}

      {!stylists && !error && (
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          {[1, 2].map((i) => (
            <div key={i} className="h-24 animate-pulse rounded-xl bg-muted" />
          ))}
        </div>
      )}

      {stylists && (
        <div className="mt-6 space-y-3">
          {/* Anyone available option */}
          <button
            className={cn(
              'flex w-full items-center gap-4 rounded-xl border p-4 text-left transition-all hover:border-rose-400 hover:shadow-md',
              selectedStylist === 'anyone'
                ? 'border-rose-500 bg-rose-50 shadow-md'
                : 'border-border bg-white'
            )}
            onClick={() => handleSelect('anyone')}
            aria-pressed={selectedStylist === 'anyone'}
          >
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-rose-100">
              <Users className="h-6 w-6 text-rose-600" aria-hidden="true" />
            </div>
            <div>
              <p className="font-semibold">Anyone Available</p>
              <p className="text-sm text-muted-foreground">
                We'll assign you the first available stylist
              </p>
            </div>
          </button>

          {/* Individual stylists */}
          {stylists.map((stylist) => (
            <StylistCard
              key={stylist.id}
              stylist={stylist}
              compact
              selected={
                typeof selectedStylist === 'object' &&
                selectedStylist?.id === stylist.id
              }
              onClick={() => handleSelect(stylist)}
            />
          ))}
        </div>
      )}

      <button
        onClick={prevStep}
        className="mt-6 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        ← Back
      </button>
    </div>
  );
}
