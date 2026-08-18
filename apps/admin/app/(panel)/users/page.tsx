'use client';

import { useEffect, useState } from 'react';
import { Pencil, Loader2, Plus, Trash2 } from 'lucide-react';
import { apiGet, apiPut, apiPost, apiDelete, pageData } from '@/lib/api';
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
interface PriceRow {
  variation_id: number;
  price: number;
  title: string;
  ptitle: string;
}
interface Pack {
  id: number;
  title: string;
  price: number;
  product: string;
}

export default function UsersPage() {
  const toast = useToast();
  const [rows, setRows] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<User | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [saving, setSaving] = useState(false);
  // পার-ইউজার দাম — এই ইউজারের কাস্টম দাম Edit User মডালেই
  const [prices, setPrices] = useState<PriceRow[]>([]);
  const [packs, setPacks] = useState<Pack[]>([]);
  const [pkQuery, setPkQuery] = useState('');
  const [newVid, setNewVid] = useState('');
  const [newPrice, setNewPrice] = useState('');
  const [tgDiscount, setTgDiscount] = useState('');

  async function loadPrices(userId: number) {
    const res = await apiGet<{ prices: PriceRow[]; user?: { telegram_discount?: number } }>(
      `/api/admin/user-prices?user=${userId}`,
    );
    setPrices(res.data?.prices ?? []);
    setTgDiscount(String(res.data?.user?.telegram_discount ?? 0));
  }

  async function openEdit(u: User | null) {
    setNewPassword('');
    setPrices([]);
    setPkQuery('');
    setNewVid('');
    setNewPrice('');
    setEditing(u);
    if (u) {
      loadPrices(u.id);
      if (!packs.length) {
        const p = await apiGet<{ variations: Pack[] }>('/api/admin/pool/packs');
        setPacks(p.data?.variations ?? []);
      }
    }
  }

  async function addPrice() {
    if (!editing || !newVid || newPrice === '') return toast.error('Pick a package and price.');
    const res = await apiPost('/api/admin/user-prices', {
      user: String(editing.id),
      variation_id: Number(newVid),
      price: Number(newPrice),
    });
    if (res.success) {
      toast.success('Price set.');
      setNewVid('');
      setNewPrice('');
      setPkQuery('');
      loadPrices(editing.id);
    } else toast.error(res.message || 'Failed.');
  }

  async function removePrice(variationId: number) {
    if (!editing) return;
    const res = await apiDelete('/api/admin/user-prices', { user: String(editing.id), variation_id: variationId });
    if (res.success) {
      toast.success('Removed.');
      loadPrices(editing.id);
    } else toast.error(res.message || 'Failed.');
  }

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
      telegram_discount: Number(tgDiscount) || 0,
      ...(newPassword ? { password: newPassword } : {}),
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
        <button onClick={() => openEdit(r)} className="btn-ghost px-2 py-1">
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

      <Modal open={!!editing} onClose={() => openEdit(null)} title="Edit User">
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
            <div>
              <label className="label">Set / Reset Password</label>
              <input
                type="text"
                className="input"
                placeholder="Leave blank to keep current password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
              />
              <p className="mt-1 text-xs text-slate-400">
                Set a password so this user (e.g. a new admin) can log in with email + password.
              </p>
            </div>

            {/* টেলিগ্রাম ফ্ল্যাট ছাড় — শুধু বট থেকে অর্ডারে */}
            <div className="border-t border-slate-100 pt-3">
              <label className="label">Telegram Discount ৳ (per package, Telegram only)</label>
              <input
                type="number"
                className="input"
                value={tgDiscount}
                onChange={(e) => setTgDiscount(e.target.value)}
              />
              <p className="mt-1 text-xs text-slate-400">
                এই ইউজার টেলিগ্রাম বট থেকে অর্ডার করলে প্রতিটি প্যাকেজে এত টাকা কম পড়বে (ওয়েবসাইটে নয়)।
              </p>
            </div>

            {/* পার-ইউজার কাস্টম দাম — এই ইউজারের জন্য আলাদা দাম */}
            <div className="border-t border-slate-100 pt-3">
              <label className="label">Custom Prices (reseller pricing)</label>
              {prices.length === 0 ? (
                <p className="mb-2 text-xs text-slate-400">No custom prices — pays global prices.</p>
              ) : (
                <div className="mb-2 space-y-1">
                  {prices.map((p) => (
                    <div key={p.variation_id} className="flex items-center justify-between rounded bg-slate-50 px-2 py-1 text-sm">
                      <span>{p.ptitle} — {p.title}: <b className="text-primary-dark">{money(p.price)}</b></span>
                      <button onClick={() => removePrice(p.variation_id)} className="text-red-500 hover:text-red-700">
                        <Trash2 size={13} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <input
                className="input mb-1 text-sm"
                placeholder="🔍 Search package…"
                value={pkQuery}
                onChange={(e) => setPkQuery(e.target.value)}
              />
              <div className="flex gap-2">
                <select className="input text-sm" value={newVid} onChange={(e) => setNewVid(e.target.value)} size={1}>
                  <option value="">— package —</option>
                  {packs
                    .filter((v) => {
                      const q = pkQuery.trim().toLowerCase();
                      return !q || `${v.product} ${v.title}`.toLowerCase().includes(q);
                    })
                    .map((v) => (
                      <option key={v.id} value={v.id}>{v.product} — {v.title} ({money(v.price)})</option>
                    ))}
                </select>
                <input
                  className="input w-24 text-sm"
                  type="number"
                  placeholder="৳"
                  value={newPrice}
                  onChange={(e) => setNewPrice(e.target.value)}
                />
                <button onClick={addPrice} className="btn-primary px-3"><Plus size={14} /></button>
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <button onClick={() => openEdit(null)} className="btn-ghost">
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
