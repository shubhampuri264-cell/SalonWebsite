import { Helmet } from 'react-helmet-async';
import { MapPin, Phone, Mail, Clock } from 'lucide-react';
import { HOURS_DISPLAY, SALON_INFO } from '@/utils/dates';

export default function Location() {
  const googleMapsApiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string;
  const encodedAddress = encodeURIComponent(SALON_INFO.address);

  return (
    <>
      <Helmet>
        <title>Location & Hours | Icon Studio</title>
        <meta
          name="description"
          content={`Visit Icon Studio at ${SALON_INFO.address}. Open Monday–Saturday.`}
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
          {/* Map */}
          <div className="overflow-hidden rounded-2xl border border-border shadow-sm">
            <iframe
              title="Icon Studio location map"
              src={
                googleMapsApiKey
                  ? `https://www.google.com/maps/embed/v1/place?key=${googleMapsApiKey}&q=${encodedAddress}`
                  : `https://maps.google.com/maps?q=${encodedAddress}&output=embed`
              }
              width="100%"
              height="400"
              className="border-0"
              allowFullScreen
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
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
                  <span>{SALON_INFO.address}</span>
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
                        className={`py-2.5 text-right ${
                          hours === 'Closed'
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
