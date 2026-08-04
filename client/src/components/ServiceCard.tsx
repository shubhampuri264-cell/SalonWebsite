import type { Service } from '@luxe/shared';
import { cn } from '@/utils/cn';

interface ServiceCardProps {
  service: Service;
  selected?: boolean;
  onClick?: () => void;
}

export default function ServiceCard({ service, selected, onClick }: ServiceCardProps) {
  const consultationOnly = Number(service.price_min) === 0 && !service.price_max;
  const priceDisplay = service.price_max
    ? `${service.price_min}–${service.price_max}`
    : `${service.price_min}`;

  return (
    <article
      className={cn(
        'card-lux flex flex-col p-6',
        onClick && 'card-lux--interactive cursor-pointer',
        selected && 'border-rose-500/60 bg-rose-50/60 ring-2 ring-rose-500'
      )}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => e.key === 'Enter' && onClick() : undefined}
      aria-pressed={selected}
    >
      <h3 className="font-serif text-lg font-semibold">{service.name}</h3>
      <p className="mt-1.5 flex-1 text-sm leading-relaxed text-muted-foreground line-clamp-2">
        {service.description}
      </p>
      <div className="mt-5 flex items-center justify-between border-t border-gold-500/20 pt-4">
        {consultationOnly ? (
          <span className="font-serif text-lg font-semibold">Price on consultation</span>
        ) : (
          <span className="font-serif text-lg font-semibold tabular-nums">
            <span className="text-gold-600">$</span>
            {priceDisplay}
          </span>
        )}
      </div>
    </article>
  );
}
