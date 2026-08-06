import { useEffect, useState } from 'react';
import { Pencil, Check, X, Plus, Eye, EyeOff } from 'lucide-react';
import { getAdminPromotions, createPromotion, updatePromotion } from '@/api/adminPromotions';
import { useAuthStore } from '@/store/authStore';
import { salonToday } from '@/utils/dates';
import type { Promotion } from '@luxe/shared';
import { cn } from '@/utils/cn';

interface EditState {
  title: string;
  offer_text: string;
  description: string;
  starts_on: string;
  ends_on: string;
}

const EMPTY: EditState = { title: '', offer_text: '', description: '', starts_on: '', ends_on: '' };

type Status = 'live' | 'scheduled' | 'expired' | 'hidden';

const STATUS_STYLES: Record<Status, { label: string; className: string }> = {
  live: { label: 'Live', className: 'bg-green-100 text-green-700' },
  scheduled: { label: 'Scheduled', className: 'bg-blue-100 text-blue-700' },
  expired: { label: 'Ended', className: 'bg-amber-100 text-amber-700' },
  hidden: { label: 'Hidden', className: 'bg-gray-100 text-gray-600' },
};

/**
 * What a customer sees right now. Both conditions must hold for "live" — the
 * manual is_active switch AND today falling inside the date range — which is
 * exactly the rule the public reader and the assistant apply.
 */
function statusOf(p: Promotion, today: string): Status {
  if (!p.is_active) return 'hidden';
  if (p.starts_on > today) return 'scheduled';
  if (p.ends_on && p.ends_on < today) return 'expired';
  return 'live';
}

/** ISO dates compare correctly as strings, so no Date parsing is needed here. */
function formatRange(p: Promotion): string {
  const fmt = (d: string) => {
    const [y, m, day] = d.split('-').map(Number);
    return new Date(y, m - 1, day).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };
  return p.ends_on ? `${fmt(p.starts_on)} – ${fmt(p.ends_on)}` : `From ${fmt(p.starts_on)}`;
}

function validate(state: EditState): string | null {
  if (state.title.trim().length < 2) return 'Title must be at least 2 characters';
  if (state.title.trim().length > 120) return 'Title must be 120 characters or fewer';
  if (state.offer_text.trim().length < 2) return 'Offer text is required';
  if (state.offer_text.trim().length > 200) return 'Offer text must be 200 characters or fewer';
  if (state.description.length > 500) return 'Description must be 500 characters or fewer';
  if (state.starts_on && state.ends_on && state.ends_on < state.starts_on) {
    return 'The end date cannot be before the start date';
  }
  return null;
}

