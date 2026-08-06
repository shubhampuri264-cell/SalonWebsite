import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { Service, Stylist } from '@luxe/shared';

interface ContactInfo {
  client_name: string;
  client_email: string;
  client_phone: string;
  notes: string;
}

interface BookingState {
  currentStep: 0 | 1 | 2 | 3;
  selectedService: Service | null;
  selectedStylist: Stylist | null;
  /**
   * Stylists who perform `selectedService`, resolved in StepService the moment
   * a service is picked. Held here rather than fetched in StepStylist because
   * the wizard has to know how many there are *before* deciding whether to show
   * the stylist step at all — and because the Back button on the date step
   * needs the same answer.
   */
  eligibleStylists: Stylist[];
  selectedDate: string | null;   // YYYY-MM-DD
  selectedTime: string | null;   // HH:MM
  contactInfo: ContactInfo;

  setService: (service: Service, eligible: Stylist[]) => void;
  setStylist: (stylist: Stylist) => void;
  setDateTime: (date: string, time: string) => void;
  setContactInfo: (info: ContactInfo) => void;
  goToStep: (step: 0 | 1 | 2 | 3) => void;
  nextStep: () => void;
  prevStep: () => void;
  reset: () => void;
}

const defaultContactInfo: ContactInfo = {
  client_name: '',
  client_email: '',
  client_phone: '',
  notes: '',
};

export const useBookingStore = create<BookingState>()(
  persist(
    (set) => ({
      currentStep: 0,
      selectedService: null,
      selectedStylist: null,
      eligibleStylists: [],
      selectedDate: null,
      selectedTime: null,
      contactInfo: defaultContactInfo,

      // Changing the service invalidates the stylist: the one already chosen
      // may not perform the new one.
      setService: (service, eligible) =>
        set({
          selectedService: service,
          eligibleStylists: eligible,
          selectedStylist: eligible.length === 1 ? eligible[0] : null,
          selectedDate: null,
          selectedTime: null,
        }),

      setStylist: (stylist) =>
        set({ selectedStylist: stylist }),

      setDateTime: (date, time) =>
        set({ selectedDate: date, selectedTime: time }),

      setContactInfo: (info) =>
        set({ contactInfo: info }),

      goToStep: (step) => set({ currentStep: step }),

      nextStep: () =>
        set((s) => ({
          currentStep: Math.min(s.currentStep + 1, 3) as 0 | 1 | 2 | 3,
        })),

      prevStep: () =>
        set((s) => ({
          currentStep: Math.max(s.currentStep - 1, 0) as 0 | 1 | 2 | 3,
        })),

      reset: () =>
        set({
          currentStep: 0,
          selectedService: null,
          selectedStylist: null,
          eligibleStylists: [],
          selectedDate: null,
          selectedTime: null,
          contactInfo: defaultContactInfo,
        }),
    }),
    {
      name: 'icon-booking-wizard',
      storage: createJSONStorage(() => sessionStorage),
      // Bumped when stylist eligibility landed. A session persisted before then
      // can hold selectedStylist: 'anyone', or a stylist who does not perform
      // the chosen service — neither is representable any more, and restoring
      // one leaves the wizard on a step it cannot submit from. Nothing useful
      // can be salvaged, so those sessions start again.
      version: 2,
      migrate: () => ({
        currentStep: 0 as const,
        selectedService: null,
        selectedStylist: null,
        eligibleStylists: [],
        selectedDate: null,
        selectedTime: null,
        contactInfo: defaultContactInfo,
      }),
    }
  )
);
