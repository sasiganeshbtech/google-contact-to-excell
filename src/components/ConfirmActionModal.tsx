import React, { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, X } from 'lucide-react';
import type { ConfirmModalConfig } from '../types/contacts';

interface ConfirmActionModalProps {
  config: ConfirmModalConfig | null;
  onClose: () => void;
}

export const ConfirmActionModal: React.FC<ConfirmActionModalProps> = ({ config, onClose }) => {
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!config) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !submitting) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [config, submitting, onClose]);

  if (!config) return null;

  const handleConfirm = async () => {
    setSubmitting(true);
    try {
      await config.onConfirm();
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  const isDanger = config.tone === 'danger';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-modal-title"
      onClick={() => {
        if (!submitting) onClose();
      }}
    >
      <div
        className="w-full max-w-lg rounded-xl border border-slate-200 bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-6 py-4">
          <div className="flex items-center gap-3">
            <div
              className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
                isDanger ? 'bg-red-50 text-red-700' : 'bg-blue-50 text-blue-700'
              }`}
            >
              {isDanger ? <AlertTriangle className="h-5 w-5" /> : <CheckCircle2 className="h-5 w-5" />}
            </div>
            <h2
              id="confirm-modal-title"
              className="text-base font-semibold text-slate-900"
            >
              {config.title}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="rounded-md p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 focus-visible:outline-2 focus-visible:outline-blue-600"
            aria-label="Close dialog"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4 px-6 py-5">
          <p className="text-sm leading-relaxed text-slate-600">{config.description}</p>

          {config.details && config.details.length > 0 && (
            <div className="max-h-44 overflow-y-auto rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
              <ul className="space-y-1.5 text-xs text-slate-700">
                {config.details.map((item, idx) => (
                  <li key={idx} className="truncate font-mono">
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-3 border-t border-slate-200 bg-slate-50/70 px-6 py-3.5 rounded-b-xl">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-blue-600 whitespace-nowrap shrink-0"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={submitting}
            className={`rounded-lg px-4 py-2 text-sm font-semibold text-white transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 whitespace-nowrap shrink-0 disabled:opacity-60 ${
              isDanger
                ? 'bg-red-700 hover:bg-red-800 focus-visible:outline-red-700'
                : 'bg-blue-700 hover:bg-blue-800 focus-visible:outline-blue-700'
            }`}
          >
            {submitting ? 'Applying...' : config.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};
