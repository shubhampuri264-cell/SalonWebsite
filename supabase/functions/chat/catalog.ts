// Catalogue reads.
//
// These are the only queries Iris runs against the database directly, and they
// are all plain selects of public, already-published data — the same rows
// /services and /team render. Nothing here duplicates business logic, which is
// the line that decides what lives in Deno and what gets proxied to Vercel:
// availability, booking, cancel and reschedule all carry rules (opening hours,
// lead time, the double-booking constraint, per-customer caps), so they stay on
// the Vercel side and are called over HTTP.
//
// The service-role key is used because RLS on `promotions` evaluates
// CURRENT_DATE in the database's timezone (UTC), which disagrees with the
// salon's day for four to five hours every night. The authoritative date filter
// is applied here, in the salon's timezone, exactly as migration 017 documents.

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { salonToday } from './dates.ts';

let client: SupabaseClient | null = null;

export function supabase(): SupabaseClient {
  if (client) return client;
  client = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } },
  );
  return client;
}

export interface CatalogService {
  id: string;
  category: string;
  name: string;
  description: string | null;
  price_min: number;
  price_max: number | null;
  duration_min: number;
}

export interface CatalogStylist {
  id: string;
  name: string;
  /** Display copy. Bookability lives in `stylist_services` — see migration 018. */
  specialties: string[] | null;
}

/**
 * Which stylists perform which service: service id -> stylist ids.
 *
 * Loaded whole rather than queried per service. The table is one row per
 * bookable pairing — around sixty for a two-person salon — so a single read
 * costs less than the round trips it replaces, and it lets a handler answer
 * "who can do this" without touching the network mid-conversation.
 */
export type StylistServiceMap = Map<string, string[]>;

export interface LivePromotion {
  title: string;
  description: string | null;
  offer_text: string;
}

/**
 * Active services, in a FIXED order.
 *
 * The ordering is not cosmetic. This list is serialized into the cached system
 * prompt, and prompt caching is a byte-exact prefix match — a query that
 * returned the same rows in a different order would silently produce a cache
 * miss on every request, which shows up only as a bill.
 */
export async function fetchServices(): Promise<CatalogService[]> {
  const { data, error } = await supabase()
    .from('services')
    .select('id, category, name, description, price_min, price_max, duration_min')
    .eq('is_active', true)
    .order('category', { ascending: true })
    .order('name', { ascending: true });

  if (error) {
    console.error('[catalog] services query failed:', error.message);
    return [];
  }
  return (data ?? []) as CatalogService[];
}

export async function fetchStylists(): Promise<CatalogStylist[]> {
  const { data, error } = await supabase()
    .from('stylists')
    .select('id, name, specialties')
    .eq('is_active', true)
    .order('name', { ascending: true });

  if (error) {
    console.error('[catalog] stylists query failed:', error.message);
    return [];
  }
  return (data ?? []) as CatalogStylist[];
}

/**
 * The stylist -> service mapping, as service id -> stylist ids.
 *
 * Returns an EMPTY map on failure, which makes every service look unstaffed and
 * stops the booking funnel at the stylist step. That is the correct direction to
 * fail: the alternative reading of "no data" is "anyone can do anything", which
 * is exactly the bug migration 018 exists to close. The customer is told to call
 * the salon rather than handed a booking with the wrong person.
 */
export async function fetchStylistServices(): Promise<StylistServiceMap> {
  const map: StylistServiceMap = new Map();

  const { data, error } = await supabase()
    .from('stylist_services')
    .select('stylist_id, service_id');

  if (error) {
    console.error('[catalog] stylist_services query failed:', error.message);
    return map;
  }

  for (const row of data ?? []) {
    const serviceId = row.service_id as string;
    const list = map.get(serviceId);
    if (list) list.push(row.stylist_id as string);
    else map.set(serviceId, [row.stylist_id as string]);
  }
  return map;
}

/**
 * Who may be booked for what.
 *
 * The authoritative copy of this rule is api/_lib/eligibility.ts, which the
 * booking API applies to every request. This one exists so Iris never offers a
 * pairing that would then be rejected — it is a UX filter, not a security
 * boundary. See migration 018.
 */
export function stylistCanDo(
  map: StylistServiceMap,
  stylistId: string,
  serviceId: string,
): boolean {
  return (map.get(serviceId) ?? []).includes(stylistId);
}

/** Active stylists who perform this service, in the roster's display order. */
export function eligibleStylists(
  stylists: CatalogStylist[],
  map: StylistServiceMap,
  serviceId: string,
): CatalogStylist[] {
  const allowed = new Set(map.get(serviceId) ?? []);
  return stylists.filter((s) => allowed.has(s.id));
}

/**
 * Promotions running today, in the salon's timezone.
 *
 * Degrades to an empty list on ANY failure, including the table not existing.
 * "No current offers" is a truthful, harmless answer; a 500 in the middle of a
 * booking is not. This is what makes the promotions migration safe to apply in
 * either order relative to the code deploy.
 */
export async function fetchLivePromotions(): Promise<LivePromotion[]> {
  const today = salonToday();

  try {
    const { data, error } = await supabase()
      .from('promotions')
      .select('title, description, offer_text')
      .eq('is_active', true)
      .lte('starts_on', today)
      .or(`ends_on.is.null,ends_on.gte.${today}`)
      .order('starts_on', { ascending: false });

    if (error) {
      console.error('[catalog] promotions query failed:', error.message);
      return [];
    }
    return (data ?? []) as LivePromotion[];
  } catch (err) {
    console.error('[catalog] promotions query threw:', err);
    return [];
  }
}

/** "$200–$300", "$45", or "Consultation" — matches how the site renders prices. */
export function priceLabel(service: { price_min: number; price_max: number | null }): string {
  const min = Number(service.price_min);
  const max = service.price_max == null ? null : Number(service.price_max);
  if (max !== null && max !== min) return `$${min}–$${max}`;
  if (min === 0) return 'Consultation';
  return `$${min}`;
}

export const CATEGORY_LABELS: Record<string, string> = {
  hair: 'Hair Services',
  threading: 'Threading Services',
  waxing: 'Waxing Services',
  facial: 'Facial Services',
  special_treatment: 'Special Treatments',
};
