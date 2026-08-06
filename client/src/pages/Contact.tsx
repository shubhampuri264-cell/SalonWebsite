import { useState } from 'react';
import { Helmet } from '@dr.pogodin/react-helmet';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Send, CheckCircle, AlertCircle } from 'lucide-react';
import { Instagram } from '@/components/icons/Instagram';
import { contactFormSchema, type ContactFormValues } from '@/utils/validators';
import { sendContactMessage } from '@/api/contact';
import { SALON_INFO } from '@/utils/dates';

export default function Contact() {
  const [submitted, setSubmitted] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    reset,
  } = useForm<ContactFormValues>({
    resolver: zodResolver(contactFormSchema),
  });

  // Previously this built a `mailto:` and handed off to the OS mail client.
  // On mobile, and for anyone using webmail with no registered handler, that
  // does nothing visible and the enquiry is lost — the form reported success
  // either way. It now posts to /api/contact, which delivers through Resend.
  const onSubmit = async (data: ContactFormValues) => {
    setSendError(null);
    try {
      await sendContactMessage(data);
      setSubmitted(true);
      reset();
    } catch (err) {
      // Keep the typed message in the fields so a retry costs nothing.
      setSendError(
        err instanceof Error && err.message
          ? err.message
          : `Something went wrong. Please call us on ${SALON_INFO.phone}.`,
      );
    }
  };

  return (
    <>
      <Helmet>
        <title>Contact | Icon Studio</title>
        <meta
          name="description"
          content="Get in touch with Icon Studio. Send us a message or find us on social media."
        />
      </Helmet>

      <div className="container mx-auto px-4 py-16 md:px-6">
        <div className="mb-14 text-center">
          <span className="eyebrow eyebrow--center">Say Hello</span>
          <h1 className="mt-4 font-serif text-4xl font-semibold md:text-5xl">Get in Touch</h1>
          <p className="mx-auto mt-4 max-w-xl text-muted-foreground">
            Have a question? We'd love to hear from you.
          </p>
        </div>

        <div className="mx-auto max-w-lg">
          {submitted ? (
            <div className="flex flex-col items-center gap-4 rounded-2xl border border-rose-200 bg-rose-50 p-10 text-center">
              <CheckCircle className="h-12 w-12 text-rose-500" aria-hidden="true" />
              <h2 className="font-serif text-2xl font-semibold">Message Sent!</h2>
              <p className="text-muted-foreground">
                Thanks for getting in touch — your message is on its way to the salon and we'll
                reply to the email address you gave us. In a hurry? Call us on {SALON_INFO.phone}.
              </p>
              <button
                onClick={() => setSubmitted(false)}
                className="mt-2 text-sm text-rose-600 underline"
              >
                Send another message
              </button>
            </div>
          ) : (
            <form
              onSubmit={handleSubmit(onSubmit)}
              className="card-lux space-y-5 p-8 shadow-xs"
              noValidate
            >
              <div>
                <label htmlFor="name" className="mb-1 block text-sm font-medium">
                  Name
                </label>
                <input
                  {...register('name')}
                  id="name"
                  type="text"
                  placeholder="Jane Smith"
                  className="w-full rounded-lg border border-input bg-background px-4 py-2.5 text-sm outline-hidden focus:ring-2 focus:ring-rose-400 focus:border-transparent"
                  aria-invalid={!!errors.name}
                />
                {errors.name && (
                  <p className="mt-1 text-xs text-destructive" role="alert">
                    {errors.name.message}
                  </p>
                )}
              </div>

              <div>
                <label htmlFor="email" className="mb-1 block text-sm font-medium">
                  Email
                </label>
                <input
                  {...register('email')}
                  id="email"
                  type="email"
                  placeholder="jane@example.com"
                  className="w-full rounded-lg border border-input bg-background px-4 py-2.5 text-sm outline-hidden focus:ring-2 focus:ring-rose-400 focus:border-transparent"
                  aria-invalid={!!errors.email}
                />
                {errors.email && (
                  <p className="mt-1 text-xs text-destructive" role="alert">
                    {errors.email.message}
                  </p>
                )}
              </div>

              <div>
                <label htmlFor="message" className="mb-1 block text-sm font-medium">
                  Message
                </label>
                <textarea
                  {...register('message')}
                  id="message"
                  rows={5}
                  placeholder="Your message..."
                  className="w-full rounded-lg border border-input bg-background px-4 py-2.5 text-sm outline-hidden focus:ring-2 focus:ring-rose-400 focus:border-transparent resize-none"
                  aria-invalid={!!errors.message}
                />
                {errors.message && (
                  <p className="mt-1 text-xs text-destructive" role="alert">
                    {errors.message.message}
                  </p>
                )}
              </div>

              {/*
                Honeypot. Hidden from sighted users and from screen readers, and
                skipped by keyboard tabbing, so a real visitor can never fill it
                in — but form-filling bots populate every input in the DOM.
                Positioned off-screen rather than `display: none`, which the
                better bots know to skip. Server drops any submission that
                arrives with it set, and still returns 200.
              */}
              <div className="pointer-events-none absolute left-[-9999px] h-0 w-0 overflow-hidden" aria-hidden="true">
                <label htmlFor="website">Leave this field empty</label>
                <input
                  {...register('website')}
                  id="website"
                  type="text"
                  tabIndex={-1}
                  autoComplete="off"
                />
              </div>

              {sendError && (
                <div
                  className="flex items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm"
                  role="alert"
                >
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" aria-hidden="true" />
                  <div>
                    <p className="text-destructive">{sendError}</p>
                    <p className="mt-1 text-muted-foreground">
                      Your message is still here — press Send Message to try again, or call{' '}
                      <a href={`tel:${SALON_INFO.phone.replace(/\D/g, '')}`} className="underline">
                        {SALON_INFO.phone}
                      </a>
                      .
                    </p>
                  </div>
                </div>
              )}

              <button
                type="submit"
                disabled={isSubmitting}
                className="btn-primary w-full disabled:opacity-50"
              >
                <Send className="h-4 w-4" aria-hidden="true" />
                {isSubmitting ? 'Sending...' : 'Send Message'}
              </button>
            </form>
          )}

          {/* Social links */}
          <div className="mt-8 text-center">
            <p className="mb-4 text-sm text-muted-foreground">Or follow us on social media</p>
            <div className="flex justify-center gap-6">
              <a
                href={SALON_INFO.instagram}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 text-sm font-medium text-foreground hover:text-rose-600 transition-colors"
              >
                <Instagram className="h-5 w-5" aria-hidden="true" />
                Instagram
              </a>
              <a
                href={SALON_INFO.tiktok}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 text-sm font-medium text-foreground hover:text-rose-600 transition-colors"
              >
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.5 2.89 2.89 0 0 1-2.89-2.89 2.89 2.89 0 0 1 2.89-2.89c.28 0 .54.04.79.1V9.01a6.33 6.33 0 0 0-.79-.05 6.34 6.34 0 0 0-6.34 6.34 6.34 6.34 0 0 0 6.34 6.34 6.34 6.34 0 0 0 6.33-6.34V8.69a8.18 8.18 0 0 0 4.78 1.52V6.76a4.85 4.85 0 0 1-1.01-.07z"/>
                </svg>
                TikTok
              </a>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
