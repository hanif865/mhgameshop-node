'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import clsx from 'clsx';
import { BadgeCheck, Loader2, Wallet, Zap, ShieldCheck } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/components/ui/Toast';
import { apiPost } from '@/lib/api';
import { imageUrl } from '@/lib/config';
import { money } from '@/lib/format';

interface Variation {
  id: number;
  title: string;
  price: string;
  stock: number;
  providerProductId: string | null;
}
interface Combo {
  id: number;
  title: string;
  price: string;
  stock: number;
}
export interface CheckoutProduct {
  id: number;
  title: string;
  slug: string;
  type: string;
  image: string | null;
  description: string | null;
  variations: Variation[];
  comboPackages: Combo[];
}

type Selection = { kind: 'variation' | 'combo'; id: number; price: string; stock: number } | null;

export function Checkout({ product }: { product: CheckoutProduct }) {
  const { user } = useAuth();
  const toast = useToast();
  const router = useRouter();

  const needsPlayerId = product.type !== 'voucher';
  const [selection, setSelection] = useState<Selection>(null);
  const [playerId, setPlayerId] = useState('');
  const [nickname, setNickname] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [payment, setPayment] = useState<'wallet' | 'uddoktapay'>(
    Number(user?.balance ?? 0) > 0 ? 'wallet' : 'uddoktapay',
  );
  const [submitting, setSubmitting] = useState(false);

  const selectedPrice = selection ? Number(selection.price) : 0;

  const variationValue = useMemo(() => {
    if (!selection) return '';
    return selection.kind === 'combo' ? `combo-${selection.id}` : String(selection.id);
  }, [selection]);

  async function checkUid() {
    if (!playerId.trim()) return toast.error('Enter a Player ID first.');
    setChecking(true);
    setNickname(null);
    try {
      const res = await apiPost<{ nickname: string }>('/api/uid-checker', {
        player_id: playerId.trim(),
        provider_product_id: selection?.kind === 'variation' ? undefined : undefined,
      });
      if (res.success && res.data) {
        setNickname(res.data.nickname);
        toast.success(`Player found: ${res.data.nickname}`);
      } else {
        toast.error(res.message || 'Could not verify this Player ID.');
      }
    } catch {
      toast.error('UID check failed.');
    } finally {
      setChecking(false);
    }
  }

  async function submit() {
    if (!user) {
      toast.error('Please log in to continue.');
      router.push('/auth/login');
      return;
    }
    if (!selection) return toast.error('Please select a package.');
    if (needsPlayerId && !playerId.trim()) return toast.error('Enter your Player ID.');

    setSubmitting(true);
    try {
      const res = await apiPost<{ order_id: number; redirect_url?: string }>('/api/orders', {
        variation_id: variationValue,
        payment_method: payment,
        account_info: needsPlayerId ? { player_id: playerId.trim() } : null,
        idempotency_key: crypto.randomUUID(),
      });

      if (!res.success) {
        toast.error(res.message || 'Order failed.');
        return;
      }
      const redirect = (res as any).redirect_url as string | undefined;
      if (redirect) {
        window.location.href = redirect;
        return;
      }
      toast.success('Order placed successfully!');
      router.push(product.type === 'voucher' ? '/user/codes' : '/user/orders');
    } catch {
      toast.error('Something went wrong.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="container-page py-5">
      {/* Product header */}
      <div className="card flex items-center gap-4 p-4">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={imageUrl(product.image)}
          alt={product.title}
          className="h-20 w-20 rounded-xl object-cover"
        />
        <div>
          <span className="rounded-md bg-gold/10 px-2 py-0.5 text-[10px] font-bold uppercase text-gold">
            {product.type}
          </span>
          <h1 className="mt-1 text-xl font-extrabold text-slate-800">{product.title}</h1>
        </div>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-[1fr_340px]">
        <div className="space-y-6">
          {/* Packages */}
          <section className="card p-4">
            <h2 className="mb-3 font-bold text-slate-800">Select Package</h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {product.variations.map((v) => (
                <PackageTile
                  key={`v-${v.id}`}
                  title={v.title}
                  price={v.price}
                  outOfStock={v.stock <= 0 && product.type === 'voucher'}
                  active={selection?.kind === 'variation' && selection.id === v.id}
                  onClick={() =>
                    setSelection({ kind: 'variation', id: v.id, price: v.price, stock: v.stock })
                  }
                />
              ))}
            </div>
          </section>

          {/* Account info */}
          {needsPlayerId && (
            <section className="card p-4">
              <h2 className="mb-3 font-bold text-slate-800">Account Info</h2>
              <div className="flex gap-2">
                <input
                  className="input"
                  placeholder="Enter Player ID"
                  value={playerId}
                  onChange={(e) => {
                    setPlayerId(e.target.value);
                    setNickname(null);
                  }}
                />
                <button onClick={checkUid} disabled={checking} className="btn-outline shrink-0">
                  {checking ? <Loader2 size={18} className="animate-spin" /> : 'Check'}
                </button>
              </div>
              {nickname && (
                <p className="mt-2 flex items-center gap-1.5 text-sm font-medium text-primary-dark">
                  <BadgeCheck size={16} /> {nickname}
                </p>
              )}
            </section>
          )}

          {/* Payment methods */}
          <section className="card p-4">
            <h2 className="mb-3 font-bold text-slate-800">Payment Method</h2>
            <div className="grid grid-cols-2 gap-3">
              <PaymentTile
                active={payment === 'wallet'}
                onClick={() => setPayment('wallet')}
                icon={<Wallet />}
                title="Wallet"
                subtitle={money(user?.balance)}
              />
              <PaymentTile
                active={payment === 'uddoktapay'}
                onClick={() => setPayment('uddoktapay')}
                icon={<Zap />}
                title="Instant Pay"
                subtitle="bKash / Nagad"
              />
            </div>
          </section>

          {/* Rules — appears last on mobile */}
          <section className="card p-4">
            <h2 className="mb-2 flex items-center gap-2 font-bold text-slate-800">
              <ShieldCheck size={18} className="text-primary" /> Rules & Conditions
            </h2>
            <ul className="list-inside list-disc space-y-1 text-sm text-slate-500">
              <li>Enter the correct Player ID — orders cannot be reversed.</li>
              <li>Delivery is usually instant but may take a few minutes.</li>
              <li>For any issue, contact support with your order ID.</li>
            </ul>
          </section>
        </div>

        {/* Summary (desktop) */}
        <aside className="hidden lg:block">
          <div className="card sticky top-20 p-5">
            <h2 className="font-bold text-slate-800">Order Summary</h2>
            <div className="mt-3 flex justify-between text-sm text-slate-500">
              <span>Total</span>
              <span className="text-lg font-extrabold text-primary-dark">
                {money(selectedPrice)}
              </span>
            </div>
            <button
              onClick={submit}
              disabled={submitting || !selection}
              className="btn-primary mt-4 w-full py-3"
            >
              {submitting ? <Loader2 className="animate-spin" /> : 'Buy Now'}
            </button>
          </div>
        </aside>
      </div>

      {/* Mobile sticky buy bar */}
      <div className="fixed inset-x-0 bottom-16 z-30 border-t border-slate-100 bg-white p-3 lg:hidden">
        <div className="container-page flex items-center justify-between gap-3">
          <div>
            <p className="text-xs text-slate-400">Total</p>
            <p className="text-lg font-extrabold text-primary-dark">{money(selectedPrice)}</p>
          </div>
          <button
            onClick={submit}
            disabled={submitting || !selection}
            className="btn-primary flex-1 py-3"
          >
            {submitting ? <Loader2 className="animate-spin" /> : 'Buy Now'}
          </button>
        </div>
      </div>
    </div>
  );
}

function PackageTile({
  title,
  price,
  active,
  outOfStock,
  combo,
  onClick,
}: {
  title: string;
  price: string;
  active: boolean;
  outOfStock?: boolean;
  combo?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={outOfStock}
      className={clsx(
        'relative rounded-xl border p-3 text-left transition',
        active
          ? 'border-primary bg-primary/5 ring-2 ring-primary/20'
          : 'border-slate-200 bg-white hover:border-primary/40',
        outOfStock && 'cursor-not-allowed opacity-50',
      )}
    >
      {combo && (
        <span className="absolute right-2 top-2 rounded bg-gold px-1.5 py-0.5 text-[9px] font-bold text-white">
          COMBO
        </span>
      )}
      {outOfStock && (
        <span className="absolute left-2 top-2 rounded bg-red-600 px-1.5 py-0.5 text-[9px] font-bold text-white">
          STOCK OUT
        </span>
      )}
      <p className="mt-3 line-clamp-2 text-xs font-semibold text-slate-700">{title}</p>
      <p className="mt-1 font-bold text-primary-dark">{money(price)}</p>
    </button>
  );
}

function PaymentTile({
  active,
  onClick,
  icon,
  title,
  subtitle,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  title: string;
  subtitle: string;
}) {
  return (
    <button
      onClick={onClick}
      className={clsx(
        'flex items-center gap-3 rounded-xl border p-3 text-left transition',
        active
          ? 'border-primary bg-primary/5 ring-2 ring-primary/20'
          : 'border-slate-200 bg-white hover:border-primary/40',
      )}
    >
      <span className="grid h-10 w-10 place-items-center rounded-lg bg-primary/10 text-primary-dark">
        {icon}
      </span>
      <div>
        <p className="text-sm font-semibold text-slate-800">{title}</p>
        <p className="text-xs text-slate-400">{subtitle}</p>
      </div>
    </button>
  );
}
