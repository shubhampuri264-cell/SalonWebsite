import { Link } from 'react-router-dom';
import { Scissors, Instagram, MapPin, Phone, Mail } from 'lucide-react';
import { SALON_INFO } from '@/utils/dates';

export default function Footer() {
  return (
    <footer className="bg-[#2A2224] text-[#CDC3C4]">
      <div className="h-px w-full bg-gradient-to-r from-transparent via-gold-500/60 to-transparent" />
      <div className="container mx-auto px-4 py-14 md:px-6">
        <div className="grid gap-10 md:grid-cols-3">
          {/* Brand */}
          <div>
            <Link
              to="/"
              className="flex items-center gap-2.5 font-serif text-xl font-semibold uppercase tracking-[0.14em] text-white"
            >
              <Scissors className="h-5 w-5 text-gold-400" aria-hidden="true" />
              Icon Studio
            </Link>
            <p className="mt-4 max-w-xs text-sm leading-relaxed text-[#9E9496]">
              A boutique hair salon and threading studio in the heart of Sunnyside, Queens.
            </p>
            <div className="mt-5 flex gap-4">
              <a
                href={SALON_INFO.instagram}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Icon Studio on Instagram"
                className="text-[#9E9496] transition-colors hover:text-gold-400"
              >
                <Instagram className="h-5 w-5" />
              </a>
              <a
                href={SALON_INFO.tiktok}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Icon Studio on TikTok"
                className="text-[#9E9496] transition-colors hover:text-gold-400"
              >
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.5 2.89 2.89 0 0 1-2.89-2.89 2.89 2.89 0 0 1 2.89-2.89c.28 0 .54.04.79.1V9.01a6.33 6.33 0 0 0-.79-.05 6.34 6.34 0 0 0-6.34 6.34 6.34 6.34 0 0 0 6.34 6.34 6.34 6.34 0 0 0 6.33-6.34V8.69a8.18 8.18 0 0 0 4.78 1.52V6.76a4.85 4.85 0 0 1-1.01-.07z" />
                </svg>
              </a>
            </div>
          </div>

          {/* Quick Links */}
          <div>
            <h3 className="mb-4 text-xs font-semibold uppercase tracking-[0.2em] text-gold-400">
              Quick Links
            </h3>
            <ul className="space-y-2.5 text-sm">
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
                    className="text-[#9E9496] transition-colors hover:text-white"
                  >
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Contact */}
          <div>
            <h3 className="mb-4 text-xs font-semibold uppercase tracking-[0.2em] text-gold-400">
              Contact
            </h3>
            <ul className="space-y-3.5 text-sm text-[#9E9496]">
              <li className="flex items-start gap-3">
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-gold-500" aria-hidden="true" />
                {SALON_INFO.address}
              </li>
              <li className="flex items-center gap-3">
                <Phone className="h-4 w-4 shrink-0 text-gold-500" aria-hidden="true" />
                <a href={`tel:${SALON_INFO.phone}`} className="transition-colors hover:text-white">
                  {SALON_INFO.phone}
                </a>
              </li>
              <li className="flex items-center gap-3">
                <Mail className="h-4 w-4 shrink-0 text-gold-500" aria-hidden="true" />
                <a href={`mailto:${SALON_INFO.email}`} className="transition-colors hover:text-white">
                  {SALON_INFO.email}
                </a>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-12 flex items-center justify-center gap-4 border-t border-white/10 pt-6 text-xs text-[#7C7274]">
          <span>© {new Date().getFullYear()} Icon Studio. All rights reserved.</span>
          <Link to="/admin/login" className="transition-colors hover:text-gold-400">
            Owner Login
          </Link>
        </div>
      </div>
    </footer>
  );
}
