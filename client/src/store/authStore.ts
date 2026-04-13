import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '@/api/supabase';

interface AuthState {
  session: Session | null;
  isLoading: boolean;
  error: string | null;

  signIn: (identifier: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  setSession: (session: Session | null) => void;
  clearError: () => void;
}

function resolveLoginEmail(identifier: string): string {
  const value = identifier.trim();
  if (value.includes('@')) return value;

  const ownerUsername = (import.meta.env.VITE_OWNER_USERNAME as string | undefined)?.trim();
  const ownerEmail = (import.meta.env.VITE_OWNER_EMAIL as string | undefined)?.trim();

  if (
    ownerUsername &&
    ownerEmail &&
    value.toLowerCase() === ownerUsername.toLowerCase()
  ) {
    return ownerEmail;
  }

  return value;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      session: null,
      isLoading: false,
      error: null,

      signIn: async (identifier, password) => {
        set({ isLoading: true, error: null });
        const email = resolveLoginEmail(identifier);
        const { data, error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) {
          set({ isLoading: false, error: error.message });
          return;
        }
        set({ session: data.session, isLoading: false });
      },

      signOut: async () => {
        await supabase.auth.signOut();
        set({ session: null });
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
