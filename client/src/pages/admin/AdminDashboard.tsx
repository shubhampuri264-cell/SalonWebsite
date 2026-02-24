import { useEffect } from 'react';
import { useNavigate, Routes, Route, Link, useLocation } from 'react-router-dom';
import { LayoutDashboard, Calendar, Ban, LogOut, Scissors } from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import AdminAppointments from './AdminAppointments';
import AdminBlockSlots from './AdminBlockSlots';
import { cn } from '@/utils/cn';

const NAV_ITEMS = [
  { to: '/admin/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/admin/appointments', icon: Calendar, label: 'Appointments' },
  { to: '/admin/blocked-slots', icon: Ban, label: 'Block Slots' },
];

export default function AdminDashboard() {
  const navigate = useNavigate();
  const location = useLocation();
  const { session, signOut } = useAuthStore();

  useEffect(() => {
    if (!session) navigate('/admin/login', { replace: true });
  }, [session, navigate]);

  if (!session) return null;

  return (
    <div className="flex min-h-screen bg-stone-50">
      {/* Sidebar */}
      <aside className="w-60 shrink-0 border-r border-border bg-white">
        <div className="flex h-16 items-center gap-2 border-b border-border px-5">
          <Scissors className="h-5 w-5 text-rose-600" aria-hidden="true" />
          <span className="font-serif font-semibold text-rose-600">Luxe Threads</span>
        </div>
        <nav className="p-3" aria-label="Admin navigation">
          {NAV_ITEMS.map(({ to, icon: Icon, label }) => (
            <Link
              key={to}
              to={to}
              className={cn(
                'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
                location.pathname.startsWith(to)
                  ? 'bg-rose-50 text-rose-700'
                  : 'text-foreground/70 hover:bg-muted hover:text-foreground'
              )}
            >
              <Icon className="h-4 w-4" aria-hidden="true" />
              {label}
            </Link>
          ))}
        </nav>
        <div className="absolute bottom-4 left-0 w-60 px-3">
          <button
            onClick={signOut}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-foreground/70 hover:bg-muted hover:text-foreground transition-colors"
          >
            <LogOut className="h-4 w-4" aria-hidden="true" />
            Sign Out
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto p-8">
        <Routes>
          <Route
            path="dashboard"
            element={
              <div>
                <h1 className="font-serif text-3xl font-semibold">Dashboard</h1>
                <p className="mt-2 text-muted-foreground">
                  Welcome back! Use the navigation to manage appointments.
                </p>
              </div>
            }
          />
          <Route path="appointments" element={<AdminAppointments />} />
          <Route path="blocked-slots" element={<AdminBlockSlots />} />
          <Route
            path="*"
            element={
              <div>
                <h1 className="font-serif text-3xl font-semibold">Dashboard</h1>
                <p className="mt-2 text-muted-foreground">
                  Welcome back! Use the navigation to manage appointments.
                </p>
                <div className="mt-6 grid gap-4 sm:grid-cols-3">
                  {NAV_ITEMS.slice(1).map(({ to, icon: Icon, label }) => (
                    <Link
                      key={to}
                      to={to}
                      className="flex items-center gap-4 rounded-xl border border-border bg-white p-5 hover:border-rose-300 hover:shadow-sm transition-all"
                    >
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-rose-100">
                        <Icon className="h-5 w-5 text-rose-600" aria-hidden="true" />
                      </div>
                      <span className="font-medium">{label}</span>
                    </Link>
                  ))}
                </div>
              </div>
            }
          />
        </Routes>
      </main>
    </div>
  );
}
