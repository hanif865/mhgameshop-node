'use client';

import type { ReactNode } from 'react';
import { Search, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';

export interface Column<T> {
  key: string;
  label: string;
  render?: (row: T) => ReactNode;
  className?: string;
}

interface FilterConfig {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}

export function DataTable<T extends { id: number | string }>({
  columns,
  rows,
  loading,
  page = 1,
  totalPages = 1,
  onPageChange,
  search,
  filters,
  toolbar,
  empty = 'No records found.',
}: {
  columns: Column<T>[];
  rows: T[];
  loading?: boolean;
  page?: number;
  totalPages?: number;
  onPageChange?: (p: number) => void;
  search?: { value: string; onChange: (v: string) => void; placeholder?: string };
  filters?: FilterConfig[];
  toolbar?: ReactNode;
  empty?: string;
}) {
  return (
    <div className="card overflow-hidden">
      {(search || filters || toolbar) && (
        <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 p-3">
          {search && (
            <div className="relative flex-1 min-w-[200px]">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                className="input pl-9"
                placeholder={search.placeholder ?? 'Search…'}
                value={search.value}
                onChange={(e) => search.onChange(e.target.value)}
              />
            </div>
          )}
          {filters?.map((f, i) => (
            <select
              key={i}
              className="input w-auto"
              value={f.value}
              onChange={(e) => f.onChange(e.target.value)}
            >
              {f.options.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          ))}
          <div className="ml-auto">{toolbar}</div>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-slate-50">
            <tr>
              {columns.map((c) => (
                <th key={c.key} className="th">
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              <tr>
                <td colSpan={columns.length} className="td text-center">
                  <Loader2 className="mx-auto my-8 animate-spin text-slate-300" />
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="td py-10 text-center text-slate-400">
                  {empty}
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.id} className="hover:bg-slate-50">
                  {columns.map((c) => (
                    <td key={c.key} className={`td ${c.className ?? ''}`}>
                      {c.render ? c.render(row) : ((row as any)[c.key] ?? '—')}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {onPageChange && totalPages > 1 && (
        <div className="flex items-center justify-between border-t border-slate-100 p-3 text-sm text-slate-500">
          <span>
            Page {page} of {totalPages}
          </span>
          <div className="flex gap-2">
            <button
              disabled={page <= 1}
              onClick={() => onPageChange(page - 1)}
              className="btn-ghost px-2 py-1 disabled:opacity-40"
            >
              <ChevronLeft size={16} />
            </button>
            <button
              disabled={page >= totalPages}
              onClick={() => onPageChange(page + 1)}
              className="btn-ghost px-2 py-1 disabled:opacity-40"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
