import { Trophy, Crown } from 'lucide-react';
import { money } from '@/lib/format';

export interface TopUser {
  rank: number;
  user: string;
  avatar: string | null;
  total: number;
  tier: string;
}

// tier → দেখানোর লেবেল; 'none'/অজানা হলে সবুজ tier লাইন লুকানো থাকে (utils/levels.ts-এর সাথে মিল)
const TIER_LABEL: Record<string, string> = {
  bronze: 'Bronze',
  silver: 'Silver',
  gold: 'Gold',
  platinum: 'Platinum',
  premium: 'Premium',
};

// rank ব্যাজের রঙ — ১ সোনালি, ২ রুপালি, ৩ ব্রোঞ্জ, বাকিরা নিরপেক্ষ
function rankClass(rank: number): string {
  if (rank === 1) return 'bg-gold text-white';
  if (rank === 2) return 'bg-slate-300 text-slate-700';
  if (rank === 3) return 'bg-amber-500 text-white';
  return 'bg-slate-100 text-slate-500';
}

// অ্যাভাটারের চারপাশে অলংকৃত লরেল-রিং (বিশুদ্ধ SVG — কোনো ইমেজ অ্যাসেট লাগে না)।
// দুই পাশে সমান্তরাল পাতা, উপরে খোলা মুখ, নিচে সোনালি গিঁট। gradient id প্রতি কার্ডে ইউনিক।
function WreathFrame({ uid }: { uid: number }) {
  const gid = `wreath-${uid}`;
  const CX = 52;
  const CY = 52;
  const R = 40; // পাতার কেন্দ্র বৃত্তের ব্যাসার্ধ
  const angles = [22, 46, 70, 94, 118, 142, 166]; // উপরের খোলা মুখ থেকে নিচ পর্যন্ত

  const leaf = (a: number, side: 1 | -1, i: number) => {
    const rad = (a * side * Math.PI) / 180;
    const x = CX + R * Math.sin(rad);
    const y = CY - R * Math.cos(rad);
    return (
      <ellipse
        key={`${side}-${i}`}
        cx={x}
        cy={y}
        rx={3}
        ry={6.5}
        transform={`rotate(${a * side} ${x} ${y})`}
        fill={`url(#${gid})`}
        stroke="#6b21a8"
        strokeWidth={0.5}
      />
    );
  };

  return (
    <svg viewBox="0 0 104 104" className="absolute inset-0 h-full w-full" aria-hidden="true">
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#c084fc" />
          <stop offset="100%" stopColor="#7e22ce" />
        </linearGradient>
      </defs>
      {/* অ্যাভাটার ঘিরে হালকা বেগুনি বলয় */}
      <circle cx={CX} cy={CY} r={33} fill="none" stroke="#e9d5ff" strokeWidth={2} />
      {angles.map((a, i) => leaf(a, 1, i))}
      {angles.map((a, i) => leaf(a, -1, i))}
      {/* নিচের সোনালি গিঁট (দুই ডাল মিলছে) */}
      <circle cx={CX} cy={CY + R} r={2.6} fill="#ca8a04" />
    </svg>
  );
}

export function TopRankedUsers({ users }: { users: TopUser[] }) {
  if (users.length === 0) return null;

  return (
    <section>
      {/* সবুজ গ্রেডিয়েন্ট হেডার কার্ড */}
      <div className="flex items-center gap-3 rounded-2xl bg-gradient-to-br from-primary to-primary-dark px-4 py-3.5 text-white shadow-card">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white/15">
          <Trophy size={22} />
        </span>
        <div className="min-w-0">
          <h2 className="text-base font-extrabold leading-tight">Top Ranked Users</h2>
          <p className="truncate text-xs text-white/85">Highest spenders on this shop</p>
        </div>
      </div>

      {/* হরাইজন্টাল ক্যারোজেল — স্ক্রলবার লুকানো */}
      <div className="mt-3 flex gap-3 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {users.map((u) => {
          const tierLabel = TIER_LABEL[u.tier];
          return (
            <div
              key={u.rank}
              className="flex w-32 shrink-0 flex-col items-center rounded-2xl bg-white px-2 py-3 shadow-card"
            >
              <div className="relative h-[104px] w-[104px]">
                <WreathFrame uid={u.rank} />

                {/* উপরের খোলা মুখে সোনালি ক্রাউন */}
                <Crown
                  size={16}
                  className="absolute left-1/2 top-0 -translate-x-1/2 text-gold"
                  aria-hidden="true"
                />

                {/* অ্যাভাটার — বলয়ের ঠিক মাঝে */}
                <div className="absolute left-1/2 top-1/2 grid h-16 w-16 -translate-x-1/2 -translate-y-1/2 place-items-center overflow-hidden rounded-full bg-primary/10 text-lg font-bold text-primary-dark shadow-md ring-2 ring-white">
                  {u.avatar ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={u.avatar}
                      alt=""
                      className="h-full w-full object-cover"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    u.user.charAt(0).toUpperCase()
                  )}
                </div>

                {/* নিচে rank মেডেল */}
                <span
                  className={`absolute bottom-0 left-1/2 grid h-6 w-6 -translate-x-1/2 place-items-center rounded-full text-[11px] font-extrabold ring-2 ring-white ${rankClass(u.rank)}`}
                >
                  {u.rank}
                </span>
              </div>

              <p className="mt-1.5 w-full truncate text-center text-sm font-semibold text-slate-800">
                {u.user}
              </p>
              {tierLabel && (
                <p className="text-xs font-bold text-primary">{tierLabel}</p>
              )}
              <p className="text-[11px] font-bold text-slate-400">{money(u.total)}</p>
            </div>
          );
        })}
      </div>
    </section>
  );
}
