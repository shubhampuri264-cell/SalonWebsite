import { Phone } from 'lucide-react';
import type { Chip } from '@/api/chat';
import { SALON_PHONE } from '@/api/chat';
import { cn } from '@/utils/cn';

interface ChipRowProps {
  chips: Chip[];
  disabled: boolean;
  onPick: (chip: Chip) => void;
}

/**
 * The tappable half of the widget.
 *
 * These are not decoration and they are not training wheels. A chip tap reaches
 * the intent handler with ZERO model calls, which makes this row three things
 * at once: the offline path (it still books with Anthropic unreachable), the
 * error path (it is what appears under "I didn't catch that"), and the
 * discovery path (it shows what Iris can do, which an empty text box does not).
 *
 * The chip set is contextual — sent by the server for whatever step the
 * customer is on — so there is always something to tap.
 */
export default function ChipRow({ chips, disabled, onPick }: ChipRowProps) {
  if (chips.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-1.5 px-1 pt-1">
      {chips.map((chip, index) => {
        // The "Call the salon" chip is not a request — it is a tel: link. Every
        // dead end offers one; a booking assistant with no escape route is the
        // most common way these lose people.
        if (chip.intent === 'escalate' && chip.label.startsWith('Call')) {
          return (
            <a
              key={`call-${index}`}
              href={`tel:${SALON_PHONE.replace(/\D/g, '')}`}
              className="inline-flex items-center gap-1 rounded-full border border-gold-300 px-3 py-1.5 text-[13px] font-medium text-rose-700 transition-colors hover:bg-rose-50"
            >
              <Phone className="h-3 w-3" aria-hidden="true" />
              {chip.label}
            </a>
          );
        }

        return (
          <button
            key={`${chip.intent}-${index}`}
            type="button"
            disabled={disabled}
            onClick={() => onPick(chip)}
            className={cn(
              'rounded-full border px-3 py-1.5 text-[13px] font-medium transition-colors disabled:opacity-50',
              chip.style === 'primary'
                ? 'border-rose-500 bg-rose-500 text-white hover:bg-rose-600'
                : chip.style === 'ghost'
                  ? 'border-border text-muted-foreground hover:bg-muted'
                  : 'border-gold-300 text-rose-700 hover:bg-rose-50',
            )}
          >
            {chip.label}
          </button>
        );
      })}
    </div>
  );
}
