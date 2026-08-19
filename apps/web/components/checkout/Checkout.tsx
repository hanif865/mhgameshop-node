'use client';

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import clsx from 'clsx';
import { BadgeCheck, Loader2, Wallet, Zap, LogIn, Info, HelpCircle, CheckCircle2 } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/components/ui/Toast';
import { useSettings } from '@/lib/settings';
import { apiGet, apiPost } from '@/lib/api';
import { imageUrl } from '@/lib/config';
import { money } from '@/lib/format';
import { fbTrack, getFbCookies } from '@/lib/fbpixel';
import { readUidHistory, rememberUid } from '@/lib/uidHistory';
import { SpecialLockCard } from '@/components/checkout/SpecialLockCard';

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
  formFields?: FormField[] | null;
  variations: Variation[];
  comboPackages: Combo[];
  special?: boolean;
  unlockThreshold?: number | null;
}

interface FormField {
  key: string;
  label: string;
  type?: 'text' | 'password' | 'select' | 'number';
  placeholder?: string;
  options?: string[];
  required?: boolean;
}

type Selection = { kind: 'variation' | 'combo'; id: number; price: string; stock: number } | null;

export function Checkout({ product }: { product: CheckoutProduct }) {
  const { user } = useAuth();
  const toast = useToast();
  const router = useRouter();
  const { get } = useSettings();
  const walletImage = get('wallet_pay_image');
  const instantImage = get('instant_pay_image');

  const customFields = Array.isArray(product.formFields) ? product.formFields : [];
  const hasCustomFields = customFields.length > 0;
  const isVoucher = product.type === 'voucher';
  const needsPlayerId = !isVoucher && !hasCustomFields;

  // স্পেশাল (লকড) প্রোডাক্ট — খরচ থ্রেশহোল্ডে না পৌঁছালে লক-কার্ড দেখাই
  const isSpecial = !!product.special;
  const threshold = Number(product.unlockThreshold ?? 0);

  const [selection, setSelection] = useState<Selection>(null);
  const [playerId, setPlayerId] = useState('');
  const [custom, setCustom] = useState<Record<string, string>>({});
  const [quantity, setQuantity] = useState(1);
  const [nickname, setNickname] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [payment, setPayment] = useState<'wallet' | 'uddoktapay'>('uddoktapay');
  const [submitting, setSubmitting] = useState(false);
  const [saved, setSaved] = useState<{ player_id: string; nickname: string | null }[]>([]);
  const [uidHistory, setUidHistory] = useState<string[]>([]);
  const [spend, setSpend] = useState<number | null>(null);
  const [spendLoading, setSpendLoading] = useState(false);

  // Auto-select Wallet once the user loads with a positive balance (user is
  // fetched async, so the initial state can't rely on it). Manual changes stick.
  const autoSelected = useRef(false);
  useEffect(() => {
    if (!autoSelected.current && user && Number(user.balance) > 0) {
      setPayment('wallet');
      autoSelected.current = true;
    }
  }, [user]);

  // Reset quantity when the selected package changes.
  useEffect(() => {
    setQuantity(1);
  }, [selection?.id, selection?.kind]);

  // প্রোডাক্ট পেজ খুললে Facebook ViewContent — value = সবচেয়ে সস্তা প্যাকেজের দাম।
  useEffect(() => {
    const prices = product.variations.map((v) => Number(v.price)).filter((n) => n > 0);
    const minPrice = prices.length ? Math.min(...prices) : 0;
    fbTrack('ViewContent', {
      content_type: 'product',
      content_ids: [String(product.id)],
      content_name: product.title,
      value: minPrice,
      currency: 'BDT',
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [product.id]);

  // অন-ডিভাইস সেভ করা UID লোড (গেস্ট/লগইন—উভয়েই datalist সাজেশন পাবে)।
  useEffect(() => {
    setUidHistory(readUidHistory());
  }, []);

  // সেভ করা Player ID লোড (লগইন থাকলে, player-id মোডে)
  async function loadSaved() {
    if (!user || !needsPlayerId) return;
    const r = await apiGet<{ player_id: string; nickname: string | null }[]>(
      `/api/user/saved-accounts?product_id=${product.id}`,
    );
    setSaved(r.data ?? []);
  }
  useEffect(() => {
    loadSaved();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, needsPlayerId, product.id]);

  // স্পেশাল প্রোডাক্ট হলে লগইন-করা ইউজারের lifetime খরচ আনি (প্রোফাইলের totalSpent-এর মতোই)
  useEffect(() => {
    if (!isSpecial || !user) return;
    setSpendLoading(true);
    apiGet<{ totalSpent: number }>('/api/user/profile')
      .then((r) => setSpend(Number(r.data?.totalSpent ?? 0)))
      .catch(() => setSpend(0))
      .finally(() => setSpendLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSpecial, user]);

  async function removeSaved(pid: string) {
    setSaved((s) => s.filter((x) => x.player_id !== pid));
    await apiPost('/api/user/saved-accounts/remove', {
      product_id: product.id,
      player_id: pid,
    }).catch(() => {});
  }

  const qty = isVoucher ? quantity : 1;
  const selectedPrice = (selection ? Number(selection.price) : 0) * qty;
  const maxQty = isVoucher && selection ? Math.max(1, selection.stock) : 99;
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
        // যাচাই-হওয়া UID অন-ডিভাইসে মনে রাখি (পরেরবার সাজেশনে আসবে)।
        setUidHistory(rememberUid(playerId));
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

    // Build account_info from the relevant input mode.
    let accountInfo: Record<string, string> | null = null;
    if (hasCustomFields) {
      for (const f of customFields) {
        const v = (custom[f.key] ?? '').trim();
        if (f.required !== false && !v) return toast.error(`${f.label} দিন।`);
      }
      accountInfo = { ...custom };
    } else if (needsPlayerId) {
      accountInfo = { player_id: playerId.trim() };
    }

    setSubmitting(true);
    // অর্ডার সাবমিটের ঠিক আগে Facebook InitiateCheckout।
    fbTrack('InitiateCheckout', {
      content_type: 'product',
      content_ids: [String(product.id)],
      content_name: product.title,
      value: selectedPrice,
      currency: 'BDT',
      num_items: qty,
    });
    try {
      const res = await apiPost<{ order_id: number; redirect_url?: string }>('/api/orders', {
        variation_id: variationValue,
        payment_method: payment,
        account_info: accountInfo,
        quantity: qty,
        idempotency_key: crypto.randomUUID(),
        // সার্ভার CAPI ম্যাচের জন্য ব্রাউজারের _fbp/_fbc কুকি পাঠাই।
        ...getFbCookies(),
      });
      if (!res.success) {
        toast.error(res.message || 'Order failed.');
        return;
      }
      // এই আইডি সেভ করে রাখি — পরেরবার ১ ক্লিকে বেছে নেওয়া যাবে
      if (needsPlayerId && playerId.trim()) {
        apiPost('/api/user/saved-accounts', {
          product_id: product.id,
          player_id: playerId.trim(),
          nickname,
        }).catch(() => {});
        // অন-ডিভাইসেও রাখি — গেস্টসহ পরেরবার datalist সাজেশনে আসবে।
        setUidHistory(rememberUid(playerId));
      }
      const redirect = (res as any).redirect_url as string | undefined;
      if (redirect) {
        window.location.href = redirect;
        return;
      }
      // ওয়ালেট অর্ডার — রিডাইরেক্ট নেই মানে এখানেই সফল। ব্রাউজার Purchase একই
      // event_id-তে (`purchase_order_<id>`) ফায়ার করি — সার্ভার CAPI Purchase-এর
      // সাথে Facebook dedup করবে, ডাবল-কাউন্ট হবে না।
      fbTrack(
        'Purchase',
        {
          content_type: 'product',
          content_ids: [String(product.id)],
          content_name: product.title,
          value: selectedPrice,
          currency: 'BDT',
        },
        `purchase_order_${(res as any).order_id}`,
      );
      toast.success('অর্ডার সফল হয়েছে!');
      router.push(product.type === 'voucher' ? '/user/codes' : '/user/orders');
    } catch {
      toast.error('কিছু একটা সমস্যা হয়েছে।');
    } finally {
      setSubmitting(false);
    }
  }

  const enoughBalance = Number(user?.balance ?? 0) >= selectedPrice;

  // লক অবস্থা: থ্রেশহোল্ড থাকলে + (লগআউট বা খরচ < থ্রেশহোল্ড) → buy-grid-এর বদলে লক-কার্ড
  const gated = isSpecial && threshold > 0;
  const unlocked = gated && !!user && spend !== null && spend >= threshold;
  const showLock = gated && !unlocked;

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

      {showLock && (
        <SpecialLockCard
          threshold={threshold}
          spend={spend}
          loading={spendLoading}
          loggedIn={!!user}
        />
      )}

      <div className={`grid gap-5 ${showLock ? '' : 'lg:grid-cols-[1.9fr_1fr]'}`}>
        {/* ── LEFT: Select Recharge ── */}
        <div>
          <Section num={1} title="Select Recharge">
            <div
              className={`grid grid-cols-2 gap-3 sm:grid-cols-3 ${
                showLock ? 'pointer-events-none opacity-70' : ''
              }`}
            >
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

            {showLock && (
              <p className="mt-3 flex items-center gap-1.5 rounded-lg bg-primary/5 px-3 py-2 text-sm font-medium text-primary-dark">
                <Info size={15} /> এই প্যাকেজগুলো এখন লক — টার্গেট পূরণ হলে অর্ডার করতে পারবেন।
              </p>
            )}

            <a
              href="#rules"
              className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-gold hover:underline"
            >
              <HelpCircle size={16} /> কিভাবে অর্ডার করবেন ?
            </a>
          </Section>
        </div>

        {/* ── RIGHT: Account Info + Payment (লক থাকলে দেখাই না) ── */}
        {!showLock && (
        <div className="space-y-5">
          {/* Custom login-based fields (manual topup) */}
          {hasCustomFields && (
            <Section num={2} title="Account Info">
              <div className="space-y-3">
                {customFields.map((f) => (
                  <div key={f.key}>
                    <label className="mb-1 block text-sm font-medium text-slate-600">
                      {f.label}
                    </label>
                    {f.type === 'select' ? (
                      <select
                        className="input"
                        value={custom[f.key] ?? ''}
                        onChange={(e) => setCustom((c) => ({ ...c, [f.key]: e.target.value }))}
                      >
                        <option value="">Select…</option>
                        {(f.options ?? []).map((o) => (
                          <option key={o} value={o}>
                            {o}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        className="input"
                        type={
                          f.type === 'password' ? 'password' : f.type === 'number' ? 'number' : 'text'
                        }
                        placeholder={f.placeholder ?? ''}
                        value={custom[f.key] ?? ''}
                        onChange={(e) => setCustom((c) => ({ ...c, [f.key]: e.target.value }))}
                      />
                    )}
                  </div>
                ))}
              </div>
            </Section>
          )}

          {/* Default Player ID + UID checker */}
          {needsPlayerId && (
            <Section num={2} title="Account Info">
              {saved.length > 0 && (
                <div className="mb-3">
                  <p className="mb-1.5 text-xs font-medium text-slate-500">
                    সেভ করা আইডি — ট্যাপ করে বেছে নিন
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {saved.map((s) => (
                      <div
                        key={s.player_id}
                        className={clsx(
                          'relative flex items-center rounded-lg border pr-6 transition',
                          playerId === s.player_id
                            ? 'border-primary bg-primary/5'
                            : 'border-slate-200 hover:border-primary/50',
                        )}
                      >
                        <button
                          type="button"
                          onClick={() => {
                            setPlayerId(s.player_id);
                            setNickname(s.nickname);
                          }}
                          className="px-3 py-1.5 text-left"
                        >
                          <span className="block text-xs font-semibold text-slate-700">
                            {s.nickname || s.player_id}
                          </span>
                          <span className="block text-[10px] text-slate-400">{s.player_id}</span>
                        </button>
                        <button
                          type="button"
                          aria-label="Remove"
                          onClick={() => removeSaved(s.player_id)}
                          className="absolute right-1 top-1 leading-none text-slate-300 hover:text-red-500"
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <label className="mb-1 block text-sm font-medium text-slate-600">
                এখানে প্লেয়ার আইডি কোড দিন
              </label>
              <input
                className="input"
                name="player_id"
                list="uid-history"
                placeholder="এখানে প্লেয়ার আইডি কোড দিন"
                value={playerId}
                onChange={(e) => {
                  setPlayerId(e.target.value);
                  setNickname(null);
                }}
              />
              {uidHistory.length > 0 && (
                <datalist id="uid-history">
                  {uidHistory.map((id) => (
                    <option key={id} value={id} />
                  ))}
                </datalist>
              )}
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

          {/* Quantity for voucher products */}
          {isVoucher && (
            <Section num={2} title="Quantity">
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                  className="grid h-10 w-10 place-items-center rounded-lg border border-slate-200 text-lg font-bold text-slate-600 hover:border-primary"
                >
                  −
                </button>
                <span className="w-12 text-center text-lg font-bold text-slate-800">{quantity}</span>
                <button
                  onClick={() => setQuantity((q) => Math.min(maxQty, q + 1))}
                  className="grid h-10 w-10 place-items-center rounded-lg border border-slate-200 text-lg font-bold text-slate-600 hover:border-primary"
                >
                  +
                </button>
                {selection && (
                  <span className="text-xs text-slate-400">In stock: {selection.stock}</span>
                )}
              </div>
            </Section>
          )}

          <Section num={3} title="Select one option">
            <div className="grid grid-cols-2 gap-3">
              <PaymentTile
                active={payment === 'wallet'}
                onClick={() => setPayment('wallet')}
                icon={<Wallet />}
                image={walletImage}
                title="Wallet Pay"
                subtitle={money(user?.balance)}
              />
              <PaymentTile
                active={payment === 'uddoktapay'}
                onClick={() => setPayment('uddoktapay')}
                icon={<Zap />}
                image={instantImage}
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
        )}
      </div>

      {/* ── Rules & Conditions (full width) ── */}
      <div id="rules" className="mt-5">
        <Section title="Rules & Conditions" tone="plain">
          <ul className="space-y-2.5 text-sm leading-relaxed text-slate-600">
            {rulesFor(product.description).map((rule, i) => (
              <li key={i} className="flex gap-2.5">
                <CheckCircle2 size={17} className="mt-0.5 shrink-0 text-primary" />
                <span>{rule}</span>
              </li>
            ))}
          </ul>
        </Section>
      </div>
    </div>
  );
}

/* ── Rules & Conditions parsing ──
 * অ্যাডমিন প্লেইন <textarea>-তে (◉ মার্কার বা প্রতি লাইনে একটা করে) rules লেখে।
 * সেটাকে নিরাপদে আলাদা আইটেমে ভাঙি — পুরনো ডেটায় HTML ট্যাগ থাকলে টেক্সট বের করে
 * নিই (dangerouslySetInnerHTML নয়, তাই XSS ঝুঁকি নেই)। */
function parseRules(desc: string): string[] {
  const text = desc
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|li|div)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&');
  const parts = text.includes('◉') ? text.split('◉') : text.split(/\r?\n/);
  return parts.map((s) => s.replace(/^[•\-*◉\s]+/, '').trim()).filter(Boolean);
}

// প্রোডাক্টে description না থাকলে (বা পার্স করে খালি এলে) এই ডিফল্ট rules দেখাই।
const DEFAULT_RULES = [
  'শুধুমাত্র Bangladesh সার্ভারে ID Code দিয়ে টপ আপ হবে।',
  'Player ID Code ভুল দিয়ে Diamond না পেলে কর্তৃপক্ষ দায়ী নয়।',
  'অর্ডার কমপ্লিট হওয়ার পরেও আইডিতে ডায়মন্ড না গেলে চেক করার জন্য আইডি পাসওয়ার্ড দিতে হবে।',
  'অর্ডার Cancel হলে কি কারণে তা Cancel হয়েছে তা অর্ডার হিস্টোরিতে দেওয়া থাকে — অনুগ্রহপূর্বক দেখে পুনরায় সঠিক তথ্য দিয়ে অর্ডার করবেন।',
];

function rulesFor(desc?: string | null): string[] {
  const parsed = desc ? parseRules(desc) : [];
  return parsed.length ? parsed : DEFAULT_RULES;
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

/* ── Payment tile: uploaded image card (falls back to icon) ── */
function PaymentTile({
  active,
  onClick,
  icon,
  image,
  title,
  subtitle,
}: {
  active: boolean;
  onClick: () => void;
  icon: ReactNode;
  image?: string;
  title: string;
  subtitle: string;
}) {
  return (
    <button
      onClick={onClick}
      className={clsx(
        'relative flex flex-col items-center gap-1.5 overflow-hidden rounded-xl border p-2 text-center transition',
        active
          ? 'border-primary bg-primary/5 ring-2 ring-primary/30'
          : 'border-slate-200 bg-white hover:border-primary/50',
      )}
    >
      {image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={imageUrl(image)} alt={title} className="h-14 w-full object-contain" />
      ) : (
        <span className="grid h-10 w-10 place-items-center rounded-lg bg-primary/10 text-primary-dark">
          {icon}
        </span>
      )}
      <p className="text-[11px] font-medium text-slate-500">{subtitle}</p>
    </button>
  );
}
