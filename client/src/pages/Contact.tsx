import { useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Instagram, Facebook, Send, CheckCircle } from 'lucide-react';
import { contactFormSchema, type ContactFormValues } from '@/utils/validators';
import { SALON_INFO } from '@/utils/dates';

export default function Contact() {
  const [submitted, setSubmitted] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    reset,
  } = useForm<ContactFormValues>({
    resolver: zodResolver(contactFormSchema),
  });

  const onSubmit = async (data: ContactFormValues) => {
    window.location.href = `mailto:${SALON_INFO.email}?subject=Message from ${encodeURIComponent(data.name)}&body=${encodeURIComponent(data.message)}%0A%0AFrom%3A ${encodeURIComponent(data.email)}`;
    setSubmitted(true);
    reset();
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
        <div className="mb-12 text-center">
          <h1 className="font-serif text-4xl font-semibold md:text-5xl">Get in Touch</h1>
          <p className="mt-4 text-muted-foreground">
            Have a question? We'd love to hear from you.
          </p>
        </div>

        <div className="mx-auto max-w-lg">
          {submitted ? (
            <div className="flex flex-col items-center gap-4 rounded-2xl border border-rose-200 bg-rose-50 p-10 text-center">
              <CheckCircle className="h-12 w-12 text-rose-500" aria-hidden="true" />
              <h2 className="font-serif text-2xl font-semibold">Email Ready!</h2>
              <p className="text-muted-foreground">
                Your email app should have opened with your message pre-filled. Just hit send and we'll get back to you soon.
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
              className="space-y-5 rounded-2xl border border-border bg-white p-8 shadow-sm"
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
                  className="w-full rounded-lg border border-input bg-background px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-rose-400 focus:border-transparent"
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
                  className="w-full rounded-lg border border-input bg-background px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-rose-400 focus:border-transparent"
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
                  className="w-full rounded-lg border border-input bg-background px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-rose-400 focus:border-transparent resize-none"
                  aria-invalid={!!errors.message}
                />
                {errors.message && (
                  <p className="mt-1 text-xs text-destructive" role="alert">
                    {errors.message.message}
                  </p>
                )}
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className="flex w-full items-center justify-center gap-2 rounded-full bg-rose-500 py-3 text-sm font-semibold text-white hover:bg-rose-600 transition-colors disabled:opacity-50"
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
                href={SALON_INFO.facebook}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 text-sm font-medium text-foreground hover:text-rose-600 transition-colors"
              >
                <Facebook className="h-5 w-5" aria-hidden="true" />
                Facebook
              </a>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
