'use client';

import { AlertTriangle, Loader2 } from 'lucide-react';
import { Modal } from './Modal';

export function ConfirmDialog({
  open,
  title = 'Are you sure?',
  message,
  confirmLabel = 'Delete',
  loading = false,
  onConfirm,
  onClose,
}: {
  open: boolean;
  title?: string;
  message: string;
  confirmLabel?: string;
  loading?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <Modal open={open} onClose={onClose} title={title}>
      <div className="flex items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-red-50 text-red-500">
          <AlertTriangle size={20} />
        </span>
        <p className="pt-1.5 text-sm text-slate-600">{message}</p>
      </div>
      <div className="mt-5 flex justify-end gap-2">
        <button onClick={onClose} className="btn-ghost" disabled={loading}>
          Cancel
        </button>
        <button onClick={onConfirm} className="btn bg-red-600 text-white hover:bg-red-700" disabled={loading}>
          {loading ? <Loader2 size={16} className="animate-spin" /> : confirmLabel}
        </button>
      </div>
    </Modal>
  );
}
