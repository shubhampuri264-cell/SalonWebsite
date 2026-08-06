import { User } from 'lucide-react';
import type { Stylist } from '@luxe/shared';
import { cn } from '@/utils/cn';

interface StylistCardProps {
  stylist: Stylist;
  selected?: boolean;
  onClick?: () => void;
  compact?: boolean;
}

export default function StylistCard({
  stylist,
  selected,
  onClick,
  compact = false,
}: StylistCardProps) {
  return (
    <article
      className={cn(
        'card-lux',
        compact ? 'flex items-center gap-4 p-4' : 'overflow-hidden',
        onClick && 'card-lux--interactive cursor-pointer',
        selected && 'border-rose-500/60 bg-rose-50/60 ring-2 ring-rose-500'
      )}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => e.key === 'Enter' && onClick() : undefined}
      aria-pressed={selected}
    >
      {/* Headshot */}
      <div
        className={cn(
          'flex items-center justify-center bg-linear-to-br from-rose-50 to-accent',
          compact ? 'h-14 w-14 shrink-0 rounded-full' : 'h-60 w-full'
        )}
      >
        {stylist.image_url ? (
          <img
            src={stylist.image_url}
            alt={`${stylist.name} headshot`}
            className={cn('h-full w-full object-cover', compact && 'rounded-full')}
            loading="lazy"
          />
        ) : (
          <User
            className={cn('text-rose-300', compact ? 'h-7 w-7' : 'h-16 w-16')}
            aria-hidden="true"
          />
        )}
      </div>

      {/* Info */}
      <div className={compact ? '' : 'p-6'}>
        <h3 className="font-serif text-lg font-semibold">{stylist.name}</h3>
        <p className="text-xs font-medium uppercase tracking-[0.14em] text-gold-700">{stylist.title}</p>

        {!compact && (
          <>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground line-clamp-3">
              {stylist.bio}
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              {stylist.specialties.map((spec) => (
                <span
                  key={spec}
                  className="rounded-full border border-gold-500/30 bg-accent px-3 py-0.5 text-xs text-foreground/70"
                >
                  {spec}
                </span>
              ))}
            </div>
            <p className="mt-4 text-xs text-muted-foreground">
              {stylist.years_exp} years experience
            </p>
          </>
        )}
      </div>
    </article>
  );
}
