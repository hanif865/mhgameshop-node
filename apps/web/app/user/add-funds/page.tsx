'use client';

import { useState } from 'react';
import { Loader2, Wallet } from 'lucide-react';
import { apiPost } from '@/lib/api';
import { useToast } from '@/components/ui/Toast';
import { useAuth } from '@/lib/auth';
import { money } from '@/lib/format';

const QUICK = [100, 200, 500, 1000, 2000, 5000];

export default function AddFundsPage() {
  const toast = useToast();
  const { user } = useAuth();
  const [amount, setAmount] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit() {
    const value = Number(amount);
    if (!value || value < 10) return toast.error('Enter an amount of at least ৳10.');
    setLoading(true);
    try {
      const res = await apiPost<{ redirect_url: string }>('/api/deposits/initiate', {
        amount: value,
      });
      if (res.success && res.data?.redirect_url) {
        window.location.href = res.data.redirect_url;
      } else {
        toast.error(res.message || 'Could not start payment.');
      }
    } catch {
      toast.error('Something went wrong.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <h1 className="mb-4 text-xl font-extrabold text-slate-800">Add Funds</h1>

      <div className="card max-w-lg p-6">
        <div className="mb-5 flex items-center gap-3 rounded-xl bg-primary/5 p-4">
          <Wallet className="text-primary-dark" />
          <div>
            <p className="text-xs text-slate-500">Current balance</p>
            <p className="text-lg font-extrabold text-primary-dark">{money(user?.balance)}</p>
          </div>
        </div>

        <label className="mb-1 block text-sm font-medium text-slate-600">Amount (৳)</label>
        <input
          type="number"
          min={10}
          className="input"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="Enter amount"
        />

        <div className="mt-3 grid grid-cols-3 gap-2">
          {QUICK.map((v) => (
            <button
              key={v}
              onClick={() => setAmount(String(v))}
              className="rounded-xl border border-slate-200 py-2 text-sm font-semibold text-slate-600 hover:border-primary hover:text-primary-dark"
            >
              ৳{v}
            </button>
          ))}
        </div>

        <button onClick={submit} disabled={loading} className="btn-primary mt-5 w-full py-3">
          {loading ? <Loader2 className="animate-spin" /> : 'Proceed to Payment'}
        </button>
      </div>
    </div>
  );
}
