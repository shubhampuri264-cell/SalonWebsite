import { useEffect } from 'react';
import { useNavigate, Routes, Route, Link, useLocation } from 'react-router-dom';
import { LayoutDashboard, Calendar, Ban, LogOut, Scissors } from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import AdminAppointments from './AdminAppointments';
import AdminBlockSlots from './AdminBlockSlots';
import AdminOverview from './AdminOverview';
import AdminServices from './AdminServices';
import { cn } from '@/utils/cn';

const NAV_ITEMS = [
  { to: '/admin/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/admin/appointments', icon: Calendar, label: 'Appointments' },
  { to: '/admin/services', icon: Scissors, label: 'Services' },
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
          <span className="font-serif font-semibold text-rose-600">Icon Studio</span>
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
          <Route path="dashboard" element={<AdminOverview />} />
          <Route path="appointments" element={<AdminAppointments />} />
          <Route path="services" element={<AdminServices />} />
          <Route path="blocked-slots" element={<AdminBlockSlots />} />
          <Route path="*" element={<AdminOverview />} />
        </Routes>
      </main>
    </div>
  );
}
