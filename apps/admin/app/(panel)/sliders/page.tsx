'use client';

import { useEffect, useState } from 'react';
import { Plus, Pencil, Trash2, Loader2 } from 'lucide-react';
import { apiGet, apiPost, apiPut, apiDelete } from '@/lib/api';
import { DataTable, type Column } from '@/components/DataTable';
import { Modal } from '@/components/Modal';
import { StatusBadge } from '@/components/StatusBadge';
import { ImageUpload } from '@/components/ImageUpload';
import { imageUrl } from '@/lib/config';
import { useToast } from '@/components/ui/Toast';

interface Slider {
  id: number;
  title: string | null;
  image: string | null;
  url: string | null;
  orderColumn: number;
  status: number;
}

export default function SlidersPage() {
  const toast = useToast();
  const [rows, setRows] = useState<Slider[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Partial<Slider> | null>(null);
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    const res = await apiGet<Slider[]>('/api/admin/sliders');
    setRows(res.data ?? []);
    setLoading(false);
  }
  useEffect(() => {
    load();
  }, []);

  async function save() {
    setSaving(true);
    const body = {
      title: editing?.title ?? null,
      url: editing?.url ?? null,
      orderColumn: editing?.orderColumn ?? 0,
      status: editing?.status ?? 1,
    };
    const res = editing?.id
      ? await apiPut(`/api/admin/sliders/${editing.id}`, body)
      : await apiPost('/api/admin/sliders', body);
    setSaving(false);
    if (res.success) {
      toast.success('Saved.');
      // Keep modal open on create so an image can be uploaded to the new id.
      if (!editing?.id && res.data) setEditing(res.data as Slider);
      else setEditing(null);
      load();
    } else toast.error(res.message || 'Failed.');
  }

  async function remove(id: number) {
    if (!confirm('Delete this slider?')) return;
    const res = await apiDelete(`/api/admin/sliders/${id}`);
    if (res.success) {
      toast.success('Deleted.');
      load();
    } else toast.error(res.message || 'Failed.');
  }

  const columns: Column<Slider>[] = [
    {
      key: 'image',
      label: 'Image',
      render: (r) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={imageUrl(r.image)} alt="" className="h-10 w-20 rounded object-cover" />
      ),
    },
    { key: 'title', label: 'Title', render: (r) => r.title ?? '—' },
    { key: 'url', label: 'URL', render: (r) => r.url ?? '—' },
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
        <h1 className="text-2xl font-bold text-slate-800">Sliders</h1>
        <button onClick={() => setEditing({ status: 1, orderColumn: 0 })} className="btn-primary">
          <Plus size={16} /> New Slider
        </button>
      </div>

      <DataTable columns={columns} rows={rows} loading={loading} />

      <Modal open={!!editing} onClose={() => setEditing(null)} title={editing?.id ? 'Edit Slider' : 'New Slider'}>
        {editing && (
          <div className="space-y-3">
            {editing.id ? (
              <div>
                <label className="label">Image</label>
                <ImageUpload
                  endpoint={`/api/admin/sliders/${editing.id}/image`}
                  current={editing.image}
                  onUploaded={(d) => setEditing({ ...editing, image: d?.image })}
                />
              </div>
            ) : (
              <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
                Save first, then upload an image.
              </p>
            )}
            <div>
              <label className="label">Title</label>
              <input className="input" value={editing.title ?? ''} onChange={(e) => setEditing({ ...editing, title: e.target.value })} />
            </div>
            <div>
              <label className="label">Link URL</label>
              <input className="input" value={editing.url ?? ''} onChange={(e) => setEditing({ ...editing, url: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Order</label>
                <input type="number" className="input" value={editing.orderColumn ?? 0} onChange={(e) => setEditing({ ...editing, orderColumn: Number(e.target.value) })} />
              </div>
              <div>
                <label className="label">Status</label>
                <select className="input" value={editing.status ?? 1} onChange={(e) => setEditing({ ...editing, status: Number(e.target.value) })}>
                  <option value={1}>Active</option>
                  <option value={0}>Inactive</option>
                </select>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={() => setEditing(null)} className="btn-ghost">Close</button>
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
