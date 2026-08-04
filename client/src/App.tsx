import { Suspense, useEffect } from 'react';
import { Routes, Route } from 'react-router-dom';
import type { Session } from '@supabase/supabase-js';
import Navbar from '@/components/layout/Navbar';
import Footer from '@/components/layout/Footer';
import NoIndex from '@/components/NoIndex';
import { supabase } from '@/api/supabase';
import { useCustomerAuthStore } from '@/store/customerAuthStore';
import { useAuthStore } from '@/store/authStore';
import { lazyWithReload } from '@/utils/lazyWithReload';

// Public pages — lazy loaded for code splitting. lazyWithReload recovers from
// stale chunk requests after a redeploy (see utils/lazyWithReload).
const Home = lazyWithReload(() => import('@/pages/Home'));
const Services = lazyWithReload(() => import('@/pages/Services'));
const Team = lazyWithReload(() => import('@/pages/Team'));
const Gallery = lazyWithReload(() => import('@/pages/Gallery'));
const Location = lazyWithReload(() => import('@/pages/Location'));
const Book = lazyWithReload(() => import('@/pages/Book'));
const Contact = lazyWithReload(() => import('@/pages/Contact'));
const BookingConfirmation = lazyWithReload(() => import('@/pages/BookingConfirmation'));
const CancelPage = lazyWithReload(() => import('@/pages/CancelPage'));
const CustomerProfile = lazyWithReload(() => import('@/pages/CustomerProfile'));
const ResetPassword = lazyWithReload(() => import('@/pages/ResetPassword'));

// Admin pages
const AdminLogin = lazyWithReload(() => import('@/pages/admin/AdminLogin'));
const AdminDashboard = lazyWithReload(() => import('@/pages/admin/AdminDashboard'));

function PageLoader() {
  return (
    <div className="flex h-64 items-center justify-center">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-rose-200 border-t-rose-500" />
    </div>
  );
}

export default function App() {
  // Keep the zustand sessions in sync with Supabase's own auth state.
  // Without this, the persisted session.access_token goes stale after 1h
  // (its JWT lifetime), and authenticated API calls start failing with 401
  // even though Supabase has silently refreshed its internal token.
  // Both customer and admin stores read from the same Supabase client, so
  // a single subscription updates both.
  useEffect(() => {
    const syncSessions = (session: Session | null) => {
      useCustomerAuthStore.getState().setSession(session);
      useAuthStore.getState().setSession(session);
    };
    supabase.auth.getSession().then(({ data }) => syncSessions(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      syncSessions(session);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  return (
    <div className="flex min-h-screen flex-col">
      <Routes>
        {/* Admin routes — no public Navbar/Footer */}
        <Route
          path="/admin/*"
          element={
            <Suspense fallback={<PageLoader />}>
              {/* One NoIndex here covers every admin screen — they all render
                  under this branch, so per-page Helmet blocks are unnecessary. */}
              <NoIndex />
              <Routes>
                <Route path="login" element={<AdminLogin />} />
                <Route path="*" element={<AdminDashboard />} />
              </Routes>
            </Suspense>
          }
        />

        {/* Public routes */}
        <Route
          path="*"
          element={
            <>
              <Navbar />
              <main className="flex-1">
                <Suspense fallback={<PageLoader />}>
                  <Routes>
                    <Route path="/" element={<Home />} />
                    <Route path="/services" element={<Services />} />
                    <Route path="/team" element={<Team />} />
                    <Route path="/gallery" element={<Gallery />} />
                    <Route path="/location" element={<Location />} />
                    <Route path="/book" element={<Book />} />
                    <Route path="/contact" element={<Contact />} />
                    {/* Private or single-use routes: keep them out of search
                        results. See components/NoIndex. */}
                    <Route
                      path="/booking/confirmation"
                      element={
                        <>
                          <NoIndex />
                          <BookingConfirmation />
                        </>
                      }
                    />
                    <Route
                      path="/booking/cancel"
                      element={
                        <>
                          <NoIndex />
                          <CancelPage />
                        </>
                      }
                    />
                    <Route
                      path="/profile"
                      element={
                        <>
                          <NoIndex />
                          <CustomerProfile />
                        </>
                      }
                    />
                    <Route
                      path="/auth/reset"
                      element={
                        <>
                          <NoIndex />
                          <ResetPassword />
                        </>
                      }
                    />
                    <Route
                      path="*"
                      element={
                        <>
                          <NoIndex />
                          <div className="flex h-64 flex-col items-center justify-center gap-4">
                            <h1 className="text-3xl">404 — Page Not Found</h1>
                            <a href="/" className="text-rose-500 underline">
                              Return home
                            </a>
                          </div>
                        </>
                      }
                    />
                  </Routes>
                </Suspense>
              </main>
              <Footer />
            </>
          }
        />
      </Routes>
    </div>
  );
}
