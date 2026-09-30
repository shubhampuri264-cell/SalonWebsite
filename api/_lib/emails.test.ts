import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { sendContactMessageEmail, sendOwnerNotificationEmail } from './emails';

// Owner-facing mail goes to the business inbox, never to OWNER_EMAIL. The two
// were once the same variable, and the failure that split them was silent: a
// booking that succeeds while the salon never hears about it. Resend is
// mocked, so these tests never send real mail.

// vi.mock is hoisted above the import, so the mock it closes over must be too.
const { send } = vi.hoisted(() => ({ send: vi.fn() }));
vi.mock('resend', () => ({
  Resend: class {
    emails = { send };
  },
}));
vi.mock('./quota', () => ({ recordEmailSend: vi.fn() }));

const appointment = {
  id: 'a347f7c9-0000-0000-0000-000000000000',
  client_name: 'Test Client',
  client_email: 'client@example.com',
  appointment_date: '2026-10-01',
  appointment_time: '10:00',
  cancellation_token: 'token',
};

const recipients = () => send.mock.calls.map(([payload]) => payload.to);

beforeEach(() => {
  vi.stubEnv('RESEND_API_KEY', 're_test');
  vi.stubEnv('OWNER_EMAIL', '"owner@gmail.com"');
  vi.stubEnv('OWNER_NOTIFY_EMAIL', '');
  vi.stubEnv('EMAIL_DEV_OVERRIDE', undefined);
  send.mockResolvedValue({ data: { id: 'id' }, error: null });
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe('owner inbox', () => {
  it('sends new-booking notices to the business inbox, not the admin login', async () => {
    await sendOwnerNotificationEmail(appointment, 'Man Hair Cut', 'Sumita Karki');
    expect(recipients()).toEqual(['ks@iconht.studio']);
  });

  it('uses OWNER_NOTIFY_EMAIL when set', async () => {
    vi.stubEnv('OWNER_NOTIFY_EMAIL', '"frontdesk@example.com"');
    await sendOwnerNotificationEmail(appointment, 'Man Hair Cut', 'Sumita Karki');
    expect(recipients()).toEqual(['frontdesk@example.com']);
  });

  it('sends contact messages to the business inbox with reply-to set to the visitor', async () => {
    await expect(
      sendContactMessageEmail({ name: 'Visitor', email: 'v@example.com', message: 'Hello there' }),
    ).resolves.toBe(true);
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'ks@iconht.studio', replyTo: 'v@example.com' }),
    );
  });
});

describe('owner send failures', () => {
  it('throws when Resend rejects the notice, so the booking path reports it', async () => {
    send.mockResolvedValue({ data: null, error: { message: 'quota exceeded' } });
    await expect(
      sendOwnerNotificationEmail(appointment, 'Man Hair Cut', 'Sumita Karki'),
    ).rejects.toThrow('Resend rejected send to ks@iconht.studio');
  });

  it('reports a contact message as undeliverable when Resend is not configured', async () => {
    vi.stubEnv('RESEND_API_KEY', '');
    await expect(
      sendContactMessageEmail({ name: 'Visitor', email: 'v@example.com', message: 'Hello there' }),
    ).resolves.toBe(false);
    expect(send).not.toHaveBeenCalled();
  });
});
