import { Link } from 'react-router-dom';
import { Scissors, Instagram, Facebook, MapPin, Phone, Mail } from 'lucide-react';
import { SALON_INFO } from '@/utils/dates';

export default function Footer() {
  return (
    <footer className="border-t border-border bg-stone-50">
      <div className="container mx-auto px-4 py-12 md:px-6">
        <div className="grid gap-8 md:grid-cols-3">
          {/* Brand */}
          <div>
            <Link
              to="/"
              className="flex items-center gap-2 font-serif text-xl font-semibold text-rose-600"
            >
              <Scissors className="h-5 w-5 text-gold-500" aria-hidden="true" />
              Luxe Threads
            </Link>
            <p className="mt-3 text-sm text-muted-foreground leading-relaxed">
              A boutique hair salon and threading studio in the heart of New York City.
            </p>
            <div className="mt-4 flex gap-4">
              <a
                href={SALON_INFO.instagram}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Luxe Threads on Instagram"
                className="text-muted-foreground hover:text-rose-600 transition-colors"
              >
                <Instagram className="h-5 w-5" />
              </a>
              <a
                href={SALON_INFO.facebook}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Luxe Threads on Facebook"
                className="text-muted-foreground hover:text-rose-600 transition-colors"
              >
                <Facebook className="h-5 w-5" />
              </a>
            </div>
          </div>

          {/* Quick Links */}
          <div>
            <h3 className="mb-4 text-sm font-semibold uppercase tracking-widest text-foreground">
              Quick Links
            </h3>
            <ul className="space-y-2 text-sm">
              {[
                { to: '/services', label: 'Services' },
                { to: '/team', label: 'Our Team' },
                { to: '/gallery', label: 'Gallery' },
                { to: '/location', label: 'Location & Hours' },
                { to: '/contact', label: 'Contact' },
                { to: '/book', label: 'Book Now' },
              ].map(({ to, label }) => (
                <li key={to}>
                  <Link
                    to={to}
                    className="text-muted-foreground hover:text-rose-600 transition-colors"
                  >
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Contact */}
          <div>
            <h3 className="mb-4 text-sm font-semibold uppercase tracking-widest text-foreground">
              Contact
            </h3>
            <ul className="space-y-3 text-sm text-muted-foreground">
              <li className="flex items-start gap-2">
                <MapPin className="h-4 w-4 mt-0.5 shrink-0 text-rose-400" aria-hidden="true" />
                {SALON_INFO.address}
              </li>
              <li className="flex items-center gap-2">
                <Phone className="h-4 w-4 shrink-0 text-rose-400" aria-hidden="true" />
                <a href={`tel:${SALON_INFO.phone}`} className="hover:text-rose-600 transition-colors">
                  {SALON_INFO.phone}
                </a>
              </li>
              <li className="flex items-center gap-2">
                <Mail className="h-4 w-4 shrink-0 text-rose-400" aria-hidden="true" />
                <a href={`mailto:${SALON_INFO.email}`} className="hover:text-rose-600 transition-colors">
                  {SALON_INFO.email}
                </a>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-10 border-t border-border pt-6 text-center text-xs text-muted-foreground">
          © {new Date().getFullYear()} Luxe Threads. All rights reserved.
        </div>
      </div>
    </footer>
  );
}
