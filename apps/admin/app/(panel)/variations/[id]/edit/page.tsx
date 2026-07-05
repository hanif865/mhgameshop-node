'use client';

import { useEffect, useState } from 'react';
import { Loader2, Plus, Trash2 } from 'lucide-react';
import clsx from 'clsx';
import { apiGet, apiPut, apiPost, apiDelete } from '@/lib/api';
import { BulkAddModal } from '@/components/BulkAddModal';
import { StatusBadge } from '@/components/StatusBadge';
import { useToast } from '@/components/ui/Toast';

type Tab = 'main' | 'auto' | 'vouchers';

export default function EditVariation({ params }: { params: { id: string } }) {
  const id = params.id;
  const toast = useToast();
  const [tab, setTab] = useState<Tab>('main');
  const [form, setForm] = useState<any>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    apiGet<any>(`/api/admin/variations/${id}`).then((r) => setForm(r.data));
  }, [id]);

  async function save() {
    setSaving(true);
    const body = {
      title: form.title,
      price: Number(form.price),
      buyRate: Number(form.buyRate),
      stock: Number(form.stock),
      provider: form.provider ?? null,
      providerProductId: form.providerProductId ?? null,
      automatic: !!form.automatic,
      status: Number(form.status),
    };
    const res = await apiPut(`/api/admin/variations/${id}`, body);
    setSaving(false);
    if (res.success) toast.success('Saved.');
    else toast.error(res.message || 'Save failed.');
  }

  if (!form)
    return (
      <div className="flex justify-center py-16 text-slate-300">
        <Loader2 className="animate-spin" />
      </div>
    );

  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold text-slate-800">{form.title}</h1>
      <p className="mb-5 text-sm text-slate-400">{form.product?.title}</p>

      <div className="mb-5 flex gap-2 border-b border-slate-200">
        {(['main', 'auto', 'vouchers'] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={clsx(
              '-mb-px border-b-2 px-4 py-2 text-sm font-semibold capitalize',
              tab === t
                ? 'border-primary text-primary-dark'
                : 'border-transparent text-slate-400 hover:text-slate-600',
            )}
          >
            {t === 'auto' ? 'Auto Vouchers' : t === 'vouchers' ? 'Vouchers' : 'Main'}
          </button>
        ))}
      </div>

      {tab === 'main' && (
        <div className="card max-w-xl space-y-4 p-6">
          <div>
            <label className="label">Title</label>
            <input className="input" value={form.title ?? ''} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="label">Price</label>
              <input type="number" className="input" value={form.price ?? 0} onChange={(e) => setForm({ ...form, price: e.target.value })} />
            </div>
            <div>
              <label className="label">Buy Rate</label>
              <input type="number" className="input" value={form.buyRate ?? 0} onChange={(e) => setForm({ ...form, buyRate: e.target.value })} />
            </div>
            <div>
              <label className="label">Stock</label>
              <input type="number" className="input" value={form.stock ?? 0} onChange={(e) => setForm({ ...form, stock: e.target.value })} />
            </div>
          </div>
          <div>
            <label className="label">Provider Product ID</label>
            <input
              className="input"
              value={form.providerProductId ?? ''}
              onChange={(e) => setForm({ ...form, providerProductId: e.target.value })}
            />
          </div>
          <label className="flex items-center gap-2 text-sm font-medium text-slate-600">
            <input
              type="checkbox"
              checked={!!form.automatic}
              onChange={(e) => setForm({ ...form, automatic: e.target.checked })}
            />
            Enable Auto Topup
          </label>
          <div>
            <label className="label">Status</label>
            <select className="input w-40" value={form.status ?? 1} onChange={(e) => setForm({ ...form, status: Number(e.target.value) })}>
              <option value={1}>Active</option>
              <option value={0}>Inactive</option>
            </select>
          </div>
          <div className="flex justify-end">
            <button onClick={save} disabled={saving} className="btn-primary">
              {saving ? <Loader2 size={16} className="animate-spin" /> : 'Save'}
            </button>
          </div>
        </div>
      )}

      {tab === 'auto' && (
        <CodeManager
          listUrl={`/api/admin/variations/${id}/auto-vouchers`}
          bulkUrl={`/api/admin/variations/${id}/auto-vouchers/bulk`}
          deleteUrl={(codeId) => `/api/admin/variations/auto-vouchers/${codeId}`}
        />
      )}

      {tab === 'vouchers' && (
        <CodeManager
          listUrl={`/api/admin/vouchers?variationId=${id}&perPage=100`}
          bulkUrl={`/api/admin/vouchers/bulk`}
          bulkExtra={{ variationId: Number(id) }}
          deleteUrl={(codeId) => `/api/admin/vouchers/${codeId}`}
          paginated
        />
      )}
    </div>
  );
}

function CodeManager({
  listUrl,
  bulkUrl,
  bulkExtra,
  deleteUrl,
  paginated,
}: {
  listUrl: string;
  bulkUrl: string;
  bulkExtra?: Record<string, unknown>;
  deleteUrl: (id: number) => string;
  paginated?: boolean;
}) {
  const toast = useToast();
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [bulk, setBulk] = useState(false);

  async function load() {
    setLoading(true);
    const res = await apiGet(listUrl);
    const d = (res.data ?? res) as any;
    setRows(Array.isArray(d) ? d : d.items ?? []);
    setLoading(false);
  }
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listUrl]);

  async function remove(codeId: number) {
    if (!confirm('Delete this code?')) return;
    const res = await apiDelete(deleteUrl(codeId));
    if (res.success) {
      toast.success('Deleted.');
      load();
    } else toast.error(res.message || 'Failed.');
  }

  return (
    <div className="card p-5">
      <div className="mb-4 flex items-center justify-between">
        <p className="font-semibold text-slate-700">{rows.length} codes</p>
        <button onClick={() => setBulk(true)} className="btn-primary">
          <Plus size={16} /> Bulk Add
        </button>
      </div>

      {loading ? (
        <Loader2 className="mx-auto my-8 animate-spin text-slate-300" />
      ) : rows.length === 0 ? (
        <p className="py-8 text-center text-slate-400">No codes yet.</p>
      ) : (
        <div className="max-h-[420px] space-y-2 overflow-y-auto">
          {rows.map((c) => (
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

      <BulkAddModal
        open={bulk}
        onClose={() => setBulk(false)}
        endpoint={bulkUrl}
        extra={bulkExtra}
        onDone={load}
      />
    </div>
  );
}
