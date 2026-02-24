import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Trash2, Plus } from 'lucide-react';
import { createBlockedSlot, getBlockedSlots, deleteBlockedSlot } from '@/api/admin';
import { getStylists } from '@/api/stylists';
import { useAuthStore } from '@/store/authStore';
import type { BlockedSlot, Stylist } from '@luxe/shared';
import { formatDate } from '@/utils/dates';

const blockSchema = z.object({
  stylist_id: z.string().uuid('Select a stylist'),
  blocked_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Select a date'),
  start_time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Enter a valid time'),
  end_time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Enter a valid time'),
  reason: z.string().max(200).optional(),
});

type BlockFormValues = z.infer<typeof blockSchema>;

export default function AdminBlockSlots() {
  const { session } = useAuthStore();
  const token = session?.access_token ?? '';

  const [blockedSlots, setBlockedSlots] = useState<BlockedSlot[]>([]);
  const [stylists, setStylists] = useState<Stylist[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<BlockFormValues>({ resolver: zodResolver(blockSchema) });

  useEffect(() => {
    Promise.all([
      getBlockedSlots({}, token).then(setBlockedSlots),
      getStylists().then(setStylists),
    ])
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [token]);

  const onSubmit = async (data: BlockFormValues) => {
    try {
      const created = await createBlockedSlot(
        { ...data, reason: data.reason ?? null } as any,
        token
      );
      setBlockedSlots((prev) => [created, ...prev]);
      reset();
      setShowForm(false);
    } catch (err) {
      console.error(err);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this blocked slot?')) return;
    try {
      await deleteBlockedSlot(id, token);
      setBlockedSlots((prev) => prev.filter((s) => s.id !== id));
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="font-serif text-3xl font-semibold">Blocked Slots</h1>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="flex items-center gap-2 rounded-full bg-rose-500 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-600 transition-colors"
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          Add Block
        </button>
      </div>

      {/* Add form */}
      {showForm && (
        <form
          onSubmit={handleSubmit(onSubmit)}
          className="mt-6 rounded-xl border border-border bg-white p-5"
          noValidate
        >
          <h2 className="mb-4 font-medium">Block a Time Slot</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium">Stylist</label>
              <select
                {...register('stylist_id')}
                className="w-full rounded-lg border border-input px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-rose-400"
              >
                <option value="">Select stylist...</option>
                {stylists.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
              {errors.stylist_id && (
                <p className="mt-1 text-xs text-destructive">{errors.stylist_id.message}</p>
              )}
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium">Date</label>
              <input
                type="date"
                {...register('blocked_date')}
                className="w-full rounded-lg border border-input px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-rose-400"
              />
              {errors.blocked_date && (
                <p className="mt-1 text-xs text-destructive">{errors.blocked_date.message}</p>
              )}
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium">Start Time</label>
              <input
                type="time"
                {...register('start_time')}
                className="w-full rounded-lg border border-input px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-rose-400"
              />
              {errors.start_time && (
                <p className="mt-1 text-xs text-destructive">{errors.start_time.message}</p>
              )}
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium">End Time</label>
              <input
                type="time"
                {...register('end_time')}
                className="w-full rounded-lg border border-input px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-rose-400"
              />
              {errors.end_time && (
                <p className="mt-1 text-xs text-destructive">{errors.end_time.message}</p>
              )}
            </div>

            <div className="sm:col-span-2">
              <label className="mb-1 block text-sm font-medium">
                Reason (optional)
              </label>
              <input
                type="text"
                {...register('reason')}
                placeholder="e.g. Lunch break, Vacation"
                className="w-full rounded-lg border border-input px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-rose-400"
              />
            </div>
          </div>

          <div className="mt-4 flex gap-3">
            <button
              type="submit"
              disabled={isSubmitting}
              className="rounded-full bg-rose-500 px-5 py-2 text-sm font-semibold text-white hover:bg-rose-600 disabled:opacity-50 transition-colors"
            >
              {isSubmitting ? 'Saving...' : 'Save Block'}
            </button>
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="rounded-full border border-border px-5 py-2 text-sm font-medium hover:bg-muted transition-colors"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* List */}
      <div className="mt-6 overflow-x-auto rounded-xl border border-border bg-white">
        {loading ? (
          <div className="flex h-32 items-center justify-center">
            <div className="h-6 w-6 animate-spin rounded-full border-4 border-rose-200 border-t-rose-500" />
          </div>
        ) : blockedSlots.length === 0 ? (
          <p className="py-12 text-center text-muted-foreground">
            No blocked slots. Add one above.
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="px-4 py-3 text-left font-medium">Date</th>
                <th className="px-4 py-3 text-left font-medium">Time</th>
                <th className="px-4 py-3 text-left font-medium">Reason</th>
                <th className="px-4 py-3 text-left font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {blockedSlots.map((slot) => (
                <tr key={slot.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-3">{formatDate(slot.blocked_date)}</td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    {slot.start_time} – {slot.end_time}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {slot.reason ?? '—'}
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => handleDelete(slot.id)}
                      className="p-1.5 text-muted-foreground hover:text-destructive transition-colors rounded"
                      aria-label="Delete blocked slot"
                    >
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
