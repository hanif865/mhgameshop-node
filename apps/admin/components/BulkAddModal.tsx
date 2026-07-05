'use client';

import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Modal } from './Modal';
import { apiPost } from '@/lib/api';
import { useToast } from '@/components/ui/Toast';

/**
 * Textarea modal for bulk voucher-code upload. Posts { ...extra, codes } to
 * `endpoint`. Used for variation vouchers, auto-vouchers and combo item codes.
 */
export function BulkAddModal({
  open,
  onClose,
  endpoint,
  extra = {},
  onDone,
  title = 'Bulk Add Codes',
}: {
  open: boolean;
  onClose: () => void;
  endpoint: string;
  extra?: Record<string, unknown>;
  onDone?: () => void;
  title?: string;
}) {
  const toast = useToast();
  const [codes, setCodes] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit() {
    if (!codes.trim()) return toast.error('Paste at least one code.');
    setLoading(true);
    const res = await apiPost<{ added: number }>(endpoint, { ...extra, codes });
    setLoading(false);
    if (res.success) {
      toast.success(res.message || 'Codes added.');
      setCodes('');
      onDone?.();
      onClose();
    } else {
      toast.error(res.message || 'Failed to add codes.');
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={title} size="lg">
      <label className="label">One code per line</label>
      <textarea
        rows={10}
        className="input font-mono text-xs"
        placeholder={'CODE-1111-2222\nCODE-3333-4444'}
        value={codes}
        onChange={(e) => setCodes(e.target.value)}
      />
      <div className="mt-4 flex justify-end gap-2">
        <button onClick={onClose} className="btn-ghost">
          Cancel
        </button>
        <button onClick={submit} disabled={loading} className="btn-primary">
          {loading ? <Loader2 size={16} className="animate-spin" /> : 'Add Codes'}
        </button>
      </div>
    </Modal>
  );
}
