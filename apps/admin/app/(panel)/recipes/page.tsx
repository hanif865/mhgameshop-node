'use client';

import { useEffect, useState } from 'react';
import { Plus, Trash2, Loader2 } from 'lucide-react';
import { apiGet, apiPost, apiDelete } from '@/lib/api';
import { Modal } from '@/components/Modal';
import { useToast } from '@/components/ui/Toast';

interface RecipeRow {
  variation_id: number | null;
  combo_package_id: number | null;
  uc: number;
  qty: number;
  vtitle: string;
  ptitle: string;
}
interface Pack {
  id: number;
  title: string;
  price: number;
  product: string;
  type?: string;
}

/** একই প্যাকেজের সব লাইন এক করে "161×2 + 800×1" বানাই */
function group(rows: RecipeRow[]) {
  const map = new Map<string, { title: string; combo: boolean; id: number; items: string[] }>();
  for (const r of rows) {
    const combo = !!r.combo_package_id;
    const id = (combo ? r.combo_package_id : r.variation_id)!;
    const key = `${combo ? 'c' : 'v'}:${id}`;
    if (!map.has(key)) map.set(key, { title: `${r.ptitle} — ${r.vtitle}`, combo, id, items: [] });
    map.get(key)!.items.push(`${r.uc}×${r.qty}`);
  }
  return [...map.values()];
}

export default function RecipesPage() {
  const toast = useToast();
  const [rows, setRows] = useState<RecipeRow[]>([]);
  const [packs, setPacks] = useState<{ variations: Pack[]; combos: Pack[] }>({ variations: [], combos: [] });
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [target, setTarget] = useState(''); // "v:5" | "c:13"
  const [items, setItems] = useState(''); // "161x2 800x1"
  const [pkQuery, setPkQuery] = useState(''); // প্যাকেজ সার্চ

  async function load() {
    setLoading(true);
    const [r, p] = await Promise.all([
      apiGet<RecipeRow[]>('/api/admin/pool/recipes'),
      apiGet<{ variations: Pack[]; combos: Pack[] }>('/api/admin/pool/packs'),
    ]);
    setRows(r.data ?? []);
    setPacks(p.data ?? { variations: [], combos: [] });
    setLoading(false);
  }
  useEffect(() => {
    load();
  }, []);

  async function save() {
    if (!target) return toast.error('Pick a package.');
    const parsed = items.trim().split(/\s+/).map((p) => {
      const m = p.match(/^(\d+)[x×*](\d+)$/i);
      return m ? { uc: Number(m[1]), qty: Number(m[2]) } : null;
    });
    if (!parsed.length || parsed.some((x) => !x)) return toast.error('Format: 161x2 800x1');
    const [kind, id] = target.split(':');
    const body = kind === 'c' ? { combo_package_id: Number(id), items: parsed } : { variation_id: Number(id), items: parsed };
    setSaving(true);
    const res = await apiPost('/api/admin/pool/recipes', body);
    setSaving(false);
    if (res.success) {
      toast.success('Recipe saved.');
      setEditing(false);
      setTarget('');
      setItems('');
      load();
    } else toast.error(res.message || 'Failed.');
  }

  async function remove(g: { combo: boolean; id: number; title: string }) {
    if (!confirm(`Remove recipe for ${g.title}?`)) return;
    const body = g.combo ? { combo_package_id: g.id } : { variation_id: g.id };
    const res = await apiDelete('/api/admin/pool/recipes', body);
    if (res.success) {
      toast.success('Removed.');
      load();
    } else toast.error(res.message || 'Failed.');
  }

  const grouped = group(rows);

  // প্যাকেজ সার্চ — প্রোডাক্ট বা প্যাকেজের নামে মেলে
  const q = pkQuery.trim().toLowerCase();
  const match = (p: Pack) => !q || `${p.product} ${p.title}`.toLowerCase().includes(q);
  const fVariations = packs.variations.filter(match);
  const fCombos = packs.combos.filter(match);

  return (
    <div>
      <div className="mb-5 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Recipes</h1>
          <p className="text-sm text-slate-500">Which UC codes each package draws from the pool.</p>
        </div>
        <button onClick={() => { setTarget(''); setItems(''); setPkQuery(''); setEditing(true); }} className="btn-primary">
          <Plus size={16} /> Set Recipe
        </button>
      </div>

      {loading ? (
        <div className="py-10 text-center text-slate-400"><Loader2 className="mx-auto animate-spin" /></div>
      ) : grouped.length === 0 ? (
        <p className="rounded-lg bg-slate-50 p-6 text-center text-slate-500">No recipes yet.</p>
      ) : (
        <div className="space-y-2">
          {grouped.map((g) => (
            <div key={`${g.combo}-${g.id}`} className="flex items-center justify-between rounded-lg border border-slate-200 bg-white p-3">
              <div>
                <p className="font-medium text-slate-800">{g.combo ? '🎁 ' : ''}{g.title}</p>
                <p className="text-sm text-slate-500">{g.items.join('  +  ')}</p>
              </div>
              <button onClick={() => remove(g)} className="btn-danger px-2 py-1"><Trash2 size={14} /></button>
            </div>
          ))}
        </div>
      )}

      <Modal open={editing} onClose={() => setEditing(false)} title="Set Recipe">
        <div className="space-y-3">
          <div>
            <label className="label">Package</label>
            <input
              className="input mb-2"
              placeholder="🔍 Search package… (e.g. mistry, weekly)"
              value={pkQuery}
              onChange={(e) => setPkQuery(e.target.value)}
            />
            <select
              className="input"
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              size={8}
            >
              {fVariations.length === 0 && fCombos.length === 0 && <option value="">No match</option>}
              {fVariations.length > 0 && (
                <optgroup label="Variations">
                  {fVariations.map((v) => (
                    <option key={`v${v.id}`} value={`v:${v.id}`}>{v.product} — {v.title} (৳{v.price})</option>
                  ))}
                </optgroup>
              )}
              {fCombos.length > 0 && (
                <optgroup label="Combo Packages">
                  {fCombos.map((c) => (
                    <option key={`c${c.id}`} value={`c:${c.id}`}>🎁 {c.product} — {c.title} (৳{c.price})</option>
                  ))}
                </optgroup>
              )}
            </select>
          </div>
          <div>
            <label className="label">Recipe (UC×qty, space separated)</label>
            <input className="input font-mono" placeholder="161x2 800x1" value={items} onChange={(e) => setItems(e.target.value)} />
            <p className="mt-1 text-xs text-slate-400">e.g. <code>161x1</code> = one 161-UC code · <code>160x2 80x1</code> = two 240💎 + one 115💎</p>
          </div>
          <div className="flex justify-end gap-2">
            <button onClick={() => setEditing(false)} className="btn-ghost">Cancel</button>
            <button onClick={save} disabled={saving} className="btn-primary">
              {saving ? <Loader2 size={16} className="animate-spin" /> : 'Save'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
