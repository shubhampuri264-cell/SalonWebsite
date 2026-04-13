import crypto from 'crypto';

/** Generate a cryptographically random UUID for cancellation tokens */
export function generateCancellationToken(): string {
  return crypto.randomUUID();
}
