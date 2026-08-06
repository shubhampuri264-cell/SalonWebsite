import StylistCard from '@/components/StylistCard';
import { useBookingStore } from '@/store/bookingStore';
import type { Stylist } from '@luxe/shared';

/**
 * Only ever rendered when two or more stylists perform the chosen service —
 * StepService resolves the eligible list and skips straight to date/time when
 * there is exactly one. There is deliberately no "anyone available" option: it
 * assigned whoever was free regardless of whether they do the service.
 */
export default function StepStylist() {
  const { eligibleStylists, selectedStylist, selectedService, setStylist, nextStep, prevStep } =
    useBookingStore();

  const handleSelect = (stylist: Stylist) => {
    setStylist(stylist);
    nextStep();
  };

  return (
    <div>
      <h2 className="font-serif text-2xl font-semibold">Choose a Stylist</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        {selectedService
          ? `These stylists offer ${selectedService.name}.`
          : 'Select the stylist you would like to see.'}
      </p>

      {eligibleStylists.length === 0 && (
        <p className="mt-4 text-sm text-muted-foreground">
          Pick a service first and we'll show you who can do it.
        </p>
      )}

      {eligibleStylists.length > 0 && (
        <div className="mt-6 space-y-3">
          {eligibleStylists.map((stylist) => (
            <StylistCard
              key={stylist.id}
              stylist={stylist}
              compact
              selected={selectedStylist?.id === stylist.id}
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
