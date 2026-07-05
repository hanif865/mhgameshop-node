'use client';

import { useEffect, useState } from 'react';
import { Plus, Trash2, Loader2 } from 'lucide-react';
import { apiGet, apiPost, apiDelete, pageData } from '@/lib/api';
import { DataTable, type Column } from '@/components/DataTable';
import { Modal } from '@/components/Modal';
import { StatusBadge } from '@/components/StatusBadge';
import { useToast } from '@/components/ui/Toast';

interface VoucherRow {
  id: number;
  code: string;
  status: string;
  variation?: { title: string; product?: { title: string } };
}

/** Shared list for /vouchers and /auto-vouchers (filter tabs + bulk add). */
export function VoucherAdmin({ base, title }: { base: string; title: string }) {
  const toast = useToast();
  const [rows, setRows] = useState<VoucherRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [filter, setFilter] = useState('all');
  const [bulk, setBulk] = useState(false);
  const [variationId, setVariationId] = useState('');
  const [codes, setCodes] = useState('');
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    const res = await apiGet(`${base}?page=${page}&filter=${filter}`);
    const d = pageData<VoucherRow>(res);
    setRows(d.items);
    setTotalPages(d.totalPages);
    setLoading(false);
  }
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, filter]);

  async function bulkAdd() {
    if (!variationId || !codes.trim()) return toast.error('Variation ID and codes are required.');
    setSaving(true);
    const res = await apiPost(`${base}/bulk`, { variationId: Number(variationId), codes });
    setSaving(false);
    if (res.success) {
      toast.success(res.message || 'Added.');
      setBulk(false);
      setCodes('');
      load();
    } else toast.error(res.message || 'Failed.');
  }

  async function remove(id: number) {
    if (!confirm('Delete this code?')) return;
    const res = await apiDelete(`${base}/${id}`);
    if (res.success) {
      toast.success('Deleted.');
      load();
    } else toast.error(res.message || 'Failed.');
  }

  const columns: Column<VoucherRow>[] = [
    { key: 'id', label: 'ID' },
    { key: 'code', label: 'Code', render: (r) => <code className="text-xs">{r.code}</code> },
    {
      key: 'variation',
      label: 'Variation',
      render: (r) => (
        <span>
          {r.variation?.product?.title} · {r.variation?.title}
        </span>
      ),
    },
    { key: 'status', label: 'Status', render: (r) => <StatusBadge status={r.status} /> },
    {
      key: 'actions',
      label: '',
      render: (r) => (
        <div className="flex justify-end">
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
        <h1 className="text-2xl font-bold text-slate-800">{title}</h1>
        <button onClick={() => setBulk(true)} className="btn-primary">
          <Plus size={16} /> Bulk Add
        </button>
      </div>

      <DataTable
        columns={columns}
        rows={rows}
        loading={loading}
        page={page}
        totalPages={totalPages}
        onPageChange={setPage}
        filters={[
          {
            value: filter,
            onChange: (v) => {
              setPage(1);
              setFilter(v);
            },
            options: [
              { value: 'all', label: 'All' },
              { value: 'available', label: 'Available' },
              { value: 'sold', label: 'Sold' },
            ],
          },
        ]}
      />

      <Modal open={bulk} onClose={() => setBulk(false)} title="Bulk Add Codes" size="lg">
        <div className="space-y-3">
          <div>
            <label className="label">Variation ID</label>
            <input
              className="input"
              value={variationId}
              onChange={(e) => setVariationId(e.target.value)}
              placeholder="e.g. 191"
            />
          </div>
          <div>
            <label className="label">Codes (one per line)</label>
            <textarea
              rows={8}
              className="input font-mono text-xs"
              value={codes}
              onChange={(e) => setCodes(e.target.value)}
            />
          </div>
          <div className="flex justify-end gap-2">
            <button onClick={() => setBulk(false)} className="btn-ghost">
              Cancel
            </button>
            <button onClick={bulkAdd} disabled={saving} className="btn-primary">
              {saving ? <Loader2 size={16} className="animate-spin" /> : 'Add Codes'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
