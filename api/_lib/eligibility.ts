// Who may be booked for what — the authoritative check.
//
// Eligibility lives in the `stylist_services` join table (migration 018), not
// on the stylist row, because Hot Oil Hair Massage is performed by both
// stylists while the rest of its category is performed by one. A single service
// crossing the category line is enough to make any per-stylist category list
// unrepresentable.
//
// EVERY function here fails CLOSED. A query that could not run is not evidence
// that a pairing is allowed, and the cost of the two failure modes is not
// symmetric: refusing a legitimate booking is a retry, permitting an illegitimate
// one puts a customer in a chair with someone who cannot do their service.

import { supabaseAdmin } from './supabase';
import { captureError } from './sentry';

/**
 * True if this stylist performs this service.
 *
 * Returns null when the lookup itself failed, which callers must surface as a
 * retryable error rather than collapsing to a boolean.
 */
export async function stylistPerformsService(
  stylistId: string,
  serviceId: string,
): Promise<boolean | null> {
  const { data, error } = await supabaseAdmin
    .from('stylist_services')
    .select('stylist_id')
    .eq('stylist_id', stylistId)
    .eq('service_id', serviceId)
    .maybeSingle();

  if (error) {
    await captureError(error, {
      fingerprint: 'api:eligibility:lookup',
      tags: { endpoint: 'stylist_services' },
      extra: { stylistId, serviceId },
    });
    return null;
  }

  return data !== null;
}

/**
 * Ids of the stylists who perform this service. Null on query failure.
 *
 * Not filtered by `stylists.is_active` — callers already hold or fetch the
 * active roster, and intersecting there keeps this a single-table read.
 */
export async function stylistIdsForService(serviceId: string): Promise<string[] | null> {
  const { data, error } = await supabaseAdmin
    .from('stylist_services')
    .select('stylist_id')
    .eq('service_id', serviceId);

  if (error) {
    await captureError(error, {
      fingerprint: 'api:eligibility:by-service',
      tags: { endpoint: 'stylist_services' },
      extra: { serviceId },
    });
    return null;
  }

  return (data ?? []).map((row) => row.stylist_id as string);
}
