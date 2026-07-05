'use client';

import { useEffect, useState } from 'react';
import { Plus, Pencil, Trash2, Loader2 } from 'lucide-react';
import { apiGet, apiPost, apiPut, apiDelete } from '@/lib/api';
import { DataTable, type Column } from '@/components/DataTable';
import { Modal } from '@/components/Modal';
import { StatusBadge } from '@/components/StatusBadge';
import { useToast } from '@/components/ui/Toast';

interface Category {
  id: number;
  title: string;
  icon: string | null;
  orderColumn: number;
  status: number;
  _count?: { products: number };
}

export default function CategoriesPage() {
  const toast = useToast();
  const [rows, setRows] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Partial<Category> | null>(null);
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    const res = await apiGet<Category[]>('/api/admin/categories');
    setRows(res.data ?? []);
    setLoading(false);
  }
  useEffect(() => {
    load();
  }, []);

  async function save() {
    if (!editing?.title) return toast.error('Title is required.');
    setSaving(true);
    const body = {
      title: editing.title,
      icon: editing.icon ?? null,
      orderColumn: editing.orderColumn ?? 0,
      status: editing.status ?? 1,
    };
    const res = editing.id
      ? await apiPut(`/api/admin/categories/${editing.id}`, body)
      : await apiPost('/api/admin/categories', body);
    setSaving(false);
    if (res.success) {
      toast.success('Saved.');
      setEditing(null);
      load();
    } else toast.error(res.message || 'Save failed.');
  }

  async function remove(id: number) {
    if (!confirm('Delete this category?')) return;
    const res = await apiDelete(`/api/admin/categories/${id}`);
    if (res.success) {
      toast.success('Deleted.');
      load();
    } else toast.error(res.message || 'Delete failed.');
  }

  const columns: Column<Category>[] = [
    { key: 'id', label: 'ID' },
    { key: 'title', label: 'Title' },
    { key: 'products', label: 'Products', render: (r) => r._count?.products ?? 0 },
    { key: 'orderColumn', label: 'Order' },
    { key: 'status', label: 'Status', render: (r) => <StatusBadge status={r.status} /> },
    {
      key: 'actions',
      label: '',
      render: (r) => (
        <div className="flex justify-end gap-2">
          <button onClick={() => setEditing(r)} className="btn-ghost px-2 py-1">
            <Pencil size={14} />
          </button>
          <button onClick={() => remove(r.id)} className="btn-danger px-2 py-1">
            <Trash2 size={14} />
          </button>
        </div>
      ),
    },
  ];

  return (
    <div>
      <div className="mb-5 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-800">Categories</h1>
        <button onClick={() => setEditing({ status: 1, orderColumn: 0 })} className="btn-primary">
          <Plus size={16} /> New Category
        </button>
      </div>

      <DataTable columns={columns} rows={rows} loading={loading} />

      <Modal
        open={!!editing}
        onClose={() => setEditing(null)}
        title={editing?.id ? 'Edit Category' : 'New Category'}
      >
        {editing && (
          <div className="space-y-4">
            <div>
              <label className="label">Title</label>
              <input
                className="input"
                value={editing.title ?? ''}
                onChange={(e) => setEditing({ ...editing, title: e.target.value })}
              />
            </div>
            <div>
              <label className="label">Icon (optional URL / class)</label>
              <input
                className="input"
                value={editing.icon ?? ''}
                onChange={(e) => setEditing({ ...editing, icon: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="label">Order</label>
                <input
                  type="number"
                  className="input"
                  value={editing.orderColumn ?? 0}
                  onChange={(e) => setEditing({ ...editing, orderColumn: Number(e.target.value) })}
                />
              </div>
              <div>
                <label className="label">Status</label>
                <select
                  className="input"
                  value={editing.status ?? 1}
                  onChange={(e) => setEditing({ ...editing, status: Number(e.target.value) })}
                >
                  <option value={1}>Active</option>
                  <option value={0}>Inactive</option>
                </select>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={() => setEditing(null)} className="btn-ghost">
                Cancel
              </button>
              <button onClick={save} disabled={saving} className="btn-primary">
                {saving ? <Loader2 size={16} className="animate-spin" /> : 'Save'}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
