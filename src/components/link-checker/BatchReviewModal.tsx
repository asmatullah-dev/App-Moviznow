import React from 'react';
import { AlertTriangle, Trash2 } from 'lucide-react';

export interface BatchReviewItem {
  key: string;
  title: string;
  year: string;
  links: any[];
  metadata: {
    languages: string[];
    printQuality?: string;
    subtitles?: boolean;
    type: 'movie' | 'series';
    season?: number;
    episode?: number;
    sampleUrl?: string;
  };
}

interface BatchReviewModalProps {
  batchReviewItems: BatchReviewItem[];
  updateBatchReviewItem: (key: string, field: 'title' | 'year', value: string) => void;
  removeBatchReviewItem: (key: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
}

export const BatchReviewModal: React.FC<BatchReviewModalProps> = ({
  batchReviewItems,
  updateBatchReviewItem,
  removeBatchReviewItem,
  onCancel,
  onConfirm,
}) => {
  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 p-4 space-y-4 max-h-[60vh] overflow-y-auto custom-scrollbar">
        {batchReviewItems.map((item) => (
          <div
            key={item.key}
            className="flex flex-col md:flex-row gap-6 p-5 rounded-2xl bg-zinc-50 dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800 shadow-sm transition-all hover:bg-zinc-100/50 dark:hover:bg-zinc-900/80"
          >
            <div className="flex-1 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
                <div className="md:col-span-9">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 dark:text-zinc-400 mb-1.5 block">
                    Content Title
                  </label>
                  <input
                    type="text"
                    value={item.title}
                    onChange={(e) => updateBatchReviewItem(item.key, 'title', e.target.value)}
                    className="w-full bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl px-4 py-2.5 text-sm font-medium outline-none focus:ring-2 focus:ring-cyan-500/40 focus:border-cyan-500 shadow-sm transition-all"
                    placeholder="Enter title..."
                  />
                </div>
                <div className="md:col-span-3">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 dark:text-zinc-400 mb-1.5 block">
                    Release Year
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      value={item.year}
                      onChange={(e) =>
                        updateBatchReviewItem(item.key, 'year', e.target.value.replace(/\D/g, ''))
                      }
                      className={`w-full bg-white dark:bg-zinc-950 border ${
                        !item.year
                          ? 'border-red-500/50 focus:ring-red-500/20'
                          : 'border-zinc-200 dark:border-zinc-800 focus:ring-cyan-500/20'
                      } rounded-xl px-4 py-2.5 text-sm font-mono outline-none focus:ring-2 transition-all`}
                      placeholder="YYYY"
                      maxLength={4}
                    />
                    {!item.year && (
                      <div className="absolute -bottom-5 left-0">
                        <p className="text-[10px] font-medium text-red-500 flex items-center gap-1">
                          <AlertTriangle className="h-2.5 w-2.5" /> Year required
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between mb-2">
                <label className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 dark:text-zinc-400 block">
                  Detected Metadata & Flags
                </label>
                <button
                  onClick={() => removeBatchReviewItem(item.key)}
                  className="p-1.5 text-zinc-400 hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-all group"
                  title="Remove Item"
                >
                  <Trash2 className="h-4 w-4 group-hover:scale-110 transition-transform" />
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                <span
                  className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider ${
                    item.metadata.type === 'series'
                      ? 'bg-indigo-500/15 text-indigo-500 border-indigo-500/30'
                      : 'bg-blue-500/15 text-blue-500 border-blue-500/30'
                  }`}
                >
                  {item.metadata.type}
                </span>
                {item.metadata.languages.map((l) => (
                  <span
                    key={l}
                    className="inline-flex items-center rounded-full border bg-emerald-500/15 text-emerald-500 border-emerald-500/30 px-2.5 py-1 text-[10px] font-semibold"
                  >
                    {l}
                  </span>
                ))}
                {item.metadata.printQuality && (
                  <span className="inline-flex items-center rounded-full border bg-fuchsia-500/15 text-fuchsia-500 border-fuchsia-500/30 px-2.5 py-1 text-[10px] font-semibold">
                    {item.metadata.printQuality}
                  </span>
                )}
                {item.metadata.subtitles && (
                  <span className="inline-flex items-center rounded-full border bg-amber-500/15 text-amber-500 border-amber-500/30 px-2.5 py-1 text-[10px] font-semibold uppercase">
                    Subs
                  </span>
                )}
                <span className="inline-flex items-center rounded-full border bg-zinc-500/10 text-zinc-500 border-zinc-500/20 px-2.5 py-1 text-[10px] font-medium">
                  {item.links.length} Source{item.links.length > 1 ? 's' : ''}
                </span>
              </div>
            </div>
          </div>
        ))}
        {batchReviewItems.length === 0 && (
          <div className="py-12 text-center text-zinc-500">No items to save.</div>
        )}
      </div>

      <div className="flex gap-3 justify-end pt-2">
        <button
          onClick={onCancel}
          className="px-6 py-2.5 rounded-2xl border border-zinc-200 dark:border-zinc-800 text-sm font-bold hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-all cursor-pointer"
        >
          Back to Results
        </button>
        <button
          onClick={onConfirm}
          disabled={batchReviewItems.length === 0}
          className="px-8 py-2.5 rounded-2xl bg-emerald-600 text-white text-sm font-bold hover:bg-emerald-700 disabled:opacity-50 transition-all shadow-lg shadow-emerald-500/20 cursor-pointer"
        >
          Save Drafts ({batchReviewItems.length})
        </button>
      </div>
    </div>
  );
};
