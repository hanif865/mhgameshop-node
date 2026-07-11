'use client';

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import clsx from 'clsx';
import { BadgeCheck, Loader2, Wallet, Zap, LogIn, Info, HelpCircle } from 'lucide-react';
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
  category?: { title: string } | null;
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
  const [payment, setPayment] = useState<'wallet' | 'uddoktapay'>('uddoktapay');
  const [submitting, setSubmitting] = useState(false);

  // Auto-select Wallet once the user loads with a positive balance (user is
  // fetched async, so the initial state can't rely on it). Manual changes stick.
  const autoSelected = useRef(false);
  useEffect(() => {
    if (!autoSelected.current && user && Number(user.balance) > 0) {
      setPayment('wallet');
      autoSelected.current = true;
    }
  }, [user]);

  const selectedPrice = selection ? Number(selection.price) : 0;
  const typeLabel = product.type.charAt(0).toUpperCase() + product.type.slice(1);

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
      router.push('/auth/login');
      return;
    }
    if (!selection) return toast.error('অনুগ্রহ করে একটি প্যাকেজ নির্বাচন করুন।');
    if (needsPlayerId && !playerId.trim()) return toast.error('আপনার Player ID দিন।');

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
      toast.success('অর্ডার সফল হয়েছে!');
      router.push(product.type === 'voucher' ? '/user/codes' : '/user/orders');
    } catch {
      toast.error('কিছু একটা সমস্যা হয়েছে।');
    } finally {
      setSubmitting(false);
    }
  }

  const enoughBalance = Number(user?.balance ?? 0) >= selectedPrice;

  return (
    <div className="container-page py-5">
      {/* ── Product header ── */}
      <div className="card mb-5 flex items-center gap-4 p-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={imageUrl(product.image)}
          alt={product.title}
          className="h-14 w-14 rounded-lg object-cover"
        />
        <div>
          <h1 className="text-lg font-extrabold text-slate-800">{product.title}</h1>
          <p className="text-xs text-slate-400">
            {product.category?.title ?? 'Game'} / {typeLabel}
          </p>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1.9fr_1fr]">
        {/* ── LEFT: Select Recharge ── */}
        <div>
          <Section num={1} title="Select Recharge">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {product.variations.map((v) => (
                <PackageTile
                  key={`v-${v.id}`}
                  title={v.title}
                  price={v.price}
                  outOfStock={v.stock <= 0}
                  active={selection?.kind === 'variation' && selection.id === v.id}
                  onClick={() =>
                    setSelection({ kind: 'variation', id: v.id, price: v.price, stock: v.stock })
                  }
                />
              ))}
              {product.comboPackages.map((c) => (
                <PackageTile
                  key={`c-${c.id}`}
                  title={c.title}
                  price={c.price}
                  outOfStock={c.stock <= 0}
                  active={selection?.kind === 'combo' && selection.id === c.id}
                  onClick={() =>
                    setSelection({ kind: 'combo', id: c.id, price: c.price, stock: c.stock })
                  }
                />
              ))}
            </div>

            <a
              href="#rules"
              className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-gold hover:underline"
            >
              <HelpCircle size={16} /> কিভাবে অর্ডার করবেন ?
            </a>
          </Section>
        </div>

        {/* ── RIGHT: Account Info + Payment ── */}
        <div className="space-y-5">
          {needsPlayerId && (
            <Section num={2} title="Account Info">
              <label className="mb-1 block text-sm font-medium text-slate-600">
                এখানে প্লেয়ার আইডি কোড দিন
              </label>
              <input
                className="input"
                placeholder="এখানে প্লেয়ার আইডি কোড দিন"
                value={playerId}
                onChange={(e) => {
                  setPlayerId(e.target.value);
                  setNickname(null);
                }}
              />
              <button
                onClick={checkUid}
                disabled={checking}
                className="btn-primary mt-3 w-full py-2.5"
              >
                {checking ? (
                  <Loader2 size={18} className="animate-spin" />
                ) : (
                  'আপনার গেম আইডির নাম চেক করুন'
                )}
              </button>
              {nickname && (
                <p className="mt-2 flex items-center gap-1.5 rounded-lg bg-primary/5 px-3 py-2 text-sm font-semibold text-primary-dark">
                  <BadgeCheck size={16} /> {nickname}
                </p>
              )}
            </Section>
          )}

          <Section num={needsPlayerId ? 3 : 2} title="Select one option">
            <div className="grid grid-cols-2 gap-3">
              <PaymentTile
                active={payment === 'wallet'}
                onClick={() => setPayment('wallet')}
                icon={<Wallet />}
                title="Wallet Pay"
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

            <p className="mt-3 flex items-center gap-1.5 text-sm text-slate-500">
              <Info size={15} className="text-primary" />
              প্রোডাক্টটি কিনতে আপনার প্রয়োজন{' '}
              <span className="font-bold text-primary-dark">{money(selectedPrice)}</span>
            </p>

            {!user ? (
              <>
                <p className="mt-2 flex items-center gap-1.5 text-sm font-medium text-gold">
                  <Info size={15} /> Please Login To Purchase
                </p>
                <Link href="/auth/login" className="btn-primary mt-3 w-full py-2.5">
                  <LogIn size={18} /> Login
                </Link>
              </>
            ) : (
              <>
                {selection && !enoughBalance && payment === 'wallet' && (
                  <p className="mt-2 text-sm font-medium text-red-500">
                    পর্যাপ্ত ব্যালেন্স নেই — Instant Pay বেছে নিন বা ফান্ড যোগ করুন।
                  </p>
                )}
                <button
                  onClick={submit}
                  disabled={submitting || !selection}
                  className="btn-primary mt-3 w-full py-3 text-base"
                >
                  {submitting ? <Loader2 className="animate-spin" /> : 'অর্ডার করুন'}
                </button>
              </>
            )}
          </Section>
        </div>
      </div>

      {/* ── Rules & Conditions (full width) ── */}
      <div id="rules" className="mt-5">
        <Section title="Rules & Conditions" tone="plain">
          {product.description ? (
            <div
              className="prose prose-sm max-w-none text-sm leading-relaxed text-slate-600 [&_li]:my-1"
              dangerouslySetInnerHTML={{ __html: product.description }}
            />
          ) : (
            <ul className="space-y-2 text-sm leading-relaxed text-slate-600">
              <li>শুধুমাত্র Bangladesh সার্ভারে ID Code দিয়ে টপ আপ হবে।</li>
              <li>Player ID Code ভুল দিয়ে Diamond না পেলে কর্তৃপক্ষ দায়ী নয়।</li>
              <li>
                অর্ডার কমপ্লিট হওয়ার পরেও আইডিতে ডায়মন্ড না গেলে চেক করার জন্য আইডি পাসওয়ার্ড দিতে
                হবে।
              </li>
              <li>
                অর্ডার Cancel হলে কি কারণে তা Cancel হয়েছে তা অর্ডার হিস্টোরিতে দেওয়া থাকে —
                অনুগ্রহপূর্বক দেখে পুনরায় সঠিক তথ্য দিয়ে অর্ডার করবেন।
              </li>
            </ul>
          )}
        </Section>
      </div>
    </div>
  );
}

