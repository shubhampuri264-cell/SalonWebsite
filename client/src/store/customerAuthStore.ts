import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '@/api/supabase';
import { apiFetch, ApiError } from '@/api/client';

export interface CustomerProfile {
  id: string;
  full_name: string | null;
  phone: string | null;
  email: string | null;
}

interface CustomerAuthState {
  session: Session | null;
  profile: CustomerProfile | null;
  isLoading: boolean;
  error: string | null;

  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, fullName: string) => Promise<void>;
  signOut: () => Promise<void>;
  loadProfile: () => Promise<void>;
  requestPasswordReset: (email: string) => Promise<boolean>;
  updatePassword: (newPassword: string) => Promise<boolean>;
  clearError: () => void;
  setSession: (session: Session | null) => void;
}

export const useCustomerAuthStore = create<CustomerAuthState>()(
  persist(
    (set, get) => ({
      session: null,
      profile: null,
      isLoading: false,
      error: null,

      signIn: async (email, password) => {
        set({ isLoading: true, error: null });
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) {
          set({ isLoading: false, error: error.message });
          return;
        }
        set({ session: data.session, isLoading: false });
        await get().loadProfile();
      },

      signUp: async (email, password, fullName) => {
        set({ isLoading: true, error: null });
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { full_name: fullName } },
        });
        if (error) {
          set({ isLoading: false, error: error.message });
          return;
        }
        if (!data.session) {
          // Email confirmation required — show success and let user confirm
          set({ isLoading: false, error: null });
          return;
        }
        set({ session: data.session, isLoading: false });
        // Insert customer profile (only possible with an active session)
        await supabase
          .from('customer_profiles')
          .upsert({ id: data.user!.id, full_name: fullName })
          .select()
          .single();
        set({ profile: { id: data.user!.id, full_name: fullName, phone: null, email } });
      },

      signOut: async () => {
        await supabase.auth.signOut();
        set({ session: null, profile: null });
      },

      loadProfile: async () => {
        const { session } = get();
        if (!session?.user) return;

        const { data } = await supabase
          .from('customer_profiles')
          .select('id, full_name, phone')
          .eq('id', session.user.id)
          .single();

        if (data) {
          set({ profile: { ...data, email: session.user.email ?? null } });
        } else {
          // Profile doesn't exist yet (e.g. confirmed email after sign-up)
          // Create it now using the full_name stored in user metadata
          const metaName = (session.user.user_metadata?.full_name as string | undefined) ?? null;
          await supabase
            .from('customer_profiles')
            .upsert({ id: session.user.id, full_name: metaName });
          set({ profile: { id: session.user.id, full_name: metaName, phone: null, email: session.user.email ?? null } });
        }
      },

      // Sends a password-reset email via the server (Resend), NOT via
      // Supabase's built-in SMTP (free tier capped at ~3/h, unusable in prod).
      // The server mints a Supabase recovery action_link (1h TTL, single-use)
      // and ships it through Resend. Always returns true unless the request
      // itself failed (network error / 429) — the caller should always show
      // the same "if an account exists..." message to avoid enumeration.
      requestPasswordReset: async (email) => {
        set({ isLoading: true, error: null });
        try {
          await apiFetch<{ message: string }>('/api/customer/forgot-password', {
            method: 'POST',
            body: JSON.stringify({ email }),
          });
          set({ isLoading: false });
          return true;
        } catch (err) {
          const msg = err instanceof ApiError
            ? err.message
            : 'Something went wrong. Please try again.';
          set({ isLoading: false, error: msg });
          return false;
        }
      },

      // Called from the /auth/reset page after the recovery link puts the user
      // into a temporary PASSWORD_RECOVERY session. updateUser writes the new
      // password and invalidates the recovery token.
      updatePassword: async (newPassword) => {
        set({ isLoading: true, error: null });
        const { error } = await supabase.auth.updateUser({ password: newPassword });
        set({ isLoading: false, error: error ? error.message : null });
        return !error;
      },

      clearError: () => set({ error: null }),

      setSession: (session) => set({ session }),
    }),
    {
      name: 'icon-customer-auth',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ session: state.session, profile: state.profile }),
    }
  )
);
