// Shared email sending used by /api/appointments (booking) and
// /api/customer/resend-email. Centralized so the HTML templates and the
// "fail loudly when Resend rejects" wrapper live in one place.

import type { Resend } from 'resend';

export interface AppointmentEmailData {
  id: string;
  client_name: string;
  client_email: string;
  client_phone?: string | null;
  appointment_date: string;
  appointment_time: string;
  cancellation_token: string;
  notes?: string | null;
}

let cachedResend: Resend | null = null;
let warnedMissingKey = false;

// Strip surrounding single/double quotes from an env var value.
// Vercel's env var UI stores values verbatim — including any quotes that
// were copy-pasted from a .env file. dotenv (local) strips them; Vercel
// doesn't. This already burned us once with UPSTASH_REDIS_REST_URL.
function unquote(s: string | undefined): string | undefined {
  if (!s) return s;
  return s.replace(/^['"]|['"]$/g, '');
}

async function getResend(): Promise<Resend | null> {
  const key = unquote(process.env.RESEND_API_KEY);
  if (!key || key.startsWith('re_placeholder')) {
    // Warn once per cold start so a misconfigured Vercel deploy is immediately
    // obvious in the logs instead of looking like "emails just don't work".
    if (!warnedMissingKey) {
      console.warn('[Email] RESEND_API_KEY missing or placeholder — email sending disabled');
      warnedMissingKey = true;
    }
    return null;
  }
  if (cachedResend) return cachedResend;
  const { Resend: ResendCtor } = await import('resend');
  cachedResend = new ResendCtor(key);
  return cachedResend;
}

function formatDateTime(date: string, time: string): string {
  const [year, month, day] = date.split('-').map(Number);
  const [hour, minute] = time.split(':').map(Number);
  const d = new Date(year, month - 1, day, hour, minute);
  return d.toLocaleString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    hour: 'numeric', minute: '2-digit', hour12: true,
  });
}

function buildCustomerHtml(
  appointment: AppointmentEmailData,
  serviceName: string,
  stylistName: string,
  cancelUrl: string,
  dateTimeStr: string,
): string {
  return `
    <div style="font-family: Georgia, serif; max-width: 600px; margin: 0 auto; color: #333;">
      <h1 style="color: #C9757A;">Icon Studio</h1>
      <h2>Appointment Confirmed</h2>
      <p>Hi ${appointment.client_name},</p>
      <p>Your appointment has been confirmed:</p>
      <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
        <tr><td style="padding: 8px; font-weight: bold;">Service:</td><td style="padding: 8px;">${serviceName}</td></tr>
        <tr><td style="padding: 8px; font-weight: bold;">Stylist:</td><td style="padding: 8px;">${stylistName}</td></tr>
        <tr><td style="padding: 8px; font-weight: bold;">Date & Time:</td><td style="padding: 8px;">${dateTimeStr}</td></tr>
        <tr><td style="padding: 8px; font-weight: bold;">Booking Ref:</td><td style="padding: 8px;">${String(appointment.id).slice(0, 8).toUpperCase()}</td></tr>
      </table>
      <p><strong>Location:</strong> 39-46 Queens Blvd, Sunnyside, NY 11104</p>
      <p><a href="${cancelUrl}" style="color: #C9757A;">Cancel appointment</a></p>
      <p style="color: #888; font-size: 12px; margin-top: 32px;">Icon Studio · 39-46 Queens Blvd, Sunnyside, NY 11104 · (718) 255-6940</p>
    </div>
  `;
}

function buildOwnerHtml(
  appointment: AppointmentEmailData,
  serviceName: string,
  stylistName: string,
  dateTimeStr: string,
): string {
  return `
    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
      <h2>New Appointment Booked</h2>
      <table style="width: 100%; border-collapse: collapse;">
        <tr><td style="padding: 8px; font-weight: bold;">Client:</td><td style="padding: 8px;">${appointment.client_name}</td></tr>
        <tr><td style="padding: 8px; font-weight: bold;">Email:</td><td style="padding: 8px;">${appointment.client_email}</td></tr>
        <tr><td style="padding: 8px; font-weight: bold;">Phone:</td><td style="padding: 8px;">${appointment.client_phone ?? '-'}</td></tr>
        <tr><td style="padding: 8px; font-weight: bold;">Service:</td><td style="padding: 8px;">${serviceName}</td></tr>
        <tr><td style="padding: 8px; font-weight: bold;">Stylist:</td><td style="padding: 8px;">${stylistName}</td></tr>
        <tr><td style="padding: 8px; font-weight: bold;">Date & Time:</td><td style="padding: 8px;">${dateTimeStr}</td></tr>
        ${appointment.notes ? `<tr><td style="padding: 8px; font-weight: bold;">Notes:</td><td style="padding: 8px;">${appointment.notes}</td></tr>` : ''}
      </table>
    </div>
  `;
}

async function sendOne(resend: Resend, to: string, subject: string, html: string): Promise<void> {
  const from = unquote(process.env.EMAIL_FROM) ?? 'Icon Studio <noreply@iconht.studio>';
  const devOverride = unquote(process.env.EMAIL_DEV_OVERRIDE);
  const actualRecipient = devOverride ?? to;
  const { data, error } = await resend.emails.send({
    from,
    to: actualRecipient,
    subject,
    html,
  });
  if (error) {
    throw new Error(`Resend rejected send to ${to}: ${error.message ?? JSON.stringify(error)}`);
  }
  // Log the message ID so the Vercel function log proves delivery was accepted
  // by Resend (separate from whether the inbox actually receives it).
  console.log(`[Email] sent id=${data?.id ?? '?'} to=${actualRecipient}${devOverride ? ` (override, original=${to})` : ''}`);
}

export async function sendBookingConfirmationEmail(
  appointment: AppointmentEmailData,
  serviceName: string,
  stylistName: string,
): Promise<void> {
  const resend = await getResend();
  if (!resend) return;
  const clientUrl = process.env.CLIENT_URL ?? '';
  const cancelUrl = `${clientUrl}/booking/cancel?token=${appointment.cancellation_token}`;
  const dateTimeStr = formatDateTime(appointment.appointment_date, appointment.appointment_time);
  const html = buildCustomerHtml(appointment, serviceName, stylistName, cancelUrl, dateTimeStr);
  await sendOne(resend, appointment.client_email, 'Your Icon Studio Appointment is Confirmed!', html);
}

export async function sendOwnerNotificationEmail(
  appointment: AppointmentEmailData,
  serviceName: string,
  stylistName: string,
): Promise<void> {
  const ownerEmail = unquote(process.env.OWNER_EMAIL);
  if (!ownerEmail) return;
  const resend = await getResend();
  if (!resend) return;
  const dateTimeStr = formatDateTime(appointment.appointment_date, appointment.appointment_time);
  const html = buildOwnerHtml(appointment, serviceName, stylistName, dateTimeStr);
  await sendOne(resend, ownerEmail, `New Booking: ${appointment.client_name} — ${dateTimeStr}`, html);
}