/* ── Section card with numbered header (green badge) ── */
function Section({
  num,
  title,
  tone = 'default',
  children,
}: {
  num?: number;
  title: string;
  tone?: 'default' | 'plain';
  children: ReactNode;
}) {
  return (
    <div className="card overflow-hidden">
      <div className="flex items-center gap-2 border-b border-slate-100 bg-slate-50/60 px-4 py-3">
        {num !== undefined && (
          <span className="grid h-6 w-6 place-items-center rounded-full bg-primary text-xs font-bold text-white">
            {num}
          </span>
        )}
        {tone === 'plain' && <span className="h-5 w-1.5 rounded-full bg-gold" />}
        <span className="font-bold text-slate-800">{title}</span>
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

/* ── Package tile: name on top, price below (green accent) ── */
function PackageTile({
  title,
  price,
  active,
  outOfStock,
  onClick,
}: {
  title: string;
  price: string;
  active: boolean;
  outOfStock?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={outOfStock}
      className={clsx(
        'relative flex flex-col items-center justify-center rounded-lg border px-2 py-3 text-center transition',
        active
          ? 'border-primary bg-primary/5 ring-2 ring-primary/20'
          : 'border-slate-200 bg-white hover:border-primary/50',
        outOfStock && 'cursor-not-allowed opacity-50',
      )}
    >
      {outOfStock && (
        <span className="absolute left-1.5 top-1.5 rounded bg-red-600 px-1.5 py-0.5 text-[8px] font-bold text-white">
          STOCK OUT
        </span>
      )}
      <span className="text-sm font-semibold text-slate-800">{title}</span>
      <span className="mt-1 text-xs font-bold text-primary-dark">{money(price)}</span>
    </button>
  );
}

/* ── Payment tile: image-style card with corner ribbon ── */
function PaymentTile({
  active,
  onClick,
  icon,
  title,
  subtitle,
}: {
  active: boolean;
  onClick: () => void;
  icon: ReactNode;
  title: string;
  subtitle: string;
}) {
  return (
    <button
      onClick={onClick}
      className={clsx(
        'relative flex flex-col items-center gap-2 overflow-hidden rounded-xl border p-3 text-center transition',
        active
          ? 'border-primary bg-primary/5 ring-2 ring-primary/20'
          : 'border-slate-200 bg-white hover:border-primary/50',
      )}
    >
      <span
        className={clsx(
          'absolute left-0 top-0 h-0 w-0 border-r-[18px] border-t-[18px] border-r-transparent',
          active ? 'border-t-primary' : 'border-t-gold',
        )}
      />
      <span className="grid h-10 w-10 place-items-center rounded-lg bg-primary/10 text-primary-dark">
        {icon}
      </span>
      <div>
        <p className="text-sm font-semibold text-slate-800">{title}</p>
        <p className="text-[11px] text-slate-400">{subtitle}</p>
      </div>
    </button>
  );
}
