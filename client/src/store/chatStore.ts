import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { sendChat, type Card, type ChatRequest, type Chip } from '@/api/chat';
import { useCustomerAuthStore } from '@/store/customerAuthStore';

// sessionStorage, matching bookingStore: a conversation belongs to a browsing
// session, and it should not follow someone into next week.
//
// PII rule for this store: it holds only what the customer can already see on
// screen. Contact details typed into the booking form are POSTed once and never
// written here — reloading the page after entering them shows the confirmation
// card, not a form repopulated from storage.

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  cards?: Card[];
}

interface ChatState {
  open: boolean;
  sessionId: string | null;
  messages: ChatMessage[];
  chips: Chip[];
  node: string;
  pending: boolean;
  composerEnabled: boolean;
  terminated: boolean;

  openChat: () => void;
  closeChat: () => void;
  toggle: () => void;
  send: (input: { message?: string; intent?: string; params?: Record<string, unknown> }) => Promise<void>;
  reset: () => void;
}

let counter = 0;
function messageId(): string {
  counter += 1;
  return `m${Date.now().toString(36)}-${counter}`;
}

export const useChatStore = create<ChatState>()(
  persist(
    (set, get) => ({
      open: false,
      sessionId: null,
      messages: [],
      chips: [],
      node: 'root',
      pending: false,
      composerEnabled: true,
      terminated: false,

      openChat: () => set({ open: true }),
      closeChat: () => set({ open: false }),
      toggle: () => set((s) => ({ open: !s.open })),

      send: async (input) => {
        // One request at a time. Without this a fast double-tap on a chip sends
        // two turns, and the second arrives with a stale node.
        if (get().pending || get().terminated) return;

        const echo: ChatMessage[] = input.message
          ? [{ id: messageId(), role: 'user', text: input.message }]
          : [];

        set((s) => ({
          pending: true,
          messages: [...s.messages, ...echo],
          // Clear the chips while in flight: a chip from the previous turn
          // usually no longer makes sense, and leaving them tappable invites a
          // request that the server will answer against a different node.
          chips: [],
        }));

        const request: ChatRequest = {
          sessionId: get().sessionId ?? undefined,
          ...input,
          // Read at send time, not at mount: the customer may have signed in
          // since the widget opened.
          customerToken: useCustomerAuthStore.getState().session?.access_token,
        };

        // sendChat never rejects — see api/chat.ts. There is no error branch
        // here because there is no error to branch on.
        const response = await sendChat(request);

        set((s) => ({
          pending: false,
          sessionId: response.sessionId || s.sessionId,
          messages: [
            ...s.messages,
            {
              id: messageId(),
              role: 'assistant',
              text: response.reply,
              cards: response.cards.length ? response.cards : undefined,
            },
          ],
          chips: response.chips,
          node: response.node,
          composerEnabled: response.composerEnabled,
          terminated: response.terminated,
        }));
      },

      reset: () =>
        set({
          sessionId: null,
          messages: [],
          chips: [],
          node: 'root',
          pending: false,
          composerEnabled: true,
          terminated: false,
        }),
    }),
    {
      name: 'icon-iris-chat',
      storage: createJSONStorage(() => sessionStorage),
      // `pending` is deliberately not persisted: a reload mid-request would
      // otherwise restore a stuck spinner with no request behind it.
      partialize: (s) => ({
        sessionId: s.sessionId,
        messages: s.messages,
        chips: s.chips,
        node: s.node,
        composerEnabled: s.composerEnabled,
        terminated: s.terminated,
      }),
    },
  ),
);
