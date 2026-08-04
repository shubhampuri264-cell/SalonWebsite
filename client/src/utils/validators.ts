import { z } from 'zod';

export const contactFormSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters').max(100),
  email: z.string().email('Please enter a valid email address').max(254),
  message: z.string().min(10, 'Message must be at least 10 characters').max(1000),
  // Honeypot — hidden from humans, so this is always empty for a real
  // submission. Deliberately unvalidated: rejecting a filled value here would
  // show the bot an error naming the field. The server decides, silently.
  website: z.string().max(200).optional(),
});

export const bookingContactSchema = z.object({
  client_name: z.string().min(2, 'Name must be at least 2 characters').max(100),
  client_email: z.string().email('Please enter a valid email address'),
  client_phone: z
    .string()
    .min(10, 'Please enter a valid phone number')
    .max(20)
    .regex(/^[\d\s\-\+\(\)]+$/, 'Please enter a valid phone number'),
  notes: z.string().max(500, 'Notes must be under 500 characters').optional(),
  terms: z.literal(true, {
    errorMap: () => ({ message: 'You must accept the terms to continue' }),
  }),
  // Optional opt-in, unlike `terms`. z.literal(true) would make the box
  // mandatory, which is exactly what consent must not be.
  marketing_consent: z.boolean().optional(),
});

export type ContactFormValues = z.infer<typeof contactFormSchema>;
export type BookingContactValues = z.infer<typeof bookingContactSchema>;
