import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '@/api/supabase';

interface AuthState {
  session: Session | null;
  isLoading: boolean;
  error: string | null;

  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  setSession: (session: Session | null) => void;
  clearError: () => void;
}

// No owner email or username lives in this file any more: VITE_* values are
// compiled into the public JS, which published the admin login address to
// every visitor. Who the owner is gets decided by the server alone.

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      session: null,
      isLoading: false,
      error: null,

      signIn: async (email, password) => {
        set({ isLoading: true, error: null });
        const { data, error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (error) {
          set({
            isLoading: false,
            // Same wording for a wrong email and a wrong password, so the
            // form never confirms which addresses have accounts.
            error:
              error.status === 429
                ? 'Too many sign-in attempts. Wait a few minutes, then try again.'
                : 'Email or password is incorrect.',
          });
          return;
        }
        set({ session: data.session, isLoading: false });
      },

      signOut: async () => {
        // This device only ('local'). The default ('global') would also end
        // her sessions on every other device -- and some sign-outs here are
        // automatic (a stale login, "Sign in again"). Ending every session is
        // an administrator action: supabase/admin/reset-owner-authenticator.sql.
        // The local copy is cleared even if the network call fails.
        try {
          await supabase.auth.signOut({ scope: 'local' });
        } finally {
          set({ session: null });
        }
      },

      setSession: (session) => set({ session }),

      clearError: () => set({ error: null }),
    }),
    {
      name: 'icon-admin-auth',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ session: state.session }),
    }
  )
);

export { supabase };
