'use client';

import { useEffect, useState, useCallback } from 'react';
import { Loader2, Plus, Trash2, KeyRound, Eye, Pencil } from 'lucide-react';
import { apiGet, apiPost, apiPut, apiDelete } from '@/lib/api';
import { ComboForm, type ComboData } from '@/components/forms/ComboForm';
import { BulkAddModal } from '@/components/BulkAddModal';
import { Modal } from '@/components/Modal';
import { StatusBadge } from '@/components/StatusBadge';
import { useToast } from '@/components/ui/Toast';

interface Item {
  id: number;
  title: string | null;
  quantity: number;
  orderColumn: number;
  availableCount: number;
  soldCount: number;
}

export default function EditCombo({ params }: { params: { id: string } }) {
  const id = params.id;
  const toast = useToast();
  const [combo, setCombo] = useState<ComboData | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [itemModal, setItemModal] = useState<Partial<Item> | null>(null);
  const [bulkFor, setBulkFor] = useState<number | null>(null);
  const [viewFor, setViewFor] = useState<Item | null>(null);
  const [saving, setSaving] = useState(false);

  const loadItems = useCallback(async () => {
    const res = await apiGet<Item[]>(`/api/admin/combos/${id}/items`);
    setItems(res.data ?? []);
  }, [id]);

  useEffect(() => {
    apiGet<ComboData>(`/api/admin/combos/${id}`).then((r) => setCombo(r.data ?? null));
    loadItems();
  }, [id, loadItems]);

  async function saveItem() {
    if (!itemModal) return;
    setSaving(true);
    const body = {
      title: itemModal.title ?? null,
      quantity: itemModal.quantity ?? 1,
      orderColumn: itemModal.orderColumn ?? 0,
    };
    const res = itemModal.id
      ? await apiPut(`/api/admin/combos/${id}/items/${itemModal.id}`, body)
      : await apiPost(`/api/admin/combos/${id}/items`, body);
    setSaving(false);
    if (res.success) {
      toast.success('Saved.');
      setItemModal(null);
      loadItems();
    } else toast.error(res.message || 'Failed.');
  }

  async function removeItem(itemId: number) {
    if (!confirm('Delete this item and its codes?')) return;
    const res = await apiDelete(`/api/admin/combos/${id}/items/${itemId}`);
    if (res.success) {
      toast.success('Deleted.');
      loadItems();
    } else toast.error(res.message || 'Failed.');
  }

  if (!combo)
    return (
      <div className="flex justify-center py-16 text-slate-300">
        <Loader2 className="animate-spin" />
      </div>
    );

  return (
    <div>
      <h1 className="mb-5 text-2xl font-bold text-slate-800">Edit Combo — {combo.title}</h1>

      <ComboForm initial={combo} onSaved={() => toast.success('Combo saved.')} />

      <div className="mt-6 card p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-bold text-slate-800">Items</h2>
          <button onClick={() => setItemModal({ quantity: 1, orderColumn: 0 })} className="btn-primary">
            <Plus size={16} /> New Item
          </button>
        </div>

        {items.length === 0 ? (
          <p className="py-6 text-center text-slate-400">No items yet.</p>
        ) : (
          <div className="space-y-2">
            {items.map((it) => (
              <div key={it.id} className="flex flex-wrap items-center gap-3 rounded-lg border border-slate-100 p-3">
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-slate-800">{it.title || `Item #${it.id}`}</p>
                  <p className="text-xs text-slate-400">Qty per order: {it.quantity}</p>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <StatusBadge status="available" />
                  <span className="font-semibold text-primary-dark">{it.availableCount}</span>
                  <StatusBadge status="sold" />
                  <span className="font-semibold text-slate-500">{it.soldCount}</span>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => setBulkFor(it.id)} className="btn-ghost px-2 py-1" title="Add codes">
                    <KeyRound size={14} />
                  </button>
                  <button onClick={() => setViewFor(it)} className="btn-ghost px-2 py-1" title="View codes">
                    <Eye size={14} />
                  </button>
                  <button onClick={() => setItemModal(it)} className="btn-ghost px-2 py-1">
                    <Pencil size={14} />
                  </button>
                  <button onClick={() => removeItem(it.id)} className="btn-danger px-2 py-1">
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* New/Edit item modal */}
      <Modal open={!!itemModal} onClose={() => setItemModal(null)} title={itemModal?.id ? 'Edit Item' : 'New Item'}>
        {itemModal && (
          <div className="space-y-3">
            <div>
              <label className="label">Title (optional)</label>
              <input className="input" value={itemModal.title ?? ''} onChange={(e) => setItemModal({ ...itemModal, title: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Quantity</label>
                <input type="number" min={1} className="input" value={itemModal.quantity ?? 1} onChange={(e) => setItemModal({ ...itemModal, quantity: Number(e.target.value) })} />
              </div>
              <div>
                <label className="label">Order</label>
                <input type="number" className="input" value={itemModal.orderColumn ?? 0} onChange={(e) => setItemModal({ ...itemModal, orderColumn: Number(e.target.value) })} />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={() => setItemModal(null)} className="btn-ghost">Cancel</button>
              <button onClick={saveItem} disabled={saving} className="btn-primary">
                {saving ? <Loader2 size={16} className="animate-spin" /> : 'Save'}
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* Bulk add codes */}
      {bulkFor && (
        <BulkAddModal
          open={!!bulkFor}
          onClose={() => setBulkFor(null)}
          endpoint={`/api/admin/combos/${id}/items/${bulkFor}/vouchers/bulk`}
          onDone={loadItems}
          title="Add Codes"
        />
      )}

      {/* View codes */}
      {viewFor && (
        <ViewCodes comboId={id} item={viewFor} onClose={() => { setViewFor(null); loadItems(); }} />
      )}
    </div>
  );
}

function ViewCodes({ comboId, item, onClose }: { comboId: string; item: Item; onClose: () => void }) {
  const toast = useToast();
  const [codes, setCodes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await apiGet<any[]>(`/api/admin/combos/${comboId}/items/${item.id}/vouchers`);
    setCodes(res.data ?? []);
    setLoading(false);
  }, [comboId, item.id]);

  useEffect(() => {
    load();
  }, [load]);

  async function remove(vId: number) {
    if (!confirm('Delete this code?')) return;
    const res = await apiDelete(`/api/admin/combos/${comboId}/items/vouchers/${vId}`);
    if (res.success) {
      toast.success('Deleted.');
      load();
    } else toast.error(res.message || 'Failed.');
  }

  return (
    <Modal open onClose={onClose} title={`Codes — ${item.title || `Item #${item.id}`}`} size="lg">
      {loading ? (
        <Loader2 className="mx-auto my-8 animate-spin text-slate-300" />
      ) : codes.length === 0 ? (
        <p className="py-6 text-center text-slate-400">No codes yet.</p>
      ) : (
        <div className="max-h-[400px] space-y-2 overflow-y-auto">
          {codes.map((c) => (
            <div key={c.id} className="flex items-center justify-between rounded-lg border border-slate-100 px-3 py-2">
              <code className="text-xs text-slate-700">{c.code}</code>
              <div className="flex items-center gap-2">
                <StatusBadge status={c.status} />
                <button onClick={() => remove(c.id)} className="text-red-500 hover:text-red-600">
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}
