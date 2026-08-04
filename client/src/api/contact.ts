import { apiFetch } from './client';

export interface ContactPayload {
  name: string;
  email: string;
  message: string;
  /** Honeypot — always empty for a real visitor. See api/contact.ts. */
  website?: string;
}

export function sendContactMessage(payload: ContactPayload): Promise<{ message: string }> {
  return apiFetch<{ message: string }>('/api/contact', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}
