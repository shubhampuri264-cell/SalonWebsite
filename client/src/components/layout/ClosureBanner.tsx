import { SALON_INFO, formatDayLabel, salonToday, upcomingClosures } from '@/utils/dates';

/** How far ahead a closure is announced site-wide. The booking calendar shows all of them. */
const NOTICE_DAYS = 14;

/**
 * Strip above the navbar announcing whole-salon closures (SALON_CLOSURES).
 * Disappears on its own once the day has passed, so no cleanup deploy is needed.
 */
export default function ClosureBanner() {
  const closures = upcomingClosures(salonToday(), NOTICE_DAYS);
  if (closures.length === 0) return null;

  return (
    <div className="border-b border-gold-500/30 bg-accent px-4 py-2 text-center text-sm text-foreground/80">
      {closures.map((c) => (
        <p key={c.date}>
          {SALON_INFO.name} is closed on {formatDayLabel(c.date)} for {c.occasion}. We'll see you
          again from {formatDayLabel(c.reopens)}!
        </p>
      ))}
    </div>
  );
}
