import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { createClient, type Session } from '@supabase/supabase-js';

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL as string,
  import.meta.env.VITE_SUPABASE_ANON_KEY as string
);

interface AuthState {
  session: Session | null;
  isLoading: boolean;
  error: string | null;

  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  setSession: (session: Session | null) => void;
  clearError: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      session: null,
      isLoading: false,
      error: null,

      signIn: async (email, password) => {
        set({ isLoading: true, error: null });
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
      name: 'luxe-admin-auth',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ session: state.session }),
    }
  )
);

export { supabase };
