import { useEffect, useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { Menu, X, Scissors } from 'lucide-react';
import { cn } from '@/utils/cn';

const NAV_LINKS = [
  { to: '/services', label: 'Services' },
  { to: '/team', label: 'Our Team' },
  { to: '/gallery', label: 'Gallery' },
  { to: '/location', label: 'Location' },
  { to: '/contact', label: 'Contact' },
];

export default function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const { pathname } = useLocation();

  // Close mobile menu on route change
  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  // Detect scroll for backdrop blur
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <header
      className={cn(
        'sticky top-0 z-50 w-full transition-all duration-300',
        scrolled
          ? 'bg-white/90 shadow-sm backdrop-blur-md'
          : 'bg-white'
      )}
    >
      <div className="container mx-auto flex h-16 items-center justify-between px-4 md:px-6">
        {/* Logo */}
        <Link
          to="/"
          className="flex items-center gap-2 font-serif text-xl font-semibold tracking-wide text-rose-600"
        >
          <Scissors className="h-5 w-5 text-gold-500" aria-hidden="true" />
          Luxe Threads
        </Link>

        {/* Desktop nav */}
        <nav className="hidden md:flex md:items-center md:gap-6" aria-label="Main navigation">
          {NAV_LINKS.map(({ to, label }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                cn(
                  'text-sm font-medium transition-colors hover:text-rose-600',
                  isActive ? 'text-rose-600' : 'text-foreground/80'
                )
              }
            >
              {label}
            </NavLink>
          ))}
        </nav>

        {/* Desktop CTA */}
        <div className="hidden md:block">
          <Link
            to="/book"
            className="rounded-full bg-rose-500 px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-rose-600"
          >
            Book Now
          </Link>
        </div>

        {/* Mobile menu toggle */}
        <button
          className="md:hidden p-2 text-foreground"
          onClick={() => setMenuOpen((v) => !v)}
          aria-label={menuOpen ? 'Close menu' : 'Open menu'}
          aria-expanded={menuOpen}
          aria-controls="mobile-menu"
        >
          {menuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
        </button>
      </div>

      {/* Mobile full-screen overlay */}
      {menuOpen && (
        <div
          id="mobile-menu"
          className="absolute inset-x-0 top-16 z-50 flex flex-col bg-white px-6 pb-8 pt-4 shadow-lg md:hidden"
          role="navigation"
          aria-label="Mobile navigation"
        >
          {NAV_LINKS.map(({ to, label }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                cn(
                  'border-b border-border py-4 text-base font-medium transition-colors hover:text-rose-600',
                  isActive ? 'text-rose-600' : 'text-foreground'
                )
              }
            >
              {label}
            </NavLink>
          ))}
          <Link
            to="/book"
            className="mt-6 rounded-full bg-rose-500 py-3 text-center text-base font-semibold text-white hover:bg-rose-600"
          >
            Book Now
          </Link>
        </div>
      )}
    </header>
  );
}
