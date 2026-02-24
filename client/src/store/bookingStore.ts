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
  selectedStylist: Stylist | 'anyone' | null;
  selectedDate: string | null;   // YYYY-MM-DD
  selectedTime: string | null;   // HH:MM
  contactInfo: ContactInfo;

  setService: (service: Service) => void;
  setStylist: (stylist: Stylist | 'anyone') => void;
  setDateTime: (date: string, time: string) => void;
  setContactInfo: (info: ContactInfo) => void;
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
      selectedDate: null,
      selectedTime: null,
      contactInfo: defaultContactInfo,

      setService: (service) =>
        set({ selectedService: service }),

      setStylist: (stylist) =>
        set({ selectedStylist: stylist }),

      setDateTime: (date, time) =>
        set({ selectedDate: date, selectedTime: time }),

      setContactInfo: (info) =>
        set({ contactInfo: info }),

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
          selectedDate: null,
          selectedTime: null,
          contactInfo: defaultContactInfo,
        }),
    }),
    {
      name: 'luxe-booking-wizard',
      storage: createJSONStorage(() => sessionStorage),
    }
  )
);
