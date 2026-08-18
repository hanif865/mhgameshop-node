'use client';

import { useState } from 'react';
import { Search, Plus, Trash2, Loader2 } from 'lucide-react';
import { apiGet, apiPost, apiDelete } from '@/lib/api';
import { money } from '@/lib/format';
import { Modal } from '@/components/Modal';
import { useToast } from '@/components/ui/Toast';

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
interface Loaded {
  user: { id: number; name: string; email: string };
  prices: PriceRow[];
}

export default function UserPricesPage() {
  const toast = useToast();
  const [query, setQuery] = useState('');
  const [data, setData] = useState<Loaded | null>(null);
  const [loading, setLoading] = useState(false);
  const [packs, setPacks] = useState<Pack[]>([]);
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);
  const [vid, setVid] = useState('');
  const [price, setPrice] = useState('');
  const [pkQuery, setPkQuery] = useState(''); // প্যাকেজ সার্চ

  async function search() {
    const q = query.trim();
    if (!q) return;
    setLoading(true);
    const res = await apiGet<Loaded>(`/api/admin/user-prices?user=${encodeURIComponent(q)}`);
    setLoading(false);
    if (res.success && res.data) setData(res.data);
    else {
      setData(null);
      toast.error(res.message || 'User not found.');
    }
  }

  async function openAdd() {
    if (!packs.length) {
      const p = await apiGet<{ variations: Pack[] }>('/api/admin/pool/packs');
      setPacks(p.data?.variations ?? []);
    }
    setVid('');
    setPrice('');
    setPkQuery('');
    setAdding(true);
  }

  async function save() {
    if (!data || !vid || price === '') return toast.error('Pick a package and price.');
    setSaving(true);
    const res = await apiPost('/api/admin/user-prices', {
      user: String(data.user.id),
      variation_id: Number(vid),
      price: Number(price),
    });
    setSaving(false);
    if (res.success) {
      toast.success('Price set.');
      setAdding(false);
      search();
    } else toast.error(res.message || 'Failed.');
  }

  async function remove(variationId: number) {
    if (!data || !confirm('Remove this custom price?')) return;
    const res = await apiDelete('/api/admin/user-prices', { user: String(data.user.id), variation_id: variationId });
    if (res.success) {
      toast.success('Removed.');
      search();
    } else toast.error(res.message || 'Failed.');
  }

  return (
    <div>
      <div className="mb-5">
        <h1 className="text-2xl font-bold text-slate-800">User Prices</h1>
        <p className="text-sm text-slate-500">Custom per-user pricing (reseller pricing).</p>
      </div>

      <div className="mb-5 flex gap-2">
        <input
          className="input max-w-sm"
          placeholder="Email, user id, or telegram id"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && search()}
        />
        <button onClick={search} className="btn-primary">
          {loading ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />} Find
        </button>
      </div>

      {data && (
        <div>
          <div className="mb-3 flex items-center justify-between">
            <div>
              <p className="font-semibold text-slate-800">{data.user.name}</p>
              <p className="text-sm text-slate-500">{data.user.email}</p>
            </div>
            <button onClick={openAdd} className="btn-primary"><Plus size={16} /> Set Price</button>
          </div>

          {data.prices.length === 0 ? (
            <p className="rounded-lg bg-slate-50 p-6 text-center text-slate-500">
              No custom prices — this user pays global prices.
            </p>
          ) : (
            <div className="space-y-2">
              {data.prices.map((p) => (
                <div key={p.variation_id} className="flex items-center justify-between rounded-lg border border-slate-200 bg-white p-3">
                  <div>
                    <p className="font-medium text-slate-800">{p.ptitle} — {p.title}</p>
                    <p className="text-sm font-bold text-primary-dark">{money(p.price)}</p>
                  </div>
                  <button onClick={() => remove(p.variation_id)} className="btn-danger px-2 py-1"><Trash2 size={14} /></button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <Modal open={adding} onClose={() => setAdding(false)} title="Set Custom Price">
        <div className="space-y-3">
          <div>
            <label className="label">Package</label>
            <input
              className="input mb-2"
              placeholder="🔍 Search package…"
              value={pkQuery}
              onChange={(e) => setPkQuery(e.target.value)}
            />
            <select className="input" value={vid} onChange={(e) => setVid(e.target.value)} size={8}>
              {(() => {
                const q = pkQuery.trim().toLowerCase();
                const list = packs.filter((v) => !q || `${v.product} ${v.title}`.toLowerCase().includes(q));
                if (list.length === 0) return <option value="">No match</option>;
                return list.map((v) => (
                  <option key={v.id} value={v.id}>{v.product} — {v.title} (global {money(v.price)})</option>
                ));
              })()}
            </select>
          </div>
          <div>
            <label className="label">Price for this user (৳)</label>
            <input className="input" type="number" value={price} onChange={(e) => setPrice(e.target.value)} />
          </div>
          <div className="flex justify-end gap-2">
            <button onClick={() => setAdding(false)} className="btn-ghost">Cancel</button>
            <button onClick={save} disabled={saving} className="btn-primary">
              {saving ? <Loader2 size={16} className="animate-spin" /> : 'Save'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
