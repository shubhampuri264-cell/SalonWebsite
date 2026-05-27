import { useCallback, useEffect, useState } from 'react';
import { DayPicker } from 'react-day-picker';
import { getAvailability } from '@/api/availability';
import { useBookingStore } from '@/store/bookingStore';
import { isSalonOpen, formatTime, formatDate } from '@/utils/dates';
import { cn } from '@/utils/cn';
import { supabase } from '@/api/supabase';

const POLL_INTERVAL_MS = 30_000;

export default function StepDateTime() {
  const {
    selectedService,
    selectedStylist,
    selectedDate,
    selectedTime,
    setDateTime,
    nextStep,
    prevStep,
  } = useBookingStore();

  const [slots, setSlots] = useState<{ time: string; availableStylistIds: string[] }[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [slotsError, setSlotsError] = useState<string | null>(null);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const selectedDateObj = selectedDate
    ? new Date(selectedDate + 'T12:00:00')
    : undefined;

  const stylistId =
    typeof selectedStylist === 'object' && selectedStylist
      ? selectedStylist.id
      : 'anyone';

  /**
   * Fetches availability for the currently selected date/service/stylist.
   * Pass showSpinner=true for user-triggered loads (date change, first mount).
   * Pass showSpinner=false for background refreshes (Realtime events, poll ticks)
   * so the UI does not flash an empty state.
   */
  const fetchSlots = useCallback(
    (showSpinner: boolean) => {
      if (!selectedDate || !selectedService) return;

      setSlotsError(null);
      if (showSpinner) setLoadingSlots(true);

      getAvailability({
        date: selectedDate,
        service_id: selectedService.id,
        stylist_id: stylistId === 'anyone' ? undefined : stylistId,
      })
        .then((res) => {
          const newSlots = res.slots ?? [];
          setSlots(newSlots);

          // If the currently selected time was taken by another user during this
          // refresh, clear it so they cannot accidentally submit a stale slot.
          const { selectedTime: currentTime } = useBookingStore.getState();
          if (currentTime && !newSlots.some((s) => s.time === currentTime)) {
            useBookingStore.getState().setDateTime(selectedDate, '');
          }
        })
        .catch((e) => setSlotsError(e.message))
        .finally(() => {
          if (showSpinner) setLoadingSlots(false);
        });
    },
    [selectedDate, selectedService, stylistId]
  );

  // Initial fetch (with spinner + slot reset) whenever inputs change.
  // fetchSlots captures the same deps so we only need it in the array —
  // it will be a new reference any time date/service/stylist changes.
  useEffect(() => {
    setSlots([]);
    fetchSlots(true);
  }, [fetchSlots]);

  // Supabase Realtime subscription for instant cross-user slot updates,
  // with a 30-second polling fallback in case Realtime is unavailable.
  useEffect(() => {
    if (!selectedDate || !selectedService) return;

    const channel = supabase
      .channel(`slots:${selectedDate}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'appointments',
          filter: `appointment_date=eq.${selectedDate}`,
        },
        () => fetchSlots(false)
      )
      .subscribe();

    const interval = setInterval(() => fetchSlots(false), POLL_INTERVAL_MS);

    return () => {
      void supabase.removeChannel(channel);
      clearInterval(interval);
    };
  }, [fetchSlots, selectedDate, selectedService]);

  const handleDaySelect = (day: Date | undefined) => {
    if (!day) return;
    const dateStr = day.toISOString().slice(0, 10);
    // Reset time when date changes
    if (dateStr !== selectedDate) {
      setDateTime(dateStr, '');
    }
  };

  const handleTimeSelect = (time: string) => {
    if (selectedDate) {
      setDateTime(selectedDate, time);
      nextStep();
    }
  };

  return (
    <div>
      <h2 className="font-serif text-2xl font-semibold">Pick a Date & Time</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Select your preferred date, then choose an available time slot.
      </p>

      <div className="mt-6 grid gap-6 md:grid-cols-2">
        {/* Calendar */}
        <div className="rounded-xl border border-border bg-white p-4">
          <DayPicker
            mode="single"
            selected={selectedDateObj}
            onSelect={handleDaySelect}
            disabled={[
              { before: today },
              (date) => !isSalonOpen(date),
            ]}
            showOutsideDays={false}
            classNames={{
              months: 'w-full',
              month: 'w-full',
              caption: 'flex justify-center items-center mb-4 relative',
              caption_label: 'text-sm font-semibold',
              nav: 'flex items-center gap-1',
              nav_button:
                'h-7 w-7 flex items-center justify-center rounded-md border border-border hover:bg-muted transition-colors',
              nav_button_previous: 'absolute left-0',
              nav_button_next: 'absolute right-0',
              table: 'w-full border-collapse',
              head_row: 'flex w-full',
              head_cell:
                'flex-1 text-center text-xs font-medium text-muted-foreground pb-2',
              row: 'flex w-full mt-1',
              cell: 'flex-1 text-center',
              day: 'mx-auto h-9 w-9 flex items-center justify-center rounded-full text-sm transition-colors hover:bg-rose-50 hover:text-rose-600 cursor-pointer',
              day_selected:
                'bg-rose-500 text-white hover:bg-rose-600 hover:text-white font-semibold',
              day_today: 'font-bold text-rose-600',
              day_disabled: 'text-muted-foreground opacity-40 cursor-default hover:bg-transparent hover:text-muted-foreground',
              day_outside: 'hidden',
            }}
          />
        </div>

        {/* Time slots */}
        <div>
          {!selectedDate && (
            <p className="text-sm text-muted-foreground">
              Select a date to see available times.
            </p>
          )}

          {selectedDate && loadingSlots && (
            <div className="grid grid-cols-3 gap-2">
              {Array.from({ length: 9 }).map((_, i) => (
                <div
                  key={i}
                  className="h-10 animate-pulse rounded-lg bg-muted"
                />
              ))}
            </div>
          )}

          {selectedDate && !loadingSlots && slotsError && (
            <p className="text-sm text-destructive">{slotsError}</p>
          )}

          {selectedDate && !loadingSlots && !slotsError && slots.length === 0 && (
            <p className="text-sm text-muted-foreground">
              No availability on this date. Please choose another day.
            </p>
          )}

          {selectedDate && !loadingSlots && slots.length > 0 && (
            <div>
              <p className="mb-3 text-sm font-medium">
                Available times on {formatDate(selectedDate!)}
              </p>
              <div className="grid grid-cols-3 gap-2">
                {slots.map(({ time }) => (
                  <button
                    key={time}
                    onClick={() => handleTimeSelect(time)}
                    className={cn(
                      'rounded-lg border py-2 text-sm font-medium transition-all hover:border-rose-400 hover:bg-rose-50',
                      selectedTime === time
                        ? 'border-rose-500 bg-rose-500 text-white'
                        : 'border-border bg-white'
                    )}
                    aria-pressed={selectedTime === time}
                  >
                    {formatTime(time)}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      <button
        onClick={prevStep}
        className="mt-6 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        ← Back
      </button>
    </div>
  );
}
