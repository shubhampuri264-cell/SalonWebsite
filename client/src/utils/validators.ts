import { z } from 'zod';

export const contactFormSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  email: z.string().email('Please enter a valid email address'),
  message: z.string().min(10, 'Message must be at least 10 characters').max(1000),
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
});

export type ContactFormValues = z.infer<typeof contactFormSchema>;
export type BookingContactValues = z.infer<typeof bookingContactSchema>;
