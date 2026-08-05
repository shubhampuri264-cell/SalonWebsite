// Shared email sending used by /api/appointments (booking) and
// /api/customer/resend-email. Centralized so the HTML templates and the
// "fail loudly when Resend rejects" wrapper live in one place.

import type { Resend } from 'resend';
import { unquote } from './env';
import { recordEmailSend } from './quota';

/**
 * Every kind of mail this app sends. All nine share Resend's 100/day free tier,
 * which is why sends are counted (see ./quota).
 *
 * Deliberately a closed union rather than a free string: the value is logged,
 * and two of the subjects below interpolate a customer's name
 * (`New Booking: ${client_name}`, `Website enquiry from ${msg.name}`). Logging
 * the subject would put PII into the function logs; logging this cannot.
 */
export type EmailKind =
  | 'booking_confirmation'
  | 'owner_notification'
  | 'reminder'
  | 'followup'
  | 'cancellation'
  | 'reschedule'
  | 'contact'
  | 'password_reset';

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

/**
 * Escapes a value for interpolation into HTML text or a quoted attribute.
 *
 * Every field below is attacker-controlled: client_name, client_email,
 * client_phone and notes come straight off the public booking form, and
 * service/stylist names come from the admin UI. Un-escaped, a booking with
 * the name `<img src=x onerror=...>` becomes live markup inside the owner's
 * inbox and inside the customer's confirmation.
 */
function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Strips CR/LF so an attacker-controlled value cannot inject extra SMTP
 * headers via the subject line.
 */
