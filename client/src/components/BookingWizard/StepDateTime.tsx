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
    eligibleStylists,
    selectedDate,
    selectedTime,
    setDateTime,
    nextStep,
    goToStep,
  } = useBookingStore();

  const [slots, setSlots] = useState<{ time: string }[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [slotsError, setSlotsError] = useState<string | null>(null);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const selectedDateObj = selectedDate
    ? new Date(selectedDate + 'T12:00:00')
    : undefined;

  const stylistId = selectedStylist?.id ?? null;

  // Back skips the stylist step when it was skipped on the way in — with one
  // eligible stylist there is nothing there to change.
  const goBack = () => goToStep(eligibleStylists.length > 1 ? 1 : 0);

  /**
   * Fetches availability for the currently selected date/service/stylist.
   * Pass showSpinner=true for user-triggered loads (date change, first mount).
   * Pass showSpinner=false for background refreshes (Realtime events, poll ticks)
   * so the UI does not flash an empty state.
   */
  const fetchSlots = useCallback(
    (showSpinner: boolean) => {
      if (!selectedDate || !selectedService || !stylistId) return;

      setSlotsError(null);
      if (showSpinner) setLoadingSlots(true);

      getAvailability({
        date: selectedDate,
        service_id: selectedService.id,
        stylist_id: stylistId,
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
        {selectedStylist
          ? `Select your preferred date, then choose a time with ${selectedStylist.name}.`
          : 'Select your preferred date, then choose an available time slot.'}
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
            // v9+ renders nav as a sibling above the month, not inside the
            // caption — the absolute overlay recreates the old centered-caption
            // layout. Modifier classes (selected/today/disabled) land on the
            // td, so the visible day button is styled through [&>button].
            classNames={{
              months: 'w-full relative',
              month: 'w-full',
              nav: 'absolute inset-x-0 top-0 flex items-center justify-between',
              button_previous:
                'h-7 w-7 flex items-center justify-center rounded-md border border-border hover:bg-muted transition-colors [&_svg]:h-4 [&_svg]:w-4 [&_svg]:fill-current',
              button_next:
                'h-7 w-7 flex items-center justify-center rounded-md border border-border hover:bg-muted transition-colors [&_svg]:h-4 [&_svg]:w-4 [&_svg]:fill-current',
              month_caption: 'h-7 flex justify-center items-center mb-4',
              caption_label: 'text-sm font-semibold',
              month_grid: 'w-full border-collapse',
              weekdays: 'flex w-full',
              weekday:
                'flex-1 text-center text-xs font-medium text-muted-foreground pb-2',
              week: 'flex w-full mt-1',
              day: 'flex-1 text-center p-0',
              day_button:
                'mx-auto h-9 w-9 flex items-center justify-center rounded-full text-sm transition-colors hover:bg-rose-50 hover:text-rose-600 cursor-pointer',
              selected:
                '[&>button]:bg-rose-500 [&>button]:text-white [&>button]:font-semibold [&>button:hover]:bg-rose-600 [&>button:hover]:text-white',
              today: '[&>button]:font-bold [&>button]:text-rose-600',
              disabled:
                '[&>button]:text-muted-foreground [&>button]:opacity-40 [&>button]:cursor-default [&>button:hover]:bg-transparent [&>button:hover]:text-muted-foreground',
              outside: 'hidden',
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
        onClick={goBack}
        className="mt-6 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        ← Back
      </button>
    </div>
  );
}
