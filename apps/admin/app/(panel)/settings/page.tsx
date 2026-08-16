'use client';

import { useEffect, useRef, useState } from 'react';
import { Loader2, Save, Upload } from 'lucide-react';
import { apiGet, apiPut, apiUpload } from '@/lib/api';
import { imageUrl } from '@/lib/config';
import { useToast } from '@/components/ui/Toast';

type Settings = Record<string, string>;

interface Field {
  key: string;
  label: string;
  type?: 'text' | 'textarea' | 'toggle' | 'color' | 'password' | 'image';
}
interface Section {
  title: string;
  fields: Field[];
}

const SECTIONS: Section[] = [
  {
    title: 'Site Info',
    fields: [
      { key: 'site_name', label: 'Site Name' },
      { key: 'site_title', label: 'Site Title' },
      { key: 'site_logo', label: 'Logo', type: 'image' },
      { key: 'site_favicon', label: 'Favicon', type: 'image' },
      { key: 'pwa_icon', label: 'PWA / App Icon (square PNG)', type: 'image' },
      { key: 'site_description', label: 'Description', type: 'textarea' },
    ],
  },
  {
    title: 'Social Links',
    fields: [
      { key: 'whatsapp_number', label: 'WhatsApp Number' },
      { key: 'telegram_url', label: 'Telegram URL' },
      { key: 'facebook_url', label: 'Facebook URL' },
      { key: 'instagram_url', label: 'Instagram URL' },
      { key: 'youtube_url', label: 'YouTube URL' },
      { key: 'messenger_url', label: 'Messenger URL' },
      { key: 'support_time', label: 'Support Time' },
    ],
  },
  {
    title: 'Wallet & Payment (UddoktaPay)',
    fields: [
      { key: 'wallet', label: 'Enable Wallet', type: 'toggle' },
      { key: 'uddoktapay_enabled', label: 'Enable UddoktaPay', type: 'toggle' },
      { key: 'uddoktapay_api_key', label: 'UddoktaPay API Key', type: 'password' },
      { key: 'uddoktapay_api_url', label: 'UddoktaPay Base URL' },
      { key: 'wallet_pay_image', label: 'Wallet Pay Image (checkout)', type: 'image' },
      { key: 'instant_pay_image', label: 'Instant Pay Image (checkout)', type: 'image' },
    ],
  },
  {
    title: 'Auto Topup (PinBot)',
    fields: [
      { key: 'enable_auto_topup', label: 'Enable Auto Topup', type: 'toggle' },
      { key: 'topup_gateway', label: 'Gateway (pinbot / topupnet)' },
      { key: 'pinbot_base_url', label: 'PinBot Base URL' },
      { key: 'pinbot_api_key', label: 'PinBot API Key', type: 'password' },
      { key: 'unipin_redeem_url', label: 'UniPin Redeem URL (My Codes button)' },
    ],
  },
  {
    title: 'Auto Like (Free Fire)',
    fields: [
      { key: 'like_gateway', label: 'Like Gateway (amartopupbd / pinbot)' },
      { key: 'like_api_key', label: 'amartopupbd — Like API Key', type: 'password' },
      { key: 'like_api_base_url', label: 'amartopupbd — Base URL' },
      { key: 'pinbot_like_base_url', label: 'PinBot — Like Base URL' },
      {
        key: 'pinbot_like_api_key',
        label: 'PinBot — Like Token (like_ / 100like_ / 200like_)',
        type: 'password',
      },
    ],
  },
  {
    title: 'Referral Program',
    fields: [
      { key: 'referral_enabled', label: 'Enable Referral', type: 'toggle' },
      { key: 'referral_bonus', label: 'Referrer Bonus ৳ (on referee’s first order)' },
      { key: 'referral_referee_bonus', label: 'New User Bonus ৳ (on signup)' },
      { key: 'referral_min_order', label: 'Minimum Order ৳ to qualify (0 = any)' },
    ],
  },
  {
    title: 'Creator Program',
    fields: [
      { key: 'creator_enabled', label: 'Enable Creator Program', type: 'toggle' },
      { key: 'creator_rules', label: 'Rules shown to creators', type: 'textarea' },
    ],
  },
  {
    title: 'Spin & Win',
    fields: [
      { key: 'spin_enabled', label: 'Enable Spin & Win', type: 'toggle' },
      { key: 'spin_prizes', label: 'Prize amounts ৳ (comma separated, e.g. 1,2,3,5,10)' },
    ],
  },
  {
    title: 'Top Ranked Users',
    fields: [
      { key: 'top_users_enabled', label: 'Enable Top Ranked Users', type: 'toggle' },
      { key: 'top_users_monthly', label: 'Monthly reset (off = all-time)', type: 'toggle' },
      { key: 'top_users_count', label: 'How many to show (default 10)' },
    ],
  },
  {
    title: 'Levels & Discounts',
    fields: [
      { key: 'level_bronze_min', label: 'Bronze — min spend ৳' },
      { key: 'level_bronze_discount', label: 'Bronze — discount %' },
      { key: 'level_silver_min', label: 'Silver — min spend ৳' },
      { key: 'level_silver_discount', label: 'Silver — discount %' },
      { key: 'level_gold_min', label: 'Gold — min spend ৳' },
      { key: 'level_gold_discount', label: 'Gold — discount %' },
      { key: 'level_platinum_min', label: 'Platinum — min spend ৳' },
      { key: 'level_platinum_discount', label: 'Platinum — discount %' },
      { key: 'level_premium_min', label: 'Premium — min spend ৳' },
      { key: 'level_premium_discount', label: 'Premium — discount %' },
    ],
  },
  {
    title: 'Telegram Notifications',
    fields: [
      { key: 'telegram_bot_token', label: 'Bot Token', type: 'password' },
      { key: 'telegram_chat_id', label: 'Chat ID' },
    ],
  },
  {
    title: 'Notice Bar',
    fields: [
      { key: 'enable_notice', label: 'Enable Notice', type: 'toggle' },
      { key: 'notice_title', label: 'Notice Title' },
      { key: 'notice_content', label: 'Notice Content', type: 'textarea' },
      { key: 'notice_background_color', label: 'Background Color', type: 'color' },
      { key: 'notice_font_color', label: 'Font Color', type: 'color' },
    ],
  },
  {
    title: 'Advanced',
    fields: [{ key: 'header_tags', label: 'Header Custom Tags (HTML)', type: 'textarea' }],
  },
];

