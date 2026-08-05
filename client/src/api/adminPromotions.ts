import { apiFetch } from './client';
import type { Promotion } from '@luxe/shared';

// Promotions are served by api/admin/services.ts under ?resource=promotions --
// the Vercel Hobby plan caps the project at 12 functions and all 12 are in use,
// so they share a file with services rather than getting their own endpoint.

const BASE = '/api/admin/services?resource=promotions';

export function getAdminPromotions(token: string): Promise<Promotion[]> {
  return apiFetch<Promotion[]>(BASE, { token });
}

export interface PromotionInput {
  title: string;
  offer_text: string;
  description?: string | null;
  /** Omit to default to today. */
  starts_on?: string;
  /** Omit or null for an open-ended offer. */
  ends_on?: string | null;
}

export function createPromotion(data: PromotionInput, token: string): Promise<Promotion> {
  return apiFetch<Promotion>(BASE, {
    method: 'POST',
    body: JSON.stringify(data),
    token,
  });
}

export function updatePromotion(
  id: string,
  data: Partial<PromotionInput & { is_active: boolean }>,
  token: string,
): Promise<Promotion> {
  return apiFetch<Promotion>(`${BASE}&id=${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
    token,
  });
}
