import { lazy, Suspense, useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { CHAT_AVAILABLE } from '@/api/chat';
import { useChatStore } from '@/store/chatStore';
import IrisMark from './IrisMark';

// The panel is the heavy half — cards, forms, focus trap. Split so a visitor
// who never opens Iris never downloads it.
const ChatPanel = lazy(() => import('./ChatPanel'));

// Shown once per browser session. A nudge that reappears on every page view is
// an advertisement; one that appears once is an introduction.
const NUDGE_KEY = 'iris:nudge-seen';
const NUDGE_DELAY_MS = 2500;

/**
 * Iris, mounted on every public page.
 *
 * Renders NOTHING when the feature is unconfigured or switched off. That is the
 * guarantee the whole design rests on: Iris is an addition, and with
 * VITE_CHAT_ENABLED=false the site is byte-for-byte what it was before — the
 * booking wizard, the service pages, and the admin panel are untouched.
 */
export default function ChatWidget() {
  const { open, openChat, closeChat } = useChatStore();
  const [nudge, setNudge] = useState(false);

  // A bare circle in the corner reads as decoration — people do not know it is
  // an assistant, or that it can book. The launcher therefore says so in words,
  // and a one-time bubble introduces it. Both are dismissible and neither
  // blocks anything: the wizard is still the primary way to book.
  useEffect(() => {
    if (!CHAT_AVAILABLE) return;
    if (sessionStorage.getItem(NUDGE_KEY)) return;
    const timer = window.setTimeout(() => setNudge(true), NUDGE_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, []);

  const dismissNudge = () => {
    setNudge(false);
    sessionStorage.setItem(NUDGE_KEY, '1');
  };

  if (!CHAT_AVAILABLE) return null;

  const showNudge = nudge && !open;

  return (
    <>
      {showNudge && (
        <div
          // Purely decorative repetition of the launcher's own label, so it is
          // hidden from screen readers rather than read out twice.
          aria-hidden="true"
          className="card-lux fixed bottom-24 right-5 z-40 w-[248px] bg-background p-3 pr-8 shadow-xl"
        >
          <p className="text-[13px] leading-relaxed">
            <span className="font-serif font-semibold">Hi, I'm Iris.</span>{' '}
            <span className="text-muted-foreground">
              I'm an AI assistant — I can book you in, check prices, or look up your appointments.
            </span>
          </p>
          <button
            type="button"
            onClick={dismissNudge}
            className="absolute right-1.5 top-1.5 rounded-full p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" aria-hidden="true" />
            <span className="sr-only">Dismiss</span>
          </button>
        </div>
      )}

      {/* Launcher. z-40 keeps it BELOW the sticky Navbar (z-50) and the customer
          auth modal (z-50), so it can never cover navigation or an open dialog. */}
      <button
        type="button"
        onClick={() => {
          dismissNudge();
          if (open) closeChat();
          else openChat();
        }}
        aria-label={open ? 'Close chat with Iris' : 'Chat with Iris, the AI assistant'}
        aria-expanded={open}
        className={
          open
            ? 'btn-primary fixed bottom-5 right-5 z-40 h-14 w-14 !p-0'
            : 'btn-primary fixed bottom-5 right-5 z-40 h-14 gap-2.5 !px-5 !py-0 text-[15px]'
        }
      >
        {open ? (
          <X className="h-5 w-5" aria-hidden="true" />
        ) : (
          <>
            <IrisMark size={28} />
            <span>Ask Iris</span>
            {/* Non-human status on the launcher itself, not only inside the
                panel — the disclosure is worth nothing if it appears after
                someone has already started typing. */}
            <span className="rounded-full bg-white/25 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide">
              AI
            </span>
          </>
        )}
      </button>

      {open && (
        // Its OWN Suspense with a null fallback. Nesting this inside the
        // page-level <Suspense fallback={<PageLoader/>}> in App.tsx would blank
        // the entire page for the moment the chat chunk loads.
        <Suspense fallback={null}>
          <ChatPanel onClose={closeChat} />
        </Suspense>
      )}
    </>
  );
}
