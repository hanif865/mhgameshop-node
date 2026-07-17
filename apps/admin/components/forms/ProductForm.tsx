'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { apiGet, apiPost, apiPut } from '@/lib/api';
import { ImageUpload } from '@/components/ImageUpload';
import { useToast } from '@/components/ui/Toast';

const TYPES = ['topup', 'voucher', 'ingame', 'subscription', 'autolike'];

export interface ProductData {
  id?: number;
  categoryId?: number;
  title?: string;
  slug?: string;
  type?: string;
  description?: string | null;
  shellId?: number | null;
  orderColumn?: number;
  status?: number;
  image?: string | null;
  formFields?: any[] | null;
}

const FORM_FIELDS_EXAMPLE = `[
  {"key":"account_type","label":"Account Type","type":"select","options":["Facebook","Google","VK","Twitter"]},
  {"key":"account_id","label":"Your Facebook Id / Number","type":"text","placeholder":"Enter your Facebook Id / Number"},
  {"key":"password","label":"Password","type":"password","placeholder":"Enter Password"},
  {"key":"backup_code","label":"Backup Code / Your WhatsApp Number","type":"text","placeholder":"Backup Code / WhatsApp Number"}
]`;

export function ProductForm({ initial }: { initial?: ProductData }) {
  const toast = useToast();
  const router = useRouter();
  const [form, setForm] = useState<ProductData>(
    initial ?? { type: 'topup', status: 1, orderColumn: 0 },
  );
  const [categories, setCategories] = useState<{ id: number; title: string }[]>([]);
  const [shells, setShells] = useState<{ id: number; name: string }[]>([]);
  const [saving, setSaving] = useState(false);
  const [formFieldsText, setFormFieldsText] = useState(
    initial?.formFields ? JSON.stringify(initial.formFields, null, 2) : '',
  );

  useEffect(() => {
    apiGet<any[]>('/api/admin/categories').then((r) => setCategories(r.data ?? []));
    apiGet<any[]>('/api/admin/shells').then((r) => setShells(r.data ?? []));
  }, []);

  function set<K extends keyof ProductData>(k: K, v: ProductData[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function save() {
    if (!form.title || !form.slug || !form.categoryId) {
      return toast.error('Title, slug and category are required.');
    }
    let formFields: any[] = [];
    if (formFieldsText.trim()) {
      try {
        formFields = JSON.parse(formFieldsText);
        if (!Array.isArray(formFields)) throw new Error();
      } catch {
        return toast.error('Custom Fields must be valid JSON (an array).');
      }
    }

    setSaving(true);
    const body = {
      categoryId: form.categoryId,
      title: form.title,
      slug: form.slug,
      type: form.type,
      description: form.description ?? null,
      shellId: form.shellId ?? null,
      formFields,
      orderColumn: form.orderColumn ?? 0,
      status: form.status ?? 1,
    };
    const res = form.id
      ? await apiPut(`/api/admin/products/${form.id}`, body)
      : await apiPost('/api/admin/products', body);
    setSaving(false);
    if (res.success) {
      toast.success('Saved.');
      router.push('/products');
    } else toast.error(res.message || 'Save failed.');
  }

  return (
    <div className="card max-w-2xl space-y-4 p-6">
      {form.id && (
        <div>
          <label className="label">Image</label>
          <ImageUpload
            endpoint={`/api/admin/products/${form.id}/image`}
            current={form.image}
            onUploaded={(d) => set('image', d?.image)}
          />
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label">Title</label>
          <input className="input" value={form.title ?? ''} onChange={(e) => set('title', e.target.value)} />
        </div>
        <div>
          <label className="label">Slug</label>
          <input className="input" value={form.slug ?? ''} onChange={(e) => set('slug', e.target.value)} />
        </div>
        <div>
          <label className="label">Category</label>
          <select
            className="input"
            value={form.categoryId ?? ''}
            onChange={(e) => set('categoryId', Number(e.target.value))}
          >
            <option value="">Select…</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.title}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Type</label>
          <select className="input" value={form.type} onChange={(e) => set('type', e.target.value)}>
            {TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Shell (for auto topup)</label>
          <select
            className="input"
            value={form.shellId ?? ''}
            onChange={(e) => set('shellId', e.target.value ? Number(e.target.value) : null)}
          >
            <option value="">None</option>
            {shells.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Order</label>
          <input
            type="number"
            className="input"
            value={form.orderColumn ?? 0}
            onChange={(e) => set('orderColumn', Number(e.target.value))}
          />
        </div>
      </div>

      <div>
        <label className="label">Description</label>
        <textarea
          rows={4}
          className="input"
          value={form.description ?? ''}
          onChange={(e) => set('description', e.target.value)}
        />
      </div>

      <div>
        <label className="label">Custom Input Fields (manual topup) — JSON, optional</label>
        <textarea
          rows={6}
          className="input font-mono text-xs"
          placeholder={FORM_FIELDS_EXAMPLE}
          value={formFieldsText}
          onChange={(e) => setFormFieldsText(e.target.value)}
        />
        <p className="mt-1 text-xs text-slate-400">
          Leave blank for the default Player ID field. For login-based manual topup
          (e.g. Facebook ID + password + backup code) paste a JSON array of fields —
          type can be <code>text</code>, <code>password</code>, or <code>select</code>{' '}
          (with an <code>options</code> array).
        </p>
      </div>

      <div>
        <label className="label">Status</label>
        <select
          className="input w-40"
          value={form.status ?? 1}
          onChange={(e) => set('status', Number(e.target.value))}
        >
          <option value={1}>Active</option>
          <option value={0}>Inactive</option>
        </select>
      </div>

      <div className="flex justify-end gap-2">
        <button onClick={() => router.push('/products')} className="btn-ghost">
          Cancel
        </button>
        <button onClick={save} disabled={saving} className="btn-primary">
          {saving ? <Loader2 size={16} className="animate-spin" /> : 'Save Product'}
        </button>
      </div>
    </div>
  );
}
