export type ServiceCategory = 'hair' | 'threading' | 'facial' | 'waxing' | 'special_treatment' | 'male';

export type AppointmentStatus =
  | 'pending'
  | 'confirmed'
  | 'cancelled'
  | 'completed'
  | 'no_show';

export interface Stylist {
  id: string;
  name: string;
  title: string;
  bio: string;
  specialties: string[];
  years_exp: number;
  image_url: string | null;
  is_active: boolean;
  created_at: string;
}

export interface Service {
  id: string;
  category: ServiceCategory;
  name: string;
  description: string;
  price_min: number;
  price_max: number | null;
  duration_min: number;
  is_active: boolean;
}

export interface Appointment {
  id: string;
  stylist_id: string;
  service_id: string;
  client_name: string;
  client_email: string;
  client_phone: string;
  appointment_date: string; // YYYY-MM-DD
  appointment_time: string; // HH:MM (24h)
  duration_min: number;
  notes: string | null;
  status: AppointmentStatus;
  cancellation_token: string;
  reminder_sent: boolean;
  created_at: string;
}

export interface BlockedSlot {
  id: string;
  stylist_id: string;
  blocked_date: string;   // YYYY-MM-DD
  start_time: string;     // HH:MM
  end_time: string;       // HH:MM
  reason: string | null;
  created_at: string;
}

export interface TimeSlot {
  time: string;       // HH:MM
  available: boolean;
}

export interface AnyoneAvailabilitySlot {
  time: string;
  availableStylistIds: string[];
}

export interface CreateAppointmentPayload {
  stylist_id: string | 'anyone';
  service_id: string;
  client_name: string;
  client_email: string;
  client_phone: string;
  appointment_date: string; // YYYY-MM-DD
  appointment_time: string; // HH:MM
  notes?: string;
}

export interface CreateAppointmentResponse {
  appointment: Pick<
    Appointment,
    'id' | 'status' | 'appointment_date' | 'appointment_time'
  >;
}

export interface AdminAppointmentFilters {
  date?: string;
  status?: AppointmentStatus;
  stylist_id?: string;
}