const isTruthy = (v: string) => ['1', 'true', 'on', 'yes'].includes(String(v).toLowerCase());

export default function SettingsPage() {
  const toast = useToast();
  const [values, setValues] = useState<Settings>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    apiGet<Settings>('/api/admin/settings').then((res) => {
      const data: Settings = {};
      for (const [k, v] of Object.entries(res.data ?? {})) data[k] = v ?? '';
      setValues(data);
      setLoading(false);
    });
  }, []);

  const [uploading, setUploading] = useState<string | null>(null);

  function set(key: string, value: string) {
    setValues((v) => ({ ...v, [key]: value }));
  }

  async function uploadImage(key: string, file: File) {
    setUploading(key);
    const form = new FormData();
    form.append('file', file);
    const res = await apiUpload<{ value: string }>(`/api/admin/settings/upload/${key}`, form);
    setUploading(null);
    if (res.success && res.data) {
      set(key, res.data.value);
      toast.success('Image uploaded.');
    } else {
      toast.error(res.message || 'Upload failed.');
    }
  }

  async function save() {
    setSaving(true);
    const res = await apiPut('/api/admin/settings', values);
    setSaving(false);
    if (res.success) toast.success('Settings saved.');
    else toast.error(res.message || 'Save failed.');
  }

  if (loading)
    return (
      <div className="flex justify-center py-16 text-slate-300">
        <Loader2 className="animate-spin" />
      </div>
    );

  return (
    <div className="pb-20">
      <div className="mb-5 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-800">Settings</h1>
        <button onClick={save} disabled={saving} className="btn-primary">
          {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />} Save All
        </button>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        {SECTIONS.map((section) => (
          <div key={section.title} className="card p-5">
            <h2 className="mb-4 font-bold text-slate-800">{section.title}</h2>
            <div className="space-y-3">
              {section.fields.map((f) => (
                <div key={f.key}>
                  {f.type === 'toggle' ? (
                    <label className="flex items-center gap-2 text-sm font-medium text-slate-600">
                      <input
                        type="checkbox"
                        checked={isTruthy(values[f.key] ?? '')}
                        onChange={(e) => set(f.key, e.target.checked ? '1' : '0')}
                      />
                      {f.label}
                    </label>
                  ) : f.type === 'image' ? (
                    <>
                      <label className="label">{f.label}</label>
                      <div className="flex items-center gap-3">
                        {values[f.key] ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={imageUrl(values[f.key])}
                            alt=""
                            className="h-14 w-14 rounded-lg border border-slate-200 object-contain bg-slate-50"
                          />
                        ) : (
                          <div className="grid h-14 w-14 place-items-center rounded-lg border border-dashed border-slate-300 text-slate-300">
                            <Upload size={18} />
                          </div>
                        )}
                        <label className="btn-ghost cursor-pointer">
                          {uploading === f.key ? (
                            <Loader2 size={14} className="animate-spin" />
                          ) : (
                            <Upload size={14} />
                          )}
                          Upload
                          <input
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (file) uploadImage(f.key, file);
                              e.target.value = '';
                            }}
                          />
                        </label>
                      </div>
                    </>
                  ) : (
                    <>
                      <label className="label">{f.label}</label>
                      {f.type === 'textarea' ? (
                        <textarea
                          rows={3}
                          className="input"
                          value={values[f.key] ?? ''}
                          onChange={(e) => set(f.key, e.target.value)}
                        />
                      ) : f.type === 'color' ? (
                        <div className="flex items-center gap-2">
                          <input
                            type="color"
                            className="h-10 w-14 rounded border border-slate-200"
                            value={values[f.key] || '#16a34a'}
                            onChange={(e) => set(f.key, e.target.value)}
                          />
                          <input
                            className="input"
                            value={values[f.key] ?? ''}
                            onChange={(e) => set(f.key, e.target.value)}
                          />
                        </div>
                      ) : (
                        <input
                          type={f.type === 'password' ? 'password' : 'text'}
                          className="input"
                          value={values[f.key] ?? ''}
                          onChange={(e) => set(f.key, e.target.value)}
                        />
                      )}
                    </>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
