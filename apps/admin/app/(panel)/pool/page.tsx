'use client';

import { useEffect, useState } from 'react';
import { Plus, Loader2 } from 'lucide-react';
import { apiGet, apiPost } from '@/lib/api';
import { Modal } from '@/components/Modal';
import { useToast } from '@/components/ui/Toast';

interface PoolRow {
  uc: number;
  available: number;
  sold: number;
  invalid: number;
}
interface AddResult {
  added: number;
  duplicate: number;
  skipped: string[];
  byUc: Record<string, number>;
}
interface CodeRow {
  id: number;
  code: string;
  status: string;
  order_id: number | null;
  order_status: string | null;
  updated_at: string | null;
  stuck: boolean;
}
interface StuckRow {
  id: number;
  uc: number;
  code: string;
  order_id: number;
  updated_at: string;
}

export default function PoolPage() {
  const toast = useToast();
  const [rows, setRows] = useState<PoolRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);
  const [codes, setCodes] = useState('');
  const [result, setResult] = useState<AddResult | null>(null);
  const [viewUc, setViewUc] = useState<number | null>(null);
  const [history, setHistory] = useState<CodeRow[]>([]);
  const [stuck, setStuck] = useState<StuckRow[]>([]);

  async function load() {
    setLoading(true);
    const [s, st] = await Promise.all([
      apiGet<PoolRow[]>('/api/admin/pool/stock'),
      apiGet<StuckRow[]>('/api/admin/pool/stuck'),
    ]);
    setRows(s.data ?? []);
    setStuck(st.data ?? []);
    setLoading(false);
  }
  useEffect(() => {
    load();
  }, []);

  async function openHistory(uc: number) {
    setViewUc(uc);
    const res = await apiGet<CodeRow[]>(`/api/admin/pool/codes/${uc}`);
    setHistory(res.data ?? []);
  }

  async function restoreStuck() {
    if (!confirm(`Return ${stuck.length} stuck code(s) to stock?\n\nOnly do this if these codes were NOT actually redeemed.`)) return;
    const res = await apiPost('/api/admin/pool/restore', { ids: stuck.map((s) => s.id) });
    if (res.success) {
      toast.success('Returned to stock.');
      load();
    } else toast.error(res.message || 'Failed.');
  }

  async function submit() {
    const list = codes.split('\n').map((s) => s.trim()).filter(Boolean);
    if (!list.length) return toast.error('Paste some codes first.');
    setSaving(true);
    const res = await apiPost<AddResult>('/api/admin/pool/stock', { codes: list });
    setSaving(false);
    if (res.success && res.data) {
      setResult(res.data);
      setCodes('');
      toast.success(`Added ${res.data.added}, duplicate ${res.data.duplicate}.`);
      load();
    } else toast.error(res.message || 'Failed.');
  }

  return (
    <div>
      <div className="mb-5 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Voucher Pool</h1>
          <p className="text-sm text-slate-500">UC auto-detected from each code&apos;s serial letter.</p>
        </div>
        <button onClick={() => { setResult(null); setAdding(true); }} className="btn-primary">
          <Plus size={16} /> Add Codes
        </button>
      </div>

      {/* ক্যান্সেল অর্ডারে আটকে থাকা কোড — খরচ দেখাচ্ছে কিন্তু ফেরত আসেনি */}
      {stuck.length > 0 && (
        <div className="mb-4 rounded-lg border border-amber-300 bg-amber-50 p-4">
          <p className="font-semibold text-amber-800">
            ⚠️ {stuck.length} code(s) stuck — order was cancelled but the code never returned to stock
          </p>
          <ul className="mt-2 space-y-1 text-sm text-amber-900">
            {stuck.map((s) => (
              <li key={s.id} className="font-mono text-xs">
                {s.uc} UC · {s.code.slice(0, 17)}… · order #{s.order_id}
              </li>
            ))}
          </ul>
          <button onClick={restoreStuck} className="btn-primary mt-3">
            Return to stock
          </button>
          <p className="mt-2 text-xs text-amber-700">
            Only return them if these codes were not actually redeemed at Garena.
          </p>
        </div>
      )}

      {loading ? (
        <div className="py-10 text-center text-slate-400"><Loader2 className="mx-auto animate-spin" /></div>
      ) : rows.length === 0 ? (
        <p className="rounded-lg bg-slate-50 p-6 text-center text-slate-500">Pool is empty.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase text-slate-400">
              <tr>
                <th className="px-4 py-3">UC</th>
                <th className="px-4 py-3">Available</th>
                <th className="px-4 py-3">Sold</th>
                <th className="px-4 py-3">Invalid</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr
                  key={r.uc}
                  onClick={() => openHistory(r.uc)}
                  className="cursor-pointer border-t border-slate-100 hover:bg-slate-50"
                >
                  <td className="px-4 py-3 font-semibold">{r.uc} UC</td>
                  <td className="px-4 py-3 font-bold text-green-600">{r.available}</td>
                  <td className="px-4 py-3 text-slate-500">{r.sold}</td>
                  <td className="px-4 py-3 text-red-500">{r.invalid}</td>
                  <td className="px-4 py-3 text-right text-xs text-slate-400">history →</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* কোড ইতিহাস — কোনটা কখন কোন অর্ডারে গেল */}
      <Modal open={viewUc !== null} onClose={() => setViewUc(null)} title={`${viewUc} UC — code history`}>
        <div className="max-h-[60vh] overflow-y-auto">
          {history.length === 0 ? (
            <p className="text-sm text-slate-400">No codes.</p>
          ) : (
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-white text-left text-slate-400">
                <tr>
                  <th className="py-1">Code</th>
                  <th className="py-1">Status</th>
                  <th className="py-1">Order</th>
                  <th className="py-1">When</th>
                </tr>
              </thead>
              <tbody>
                {history.map((c) => (
                  <tr key={c.id} className={`border-t border-slate-100 ${c.stuck ? 'bg-amber-50' : ''}`}>
                    <td className="py-1.5 font-mono">{c.code.slice(0, 17)}…</td>
                    <td className="py-1.5">
                      <span
                        className={
                          c.status === 'available'
                            ? 'text-green-600'
                            : c.status === 'invalid'
                              ? 'text-red-500'
                              : 'text-slate-500'
                        }
                      >
                        {c.status}
                      </span>
                      {c.stuck && <span className="ml-1 text-amber-600">⚠️ stuck</span>}
                    </td>
                    <td className="py-1.5">
                      {c.order_id ? (
                        <>
                          #{c.order_id}
                          {c.order_status && <span className="ml-1 text-slate-400">({c.order_status})</span>}
                        </>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="py-1.5 text-slate-400">
                      {c.updated_at ? new Date(c.updated_at).toLocaleString() : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </Modal>

      <Modal open={adding} onClose={() => setAdding(false)} title="Add Voucher Codes">
        <div className="space-y-3">
          <p className="text-sm text-slate-500">
            Paste one code per line. UC is detected automatically — no need to pick it.
          </p>
          <textarea
            className="input h-48 font-mono text-xs"
            placeholder={'BDMB-T-S-01234567 1111-2222-3333-4444\nUPBD-P-S-01234568 5555-6666-7777-8888'}
            value={codes}
            onChange={(e) => setCodes(e.target.value)}
          />
          {result && (
            <div className="rounded-lg bg-slate-50 p-3 text-sm">
              <p className="font-semibold text-green-600">Added {result.added} · Duplicate {result.duplicate}</p>
              {Object.entries(result.byUc).length > 0 && (
                <ul className="mt-1 text-slate-600">
                  {Object.entries(result.byUc).sort((a, b) => Number(a[0]) - Number(b[0])).map(([uc, n]) => (
                    <li key={uc}>{uc} UC → {n}</li>
                  ))}
                </ul>
              )}
              {result.skipped.length > 0 && (
                <p className="mt-2 text-amber-600">Skipped {result.skipped.length} (not a code): {result.skipped.join(', ')}</p>
              )}
            </div>
          )}
          <div className="flex justify-end gap-2">
            <button onClick={() => setAdding(false)} className="btn-ghost">Close</button>
            <button onClick={submit} disabled={saving} className="btn-primary">
              {saving ? <Loader2 size={16} className="animate-spin" /> : 'Add'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
