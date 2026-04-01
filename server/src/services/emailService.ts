import { Resend } from 'resend';
import { env } from '../config/env';
import type { Appointment } from '@luxe/shared';

const resend = new Resend(env.RESEND_API_KEY);

const FROM_ADDRESS = 'Icon Studio <noreply@iconstudionyc.com>';

function formatDateTime(date: string, time: string): string {
  const [year, month, day] = date.split('-').map(Number);
  const [hour, minute] = time.split(':').map(Number);
  const d = new Date(year, month - 1, day, hour, minute);
  return d.toLocaleString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

export async function sendBookingConfirmation(
  appointment: Appointment,
  serviceName: string,
  stylistName: string
): Promise<void> {
  const cancelUrl = `${env.CLIENT_URL}/booking/cancel?token=${appointment.cancellation_token}`;
  const dateTimeStr = formatDateTime(
    appointment.appointment_date,
    appointment.appointment_time
  );

  await resend.emails.send({
    from: FROM_ADDRESS,
    to: appointment.client_email,
    subject: 'Your Icon Studio Appointment is Confirmed!',
    html: `
      <div style="font-family: Georgia, serif; max-width: 600px; margin: 0 auto; color: #333;">
        <h1 style="color: #C9757A;">Icon Studio</h1>
        <h2>Appointment Confirmed ✓</h2>
        <p>Hi ${appointment.client_name},</p>
        <p>Your appointment has been confirmed. Here are the details:</p>
        <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
          <tr><td style="padding: 8px; font-weight: bold;">Service:</td><td style="padding: 8px;">${serviceName}</td></tr>
          <tr><td style="padding: 8px; font-weight: bold;">Stylist:</td><td style="padding: 8px;">${stylistName}</td></tr>
          <tr><td style="padding: 8px; font-weight: bold;">Date & Time:</td><td style="padding: 8px;">${dateTimeStr}</td></tr>
          <tr><td style="padding: 8px; font-weight: bold;">Booking Ref:</td><td style="padding: 8px;">${appointment.id.slice(0, 8).toUpperCase()}</td></tr>
        </table>
        <p><strong>Location:</strong> 123 Rose Gold Ave, New York, NY 10001</p>
        <p style="margin-top: 24px;">
          Need to cancel?
          <a href="${cancelUrl}" style="color: #C9757A;">Click here to cancel your appointment</a>
        </p>
        <p style="color: #888; font-size: 12px; margin-top: 32px;">
          Icon Studio · 123 Rose Gold Ave, New York, NY 10001 · (212) 555-0100
        </p>
      </div>
    `,
  });
}

export async function sendSalonNotification(
  appointment: Appointment,
  serviceName: string,
  stylistName: string
): Promise<void> {
  if (!env.ADMIN_EMAIL) return;

  const dateTimeStr = formatDateTime(
    appointment.appointment_date,
    appointment.appointment_time
  );

  await resend.emails.send({
    from: FROM_ADDRESS,
    to: env.ADMIN_EMAIL,
    subject: `New Booking: ${appointment.client_name} — ${dateTimeStr}`,
    html: `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>New Appointment Booked</h2>
        <table style="width: 100%; border-collapse: collapse;">
          <tr><td style="padding: 8px; font-weight: bold;">Client:</td><td style="padding: 8px;">${appointment.client_name}</td></tr>
          <tr><td style="padding: 8px; font-weight: bold;">Email:</td><td style="padding: 8px;">${appointment.client_email}</td></tr>
          <tr><td style="padding: 8px; font-weight: bold;">Phone:</td><td style="padding: 8px;">${appointment.client_phone}</td></tr>
          <tr><td style="padding: 8px; font-weight: bold;">Service:</td><td style="padding: 8px;">${serviceName}</td></tr>
          <tr><td style="padding: 8px; font-weight: bold;">Stylist:</td><td style="padding: 8px;">${stylistName}</td></tr>
          <tr><td style="padding: 8px; font-weight: bold;">Date & Time:</td><td style="padding: 8px;">${dateTimeStr}</td></tr>
          ${appointment.notes ? `<tr><td style="padding: 8px; font-weight: bold;">Notes:</td><td style="padding: 8px;">${appointment.notes}</td></tr>` : ''}
        </table>
      </div>
    `,
  });
}

export async function sendCancellationConfirmation(
  appointment: Appointment,
  serviceName: string
): Promise<void> {
  await resend.emails.send({
    from: FROM_ADDRESS,
    to: appointment.client_email,
    subject: 'Your Icon Studio Appointment Has Been Cancelled',
    html: `
      <div style="font-family: Georgia, serif; max-width: 600px; margin: 0 auto; color: #333;">
        <h1 style="color: #C9757A;">Icon Studio</h1>
        <h2>Appointment Cancelled</h2>
        <p>Hi ${appointment.client_name},</p>
        <p>Your appointment for <strong>${serviceName}</strong> on ${appointment.appointment_date} at ${appointment.appointment_time} has been cancelled.</p>
        <p>We hope to see you again soon!
          <a href="${env.CLIENT_URL}/book" style="color: #C9757A;">Book a new appointment</a>
        </p>
        <p style="color: #888; font-size: 12px; margin-top: 32px;">
          Icon Studio · 123 Rose Gold Ave, New York, NY 10001 · (212) 555-0100
        </p>
      </div>
    `,
  });
}

export async function sendReminderEmail(
  appointment: Appointment,
  serviceName: string,
  stylistName: string
): Promise<void> {
  const dateTimeStr = formatDateTime(
    appointment.appointment_date,
    appointment.appointment_time
  );

  await resend.emails.send({
    from: FROM_ADDRESS,
    to: appointment.client_email,
    subject: 'Reminder: Your Icon Studio Appointment is Tomorrow',
    html: `
      <div style="font-family: Georgia, serif; max-width: 600px; margin: 0 auto; color: #333;">
        <h1 style="color: #C9757A;">Icon Studio</h1>
        <h2>Appointment Reminder</h2>
        <p>Hi ${appointment.client_name},</p>
        <p>Just a reminder that your appointment is tomorrow:</p>
        <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
          <tr><td style="padding: 8px; font-weight: bold;">Service:</td><td style="padding: 8px;">${serviceName}</td></tr>
          <tr><td style="padding: 8px; font-weight: bold;">Stylist:</td><td style="padding: 8px;">${stylistName}</td></tr>
          <tr><td style="padding: 8px; font-weight: bold;">Date & Time:</td><td style="padding: 8px;">${dateTimeStr}</td></tr>
        </table>
        <p><strong>Address:</strong> 123 Rose Gold Ave, New York, NY 10001</p>
        <p style="color: #888; font-size: 12px; margin-top: 32px;">
          Icon Studio · 123 Rose Gold Ave, New York, NY 10001 · (212) 555-0100
        </p>
      </div>
    `,
  });
}
