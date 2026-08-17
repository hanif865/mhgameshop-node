'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, Sparkles, Gift, PartyPopper } from 'lucide-react';
import { apiGet, apiPost } from '@/lib/api';
import { money } from '@/lib/format';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/components/ui/Toast';

interface SpinStatus {
  enabled: boolean;
  prizes: number[];
  canSpin: boolean;
  wonAmount: number | null;
}

// গিফট/প্রাইজ-হুইলের মতো উৎসবমুখী রঙিন প্যালেট
const COLORS = ['#F43F5E', '#FB923C', '#FACC15', '#34D399', '#22D3EE', '#818CF8', '#C084FC', '#F472B6'];

/** কেন্দ্র (100,100), উপরে (pointer) থেকে ঘড়ির কাঁটার দিকে কোণ। */
function polar(angleFromTop: number, radius: number): [number, number] {
  const a = ((-90 + angleFromTop) * Math.PI) / 180;
  return [100 + radius * Math.cos(a), 100 + radius * Math.sin(a)];
}

export default function SpinPage() {
  const { refresh } = useAuth();
  const toast = useToast();
  const [d, setD] = useState<SpinStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [spinning, setSpinning] = useState(false);
  const [rotation, setRotation] = useState(0);
  const [result, setResult] = useState<number | null>(null);
  const [showWelcome, setShowWelcome] = useState(false);
  const pending = useRef<number | null>(null);

  async function load() {
    const res = await apiGet<SpinStatus>('/api/user/spin');
    setD(res.data ?? null);
    setLoading(false);
  }
  useEffect(() => {
    load();
    // রেজিস্ট্রেশনের পরে ?welcome=1 — নতুন ইউজারকে স্বাগত পপ-আপ
    if (new URLSearchParams(window.location.search).get('welcome') === '1') {
      setShowWelcome(true);
    }
  }, []);

  const prizes = d?.prizes ?? [];
  const seg = prizes.length ? 360 / prizes.length : 360;

  const wheel = useMemo(() => {
    return prizes.map((amt, i) => {
      const a0 = i * seg;
      const a1 = (i + 1) * seg;
      const [x0, y0] = polar(a0, 96);
      const [x1, y1] = polar(a1, 96);
      const large = seg > 180 ? 1 : 0;
      const path = `M100 100 L${x0.toFixed(2)} ${y0.toFixed(2)} A96 96 0 ${large} 1 ${x1.toFixed(2)} ${y1.toFixed(2)} Z`;
      const mid = (i + 0.5) * seg;
      const [tx, ty] = polar(mid, 60);
      let rot = (-90 + mid) % 360;
      if (rot > 90 && rot < 270) rot -= 180;
      return { amt, path, tx, ty, rot, fill: COLORS[i % COLORS.length] };
    });
  }, [prizes, seg]);

  async function spin() {
    if (!d?.canSpin || spinning) return;
    setSpinning(true);
    setResult(null);
    const res = await apiPost<{ amount: number; index: number; prizes: number[] }>('/api/user/spin', {});
    if (!res.success || !res.data) {
      setSpinning(false);
      toast.error(res.message || 'স্পিন করা গেল না।');
      load();
      return;
    }
    const { amount, index } = res.data;
    pending.current = amount;

    // segment index কে উপরের pointer এ আনার ঘূর্ণন হিসাব
    const targetMod = ((360 - (index * seg + seg / 2)) % 360 + 360) % 360;
    const currentMod = ((rotation % 360) + 360) % 360;
    const delta = (targetMod - currentMod + 360) % 360;
    setRotation(rotation + 6 * 360 + delta);
  }

  function onSpinEnd() {
    if (pending.current == null) return;
    const amount = pending.current;
    pending.current = null;
    setResult(amount);
    setSpinning(false);
    setD((prev) => (prev ? { ...prev, canSpin: false, wonAmount: amount } : prev));
    refresh().catch(() => {});
    toast.success(`অভিনন্দন! আপনি ৳${amount} জিতেছেন 🎉`);
  }

  if (loading)
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-slate-400">
        <Loader2 className="animate-spin" />
      </div>
    );

  if (!d?.enabled)
    return (
      <div className="card p-8 text-center">
        <Gift className="mx-auto mb-3 text-slate-300" size={40} />
        <p className="font-semibold text-slate-700">Spin &amp; Win এখন বন্ধ আছে।</p>
        <p className="text-sm text-slate-400">পরে আবার দেখুন।</p>
      </div>
    );

  const alreadyWon = !d.canSpin;

  return (
    <div className="space-y-5">
      {/* নতুন ইউজারের স্বাগত পপ-আপ (রেজিস্ট্রেশনের পরে) */}
      {showWelcome && d.enabled && d.canSpin && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ backgroundColor: 'rgba(0,0,0,0.55)' }}
          onClick={() => setShowWelcome(false)}
        >
          <div
            className="card w-full max-w-sm p-6 text-center"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="text-5xl">🎁</div>
            <h2 className="mt-3 text-xl font-extrabold text-slate-800">স্বাগতম! 🎉</h2>
            <p className="mt-2 text-sm text-slate-500">
              অ্যাকাউন্ট তৈরি সম্পন্ন। আপনার জন্য একটা <b className="text-primary-dark">ফ্রি স্পিন</b> অপেক্ষা করছে —
              ঘুরিয়ে বোনাস নিন!
            </p>
            <button onClick={() => setShowWelcome(false)} className="btn-primary mt-5 w-full py-3">
              এখনই স্পিন করুন 🎡
            </button>
          </div>
        </div>
      )}

      <div>
        <h1 className="flex items-center gap-2 text-xl font-extrabold text-slate-800">
          <Sparkles className="text-primary" /> Spin &amp; Win
        </h1>
        <p className="text-sm text-slate-500">স্পিন করুন, ওয়ালেটে বোনাস নিন — প্রতি অ্যাকাউন্টে একবার।</p>
      </div>

      <div className="card flex flex-col items-center gap-6 p-6">
        {/* হুইল */}
        <div className="relative" style={{ width: 300, height: 300 }}>
          {/* pointer */}
          <div
            className="absolute left-1/2 top-0 z-10 -translate-x-1/2"
            style={{
              width: 0,
              height: 0,
              borderLeft: '14px solid transparent',
              borderRight: '14px solid transparent',
              borderTop: '22px solid #ca8a04',
              filter: 'drop-shadow(0 2px 2px rgba(0,0,0,.25))',
            }}
          />
          <svg
            viewBox="0 0 200 200"
            width="300"
            height="300"
            onTransitionEnd={onSpinEnd}
            style={{
              transform: `rotate(${rotation}deg)`,
              transition: spinning ? 'transform 4.5s cubic-bezier(0.15,0.72,0.12,1)' : 'none',
              borderRadius: '50%',
              boxShadow: '0 8px 30px rgba(21,128,61,.22)',
            }}
          >
            {wheel.map((w, i) => (
              <path key={i} d={w.path} fill={w.fill} stroke="#fff" strokeWidth="1" />
            ))}
            {wheel.map((w, i) => (
              <text
                key={`t-${i}`}
                x={w.tx}
                y={w.ty}
                fill="#fff"
                stroke="rgba(0,0,0,0.30)"
                strokeWidth="0.7"
                style={{ paintOrder: 'stroke' }}
                fontSize="13"
                fontWeight="800"
                textAnchor="middle"
                dominantBaseline="middle"
                transform={`rotate(${w.rot.toFixed(1)}, ${w.tx.toFixed(2)}, ${w.ty.toFixed(2)})`}
              >
                ৳{w.amt}
              </text>
            ))}
            <circle cx="100" cy="100" r="12" fill="#fff" stroke="#e2e8f0" strokeWidth="2" />
          </svg>
        </div>

        {/* বোতাম / ফল */}
        {alreadyWon ? (
          <div className="w-full rounded-2xl bg-primary/5 p-5 text-center">
            <PartyPopper className="mx-auto mb-2 text-primary" size={30} />
            <p className="font-semibold text-slate-700">
              আপনি {money(result ?? d.wonAmount ?? 0)} জিতেছেন 🎉
            </p>
            <p className="text-sm text-slate-400">বোনাস আপনার ওয়ালেটে যোগ হয়েছে।</p>
          </div>
        ) : (
          <button
            onClick={spin}
            disabled={spinning}
            className="btn-primary w-full max-w-xs py-3.5 text-base"
          >
            {spinning ? (
              <span className="flex items-center justify-center gap-2">
                <Loader2 size={18} className="animate-spin" /> ঘুরছে...
              </span>
            ) : (
              'স্পিন করুন 🎡'
            )}
          </button>
        )}
      </div>

      <div className="card p-5 text-sm text-slate-500">
        <p className="mb-1 font-semibold text-slate-700">নিয়ম</p>
        <ul className="list-inside list-disc space-y-1">
          <li>প্রতিটি অ্যাকাউন্ট একবারই স্পিন করতে পারবে।</li>
          <li>জেতা টাকা সরাসরি ওয়ালেট ব্যালান্সে যোগ হবে।</li>
          <li>ব্যালান্স দিয়ে যেকোনো প্রোডাক্ট কেনা যাবে।</li>
        </ul>
      </div>
    </div>
  );
}
