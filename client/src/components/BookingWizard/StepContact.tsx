import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useNavigate } from 'react-router-dom';
import { useBookingStore } from '@/store/bookingStore';
import { bookingContactSchema, type BookingContactValues } from '@/utils/validators';
import { createAppointment } from '@/api/appointments';
import { ApiError } from '@/api/client';
import { formatDate, formatTime } from '@/utils/dates';

export default function StepContact() {
  const navigate = useNavigate();
  const [submitError, setSubmitError] = useState<string | null>(null);
  const {
    selectedService,
    selectedStylist,
    selectedDate,
    selectedTime,
    setContactInfo,
    prevStep,
    reset,
  } = useBookingStore();

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<BookingContactValues>({
    resolver: zodResolver(bookingContactSchema),
  });

  const stylistId =
    typeof selectedStylist === 'object' && selectedStylist
      ? selectedStylist.id
      : 'anyone';

  const onSubmit = async (data: BookingContactValues) => {
    if (!selectedService || !selectedDate || !selectedTime) return;

    setSubmitError(null);
    setContactInfo({
      client_name: data.client_name,
      client_email: data.client_email,
      client_phone: data.client_phone,
      notes: data.notes ?? '',
    });

    try {
      const result = await createAppointment({
        service_id: selectedService.id,
        stylist_id: stylistId,
        client_name: data.client_name,
        client_email: data.client_email,
        client_phone: data.client_phone,
        appointment_date: selectedDate,
        appointment_time: selectedTime,
        notes: data.notes,
      });

      reset();
      navigate('/booking/confirmation', {
        state: { appointment: result.appointment },
      });
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setSubmitError(
          'This time slot was just taken. Please go back and choose a different time.'
        );
      } else {
        setSubmitError('Something went wrong. Please try again.');
      }
    }
  };

  return (
    <div>
      <h2 className="font-serif text-2xl font-semibold">Your Details</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Almost done! Enter your contact information to confirm.
      </p>

      {/* Booking summary */}
      {selectedService && selectedDate && selectedTime && (
        <div className="mt-4 rounded-xl border border-rose-100 bg-rose-50 p-4 text-sm">
          <p className="font-medium text-rose-700">Booking Summary</p>
          <ul className="mt-2 space-y-1 text-rose-600">
            <li>
              <strong>Service:</strong> {selectedService.name}
            </li>
            <li>
              <strong>Date:</strong> {formatDate(selectedDate)}
            </li>
            <li>
              <strong>Time:</strong> {formatTime(selectedTime)}
            </li>
            <li>
              <strong>Stylist:</strong>{' '}
              {typeof selectedStylist === 'object' && selectedStylist
                ? selectedStylist.name
                : 'Anyone Available'}
            </li>
          </ul>
        </div>
      )}

      <form
        onSubmit={handleSubmit(onSubmit)}
        className="mt-6 space-y-4"
        noValidate
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="client_name" className="mb-1 block text-sm font-medium">
              Full Name <span className="text-destructive">*</span>
            </label>
            <input
              {...register('client_name')}
              id="client_name"
              type="text"
              placeholder="Jane Smith"
              className="w-full rounded-lg border border-input px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-rose-400 focus:border-transparent"
              aria-invalid={!!errors.client_name}
            />
            {errors.client_name && (
              <p className="mt-1 text-xs text-destructive" role="alert">
                {errors.client_name.message}
              </p>
            )}
          </div>

          <div>
            <label htmlFor="client_phone" className="mb-1 block text-sm font-medium">
              Phone <span className="text-destructive">*</span>
            </label>
            <input
              {...register('client_phone')}
              id="client_phone"
              type="tel"
              placeholder="(718) 255-6940"
              className="w-full rounded-lg border border-input px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-rose-400 focus:border-transparent"
              aria-invalid={!!errors.client_phone}
            />
            {errors.client_phone && (
              <p className="mt-1 text-xs text-destructive" role="alert">
                {errors.client_phone.message}
              </p>
            )}
          </div>
        </div>

        <div>
          <label htmlFor="client_email" className="mb-1 block text-sm font-medium">
            Email <span className="text-destructive">*</span>
          </label>
          <input
            {...register('client_email')}
            id="client_email"
            type="email"
            placeholder="jane@example.com"
            className="w-full rounded-lg border border-input px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-rose-400 focus:border-transparent"
            aria-invalid={!!errors.client_email}
          />
          {errors.client_email && (
            <p className="mt-1 text-xs text-destructive" role="alert">
              {errors.client_email.message}
            </p>
          )}
        </div>

        <div>
          <label htmlFor="notes" className="mb-1 block text-sm font-medium">
            Notes (optional)
          </label>
          <textarea
            {...register('notes')}
            id="notes"
            rows={3}
            placeholder="Any special requests or notes for your stylist..."
            className="w-full rounded-lg border border-input px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-rose-400 focus:border-transparent resize-none"
          />
        </div>

        <div className="flex items-start gap-3">
          <input
            {...register('terms')}
            id="terms"
            type="checkbox"
            className="mt-0.5 h-4 w-4 rounded accent-rose-500"
            aria-invalid={!!errors.terms}
          />
          <label htmlFor="terms" className="text-sm text-muted-foreground">
            I agree to the cancellation policy. Appointments cancelled less than 24 hours
            in advance may be subject to a late cancellation fee.
          </label>
        </div>
        {errors.terms && (
          <p className="text-xs text-destructive" role="alert">
            {errors.terms.message}
          </p>
        )}

        {submitError && (
          <div
            className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
            role="alert"
          >
            {submitError}
          </div>
        )}

        <div className="flex gap-3 pt-2">
          <button
            type="button"
            onClick={prevStep}
            className="rounded-full border border-border px-6 py-2.5 text-sm font-medium hover:bg-muted transition-colors"
          >
            Back
          </button>
          <button
            type="submit"
            disabled={isSubmitting}
            className="flex-1 rounded-full bg-rose-500 py-2.5 text-sm font-semibold text-white hover:bg-rose-600 transition-colors disabled:opacity-50"
          >
            {isSubmitting ? 'Confirming...' : 'Confirm Booking'}
          </button>
        </div>
      </form>
    </div>
  );
}
