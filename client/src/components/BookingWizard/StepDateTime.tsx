import { useEffect, useState } from 'react';
import { DayPicker } from 'react-day-picker';
import 'react-day-picker/dist/style.css';
import { getAvailability } from '@/api/availability';
import { useBookingStore } from '@/store/bookingStore';
import { isSalonOpen, formatTime } from '@/utils/dates';
import { cn } from '@/utils/cn';

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

  // Fetch availability whenever date changes
  useEffect(() => {
    if (!selectedDate || !selectedService) return;

    setSlotsError(null);
    setLoadingSlots(true);
    setSlots([]);

    const stylistId =
      typeof selectedStylist === 'object' && selectedStylist
        ? selectedStylist.id
        : 'anyone';

    getAvailability({
      date: selectedDate,
      service_id: selectedService.id,
      stylist_id: stylistId === 'anyone' ? undefined : stylistId,
    })
      .then((res) => {
        setSlots(res.slots ?? []);
      })
      .catch((e) => setSlotsError(e.message))
      .finally(() => setLoadingSlots(false));
  }, [selectedDate, selectedService, selectedStylist]);

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
            className="w-full"
            classNames={{
              day_selected:
                'bg-rose-500 text-white hover:bg-rose-600 focus:bg-rose-600',
              day_today: 'font-bold text-rose-600',
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
