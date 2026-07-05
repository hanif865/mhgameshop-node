'use client';

import { useEffect, useState } from 'react';
import { Pencil, Loader2 } from 'lucide-react';
import { apiGet, apiPut, pageData } from '@/lib/api';
import { DataTable, type Column } from '@/components/DataTable';
import { Modal } from '@/components/Modal';
import { StatusBadge } from '@/components/StatusBadge';
import { money, formatDate } from '@/lib/format';
import { useToast } from '@/components/ui/Toast';

interface User {
  id: number;
  name: string;
  email: string;
  balance: string;
  role: string;
  status: number;
  createdAt: string;
  _count?: { orders: number };
}

export default function UsersPage() {
  const toast = useToast();
  const [rows, setRows] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<User | null>(null);
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    const res = await apiGet(`/api/admin/users?page=${page}&search=${encodeURIComponent(search)}`);
    const d = pageData<User>(res);
    setRows(d.items);
    setTotalPages(d.totalPages);
    setLoading(false);
  }
  useEffect(() => {
    const t = setTimeout(load, search ? 350 : 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, search]);

  async function save() {
    if (!editing) return;
    setSaving(true);
    const res = await apiPut(`/api/admin/users/${editing.id}`, {
      balance: Number(editing.balance),
      status: editing.status,
      role: editing.role,
    });
    setSaving(false);
    if (res.success) {
      toast.success('User updated.');
      setEditing(null);
      load();
    } else toast.error(res.message || 'Failed.');
  }

  const columns: Column<User>[] = [
    { key: 'id', label: 'ID' },
    {
      key: 'name',
      label: 'User',
      render: (r) => (
        <div>
          <p className="font-medium text-slate-800">{r.name}</p>
          <p className="text-xs text-slate-400">{r.email}</p>
        </div>
      ),
    },
    { key: 'balance', label: 'Balance', render: (r) => money(r.balance) },
    { key: 'orders', label: 'Orders', render: (r) => r._count?.orders ?? 0 },
    { key: 'role', label: 'Role', render: (r) => <span className="capitalize">{r.role}</span> },
    { key: 'status', label: 'Status', render: (r) => <StatusBadge status={r.status} /> },
    { key: 'created', label: 'Joined', render: (r) => formatDate(r.createdAt) },
    {
      key: 'actions',
      label: '',
      render: (r) => (
        <button onClick={() => setEditing(r)} className="btn-ghost px-2 py-1">
          <Pencil size={14} />
        </button>
      ),
    },
  ];

  return (
    <div>
      <h1 className="mb-5 text-2xl font-bold text-slate-800">Users</h1>
      <DataTable
        columns={columns}
        rows={rows}
        loading={loading}
        page={page}
        totalPages={totalPages}
        onPageChange={setPage}
        search={{
          value: search,
          onChange: (v) => {
            setPage(1);
            setSearch(v);
          },
          placeholder: 'Search name / email…',
        }}
      />

      <Modal open={!!editing} onClose={() => setEditing(null)} title="Edit User">
        {editing && (
          <div className="space-y-3">
            <p className="text-sm text-slate-500">{editing.email}</p>
            <div>
              <label className="label">Balance (৳)</label>
              <input
                type="number"
                className="input"
                value={editing.balance}
                onChange={(e) => setEditing({ ...editing, balance: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Role</label>
                <select
                  className="input"
                  value={editing.role}
                  onChange={(e) => setEditing({ ...editing, role: e.target.value })}
                >
                  <option value="user">User</option>
                  <option value="reseller">Reseller</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
              <div>
                <label className="label">Status</label>
                <select
                  className="input"
                  value={editing.status}
                  onChange={(e) => setEditing({ ...editing, status: Number(e.target.value) })}
                >
                  <option value={1}>Active</option>
                  <option value={0}>Banned</option>
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
