// Client for the Iris Edge Function.
//
// Deliberately NOT routed through api/client.ts. That module targets the Vercel
// API on the same origin; Iris lives on Supabase at a different one, which
// means a different base URL, a different auth header, and — most importantly —
// different failure semantics. A chat request that fails must degrade to a
// friendly message with the salon's phone number, never to a thrown ApiError
// that a caller might forget to catch.
//
// The response mirrors the wire contract in
// supabase/functions/chat/handlers.ts. Every field is plain data: `reply` is
// rendered as TEXT, never as HTML or markdown, so nothing the model writes can
// become markup.

const CHAT_URL = (import.meta.env.VITE_CHAT_URL as string | undefined)?.trim() ?? '';
const CHAT_FLAG = (import.meta.env.VITE_CHAT_ENABLED as string | undefined)?.trim();
const SUPABASE_ANON_KEY = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) ?? '';

/**
 * Whether to mount Iris at all.
 *
 * Both conditions are required: an explicit flag AND a configured URL. A
 * half-configured deploy renders no widget rather than a broken one — the site
 * and the booking wizard work identically either way.
 */
export const CHAT_AVAILABLE = CHAT_FLAG !== 'false' && /^https?:\/\//i.test(CHAT_URL);

export const SALON_PHONE = '(718) 255-6940';

// Kept character-for-character identical to the declarations in
// supabase/functions/chat/handlers.ts — chat.contract.test.ts compares them as
// text, because a silent rename on one side renders a blank card on the other.
// If you change one, change both.
export interface Chip {
  label: string;
  intent: string;
  params?: Record<string, unknown>;
  style?: 'primary' | 'ghost';
}

export type Card =
  | {
    type: 'service';
    id: string;
    name: string;
    description: string | null;
    priceLabel: string;
    durationMin: number;
    bookable: boolean;
  }
  | { type: 'promotion'; title: string; offerText: string; description: string | null }
  | { type: 'hours'; rows: Array<{ day: string; hours: string }>; address: string; phone: string }
  | {
    type: 'appointment';
    id: string;
    serviceId: string;
    serviceName: string;
    stylistName: string;
    dateLabel: string;
    timeLabel: string;
    status: string;
    canManage: boolean;
  }
  | { type: 'contactForm'; mode: 'booking' | 'message' }
  | {
    type: 'confirm';
    pendingId: string;
    serviceName: string;
    stylistName: string;
    dateLabel: string;
    timeLabel: string;
    priceLabel: string;
    durationMin: number;
  }
  | {
    type: 'booked';
    serviceName: string;
    stylistName: string;
    dateLabel: string;
    timeLabel: string;
  }
  | { type: 'signIn' };

export interface ChatResponse {
  sessionId: string;
  reply: string;
  cards: Card[];
  chips: Chip[];
  node: string;
  composerEnabled: boolean;
  terminated: boolean;
  promptVersion: string;
}

export interface ChatRequest {
  sessionId?: string;
  /** Exactly one of message or intent. */
  message?: string;
  intent?: string;
  params?: Record<string, unknown>;
  /** The signed-in customer's Supabase token, when there is one. */
  customerToken?: string;
}

/** Shown whenever the function itself is unreachable. Always names the phone. */
const OFFLINE: Omit<ChatResponse, 'sessionId'> = {
  reply:
    `I can't reach the salon's system right now. You can still book on the website as normal, or call us on ${SALON_PHONE}.`,
  cards: [],
  chips: [],
  node: 'root',
  composerEnabled: false,
  terminated: false,
  promptVersion: 'offline',
};

/**
 * Sends one turn.
 *
 * NEVER throws and never rejects. A network failure, a timeout, a 500 — all
 * resolve to the offline message above. The widget therefore has no error
 * branch to forget: whatever comes back is renderable.
 */
export async function sendChat(request: ChatRequest): Promise<ChatResponse> {
  const { customerToken, ...body } = request;

  const controller = new AbortController();
  // Comfortably longer than the two model calls, short enough that a hung
  // request surfaces the phone number rather than an endless spinner.
  const timer = setTimeout(() => controller.abort(), 30_000);

  try {
    const response = await fetch(CHAT_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // Supabase's gateway wants a project key on every function call. The
        // function itself runs with verify_jwt = false, so this routes the
        // request and grants nothing.
        ...(SUPABASE_ANON_KEY ? { apikey: SUPABASE_ANON_KEY } : {}),
        // The CUSTOMER's token, in its own header rather than Authorization —
        // which the Supabase gateway treats as its own. Forwarded untouched to
        // the Vercel API, where it is verified. Absent for anonymous visitors,
        // who can still browse, ask and book.
        ...(customerToken ? { 'X-Customer-Token': customerToken } : {}),
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!response.ok) {
      // 429 is the one status with a message worth showing: the server wrote a
      // customer-facing sentence and it names the phone number.
      const payload = await response.json().catch(() => null);
      if (payload && typeof payload.reply === 'string') return payload as ChatResponse;
      return { sessionId: request.sessionId ?? '', ...OFFLINE };
    }

    return (await response.json()) as ChatResponse;
  } catch {
    return { sessionId: request.sessionId ?? '', ...OFFLINE };
  } finally {
    clearTimeout(timer);
  }
}
