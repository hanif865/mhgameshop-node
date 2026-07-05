'use client';

import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { apiGet, apiPut } from '@/lib/api';
import { StatusBadge } from '@/components/StatusBadge';
import { money, formatDate } from '@/lib/format';
import { useToast } from '@/components/ui/Toast';

const STATUSES = ['pending', 'processing', 'autoprocessing', 'completed', 'cancelled', 'hold'];

export default function OrderDetail({ params }: { params: { id: string } }) {
  const toast = useToast();
  const [order, setOrder] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ status: '', voucherCode: '', deliveryMessage: '' });

  async function load() {
    const res = await apiGet<any>(`/api/admin/orders/${params.id}`);
    if (res.data) {
      setOrder(res.data);
      setForm({
        status: res.data.status,
        voucherCode: res.data.voucherCode ?? '',
        deliveryMessage: res.data.deliveryMessage ?? '',
      });
    }
  }
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id]);

  async function save() {
    setSaving(true);
    const res = await apiPut(`/api/admin/orders/${params.id}`, {
      status: form.status,
      voucherCode: form.voucherCode || null,
      deliveryMessage: form.deliveryMessage || null,
    });
    setSaving(false);
    if (res.success) {
      toast.success('Order updated.');
      load();
    } else toast.error(res.message || 'Update failed.');
  }

  if (!order)
    return (
      <div className="flex justify-center py-16 text-slate-300">
        <Loader2 className="animate-spin" />
      </div>
    );

  const pkg = order.variation?.title ?? order.comboPackage?.title ?? order.product?.title;

  return (
    <div>
      <div className="mb-5 flex items-center gap-3">
        <h1 className="text-2xl font-bold text-slate-800">Order #{order.id}</h1>
        <StatusBadge status={order.status} />
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_360px]">
        <div className="space-y-5">
          <div className="card p-5">
            <h2 className="mb-3 font-bold text-slate-800">Details</h2>
            <dl className="grid grid-cols-2 gap-y-3 text-sm">
              <Item label="Customer" value={order.user?.name} />
              <Item label="Email" value={order.user?.email} />
              <Item label="Package" value={pkg} />
              <Item label="Player ID" value={order.accountInfo?.player_id ?? '—'} />
              <Item label="Amount" value={money(order.amount)} />
              <Item label="Profit" value={money(order.profit)} />
              <Item label="Payment" value={order.paymentMethod ?? '—'} />
              <Item label="Date" value={formatDate(order.createdAt)} />
            </dl>
          </div>

          {order.comboOrderItems?.length > 0 && (
            <div className="card p-5">
              <h2 className="mb-3 font-bold text-slate-800">Combo Items</h2>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="th">#</th>
                      <th className="th">Item</th>
                      <th className="th">Status</th>
                      <th className="th">Voucher</th>
                      <th className="th">Response</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {order.comboOrderItems.map((it: any) => (
                      <tr key={it.id}>
                        <td className="td">{it.itemIndex}</td>
                        <td className="td">{it.comboPackageItem?.title ?? '—'}</td>
                        <td className="td"><StatusBadge status={it.status} /></td>
                        <td className="td"><code className="text-xs">{it.comboVoucher?.code ?? '—'}</code></td>
                        <td className="td max-w-[200px] truncate text-slate-400">{it.responseContent ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        <div className="card h-fit p-5">
          <h2 className="mb-3 font-bold text-slate-800">Manage</h2>
          <div className="space-y-3">
            <div>
              <label className="label">Status</label>
              <select
                className="input"
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value })}
              >
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Voucher Code</label>
              <textarea
                rows={2}
                className="input"
                value={form.voucherCode}
                onChange={(e) => setForm({ ...form, voucherCode: e.target.value })}
              />
            </div>
            <div>
              <label className="label">Delivery Message</label>
              <textarea
                rows={3}
                className="input"
                value={form.deliveryMessage}
                onChange={(e) => setForm({ ...form, deliveryMessage: e.target.value })}
              />
            </div>
            <button onClick={save} disabled={saving} className="btn-primary w-full">
              {saving ? <Loader2 size={16} className="animate-spin" /> : 'Save Changes'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Item({ label, value }: { label: string; value?: string }) {
  return (
    <div>
      <dt className="text-xs text-slate-400">{label}</dt>
      <dd className="font-medium text-slate-700">{value ?? '—'}</dd>
    </div>
  );
}
