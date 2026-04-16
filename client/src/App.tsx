import { lazy, Suspense } from 'react';
import { Routes, Route } from 'react-router-dom';
import Navbar from '@/components/layout/Navbar';
import Footer from '@/components/layout/Footer';

// Public pages — lazy loaded for code splitting
const Home = lazy(() => import('@/pages/Home'));
const Services = lazy(() => import('@/pages/Services'));
const Team = lazy(() => import('@/pages/Team'));
const Gallery = lazy(() => import('@/pages/Gallery'));
const Location = lazy(() => import('@/pages/Location'));
const Book = lazy(() => import('@/pages/Book'));
const Contact = lazy(() => import('@/pages/Contact'));
const BookingConfirmation = lazy(() => import('@/pages/BookingConfirmation'));
const CancelPage = lazy(() => import('@/pages/CancelPage'));
const CustomerProfile = lazy(() => import('@/pages/CustomerProfile'));

// Admin pages
const AdminLogin = lazy(() => import('@/pages/admin/AdminLogin'));
const AdminDashboard = lazy(() => import('@/pages/admin/AdminDashboard'));

function PageLoader() {
  return (
    <div className="flex h-64 items-center justify-center">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-rose-200 border-t-rose-500" />
    </div>
  );
}

export default function App() {
  return (
    <div className="flex min-h-screen flex-col">
      <Routes>
        {/* Admin routes — no public Navbar/Footer */}
        <Route
          path="/admin/*"
          element={
            <Suspense fallback={<PageLoader />}>
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
                    <Route
                      path="/booking/confirmation"
                      element={<BookingConfirmation />}
                    />
                    <Route path="/booking/cancel" element={<CancelPage />} />
                    <Route path="/profile" element={<CustomerProfile />} />
                    <Route
                      path="*"
                      element={
                        <div className="flex h-64 flex-col items-center justify-center gap-4">
                          <h1 className="text-3xl">404 — Page Not Found</h1>
                          <a href="/" className="text-rose-500 underline">
                            Return home
                          </a>
                        </div>
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
