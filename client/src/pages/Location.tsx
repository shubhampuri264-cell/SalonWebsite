import { Helmet } from 'react-helmet-async';
import { MapPin, Phone, Mail, Clock, Instagram } from 'lucide-react';
import { HOURS_DISPLAY, SALON_INFO } from '@/utils/dates';

export default function Location() {
  return (
    <>
      <Helmet>
        <title>Location & Hours | Icon Studio</title>
        <meta
          name="description"
          content={`Visit Icon Studio at ${SALON_INFO.address}. Open Monday–Sunday.`}
        />
      </Helmet>

      <div className="container mx-auto px-4 py-16 md:px-6">
        <div className="mb-12 text-center">
          <h1 className="font-serif text-4xl font-semibold md:text-5xl">
            Location & Hours
          </h1>
          <p className="mt-4 text-muted-foreground">
            Come visit us in New York City.
          </p>
        </div>

        <div className="grid gap-10 lg:grid-cols-2">
          {/* Salon photo */}
          <div className="overflow-hidden rounded-2xl border border-border shadow-sm">
            <img
              src="/location-salon.jpeg"
              alt="Icon Studio salon"
              className="h-[400px] w-full object-cover"
            />
          </div>

          {/* Info */}
          <div className="flex flex-col gap-8">
            {/* Contact details */}
            <div>
              <h2 className="mb-4 font-serif text-2xl font-semibold">Find Us</h2>
              <ul className="space-y-4 text-sm">
                <li className="flex items-start gap-3">
                  <MapPin className="mt-0.5 h-5 w-5 shrink-0 text-rose-500" aria-hidden="true" />
                  <a
                    href="https://www.google.com/maps/place/Icon+studios/@40.7435241,-73.9271745,17z/data=!4m15!1m8!3m7!1s0x89c25ed76478ebdb:0x29772a74ad67f170!2s39-46+Queens+Blvd,+Sunnyside,+NY+11104!3b1!8m2!3d40.7435241!4d-73.9245996!16s%2Fg%2F11rg5wx690!3m5!1s0x89c25fcc50063c8b:0xa9f41c20c43ad9c9!8m2!3d40.7435241!4d-73.9245996!16s%2Fg%2F11nc7z6pqz?entry=ttu&g_ep=EgoyMDI2MDUyNy4wIKXMDSoASAFQAw%3D%3D"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:text-rose-600 transition-colors"
                  >
                    {SALON_INFO.address}
                  </a>
                </li>
                <li className="flex items-center gap-3">
                  <Phone className="h-5 w-5 shrink-0 text-rose-500" aria-hidden="true" />
                  <a
                    href={`tel:${SALON_INFO.phone}`}
                    className="hover:text-rose-600 transition-colors"
                  >
                    {SALON_INFO.phone}
                  </a>
                </li>
                <li className="flex items-center gap-3">
                  <Mail className="h-5 w-5 shrink-0 text-rose-500" aria-hidden="true" />
                  <a
                    href={`mailto:${SALON_INFO.email}`}
                    className="hover:text-rose-600 transition-colors"
                  >
                    {SALON_INFO.email}
                  </a>
                </li>
                <li className="flex items-center gap-3">
                  <Instagram className="h-5 w-5 shrink-0 text-rose-500" aria-hidden="true" />
                  <a
                    href={SALON_INFO.instagram}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:text-rose-600 transition-colors"
                  >
                    Instagram
                  </a>
                </li>
                <li className="flex items-center gap-3">
                  <svg className="h-5 w-5 shrink-0 text-rose-500" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                    <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.5 2.89 2.89 0 0 1-2.89-2.89 2.89 2.89 0 0 1 2.89-2.89c.28 0 .54.04.79.1V9.01a6.33 6.33 0 0 0-.79-.05 6.34 6.34 0 0 0-6.34 6.34 6.34 6.34 0 0 0 6.34 6.34 6.34 6.34 0 0 0 6.33-6.34V8.69a8.18 8.18 0 0 0 4.78 1.52V6.76a4.85 4.85 0 0 1-1.01-.07z" />
                  </svg>
                  <a
                    href={SALON_INFO.tiktok}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:text-rose-600 transition-colors"
                  >
                    TikTok
                  </a>
                </li>
              </ul>
            </div>

            {/* Hours table */}
            <div>
              <h2 className="mb-4 font-serif text-2xl font-semibold flex items-center gap-2">
                <Clock className="h-5 w-5 text-rose-500" aria-hidden="true" />
                Hours
              </h2>
              <table className="w-full text-sm">
                <tbody>
                  {HOURS_DISPLAY.map(({ day, hours }) => (
                    <tr key={day} className="border-b border-border last:border-0">
                      <td className="py-2.5 font-medium">{day}</td>
                      <td
                        className={`py-2.5 text-right ${hours === 'Closed'
                            ? 'text-muted-foreground'
                            : 'text-foreground'
                          }`}
                      >
                        {hours}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
