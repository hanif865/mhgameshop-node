'use client';

import { useEffect, useState } from 'react';
import { Plus, Pencil, Trash2, Loader2 } from 'lucide-react';
import { apiGet, apiPost, apiPut, apiDelete } from '@/lib/api';
import { DataTable, type Column } from '@/components/DataTable';
import { Modal } from '@/components/Modal';
import { StatusBadge } from '@/components/StatusBadge';
import { useToast } from '@/components/ui/Toast';

interface Page {
  id: number;
  title: string;
  slug: string;
  content: string;
  status: number;
}

export default function PagesPage() {
  const toast = useToast();
  const [rows, setRows] = useState<Page[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Partial<Page> | null>(null);
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    const res = await apiGet<Page[]>('/api/admin/pages');
    setRows(res.data ?? []);
    setLoading(false);
  }
  useEffect(() => {
    load();
  }, []);

  async function save() {
    if (!editing?.title || !editing?.slug) return toast.error('Title and slug required.');
    setSaving(true);
    const body = {
      title: editing.title,
      slug: editing.slug,
      content: editing.content ?? '',
      status: editing.status ?? 1,
    };
    const res = editing.id
      ? await apiPut(`/api/admin/pages/${editing.id}`, body)
      : await apiPost('/api/admin/pages', body);
    setSaving(false);
    if (res.success) {
      toast.success('Saved.');
      setEditing(null);
      load();
    } else toast.error(res.message || 'Failed.');
  }

  async function remove(id: number) {
    if (!confirm('Delete this page?')) return;
    const res = await apiDelete(`/api/admin/pages/${id}`);
    if (res.success) {
      toast.success('Deleted.');
      load();
    } else toast.error(res.message || 'Failed.');
  }

  const columns: Column<Page>[] = [
    { key: 'id', label: 'ID' },
    { key: 'title', label: 'Title' },
    { key: 'slug', label: 'Slug' },
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
        <h1 className="text-2xl font-bold text-slate-800">Pages</h1>
        <button onClick={() => setEditing({ status: 1 })} className="btn-primary">
          <Plus size={16} /> New Page
        </button>
      </div>

      <DataTable columns={columns} rows={rows} loading={loading} />

      <Modal open={!!editing} onClose={() => setEditing(null)} title={editing?.id ? 'Edit Page' : 'New Page'} size="lg">
        {editing && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Title</label>
                <input className="input" value={editing.title ?? ''} onChange={(e) => setEditing({ ...editing, title: e.target.value })} />
              </div>
              <div>
                <label className="label">Slug</label>
                <input className="input" value={editing.slug ?? ''} onChange={(e) => setEditing({ ...editing, slug: e.target.value })} />
              </div>
            </div>
            <div>
              <label className="label">Content (HTML)</label>
              <textarea rows={10} className="input font-mono text-xs" value={editing.content ?? ''} onChange={(e) => setEditing({ ...editing, content: e.target.value })} />
            </div>
            <div>
              <label className="label">Status</label>
              <select className="input w-40" value={editing.status ?? 1} onChange={(e) => setEditing({ ...editing, status: Number(e.target.value) })}>
                <option value={1}>Active</option>
                <option value={0}>Inactive</option>
              </select>
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={() => setEditing(null)} className="btn-ghost">Cancel</button>
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
