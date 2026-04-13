import { Clock, DollarSign } from 'lucide-react';
import type { Service } from '@luxe/shared';
import { cn } from '@/utils/cn';

interface ServiceCardProps {
  service: Service;
  selected?: boolean;
  onClick?: () => void;
}

export default function ServiceCard({ service, selected, onClick }: ServiceCardProps) {
  const priceDisplay = service.price_max
    ? `$${service.price_min} – $${service.price_max}`
    : `$${service.price_min}`;

  const durationDisplay =
    service.duration_min >= 60
      ? `${Math.floor(service.duration_min / 60)}h${service.duration_min % 60 ? ` ${service.duration_min % 60}m` : ''}`
      : `${service.duration_min}m`;

  return (
    <article
      className={cn(
        'rounded-xl border p-5 transition-all',
        onClick
          ? 'cursor-pointer hover:border-rose-400 hover:shadow-md'
          : '',
        selected
          ? 'border-rose-500 bg-rose-50 shadow-md'
          : 'border-border bg-white'
      )}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => e.key === 'Enter' && onClick() : undefined}
      aria-pressed={selected}
    >
      <h3 className="font-serif text-lg font-semibold">{service.name}</h3>
      <p className="mt-1 text-sm text-muted-foreground line-clamp-2">
        {service.description}
      </p>
      <div className="mt-4 flex items-center gap-4 text-sm">
        <span className="flex items-center gap-1 font-medium text-rose-600">
          <DollarSign className="h-4 w-4" aria-hidden="true" />
          {priceDisplay}
        </span>
        <span className="flex items-center gap-1 text-muted-foreground">
          <Clock className="h-4 w-4" aria-hidden="true" />
          {durationDisplay}
        </span>
      </div>
    </article>
  );
}