export default function AdminPromotions() {
  const { session } = useAuthStore();
  const token = session?.access_token ?? '';
  const today = salonToday();

  const [promotions, setPromotions] = useState<Promotion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editState, setEditState] = useState<EditState>(EMPTY);
  const [editError, setEditError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [showAdd, setShowAdd] = useState(false);
  const [addState, setAddState] = useState<EditState>(EMPTY);
  const [addError, setAddError] = useState<string | null>(null);
  const [addSaving, setAddSaving] = useState(false);

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    getAdminPromotions(token)
      .then(setPromotions)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load promotions'))
      .finally(() => setLoading(false));
  }, [token]);

  const startEdit = (p: Promotion) => {
    setEditingId(p.id);
    setEditError(null);
    setEditState({
      title: p.title,
      offer_text: p.offer_text,
      description: p.description ?? '',
      starts_on: p.starts_on,
      ends_on: p.ends_on ?? '',
    });
  };

  const saveEdit = async (id: string) => {
    const problem = validate(editState);
    if (problem) { setEditError(problem); return; }

    setEditError(null);
    setSaving(true);
    try {
      const updated = await updatePromotion(id, {
        title: editState.title.trim(),
        offer_text: editState.offer_text.trim(),
        description: editState.description.trim() || null,
        starts_on: editState.starts_on,
        ends_on: editState.ends_on || null,
      }, token);
      setPromotions((prev) => prev.map((p) => (p.id === id ? updated : p)));
      setEditingId(null);
    } catch (err) {
      setEditError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (p: Promotion) => {
    try {
      const updated = await updatePromotion(p.id, { is_active: !p.is_active }, token);
      setPromotions((prev) => prev.map((x) => (x.id === p.id ? updated : x)));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update');
    }
  };

  const handleAdd = async () => {
    const problem = validate(addState);
    if (problem) { setAddError(problem); return; }

    setAddError(null);
    setAddSaving(true);
    try {
      const created = await createPromotion({
        title: addState.title.trim(),
        offer_text: addState.offer_text.trim(),
        description: addState.description.trim() || null,
        // Blank dates are omitted so the column defaults apply: starts_on
        // becomes today, ends_on stays NULL (open-ended).
        ...(addState.starts_on ? { starts_on: addState.starts_on } : {}),
        ...(addState.ends_on ? { ends_on: addState.ends_on } : {}),
      }, token);
      setPromotions((prev) => [created, ...prev]);
      setShowAdd(false);
      setAddState(EMPTY);
    } catch (err) {
      setAddError(err instanceof Error ? err.message : 'Failed to add promotion');
    } finally {
      setAddSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-40 items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-4 border-rose-200 border-t-rose-500" />
      </div>
    );
  }

  const inputClass =
    'w-full rounded-lg border border-input px-3 py-2 text-sm outline-hidden focus:ring-2 focus:ring-rose-400';

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-serif text-3xl font-semibold">Promotions</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Offers shown on the site and quoted word-for-word by Iris. Write the offer exactly as
            customers should read it.
          </p>
        </div>
        <button
          onClick={() => { setShowAdd((v) => !v); setAddError(null); }}
          className="flex items-center gap-2 rounded-full bg-rose-500 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-600"
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          Add Promotion
        </button>
      </div>

      {error && <p className="mt-4 text-sm text-destructive">{error}</p>}

      {showAdd && (
        <div className="mt-5 rounded-xl border border-rose-200 bg-rose-50 p-5">
          <h3 className="mb-3 font-medium text-rose-700">New Promotion</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground" htmlFor="promo-title">Title</label>
              <input
                id="promo-title"
                value={addState.title}
                onChange={(e) => setAddState((s) => ({ ...s, title: e.target.value }))}
                maxLength={120}
                placeholder="Spring Glow Special"
                className={inputClass}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground" htmlFor="promo-offer">
                Offer text — shown to customers exactly as typed
              </label>
              <input
                id="promo-offer"
                value={addState.offer_text}
                onChange={(e) => setAddState((s) => ({ ...s, offer_text: e.target.value }))}
                maxLength={200}
                placeholder="20% off all facials"
                className={inputClass}
              />
            </div>
            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs font-medium text-muted-foreground" htmlFor="promo-desc">Details (optional)</label>
              <input
                id="promo-desc"
                value={addState.description}
                onChange={(e) => setAddState((s) => ({ ...s, description: e.target.value }))}
                maxLength={500}
                placeholder="New clients only. Cannot be combined with other offers."
                className={inputClass}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground" htmlFor="promo-start">Starts (optional — defaults to today)</label>
              <input
                id="promo-start"
                type="date"
                value={addState.starts_on}
                onChange={(e) => setAddState((s) => ({ ...s, starts_on: e.target.value }))}
                className={inputClass}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground" htmlFor="promo-end">Ends (optional — blank runs until you hide it)</label>
              <input
                id="promo-end"
                type="date"
                value={addState.ends_on}
                onChange={(e) => setAddState((s) => ({ ...s, ends_on: e.target.value }))}
                className={inputClass}
              />
            </div>
          </div>
          {addError && <p className="mt-2 text-xs text-destructive">{addError}</p>}
          <div className="mt-3 flex gap-2">
            <button
              onClick={handleAdd}
              disabled={addSaving}
              className="rounded-full bg-rose-500 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-600 disabled:opacity-50"
            >
              {addSaving ? 'Saving…' : 'Save Promotion'}
            </button>
            <button
              onClick={() => { setShowAdd(false); setAddError(null); }}
              className="rounded-full border border-border px-4 py-2 text-sm font-medium hover:bg-muted"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="mt-6 overflow-x-auto rounded-xl border border-border bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/50">
              <th className="px-4 py-3 text-left font-medium">Promotion</th>
              <th className="px-4 py-3 text-left font-medium">Offer</th>
              <th className="px-4 py-3 text-left font-medium">Dates</th>
              <th className="px-4 py-3 text-left font-medium">Status</th>
              <th className="px-4 py-3 text-left font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {promotions.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                  No promotions yet. Add one and it appears on the site straight away.
                </td>
              </tr>
            )}
            {promotions.map((p) => {
              const status = statusOf(p, today);
              return (
                <tr
                  key={p.id}
                  className={cn('border-b border-border last:border-0', status !== 'live' && 'opacity-60')}
                >
                  {editingId === p.id ? (
                    <>
                      <td className="px-4 py-2">
                        <input
                          value={editState.title}
                          onChange={(e) => setEditState((v) => ({ ...v, title: e.target.value }))}
                          maxLength={120}
                          aria-label="Title"
                          className="w-full rounded-lg border border-input px-2 py-1 text-sm outline-hidden focus:ring-2 focus:ring-rose-400"
                        />
                        <input
                          value={editState.description}
                          onChange={(e) => setEditState((v) => ({ ...v, description: e.target.value }))}
                          maxLength={500}
                          placeholder="Details"
                          aria-label="Details"
                          className="mt-1 w-full rounded-lg border border-input px-2 py-1 text-xs outline-hidden focus:ring-2 focus:ring-rose-400"
                        />
                      </td>
                      <td className="px-4 py-2">
                        <input
                          value={editState.offer_text}
                          onChange={(e) => setEditState((v) => ({ ...v, offer_text: e.target.value }))}
                          maxLength={200}
                          aria-label="Offer text"
                          className="w-full rounded-lg border border-input px-2 py-1 text-sm outline-hidden focus:ring-2 focus:ring-rose-400"
                        />
                      </td>
                      <td className="px-4 py-2">
                        <div className="flex flex-col gap-1">
                          <input
                            type="date"
                            value={editState.starts_on}
                            onChange={(e) => setEditState((v) => ({ ...v, starts_on: e.target.value }))}
                            aria-label="Start date"
                            className="rounded-lg border border-input px-2 py-1 text-xs outline-hidden focus:ring-2 focus:ring-rose-400"
                          />
                          <input
                            type="date"
                            value={editState.ends_on}
                            onChange={(e) => setEditState((v) => ({ ...v, ends_on: e.target.value }))}
                            aria-label="End date"
                            className="rounded-lg border border-input px-2 py-1 text-xs outline-hidden focus:ring-2 focus:ring-rose-400"
                          />
                        </div>
                      </td>
                      <td className="px-4 py-2">
                        {editError && <p className="text-xs text-destructive">{editError}</p>}
                      </td>
                      <td className="px-4 py-2">
                        <div className="flex gap-1.5">
                          <button
                            onClick={() => saveEdit(p.id)}
                            disabled={saving}
                            className="flex items-center gap-1 rounded-md border border-green-300 bg-green-50 px-2 py-1 text-xs font-medium text-green-700 hover:bg-green-100 disabled:opacity-50"
                          >
                            <Check className="h-3 w-3" aria-hidden="true" />
                            Save
                          </button>
                          <button
                            onClick={() => { setEditingId(null); setEditError(null); }}
                            className="flex items-center gap-1 rounded-md border border-border bg-white px-2 py-1 text-xs font-medium hover:bg-muted"
                          >
                            <X className="h-3 w-3" aria-hidden="true" />
                            Cancel
                          </button>
                        </div>
                      </td>
                    </>
                  ) : (
                    <>
                      <td className="px-4 py-3">
                        <p className="font-medium">{p.title}</p>
                        {p.description && <p className="text-xs text-muted-foreground">{p.description}</p>}
                      </td>
                      <td className="px-4 py-3 font-medium">{p.offer_text}</td>
                      <td className="px-4 py-3 text-muted-foreground">{formatRange(p)}</td>
                      <td className="px-4 py-3">
                        <span className={cn('rounded-full px-2.5 py-0.5 text-xs font-medium', STATUS_STYLES[status].className)}>
                          {STATUS_STYLES[status].label}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex gap-1.5">
                          <button
                            onClick={() => startEdit(p)}
                            className="flex items-center gap-1 rounded-md border border-border bg-white px-2 py-1 text-xs font-medium hover:bg-muted"
                          >
                            <Pencil className="h-3 w-3" aria-hidden="true" />
                            Edit
                          </button>
                          <button
                            onClick={() => toggleActive(p)}
                            className="flex items-center gap-1 rounded-md border border-border bg-white px-2 py-1 text-xs font-medium hover:bg-muted"
                            title={p.is_active ? 'Hide from customers' : 'Show to customers'}
                          >
                            {p.is_active
                              ? <EyeOff className="h-3 w-3" aria-hidden="true" />
                              : <Eye className="h-3 w-3" aria-hidden="true" />}
                            {p.is_active ? 'Hide' : 'Show'}
                          </button>
                        </div>
                      </td>
                    </>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="mt-4 text-xs text-muted-foreground">
        Promotions are never deleted — hiding one keeps the wording so you can run it again later.
      </p>
    </div>
  );
}
