'use client';

import { useEffect, useState } from 'react';
import { Plus, Pencil, Trash2, Loader2 } from 'lucide-react';
import { apiGet, apiPost, apiPut, apiDelete } from '@/lib/api';
import { DataTable, type Column } from '@/components/DataTable';
import { Modal } from '@/components/Modal';
import { StatusBadge } from '@/components/StatusBadge';
import { useToast } from '@/components/ui/Toast';

interface Shell {
  id: number;
  name: string;
  username: string;
  password: string;
  autocode: string;
  prefix: string | null;
  shellbalance: string | null;
  tgbotid: string | null;
  status: number;
}

const FIELDS: { key: keyof Shell; label: string }[] = [
  { key: 'name', label: 'Name' },
  { key: 'username', label: 'Username' },
  { key: 'password', label: 'Password' },
  { key: 'autocode', label: 'Auto Code' },
  { key: 'prefix', label: 'Shell Prefix (sent as "code")' },
  { key: 'shellbalance', label: 'Balance' },
  { key: 'tgbotid', label: 'Telegram Bot ID' },
];

export default function ShellsPage() {
  const toast = useToast();
  const [rows, setRows] = useState<Shell[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Partial<Shell> | null>(null);
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    const res = await apiGet<Shell[]>('/api/admin/shells');
    setRows(res.data ?? []);
    setLoading(false);
  }
  useEffect(() => {
    load();
  }, []);

  async function save() {
    if (!editing?.name || !editing?.username) return toast.error('Name and username required.');
    setSaving(true);
    const res = editing.id
      ? await apiPut(`/api/admin/shells/${editing.id}`, editing)
      : await apiPost('/api/admin/shells', editing);
    setSaving(false);
    if (res.success) {
      toast.success('Saved.');
      setEditing(null);
      load();
    } else toast.error(res.message || 'Failed.');
  }

  async function remove(id: number) {
    if (!confirm('Delete this shell?')) return;
    const res = await apiDelete(`/api/admin/shells/${id}`);
    if (res.success) {
      toast.success('Deleted.');
      load();
    } else toast.error(res.message || 'Failed.');
  }

  const columns: Column<Shell>[] = [
    { key: 'id', label: 'ID' },
    { key: 'name', label: 'Name' },
    { key: 'username', label: 'Username' },
    { key: 'shellbalance', label: 'Balance', render: (r) => r.shellbalance ?? '—' },
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
        <h1 className="text-2xl font-bold text-slate-800">Shells</h1>
        <button onClick={() => setEditing({ status: 1, name: 'MY' })} className="btn-primary">
          <Plus size={16} /> New Shell
        </button>
      </div>

      <DataTable columns={columns} rows={rows} loading={loading} />

      <Modal open={!!editing} onClose={() => setEditing(null)} title={editing?.id ? 'Edit Shell' : 'New Shell'}>
        {editing && (
          <div className="space-y-3">
            {FIELDS.map((f) => (
              <div key={f.key}>
                <label className="label">{f.label}</label>
                <input
                  className="input"
                  value={(editing[f.key] as string) ?? ''}
                  onChange={(e) => setEditing({ ...editing, [f.key]: e.target.value })}
                />
              </div>
            ))}
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
