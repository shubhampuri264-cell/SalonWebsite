import { useEffect, useRef, useState } from 'react';
import ServiceCard from '@/components/ServiceCard';
import { getServices } from '@/api/services';
import { getStylists } from '@/api/stylists';
import { useBookingStore } from '@/store/bookingStore';
import { SERVICE_CATEGORY_LABELS } from '@luxe/shared';
import { SALON_INFO } from '@/utils/dates';
import type { Service, ServiceCategory } from '@luxe/shared';

export default function StepService() {
  const [grouped, setGrouped] = useState<Record<ServiceCategory, Service[]> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [resolving, setResolving] = useState(false);
  const [selectError, setSelectError] = useState<string | null>(null);
  const requestToken = useRef(0);
  const { selectedService, setService, goToStep } = useBookingStore();

  useEffect(() => {
    getServices()
      .then(setGrouped)
      .catch((e) => setError(e.message));
  }, []);

  /**
   * Which stylists can do this service decides where the wizard goes next, so
   * it is resolved here rather than inside StepStylist. Only one eligible
   * stylist — the common case, since the two-person team splits the menu
   * cleanly — means the stylist question has exactly one answer, so it is
   * assigned and the step is skipped. Doing the same thing with an
   * auto-forwarding effect inside StepStylist would make Back unusable: it
   * would land on the stylist step and immediately bounce forward again.
   */
  const handleSelect = async (service: Service) => {
    // Dimming the grid with pointer-events:none stops a second mouse click but
    // not a second Enter — ServiceCard stays focusable and keeps its keydown
    // handler. Without a token, a slow first response can land after a faster
    // second one and rewrite the service, the stylist and the step from a
    // component that has already unmounted. Only the newest request may write.
    const token = ++requestToken.current;
    setSelectError(null);
    setResolving(true);
    try {
      const eligible = await getStylists(service.id);
      if (token !== requestToken.current) return;
      if (eligible.length === 0) {
        setSelectError(
          `We can't book ${service.name} online right now. Please call us on ${SALON_INFO.phone} and we'll arrange it.`,
        );
        return;
      }
      setService(service, eligible);
      goToStep(eligible.length === 1 ? 2 : 1);
    } catch (e) {
      if (token !== requestToken.current) return;
      setSelectError(e instanceof Error ? e.message : 'Could not load stylists. Please try again.');
    } finally {
      if (token === requestToken.current) setResolving(false);
    }
  };

  return (
    <div>
      <h2 className="font-serif text-2xl font-semibold">Choose a Service</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Select the service you'd like to book.
      </p>

      <div className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
        <span className="font-semibold">Special Offer:</span> Eyebrow threading is free with any facial or special treatment service.
      </div>

      {error && (
        <p className="mt-4 text-destructive text-sm">
          Failed to load services. Please refresh.
        </p>
      )}

      {selectError && (
        <p role="alert" className="mt-4 text-destructive text-sm">
          {selectError}
        </p>
      )}

      {!grouped && !error && (
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-28 animate-pulse rounded-xl bg-muted" />
          ))}
        </div>
      )}

      {grouped && (
        <div
          className="mt-6 space-y-8 transition-opacity"
          aria-busy={resolving}
          style={resolving ? { opacity: 0.6, pointerEvents: 'none' } : undefined}
        >
          {(Object.keys(SERVICE_CATEGORY_LABELS) as ServiceCategory[]).map((cat) => {
            const services = grouped[cat];
            if (!services?.length) return null;
            return (
              <section key={cat}>
                <h3 className="mb-3 text-sm font-semibold uppercase tracking-widest text-rose-600">
                  {SERVICE_CATEGORY_LABELS[cat]}
                </h3>
                <div className="grid gap-3 sm:grid-cols-2">
                  {services.map((service) => (
                    <ServiceCard
                      key={service.id}
                      service={service}
                      selected={selectedService?.id === service.id}
                      onClick={() => handleSelect(service)}
                    />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
