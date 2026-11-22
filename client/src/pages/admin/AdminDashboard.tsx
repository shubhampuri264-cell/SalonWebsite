import { useEffect, useRef, useState } from 'react';
import { useNavigate, Routes, Route, Link, useLocation } from 'react-router-dom';
import { LayoutDashboard, Calendar, Ban, LogOut, Scissors, BadgePercent } from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import { adminDenial, getAdminWhoAmI } from '@/api/admin';
import AdminAppointments from './AdminAppointments';
import AdminBlockSlots from './AdminBlockSlots';
import AdminOverview from './AdminOverview';
import AdminServices from './AdminServices';
import AdminPromotions from './AdminPromotions';
import { cn } from '@/utils/cn';

const NAV_ITEMS = [
  { to: '/admin/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/admin/appointments', icon: Calendar, label: 'Appointments' },
  { to: '/admin/services', icon: Scissors, label: 'Services' },
  { to: '/admin/promotions', icon: BadgePercent, label: 'Promotions' },
  { to: '/admin/blocked-slots', icon: Ban, label: 'Block Slots' },
];

function Logo() {
  return (
    <span className="flex items-center gap-2">
      <Scissors className="h-5 w-5 text-rose-600" aria-hidden="true" />
      <span className="font-serif font-semibold text-rose-600">Icon Studio</span>
    </span>
  );
}

export default function AdminDashboard() {
  const navigate = useNavigate();
  const location = useLocation();
  const { session, signOut } = useAuthStore();
  const activeTabRef = useRef<HTMLAnchorElement>(null);

  // The server decides whether this login may see admin: the owner account,
  // signed in with two-step verification. The shell renders only after it
  // says yes; anything else goes back to the login page, which explains
  // what is missing. (The owner's identity is not in the public JS.)
  const userId = session?.user?.id;
  const [gate, setGate] = useState<'checking' | 'ok' | 'offline'>('checking');
  const [gateTick, setGateTick] = useState(0);

  useEffect(() => {
    if (!userId) {
      navigate('/admin/login', { replace: true });
      return;
    }
    // Keyed on the user, not the token: an hourly token refresh changes
    // nothing about who this is, and must not flash the checking state.
    const token = useAuthStore.getState().session?.access_token ?? '';
    let cancelled = false;
    getAdminWhoAmI(token)
      .then(() => !cancelled && setGate('ok'))
      .catch((err) => {
        if (cancelled) return;
        if (adminDenial(err)) navigate('/admin/login', { replace: true });
        else setGate('offline');
      });
    return () => {
      cancelled = true;
    };
  }, [userId, gateTick, navigate]);

  // Phone tab row scrolls sideways; keep the current tab in view.
  useEffect(() => {
    activeTabRef.current?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [location.pathname, gate]);

  if (gate === 'offline') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-stone-50 px-4">
        <div className="w-full max-w-sm space-y-3 text-center">
          <p className="text-sm text-destructive" role="alert">
            Couldn't reach the server to check your sign-in. Check your connection.
          </p>
          <button
            type="button"
            onClick={() => {
              setGate('checking');
              setGateTick((n) => n + 1);
            }}
            className="rounded-full bg-rose-500 px-5 py-2.5 text-sm font-semibold text-white hover:bg-rose-600"
          >
            Try again
          </button>
        </div>
      </div>
    );
  }
  if (gate !== 'ok') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-stone-50" role="status" aria-label="Checking your sign-in">
        <div className="h-6 w-6 animate-spin rounded-full border-4 border-rose-200 border-t-rose-500" />
      </div>
    );
  }

  const isActive = (to: string) => location.pathname.startsWith(to);

  return (
    <div className="min-h-screen bg-stone-50 md:flex">
      {/* Phone and small tablet (< 768px): top bar plus a scrollable row of tabs. */}
      <header className="sticky top-0 z-30 border-b border-border bg-white md:hidden">
        <div className="flex h-14 items-center justify-between px-4">
          <Logo />
          <button
            onClick={signOut}
            className="flex h-10 items-center gap-2 rounded-full px-3 text-sm font-medium text-foreground/70 hover:bg-muted hover:text-foreground"
          >
            <LogOut className="h-4 w-4" aria-hidden="true" />
            Sign Out
          </button>
        </div>
        <nav
          className="flex gap-1 overflow-x-auto px-3 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          aria-label="Admin navigation"
        >
          {NAV_ITEMS.map(({ to, icon: Icon, label }) => (
            <Link
              key={to}
              to={to}
              ref={isActive(to) ? activeTabRef : undefined}
              aria-current={isActive(to) ? 'page' : undefined}
              className={cn(
                'flex h-10 shrink-0 items-center gap-2 whitespace-nowrap rounded-full px-4 text-sm font-medium transition-colors',
                isActive(to) ? 'bg-rose-50 text-rose-700' : 'text-foreground/70 hover:bg-muted hover:text-foreground'
              )}
            >
              <Icon className="h-4 w-4" aria-hidden="true" />
              {label}
            </Link>
          ))}
        </nav>
      </header>

      {/* Tablet landscape and up: sidebar, pinned to the viewport so Sign Out
          sits at its bottom however long the page is. */}
      <aside className="hidden w-60 shrink-0 flex-col border-r border-border bg-white md:sticky md:top-0 md:flex md:h-screen">
        <div className="flex h-16 items-center border-b border-border px-5">
          <Logo />
        </div>
        <nav className="flex-1 overflow-y-auto p-3" aria-label="Admin navigation">
          {NAV_ITEMS.map(({ to, icon: Icon, label }) => (
            <Link
              key={to}
              to={to}
              aria-current={isActive(to) ? 'page' : undefined}
              className={cn(
                'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
                isActive(to) ? 'bg-rose-50 text-rose-700' : 'text-foreground/70 hover:bg-muted hover:text-foreground'
              )}
            >
              <Icon className="h-4 w-4" aria-hidden="true" />
              {label}
            </Link>
          ))}
        </nav>
        <div className="border-t border-border p-3">
          <button
            onClick={signOut}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-foreground/70 transition-colors hover:bg-muted hover:text-foreground"
          >
            <LogOut className="h-4 w-4" aria-hidden="true" />
            Sign Out
          </button>
        </div>
      </aside>

      {/* min-w-0 lets wide tables scroll inside their own box instead of
          stretching the page sideways. */}
      <main className="min-w-0 flex-1 px-4 py-5 md:p-8">
        <Routes>
          <Route path="dashboard" element={<AdminOverview />} />
          <Route path="appointments" element={<AdminAppointments />} />
          <Route path="services" element={<AdminServices />} />
          <Route path="promotions" element={<AdminPromotions />} />
          <Route path="blocked-slots" element={<AdminBlockSlots />} />
          <Route path="*" element={<AdminOverview />} />
        </Routes>
      </main>
    </div>
  );
}
