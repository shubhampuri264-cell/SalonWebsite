import { useEffect, useState } from 'react';
import ServiceCard from '@/components/ServiceCard';
import { getServices } from '@/api/services';
import { useBookingStore } from '@/store/bookingStore';
import { SERVICE_CATEGORY_LABELS } from '@luxe/shared';
import type { Service, ServiceCategory } from '@luxe/shared';

export default function StepService() {
  const [grouped, setGrouped] = useState<Record<ServiceCategory, Service[]> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { selectedService, setService, nextStep } = useBookingStore();

  useEffect(() => {
    getServices()
      .then(setGrouped)
      .catch((e) => setError(e.message));
  }, []);

  const handleSelect = (service: Service) => {
    setService(service);
    nextStep();
  };

  return (
    <div>
      <h2 className="font-serif text-2xl font-semibold">Choose a Service</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Select the service you'd like to book.
      </p>

      {error && (
        <p className="mt-4 text-destructive text-sm">
          Failed to load services. Please refresh.
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
        <div className="mt-6 space-y-8">
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
