'use client';

import { useRef, useState } from 'react';
import { Upload, Loader2 } from 'lucide-react';
import { apiUpload } from '@/lib/api';
import { imageUrl } from '@/lib/config';
import { useToast } from '@/components/ui/Toast';

/**
 * Image upload with preview. Uploads to `endpoint` (PUT multipart, field "image")
 * and calls onUploaded with the returned entity.
 */
export function ImageUpload({
  endpoint,
  current,
  onUploaded,
}: {
  endpoint: string;
  current?: string | null;
  onUploaded?: (data: any) => void;
}) {
  const toast = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(current ? imageUrl(current) : null);
  const [uploading, setUploading] = useState(false);

  async function onFile(file: File) {
    setPreview(URL.createObjectURL(file));
    setUploading(true);
    const form = new FormData();
    form.append('image', file);
    const res = await apiUpload(endpoint, form);
    setUploading(false);
    if (res.success) {
      toast.success('Image uploaded.');
      onUploaded?.(res.data);
    } else {
      toast.error(res.message || 'Upload failed.');
    }
  }

  return (
    <div className="flex items-center gap-4">
      <div className="grid h-24 w-24 place-items-center overflow-hidden rounded-xl border border-dashed border-slate-300 bg-slate-50">
        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={preview} alt="" className="h-full w-full object-cover" />
        ) : (
          <span className="text-xs text-slate-400">No image</span>
        )}
      </div>
      <div>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
        />
        <button onClick={() => inputRef.current?.click()} className="btn-ghost" disabled={uploading}>
          {uploading ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
          Upload Image
        </button>
        <p className="mt-1 text-xs text-slate-400">JPG/PNG/WebP, up to 5MB.</p>
      </div>
    </div>
  );
}
