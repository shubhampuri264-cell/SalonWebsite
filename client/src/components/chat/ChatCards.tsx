import { Calendar, CalendarClock, CheckCircle2, Clock, MapPin, Phone, Sparkles, X } from 'lucide-react';
import type { Card } from '@/api/chat';
import ContactForm, { SignInCard } from './ContactForm';

interface ChatCardsProps {
  cards: Card[];
  disabled: boolean;
  onAction: (intent: string, params?: Record<string, unknown>) => void;
}

/**
 * Every figure a customer sees.
 *
 * Prices, durations, dates and times are rendered HERE, from database rows the
 * server put in the response — never from the model's sentence. Iris is
 * forbidden from writing a number at all, and the server strips its reply if it
 * does. This component is the other half of that arrangement: the place the
 * real values come from.
 *
 * The practical reason is Moffatt v. Air Canada (2024) — a company is liable
 * for what its chatbot says, so the design removes the ability to misstate a
 * price rather than merely discouraging it.
 */
export default function ChatCards({ cards, disabled, onAction }: ChatCardsProps) {
  if (cards.length === 0) return null;

  return (
    <div className="mt-2 space-y-2">
      {cards.map((card, index) => (
        <SingleCard key={index} card={card} disabled={disabled} onAction={onAction} />
      ))}
    </div>
  );
}

function SingleCard({
  card,
  disabled,
  onAction,
}: {
  card: Card;
  disabled: boolean;
  onAction: (intent: string, params?: Record<string, unknown>) => void;
}) {
  switch (card.type) {
    case 'service':
      return (
        <div className="card-lux bg-white p-3.5">
          <h3 className="font-serif text-[15px] font-semibold">{card.name}</h3>
          <p className="mt-0.5 text-sm font-medium text-rose-700">
            {card.priceLabel} · {card.durationMin} min
          </p>
          {card.description && (
            <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{card.description}</p>
          )}
          {card.bookable && (
            <button
              type="button"
              disabled={disabled}
              onClick={() => onAction('pick_service', { service_id: card.id })}
              className="mt-2.5 rounded-full bg-rose-500 px-4 py-1.5 text-[13px] font-semibold text-white transition-colors hover:bg-rose-600 disabled:opacity-50"
            >
              Book this
            </button>
          )}
        </div>
      );

    case 'promotion':
      return (
        <div className="card-lux bg-gold-50 p-3.5">
          <div className="flex items-center gap-1.5">
            <Sparkles className="h-3.5 w-3.5 text-gold-600" aria-hidden="true" />
            <h3 className="font-serif text-[15px] font-semibold">{card.title}</h3>
          </div>
          {/* Verbatim from promotions.offer_text. Never paraphrased, never
              parsed into a number, never combined with another offer — see
              migration 017. */}
          <p className="mt-1 text-sm font-medium text-gold-800">{card.offerText}</p>
          {card.description && (
            <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{card.description}</p>
          )}
        </div>
      );

    case 'hours':
      return (
        <div className="card-lux bg-white p-3.5">
          <div className="space-y-1">
            {card.rows.map((row) => (
              <div key={row.day} className="flex items-center gap-2 text-sm">
                <Clock className="h-3.5 w-3.5 shrink-0 text-rose-400" aria-hidden="true" />
                <span className="text-muted-foreground">{row.day}</span>
                <span className="ml-auto font-medium">{row.hours}</span>
              </div>
            ))}
          </div>
          <div className="mt-2.5 space-y-1.5 border-t border-border pt-2.5 text-sm">
            <p className="flex items-start gap-2">
              <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-rose-400" aria-hidden="true" />
              <span>{card.address}</span>
            </p>
            <a href={`tel:${card.phone.replace(/\D/g, '')}`} className="flex items-center gap-2 text-rose-700 hover:underline">
              <Phone className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              {card.phone}
            </a>
          </div>
        </div>
      );

    case 'appointment':
      return (
        <div className="card-lux bg-white p-3.5">
          <h3 className="font-serif text-[15px] font-semibold">{card.serviceName}</h3>
          <p className="mt-0.5 text-sm text-muted-foreground">with {card.stylistName}</p>
          <p className="mt-1.5 flex items-center gap-1.5 text-sm font-medium">
            <Calendar className="h-3.5 w-3.5 text-rose-400" aria-hidden="true" />
            {card.dateLabel} at {card.timeLabel}
          </p>
          {card.canManage && (
            <div className="mt-2.5 flex gap-1.5">
              <button
                type="button"
                disabled={disabled}
                onClick={() => onAction('reschedule_start', { appointment_id: card.id })}
                className="inline-flex items-center gap-1 rounded-full border border-gold-300 px-3 py-1.5 text-[13px] font-medium text-rose-700 transition-colors hover:bg-rose-50 disabled:opacity-50"
              >
                <CalendarClock className="h-3 w-3" aria-hidden="true" />
                Move
              </button>
              <button
                type="button"
                disabled={disabled}
                onClick={() => onAction('cancel_appointment', { appointment_id: card.id })}
                className="inline-flex items-center gap-1 rounded-full border border-border px-3 py-1.5 text-[13px] font-medium text-muted-foreground transition-colors hover:bg-muted disabled:opacity-50"
              >
                <X className="h-3 w-3" aria-hidden="true" />
                Cancel
              </button>
            </div>
          )}
        </div>
      );

    case 'confirm':
      return (
        <div className="card-lux border-rose-200 bg-white p-3.5">
          <h3 className="font-serif text-[15px] font-semibold">Check and confirm</h3>
          <dl className="mt-2 space-y-1 text-sm">
            <Row label="Service" value={card.serviceName} />
            <Row label="With" value={card.stylistName} />
            <Row label="When" value={`${card.dateLabel}, ${card.timeLabel}`} />
            <Row label="Takes" value={`${card.durationMin} min`} />
            <Row label="Price" value={card.priceLabel} />
          </dl>
          {/* THE ONLY CONTROL IN THE WIDGET THAT CREATES A BOOKING. The model
              cannot reach it: confirm_booking is excluded from MODEL_INTENTS,
              so no sentence a customer types and no injected instruction can
              fire it. A human clicks, or nothing is booked. */}
          <button
            type="button"
            disabled={disabled}
            onClick={() => onAction('confirm_booking', { pending_id: card.pendingId })}
            className="mt-3 w-full rounded-full bg-rose-500 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-rose-600 disabled:opacity-50"
          >
            Confirm booking
          </button>
        </div>
      );

    case 'booked':
      return (
        <div className="card-lux border-green-200 bg-green-50 p-3.5">
          <div className="flex items-center gap-1.5">
            <CheckCircle2 className="h-4 w-4 text-green-600" aria-hidden="true" />
            <h3 className="font-serif text-[15px] font-semibold text-green-800">Booked</h3>
          </div>
          <p className="mt-1.5 text-sm">{card.serviceName} with {card.stylistName}</p>
          <p className="text-sm font-medium">{card.dateLabel} at {card.timeLabel}</p>
        </div>
      );

    case 'contactForm':
      return (
        <ContactForm
          mode={card.mode}
          disabled={disabled}
          onSubmit={(intent, params) => onAction(intent, params)}
        />
      );

    case 'signIn':
      return <SignInCard />;
  }
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2">
      <dt className="w-16 shrink-0 text-muted-foreground">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}