function safeSubject(value: string): string {
  return value.replace(/[\r\n]+/g, ' ').trim();
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
      <p>Hi ${escapeHtml(appointment.client_name)},</p>
      <p>Your appointment has been confirmed:</p>
      <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
        <tr><td style="padding: 8px; font-weight: bold;">Service:</td><td style="padding: 8px;">${escapeHtml(serviceName)}</td></tr>
        <tr><td style="padding: 8px; font-weight: bold;">Stylist:</td><td style="padding: 8px;">${escapeHtml(stylistName)}</td></tr>
        <tr><td style="padding: 8px; font-weight: bold;">Date & Time:</td><td style="padding: 8px;">${escapeHtml(dateTimeStr)}</td></tr>
        <tr><td style="padding: 8px; font-weight: bold;">Booking Ref:</td><td style="padding: 8px;">${escapeHtml(String(appointment.id).slice(0, 8).toUpperCase())}</td></tr>
      </table>
      <p><strong>Location:</strong> 39-46 Queens Blvd, Sunnyside, NY 11104</p>
      <p><a href="${escapeHtml(cancelUrl)}" style="color: #C9757A;">Cancel appointment</a></p>
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
        <tr><td style="padding: 8px; font-weight: bold;">Client:</td><td style="padding: 8px;">${escapeHtml(appointment.client_name)}</td></tr>
        <tr><td style="padding: 8px; font-weight: bold;">Email:</td><td style="padding: 8px;">${escapeHtml(appointment.client_email)}</td></tr>
        <tr><td style="padding: 8px; font-weight: bold;">Phone:</td><td style="padding: 8px;">${escapeHtml(appointment.client_phone ?? '-')}</td></tr>
        <tr><td style="padding: 8px; font-weight: bold;">Service:</td><td style="padding: 8px;">${escapeHtml(serviceName)}</td></tr>
        <tr><td style="padding: 8px; font-weight: bold;">Stylist:</td><td style="padding: 8px;">${escapeHtml(stylistName)}</td></tr>
        <tr><td style="padding: 8px; font-weight: bold;">Date & Time:</td><td style="padding: 8px;">${escapeHtml(dateTimeStr)}</td></tr>
        ${appointment.notes ? `<tr><td style="padding: 8px; font-weight: bold;">Notes:</td><td style="padding: 8px;">${escapeHtml(appointment.notes)}</td></tr>` : ''}
      </table>
    </div>
  `;
}

async function sendOne(
  resend: Resend,
  kind: EmailKind,
  to: string,
  subject: string,
  html: string,
  replyTo?: string,
): Promise<void> {
  const from = unquote(process.env.EMAIL_FROM) ?? 'Icon Studio <noreply@iconht.studio>';
  const devOverride = unquote(process.env.EMAIL_DEV_OVERRIDE);
  const actualRecipient = devOverride ?? to;
  const { data, error } = await resend.emails.send({
    from,
    to: actualRecipient,
    subject,
    html,
    ...(replyTo ? { replyTo } : {}),
  });
  if (error) {
    throw new Error(`Resend rejected send to ${to}: ${error.message ?? JSON.stringify(error)}`);
  }
  // Log the message ID so the Vercel function log proves delivery was accepted
  // by Resend (separate from whether the inbox actually receives it).
  console.log(`[Email] sent id=${data?.id ?? '?'} to=${actualRecipient}${devOverride ? ` (override, original=${to})` : ''}`);

  // Counted after a successful send, so the number tracks quota actually spent
  // rather than attempts. Never throws — see ./quota.
  await recordEmailSend(kind);
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
  await sendOne(resend, 'booking_confirmation', appointment.client_email, 'Your Icon Studio Appointment is Confirmed!', html);
}

function buildPasswordResetHtml(actionLink: string): string {
  return `
    <div style="font-family: Georgia, serif; max-width: 600px; margin: 0 auto; color: #333;">
      <h1 style="color: #C9757A;">Icon Studio</h1>
      <h2>Reset your password</h2>
      <p>We received a request to reset the password for your Icon Studio account.</p>
      <p>Click the button below to set a new password. This link expires in 1 hour and can only be used once.</p>
      <p style="margin: 24px 0;">
        <a href="${escapeHtml(actionLink)}" style="display: inline-block; background-color: #C9757A; color: #fff; padding: 12px 24px; border-radius: 999px; text-decoration: none; font-weight: 600;">
          Reset password
        </a>
      </p>
      <p style="color: #666; font-size: 14px;">If the button doesn't work, paste this link into your browser:</p>
      <p style="word-break: break-all; color: #666; font-size: 12px;">${escapeHtml(actionLink)}</p>
      <p style="color: #888; font-size: 12px; margin-top: 32px;">
        If you didn't request this, you can safely ignore this email — your password won't change.
      </p>
      <p style="color: #888; font-size: 12px;">Icon Studio · 39-46 Queens Blvd, Sunnyside, NY 11104 · (718) 255-6940</p>
    </div>
  `;
}

// Sends the password-reset email via Resend — bypassing Supabase's built-in
// SMTP, whose free tier (~3 emails/hour) is unusable in production. The
// `actionLink` should be the value returned by
// supabaseAdmin.auth.admin.generateLink({ type: 'recovery', ... }).
export async function sendPasswordResetEmail(toEmail: string, actionLink: string): Promise<void> {
  const resend = await getResend();
  if (!resend) return;
  const html = buildPasswordResetHtml(actionLink);
  await sendOne(resend, 'password_reset', toEmail, 'Reset your Icon Studio password', html);
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
  await sendOne(
    resend,
    'owner_notification',
    ownerEmail,
    safeSubject(`New Booking: ${appointment.client_name} — ${dateTimeStr}`),
    html,
  );
}

function buildReminderHtml(
  appointment: AppointmentEmailData,
  serviceName: string,
  stylistName: string,
  dateTimeStr: string,
): string {
  return `
    <div style="font-family: Georgia, serif; max-width: 600px; margin: 0 auto; color: #333;">
      <h1 style="color: #C9757A;">Icon Studio</h1>
      <h2>Appointment Reminder</h2>
      <p>Hi ${escapeHtml(appointment.client_name)},</p>
      <p>Just a reminder that your appointment is tomorrow:</p>
      <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
        <tr><td style="padding: 8px; font-weight: bold;">Service:</td><td style="padding: 8px;">${escapeHtml(serviceName)}</td></tr>
        <tr><td style="padding: 8px; font-weight: bold;">Stylist:</td><td style="padding: 8px;">${escapeHtml(stylistName)}</td></tr>
        <tr><td style="padding: 8px; font-weight: bold;">Date & Time:</td><td style="padding: 8px;">${escapeHtml(dateTimeStr)}</td></tr>
      </table>
      <p><strong>Address:</strong> 39-46 Queens Blvd, Sunnyside, NY 11104</p>
      <p style="color: #888; font-size: 12px; margin-top: 32px;">
        Icon Studio · 39-46 Queens Blvd, Sunnyside, NY 11104 · (718) 255-6940
      </p>
    </div>
  `;
}

/**
 * Day-before reminder, sent by /api/cron/reminders.
 *
 * Lives here rather than in server/src/services/emailService so the cron
 * function does not transitively import server/src/config/env, whose schema
 * hard-fails on seven variables the reminder job never uses. A missing
 * SUPABASE_JWT_SECRET should not silently stop reminder emails.
 */
export async function sendReminderEmail(
  appointment: AppointmentEmailData,
  serviceName: string,
  stylistName: string,
): Promise<void> {
  const resend = await getResend();
  if (!resend) return;
  const dateTimeStr = formatDateTime(appointment.appointment_date, appointment.appointment_time);
  const html = buildReminderHtml(appointment, serviceName, stylistName, dateTimeStr);
  await sendOne(resend, 'reminder', appointment.client_email, 'Reminder: Your Icon Studio Appointment is Tomorrow', html);
}

/**
 * The salon's Google review link, or undefined if it isn't configured yet.
 *
 * Exported so the follow-up cron can decide whether to run at all without
 * duplicating the unquote() workaround. Set this to the short "write a review"
 * URL from Google Business Profile (Home -> Ask for reviews), which looks like
 * https://g.page/r/XXXXXXXXXXXX/review and opens the review box directly. A
 * plain Maps listing URL also works but costs the customer two extra taps.
 */
export function getGoogleReviewUrl(): string | undefined {
  return unquote(process.env.GOOGLE_REVIEW_URL);
}

function buildFollowUpHtml(
  appointment: AppointmentEmailData,
  serviceName: string,
  stylistName: string,
  reviewUrl: string,
  bookUrl: string,
): string {
  return `
    <div style="font-family: Georgia, serif; max-width: 600px; margin: 0 auto; color: #333;">
      <h1 style="color: #C9757A;">Icon Studio</h1>
      <h2>Thanks for visiting, ${escapeHtml(appointment.client_name.split(' ')[0])}!</h2>
      <p>
        We hope you're loving your ${escapeHtml(serviceName.toLowerCase())}.
        ${escapeHtml(stylistName)} enjoyed having you in the chair.
      </p>
      <p>
        If you have a moment, a quick Google review helps enormously — it's how
        most of our new clients find us.
      </p>
      <p style="margin: 24px 0;">
        <a href="${escapeHtml(reviewUrl)}" style="display: inline-block; background-color: #C9757A; color: #fff; padding: 12px 24px; border-radius: 999px; text-decoration: none; font-weight: 600;">
          Leave a review
        </a>
      </p>
      <p style="color: #666; font-size: 14px;">
        Ready for your next visit? <a href="${escapeHtml(bookUrl)}" style="color: #C9757A;">Book online here</a>.
      </p>
      <p style="color: #888; font-size: 12px; margin-top: 32px;">
        You're receiving this because you had an appointment with us on
        ${escapeHtml(formatDateOnly(appointment.appointment_date))}. It's a
        one-time note about that visit — we won't email you about it again.
      </p>
      <p style="color: #888; font-size: 12px;">
        Icon Studio · 39-46 Queens Blvd, Sunnyside, NY 11104 · (718) 255-6940
      </p>
    </div>
  `;
}

function formatDateOnly(date: string): string {
  const [year, month, day] = date.split('-').map(Number);
  return new Date(year, month - 1, day).toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric',
  });
}

/**
 * Day-after follow-up asking for a Google review, sent by /api/cron/reminders.
 *
 * Deliberately asks for the review and nothing else. The rebook link is a plain
 * link, not a campaign — automated rebooking sequences were explicitly out of
 * scope, and burying the review CTA under offers is what makes these emails get
 * ignored.
 *
 * Callers must check getGoogleReviewUrl() first; the review link is the entire
 * point of the email, so there is no un-configured variant to fall back to.
 */
export async function sendFollowUpEmail(
  appointment: AppointmentEmailData,
  serviceName: string,
  stylistName: string,
  reviewUrl: string,
): Promise<void> {
  const resend = await getResend();
  if (!resend) return;
  const clientUrl = unquote(process.env.CLIENT_URL) ?? '';
  const html = buildFollowUpHtml(
    appointment,
    serviceName,
    stylistName,
    reviewUrl,
    `${clientUrl}/book`,
  );
  await sendOne(resend, 'followup', appointment.client_email, 'How was your visit to Icon Studio?', html);
}

function buildRescheduleHtml(
  appointment: AppointmentEmailData,
  serviceName: string,
  stylistName: string,
  previousDateTimeStr: string,
  newDateTimeStr: string,
  cancelUrl: string,
): string {
  return `
    <div style="font-family: Georgia, serif; max-width: 600px; margin: 0 auto; color: #333;">
      <h1 style="color: #C9757A;">Icon Studio</h1>
      <h2>Your Appointment Has Moved</h2>
      <p>Hi ${escapeHtml(appointment.client_name)},</p>
      <p>
        Your <strong>${escapeHtml(serviceName)}</strong> with
        ${escapeHtml(stylistName)} has been rescheduled. Here are the new details:
      </p>
      <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
        <tr>
          <td style="padding: 8px; font-weight: bold;">Was:</td>
          <td style="padding: 8px; color: #888; text-decoration: line-through;">${escapeHtml(previousDateTimeStr)}</td>
        </tr>
        <tr>
          <td style="padding: 8px; font-weight: bold;">Now:</td>
          <td style="padding: 8px; font-size: 17px;"><strong>${escapeHtml(newDateTimeStr)}</strong></td>
        </tr>
      </table>
      <p>
        There is nothing further you need to do — your original time has been
        released and this new one is confirmed.
      </p>
      <p style="color: #666; font-size: 14px;">
        Need to change it again or cancel?
        <a href="${escapeHtml(cancelUrl)}" style="color: #C9757A;">Cancel this appointment</a>
        or call us on (718) 255-6940.
      </p>
      <p style="color: #888; font-size: 12px; margin-top: 32px;">
        Icon Studio · 39-46 Queens Blvd, Sunnyside, NY 11104 · (718) 255-6940
      </p>
    </div>
  `;
}

/**
 * Sent when an appointment is moved, by PATCH /api/appointments.
 *
 * Deliberately ONE email rather than a cancellation plus a fresh confirmation.
 * A reschedule is implemented internally as cancel-then-rebook, and firing both
 * of those templates would tell the customer their appointment was cancelled
 * and then separately that they had booked something — which reads as a
 * double-booking or a mistake, and generates exactly the phone call the
 * feature was meant to avoid. It also halves the Resend quota each move costs.
 */
export async function sendRescheduleEmail(
  appointment: AppointmentEmailData,
  serviceName: string,
  stylistName: string,
  previousDate: string,
  previousTime: string,
): Promise<void> {
  const resend = await getResend();
  if (!resend) return;
  const clientUrl = unquote(process.env.CLIENT_URL) ?? '';
  const cancelUrl = `${clientUrl}/booking/cancel?token=${appointment.cancellation_token}`;
  const html = buildRescheduleHtml(
    appointment,
    serviceName,
    stylistName,
    formatDateTime(previousDate, previousTime),
    formatDateTime(appointment.appointment_date, appointment.appointment_time),
    cancelUrl,
  );
  await sendOne(
    resend,
    'reschedule',
    appointment.client_email,
    'Your Icon Studio Appointment Has Moved',
    html,
  );
}

function buildCancellationHtml(
  appointment: AppointmentEmailData,
  serviceName: string,
  dateTimeStr: string,
  bookUrl: string,
): string {
  return `
    <div style="font-family: Georgia, serif; max-width: 600px; margin: 0 auto; color: #333;">
      <h1 style="color: #C9757A;">Icon Studio</h1>
      <h2>Appointment Cancelled</h2>
      <p>Hi ${escapeHtml(appointment.client_name)},</p>
      <p>
        Your appointment for <strong>${escapeHtml(serviceName)}</strong> on
        ${escapeHtml(dateTimeStr)} has been cancelled. Nothing further is needed
        from you — the slot is released and you have not been charged.
      </p>
      <p style="margin: 24px 0;">
        <a href="${escapeHtml(bookUrl)}" style="display: inline-block; background-color: #C9757A; color: #fff; padding: 12px 24px; border-radius: 999px; text-decoration: none; font-weight: 600;">
          Book a new appointment
        </a>
      </p>
      <p style="color: #666; font-size: 14px;">
        Cancelled by mistake? Rebooking takes about a minute, or call us on
        (718) 255-6940 and we'll sort it out.
      </p>
      <p style="color: #888; font-size: 12px; margin-top: 32px;">
        Icon Studio · 39-46 Queens Blvd, Sunnyside, NY 11104 · (718) 255-6940
      </p>
    </div>
  `;
}

/**
 * Cancellation confirmation, sent by GET /api/appointments?token=...
 *
 * Doubles as the receipt for the cancel: without it a customer who clicks the
 * link on a flaky connection has no way to tell whether it went through, and
 * calls the salon to ask. Ported from the legacy Express template at
 * server/src/services/emailService.ts, with HTML escaping and a formatted
 * date (the original interpolated the raw `2026-08-15` / `14:30` columns).
 */
export async function sendCancellationEmail(
  appointment: AppointmentEmailData,
  serviceName: string,
): Promise<void> {
  const resend = await getResend();
  if (!resend) return;
  const clientUrl = unquote(process.env.CLIENT_URL) ?? '';
  const dateTimeStr = formatDateTime(appointment.appointment_date, appointment.appointment_time);
  const html = buildCancellationHtml(appointment, serviceName, dateTimeStr, `${clientUrl}/book`);
  await sendOne(
    resend,
    'cancellation',
    appointment.client_email,
    'Your Icon Studio Appointment Has Been Cancelled',
    html,
  );
}

export interface ContactMessage {
  name: string;
  email: string;
  message: string;
}

function buildContactHtml(msg: ContactMessage): string {
  // Escape first, then turn newlines into <br> — the other order would let a
  // sender inject markup by writing a tag across two lines.
  const body = escapeHtml(msg.message).replace(/\r?\n/g, '<br>');
  return `
    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; color: #333;">
      <h2>New message from the website contact form</h2>
      <table style="width: 100%; border-collapse: collapse; margin-bottom: 16px;">
        <tr><td style="padding: 8px; font-weight: bold;">Name:</td><td style="padding: 8px;">${escapeHtml(msg.name)}</td></tr>
        <tr><td style="padding: 8px; font-weight: bold;">Email:</td><td style="padding: 8px;">${escapeHtml(msg.email)}</td></tr>
      </table>
      <div style="padding: 16px; background: #faf7f7; border-left: 3px solid #C9757A;">
        ${body}
      </div>
      <p style="color: #888; font-size: 12px; margin-top: 24px;">
        Hit reply to answer ${escapeHtml(msg.name)} directly — replies go to
        ${escapeHtml(msg.email)}, not to the no-reply address.
      </p>
    </div>
  `;
}

/**
 * Website contact-form message, delivered to OWNER_EMAIL.
 *
 * Returns false when OWNER_EMAIL or RESEND_API_KEY is unset, so the endpoint
 * can tell the sender to phone instead. Reporting success while dropping the
 * message is the exact failure this endpoint replaces — the old form handed
 * off to `mailto:`, which silently loses the message on any device without a
 * registered mail handler.
 *
 * replyTo is the sender's address so the owner can just hit reply; From stays
 * the verified domain sender, because putting an arbitrary visitor address in
 * From fails DMARC and lands the mail in spam.
 */
export async function sendContactMessageEmail(msg: ContactMessage): Promise<boolean> {
  const ownerEmail = unquote(process.env.OWNER_EMAIL);
  if (!ownerEmail) {
    console.error('[Email] OWNER_EMAIL is not set — contact form message cannot be delivered');
    return false;
  }
  const resend = await getResend();
  if (!resend) return false;
  await sendOne(
    resend,
    'contact',
    ownerEmail,
    safeSubject(`Website enquiry from ${msg.name}`),
    buildContactHtml(msg),
    msg.email,
  );
  return true;
}
