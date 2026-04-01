import { Router } from 'express';
import { z } from 'zod';
import { supabaseAdmin } from '../config/supabase';
import { createBooking, resolveAnyoneStylist } from '../services/bookingService';
import {
  sendBookingConfirmation,
  sendSalonNotification,
  sendCancellationConfirmation,
} from '../services/emailService';
import { bookingRateLimit } from '../middleware/rateLimiter';
import { generateCancellationToken } from '../utils/tokenUtils';
import type { Appointment } from '@luxe/shared';

export const appointmentsRouter = Router();

const createSchema = z.object({
  stylist_id: z.union([z.string().uuid(), z.literal('anyone')]),
  service_id: z.string().uuid(),
  client_name: z.string().min(2).max(100),
  client_email: z.string().email(),
  client_phone: z.string().min(7).max(20),
  appointment_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  appointment_time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  notes: z.string().max(500).optional(),
});

// POST /api/appointments — create a new booking
appointmentsRouter.post('/', bookingRateLimit, async (req, res, next) => {
  try {
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });
      return;
    }

    const payload = parsed.data;

    // Fetch service duration
    const { data: service, error: serviceError } = await supabaseAdmin
      .from('services')
      .select('id, name, duration_min')
      .eq('id', payload.service_id)
      .single();

    if (serviceError || !service) {
      res.status(404).json({ error: 'Service not found' });
      return;
    }

    // Resolve 'anyone' to a specific stylist
    let stylistId: string;
    if (payload.stylist_id === 'anyone') {
      stylistId = await resolveAnyoneStylist(
        payload.appointment_date,
        payload.appointment_time,
        service.duration_min
      );
    } else {
      stylistId = payload.stylist_id;
    }

    // Fetch stylist name for notifications
    const { data: stylist } = await supabaseAdmin
      .from('stylists')
      .select('name')
      .eq('id', stylistId)
      .single();

    const cancellationToken = generateCancellationToken();

    const appointment = await createBooking({
      service_id: payload.service_id,
      client_name: payload.client_name,
      client_email: payload.client_email,
      client_phone: payload.client_phone,
      appointment_date: payload.appointment_date,
      appointment_time: payload.appointment_time,
      notes: payload.notes,
      stylist_id: stylistId,
      duration_min: service.duration_min,
      cancellation_token: cancellationToken,
    });

    const stylistName = stylist?.name ?? 'Your stylist';

    // Fire-and-forget notifications
    void Promise.all([
      sendBookingConfirmation(appointment, service.name, stylistName).catch(
        (e) => console.error('[Email] Confirmation failed:', e)
      ),
      sendSalonNotification(appointment, service.name, stylistName).catch(
        (e) => console.error('[Email] Salon notification failed:', e)
      ),
    ]);

    res.status(201).json({
      appointment: {
        id: appointment.id,
        status: appointment.status,
        appointment_date: appointment.appointment_date,
        appointment_time: appointment.appointment_time,
      },
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/appointments/cancel?token= — client self-cancellation via email link
appointmentsRouter.get('/cancel', async (req, res, next) => {
  try {
    const token = req.query.token as string | undefined;

    if (!token) {
      res.status(400).json({ error: 'Missing cancellation token' });
      return;
    }

    const { data: appointment, error } = await supabaseAdmin
      .from('appointments')
      .select('*, services:service_id (name)')
      .eq('cancellation_token', token)
      .single();

    if (error || !appointment) {
      res.status(404).json({ error: 'Appointment not found' });
      return;
    }

    if ((appointment as Appointment).status === 'cancelled') {
      res.status(409).json({ error: 'Appointment is already cancelled' });
      return;
    }

    const { error: updateError } = await supabaseAdmin
      .from('appointments')
      .update({ status: 'cancelled' })
      .eq('id', (appointment as Appointment).id);

    if (updateError) throw updateError;

    const serviceName = (appointment as any).services?.name ?? 'appointment';

    void sendCancellationConfirmation(appointment as Appointment, serviceName).catch(
      (e) => console.error('[Email] Cancellation failed:', e)
    );

    res.json({ message: 'Appointment cancelled successfully' });
  } catch (err) {
    next(err);
  }
});
