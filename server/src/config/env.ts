import { z } from 'zod';

const envSchema = z.object({
  PORT: z.string().default('3001'),
  NODE_ENV: z
    .enum(['development', 'production', 'test'])
    .default('development'),
  SUPABASE_URL: z.string().url(),
  SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  SUPABASE_JWT_SECRET: z.string().min(1),
  RESEND_API_KEY: z.string().min(1),
  TWILIO_ENABLED: z
    .string()
    .transform((v) => v === 'true')
    .default('false'),
  TWILIO_ACCOUNT_SID: z.string().optional(),
  TWILIO_AUTH_TOKEN: z.string().optional(),
  TWILIO_PHONE_NUMBER: z.string().optional(),
  CLIENT_URL: z.string().url(),
  SALON_TIMEZONE: z.string().default('America/New_York'),
  ADMIN_EMAIL: z.string().email().optional(),
});

const result = envSchema.safeParse(process.env);

if (!result.success) {
  console.error('❌ Invalid environment variables:');
  console.error(result.error.flatten().fieldErrors);
  // Only hard-exit in local dev; in serverless, throw so the request gets a 500
  if (typeof process.env.VERCEL === 'undefined') {
    process.exit(1);
  }
  throw new Error('Missing required environment variables');
}

export const env = result.data;
