import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { SALON_PHONE, type Chip } from '@/api/chat';
import { useChatStore } from '@/store/chatStore';
import { useFocusTrap } from '@/hooks/useFocusTrap';
import IrisMark from './IrisMark';
import ChatMessage from './ChatMessage';
import ChipRow from './ChipRow';
import Composer from './Composer';
import TypingIndicator from './TypingIndicator';

interface ChatPanelProps {
  onClose: () => void;
}

export default function ChatPanel({ onClose }: ChatPanelProps) {
  const { messages, chips, pending, composerEnabled, terminated, send } = useChatStore();
  const panelRef = useRef<HTMLDivElement>(null);
  const transcriptRef = useRef<HTMLDivElement>(null);

  useFocusTrap(panelRef, true, onClose);

  // Open with a greeting on the first visit of the session. Sent as an intent,
  // so opening the widget costs nothing — no model call at all.
  useEffect(() => {
    if (messages.length === 0 && !pending) void send({ intent: 'root' });
    // Deliberately once on mount: re-running on every message change would
    // re-greet after the transcript is cleared mid-conversation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const el = transcriptRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, pending]);

  // Lock the page behind the panel on mobile, where it is full-screen. The
  // cleanup runs on unmount too, so an unmount mid-open cannot leave the page
  // permanently unscrollable.
  useEffect(() => {
    const isMobile = window.matchMedia('(max-width: 639px)').matches;
    if (!isMobile) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  const act = (intent: string, params?: Record<string, unknown>) => {
    void send({ intent, params });
  };

  const pickChip = (chip: Chip) => act(chip.intent, chip.params);

  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby="iris-title"
      // z-40 is deliberate: BELOW Navbar's z-50 and the customer auth modal's
      // z-50, so Iris never covers the sticky nav or an open sign-in dialog.
      // Mobile goes full-screen at z-[60] because there it IS the whole page.
      // overflow-hidden is load-bearing, not tidiness. A category with twenty
      // services renders twenty chips, and a flex child does not shrink below
      // its content: without this the chip block grew straight out through the
      // bottom of the card, painting buttons over the page with no background
      // behind them. The chip row scrolls instead — see below.
      className="card-lux fixed inset-0 z-[60] flex flex-col overflow-hidden rounded-none bg-background shadow-2xl sm:inset-auto sm:bottom-24 sm:right-5 sm:z-40 sm:h-[70vh] sm:max-h-[640px] sm:w-[380px] sm:rounded-2xl"
    >
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-gold-200 px-4 py-3">
        <IrisMark size={26} />
        <h2 id="iris-title" className="font-serif text-lg font-semibold">
          Iris
        </h2>
        {/* Non-human status, disclosed in the furniture rather than buried in a
            paragraph. Several 2026 state laws (CA SB 243, NY Article 47 among
            them) require this of companion bots; a salon assistant is very
            likely out of scope, and it costs one pill to comply anyway. */}
        <span className="rounded-full border border-gold-300 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-gold-700">
          AI
        </span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close chat"
          className="ml-auto rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>

      {/* Transcript */}
      <div
        ref={transcriptRef}
        // aria-live="polite", never "assertive" — assertive interrupts a screen
        // reader mid-sentence, which in a chat log means the user never finishes
        // hearing the previous message.
        role="log"
        aria-live="polite"
        aria-label="Conversation with Iris"
        // min-h-0 lets this actually shrink. A flex child defaults to
        // min-height:auto, so without it the transcript refuses to give up
        // space to a long chip row and the panel overflows instead of scrolling.
        className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain px-4 py-3"
      >
        {messages.map((message) => (
          <ChatMessage key={message.id} message={message} disabled={pending} onAction={act} />
        ))}
        {pending && <TypingIndicator />}
      </div>

      {/* Chips + composer. shrink-0 keeps the composer on screen; the chip row
          inside it is what gives way when the list is long. The extra bottom
          padding is the iOS home-indicator inset, which otherwise eats the
          disclaimer on a full-screen mobile panel. */}
      <div className="shrink-0 border-t border-gold-200 bg-background px-3 py-2.5 pb-[calc(0.625rem+env(safe-area-inset-bottom))] sm:pb-2.5">
        {!terminated && (
          // Capped and scrollable. Waxing alone is seventeen services; dumping
          // them all as chips previously pushed the composer off the panel.
          <div className="max-h-[34vh] overflow-y-auto overscroll-contain sm:max-h-[184px]">
            <ChipRow chips={chips} disabled={pending} onPick={pickChip} />
          </div>
        )}

        <div className="mt-2">
          {terminated ? (
            <p className="rounded-xl bg-muted px-3 py-2 text-center text-xs text-muted-foreground">
              This conversation has ended. Please call the salon on{' '}
              <a href={`tel:${SALON_PHONE.replace(/\D/g, '')}`} className="font-medium text-rose-700 hover:underline">
                {SALON_PHONE}
              </a>
              .
            </p>
          ) : composerEnabled ? (
            <Composer disabled={false} pending={pending} onSend={(message) => void send({ message })} />
          ) : (
            // Replaced, not disabled. A greyed-out box invites people to keep
            // trying; a sentence explains, and the buttons above still book.
            <p className="rounded-xl bg-muted px-3 py-2 text-center text-xs text-muted-foreground">
              Typed messages are unavailable right now — the buttons above still work.
            </p>
          )}
        </div>

        <p className="mt-2 text-center text-[11px] leading-relaxed text-muted-foreground">
          AI assistant · prices come from our live list · for anything unusual, call{' '}
          <a href={`tel:${SALON_PHONE.replace(/\D/g, '')}`} className="hover:underline">
            {SALON_PHONE}
          </a>
        </p>
      </div>
    </div>
  );
}
