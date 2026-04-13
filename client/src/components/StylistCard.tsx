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
        'rounded-xl border transition-all',
        compact ? 'flex items-center gap-4 p-4' : 'overflow-hidden',
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
      {/* Headshot */}
      <div
        className={cn(
          'flex items-center justify-center bg-rose-50',
          compact
            ? 'h-14 w-14 shrink-0 rounded-full'
            : 'h-56 w-full'
        )}
      >
        {stylist.image_url ? (
          <img
            src={stylist.image_url}
            alt={`${stylist.name} headshot`}
            className={cn(
              'object-cover',
              compact ? 'h-full w-full rounded-full' : 'h-full w-full'
            )}
            loading="lazy"
          />
        ) : (
          <User
            className={cn(
              'text-rose-300',
              compact ? 'h-7 w-7' : 'h-16 w-16'
            )}
            aria-hidden="true"
          />
        )}
      </div>

      {/* Info */}
      <div className={compact ? '' : 'p-5'}>
        <h3 className="font-serif text-lg font-semibold">{stylist.name}</h3>
        <p className="text-sm text-rose-600">{stylist.title}</p>

        {!compact && (
          <>
            <p className="mt-2 text-sm text-muted-foreground line-clamp-3">
              {stylist.bio}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {stylist.specialties.map((spec) => (
                <span
                  key={spec}
                  className="rounded-full bg-rose-100 px-3 py-0.5 text-xs text-rose-700"
                >
                  {spec}
                </span>
              ))}
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              {stylist.years_exp} years experience
            </p>
          </>
        )}
      </div>
    </article>
  );
}
