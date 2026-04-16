import { useEffect, useState } from 'react';
import { Pencil, Check, X, Plus, Eye, EyeOff } from 'lucide-react';
import { getAdminServices, updateService, createService } from '@/api/adminServices';
import { useAuthStore } from '@/store/authStore';
import { SERVICE_CATEGORIES, SERVICE_CATEGORY_LABELS } from '@luxe/shared';
import type { Service, ServiceCategory } from '@luxe/shared';
import { cn } from '@/utils/cn';

interface EditState {
  name: string;
  description: string;
  price_min: string;
  price_max: string;
  duration_min: string;
}

function formatPrice(min: number, max: number | null): string {
  if (max && max !== min) return `$${min}–$${max}`;
  return `$${min}`;
}

export default function AdminServices() {
  const { session } = useAuthStore();
  const token = session?.access_token ?? '';

  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editState, setEditState] = useState<EditState>({ name: '', description: '', price_min: '', price_max: '', duration_min: '' });
  const [saving, setSaving] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [addState, setAddState] = useState<EditState & { category: ServiceCategory }>({
    category: 'threading', name: '', description: '', price_min: '', price_max: '', duration_min: '',
  });
  const [addError, setAddError] = useState<string | null>(null);
  const [addSaving, setAddSaving] = useState(false);

  const load = () => {
    setLoading(true);
    getAdminServices(token)
      .then(setServices)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load services'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { if (token) load(); }, [token]);

  const startEdit = (s: Service) => {
    setEditingId(s.id);
    setEditState({
      name: s.name,
      description: s.description ?? '',
      price_min: String(s.price_min),
      price_max: s.price_max != null ? String(s.price_max) : '',
      duration_min: String(s.duration_min),
    });
  };

  const cancelEdit = () => setEditingId(null);

  const saveEdit = async (id: string) => {
    const priceMin = parseFloat(editState.price_min);
    const priceMax = editState.price_max ? parseFloat(editState.price_max) : null;
    const duration = parseInt(editState.duration_min, 10);
    if (isNaN(priceMin) || isNaN(duration)) return;

    setSaving(true);
    try {
      const updated = await updateService(id, {
        name: editState.name.trim(),
        description: editState.description.trim() || undefined,
        price_min: priceMin,
        price_max: priceMax,
        duration_min: duration,
      }, token);
      setServices((prev) => prev.map((s) => (s.id === id ? updated : s)));
      setEditingId(null);
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (s: Service) => {
    try {
      const updated = await updateService(s.id, { is_active: !s.is_active }, token);
      setServices((prev) => prev.map((x) => (x.id === s.id ? updated : x)));
    } catch (err) {
      console.error(err);
    }
  };

  const handleAdd = async () => {
    const priceMin = parseFloat(addState.price_min);
    const priceMax = addState.price_max ? parseFloat(addState.price_max) : null;
    const duration = parseInt(addState.duration_min, 10);

    if (!addState.name.trim()) { setAddError('Name is required'); return; }
    if (isNaN(priceMin) || priceMin <= 0) { setAddError('Valid price required'); return; }
    if (isNaN(duration) || duration <= 0) { setAddError('Valid duration required'); return; }

    setAddError(null);
    setAddSaving(true);
    try {
      const created = await createService({
        category: addState.category,
        name: addState.name.trim(),
        description: addState.description.trim() || undefined,
        price_min: priceMin,
        price_max: priceMax,
        duration_min: duration,
      }, token);
      setServices((prev) => [...prev, created]);
      setShowAdd(false);
      setAddState({ category: 'threading', name: '', description: '', price_min: '', price_max: '', duration_min: '' });
    } catch (err) {
      setAddError(err instanceof Error ? err.message : 'Failed to add service');
    } finally {
      setAddSaving(false);
    }
  };

  const grouped = SERVICE_CATEGORIES.reduce<Record<ServiceCategory, Service[]>>(
    (acc, cat) => {
      acc[cat] = services.filter((s) => s.category === cat);
      return acc;
    },
    {} as Record<ServiceCategory, Service[]>
  );

  if (loading) {
    return (
      <div className="flex h-40 items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-4 border-rose-200 border-t-rose-500" />
      </div>
    );
  }

  if (error) {
    return <p className="text-destructive">{error}</p>;
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-serif text-3xl font-semibold">Services & Prices</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Edit prices, durations, and visibility for each service.
          </p>
        </div>
        <button
          onClick={() => setShowAdd((v) => !v)}
          className="flex items-center gap-2 rounded-full bg-rose-500 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-600"
        >
          <Plus className="h-4 w-4" />
          Add Service
        </button>
      </div>

      {/* Add service form */}
      {showAdd && (
        <div className="mt-5 rounded-xl border border-rose-200 bg-rose-50 p-5">
          <h3 className="font-medium text-rose-700 mb-3">New Service</h3>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Category</label>
              <select
                value={addState.category}
                onChange={(e) => setAddState((s) => ({ ...s, category: e.target.value as ServiceCategory }))}
                className="w-full rounded-lg border border-input px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-rose-400"
              >
                {SERVICE_CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>{SERVICE_CATEGORY_LABELS[cat]}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Name</label>
              <input
                value={addState.name}
                onChange={(e) => setAddState((s) => ({ ...s, name: e.target.value }))}
                placeholder="Service name"
                className="w-full rounded-lg border border-input px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-rose-400"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Description (optional)</label>
              <input
                value={addState.description}
                onChange={(e) => setAddState((s) => ({ ...s, description: e.target.value }))}
                placeholder="Short description"
                className="w-full rounded-lg border border-input px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-rose-400"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Price ($)</label>
              <input
                value={addState.price_min}
                onChange={(e) => setAddState((s) => ({ ...s, price_min: e.target.value }))}
                type="number"
                min="0"
                step="0.01"
                placeholder="e.g. 45"
                className="w-full rounded-lg border border-input px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-rose-400"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Max Price (optional)</label>
              <input
                value={addState.price_max}
                onChange={(e) => setAddState((s) => ({ ...s, price_max: e.target.value }))}
                type="number"
                min="0"
                step="0.01"
                placeholder="e.g. 65"
                className="w-full rounded-lg border border-input px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-rose-400"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Duration (minutes)</label>
              <input
                value={addState.duration_min}
                onChange={(e) => setAddState((s) => ({ ...s, duration_min: e.target.value }))}
                type="number"
                min="1"
                placeholder="e.g. 30"
                className="w-full rounded-lg border border-input px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-rose-400"
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
              {addSaving ? 'Saving…' : 'Save Service'}
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

      {/* Service lists by category */}
      <div className="mt-6 space-y-8">
        {SERVICE_CATEGORIES.map((cat) => {
          const catServices = grouped[cat];
          if (catServices.length === 0) return null;
          return (
            <div key={cat}>
              <h2 className="font-serif text-lg font-semibold text-foreground/80 mb-3">
                {SERVICE_CATEGORY_LABELS[cat]}
              </h2>
              <div className="overflow-x-auto rounded-xl border border-border bg-white">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/50">
                      <th className="px-4 py-3 text-left font-medium">Service</th>
                      <th className="px-4 py-3 text-left font-medium">Price</th>
                      <th className="px-4 py-3 text-left font-medium">Duration</th>
                      <th className="px-4 py-3 text-left font-medium">Status</th>
                      <th className="px-4 py-3 text-left font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {catServices.map((s) => (
                      <tr
                        key={s.id}
                        className={cn(
                          'border-b border-border last:border-0',
                          !s.is_active && 'opacity-50'
                        )}
                      >
                        {editingId === s.id ? (
                          <>
                            <td className="px-4 py-2">
                              <input
                                value={editState.name}
                                onChange={(e) => setEditState((v) => ({ ...v, name: e.target.value }))}
                                className="w-full rounded-lg border border-input px-2 py-1 text-sm outline-none focus:ring-2 focus:ring-rose-400"
                              />
                              <input
                                value={editState.description}
                                onChange={(e) => setEditState((v) => ({ ...v, description: e.target.value }))}
                                placeholder="Description"
                                className="mt-1 w-full rounded-lg border border-input px-2 py-1 text-xs outline-none focus:ring-2 focus:ring-rose-400"
                              />
                            </td>
                            <td className="px-4 py-2">
                              <div className="flex gap-1">
                                <input
                                  value={editState.price_min}
                                  onChange={(e) => setEditState((v) => ({ ...v, price_min: e.target.value }))}
                                  type="number"
                                  min="0"
                                  step="0.01"
                                  placeholder="Min"
                                  className="w-20 rounded-lg border border-input px-2 py-1 text-sm outline-none focus:ring-2 focus:ring-rose-400"
                                />
                                <input
                                  value={editState.price_max}
                                  onChange={(e) => setEditState((v) => ({ ...v, price_max: e.target.value }))}
                                  type="number"
                                  min="0"
                                  step="0.01"
                                  placeholder="Max"
                                  className="w-20 rounded-lg border border-input px-2 py-1 text-sm outline-none focus:ring-2 focus:ring-rose-400"
                                />
                              </div>
                            </td>
                            <td className="px-4 py-2">
                              <input
                                value={editState.duration_min}
                                onChange={(e) => setEditState((v) => ({ ...v, duration_min: e.target.value }))}
                                type="number"
                                min="1"
                                className="w-20 rounded-lg border border-input px-2 py-1 text-sm outline-none focus:ring-2 focus:ring-rose-400"
                              />
                            </td>
                            <td className="px-4 py-2" />
                            <td className="px-4 py-2">
                              <div className="flex gap-1.5">
                                <button
                                  onClick={() => saveEdit(s.id)}
                                  disabled={saving}
                                  className="flex items-center gap-1 rounded-md border border-green-300 bg-green-50 px-2 py-1 text-xs font-medium text-green-700 hover:bg-green-100 disabled:opacity-50"
                                >
                                  <Check className="h-3 w-3" />
                                  Save
                                </button>
                                <button
                                  onClick={cancelEdit}
                                  className="flex items-center gap-1 rounded-md border border-border bg-white px-2 py-1 text-xs font-medium hover:bg-muted"
                                >
                                  <X className="h-3 w-3" />
                                  Cancel
                                </button>
                              </div>
                            </td>
                          </>
                        ) : (
                          <>
                            <td className="px-4 py-3">
                              <p className="font-medium">{s.name}</p>
                              {s.description && (
                                <p className="text-xs text-muted-foreground">{s.description}</p>
                              )}
                            </td>
                            <td className="px-4 py-3 font-medium">{formatPrice(s.price_min, s.price_max)}</td>
                            <td className="px-4 py-3 text-muted-foreground">{s.duration_min} min</td>
                            <td className="px-4 py-3">
                              <span className={cn(
                                'rounded-full px-2.5 py-0.5 text-xs font-medium',
                                s.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'
                              )}>
                                {s.is_active ? 'Active' : 'Hidden'}
                              </span>
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex gap-1.5">
                                <button
                                  onClick={() => startEdit(s)}
                                  className="flex items-center gap-1 rounded-md border border-border bg-white px-2 py-1 text-xs font-medium hover:bg-muted"
                                >
                                  <Pencil className="h-3 w-3" />
                                  Edit
                                </button>
                                <button
                                  onClick={() => toggleActive(s)}
                                  className="flex items-center gap-1 rounded-md border border-border bg-white px-2 py-1 text-xs font-medium hover:bg-muted"
                                  title={s.is_active ? 'Hide from public' : 'Show to public'}
                                >
                                  {s.is_active ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                                  {s.is_active ? 'Hide' : 'Show'}
                                </button>
                              </div>
                            </td>
                          </>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
