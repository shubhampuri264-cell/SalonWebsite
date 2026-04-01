import { env } from '../config/env';
import type { Appointment } from '@luxe/shared';

let twilioClient: import('twilio').Twilio | null = null;

function getClient() {
  if (!env.TWILIO_ENABLED) return null;
  if (twilioClient) return twilioClient;

  if (!env.TWILIO_ACCOUNT_SID || !env.TWILIO_AUTH_TOKEN) {
    console.warn('[SMS] Twilio credentials missing — SMS disabled');
    return null;
  }

  // Lazy import to avoid loading Twilio when disabled
  const twilio = require('twilio');
  twilioClient = twilio(env.TWILIO_ACCOUNT_SID, env.TWILIO_AUTH_TOKEN);
  return twilioClient;
}

async function sendSms(to: string, body: string): Promise<void> {
  const client = getClient();
  if (!client || !env.TWILIO_PHONE_NUMBER) return;

  try {
    await client.messages.create({ from: env.TWILIO_PHONE_NUMBER, to, body });
  } catch (err) {
    console.error('[SMS] Failed to send:', err);
  }
}

export async function sendBookingConfirmationSms(
  appointment: Appointment,
  serviceName: string
): Promise<void> {
  if (!appointment.client_phone) return;

  const cancelUrl = `${env.CLIENT_URL}/booking/cancel?token=${appointment.cancellation_token}`;
  await sendSms(
    appointment.client_phone,
    `Icon Studio: Your ${serviceName} appointment on ${appointment.appointment_date} at ${appointment.appointment_time} is confirmed! Cancel: ${cancelUrl}`
  );
}

export async function sendReminderSms(
  appointment: Appointment,
  serviceName: string
): Promise<void> {
  if (!appointment.client_phone) return;

  await sendSms(
    appointment.client_phone,
    `Icon Studio reminder: Your ${serviceName} appointment is tomorrow at ${appointment.appointment_time}. 123 Rose Gold Ave, NYC.`
  );
}

export async function sendCancellationSms(
  appointment: Appointment
): Promise<void> {
  if (!appointment.client_phone) return;

  await sendSms(
    appointment.client_phone,
    `Icon Studio: Your appointment on ${appointment.appointment_date} at ${appointment.appointment_time} has been cancelled. Book again at ${env.CLIENT_URL}/book`
  );
}
