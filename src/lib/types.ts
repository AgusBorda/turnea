export interface Barbershop {
  id: string
  owner_id: string
  name: string
  slug: string
  description: string | null
  address: string | null
  phone: string | null
  instagram: string | null
  logo_url: string | null
  cover_url: string | null
  latitude: number | null
  longitude: number | null
  timezone: string
  currency: string
  deposit_required: boolean
  deposit_percentage: number
  slot_duration: number
  advance_booking_days: number
  cancellation_hours: number
  mp_access_token: string | null
  active: boolean
  created_at: string
  updated_at: string
}

export interface Barber {
  id: string
  barbershop_id: string
  user_id: string | null
  name: string
  photo_url: string | null
  bio: string | null
  sort_order: number
  active: boolean
  created_at: string
  updated_at: string
}

export interface BarberSchedule {
  id: string
  barber_id: string
  day_of_week: number
  start_time: string
  end_time: string
  is_working: boolean
  created_at: string
}

export interface Service {
  id: string
  barbershop_id: string
  name: string
  description: string | null
  duration: number
  price: number
  active: boolean
  sort_order: number
  created_at: string
  updated_at: string
}

export interface Client {
  id: string
  phone: string
  name: string
  email: string | null
  notes: string | null
  penalty_count: number
  blocked: boolean
  created_at: string
  updated_at: string
}

export interface ClientBarbershop {
  id: string
  client_id: string
  barbershop_id: string
  visits: number
  last_visit: string | null
  loyalty_points: number
  notes: string | null
  created_at: string
}

export type AppointmentStatus = 'pending' | 'confirmed' | 'completed' | 'cancelled' | 'no_show'
export type DepositStatus = 'none' | 'pending' | 'paid' | 'refunded'

export interface Appointment {
  id: string
  barbershop_id: string
  barber_id: string
  service_id: string | null
  client_id: string | null
  date: string
  start_time: string
  end_time: string
  status: AppointmentStatus
  deposit_amount: number
  deposit_status: DepositStatus
  client_name: string | null
  client_phone: string | null
  notes: string | null
  cancelled_at: string | null
  cancelled_by: string | null
  created_at: string
  updated_at: string
  // Joined fields
  barber?: Barber
  service?: Service
  client?: Client
}

export interface BlockedSlot {
  id: string
  barber_id: string
  date: string
  start_time: string | null
  end_time: string | null
  all_day: boolean
  reason: string | null
  created_at: string
}

export interface TimeSlot {
  time: string
  available: boolean
}
