'use client';

import React, { useId, useState } from 'react';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  onConfirm: () => Promise<void>;
  onClose: () => void;
  reasonRequired?: boolean;
  reason?: string;
  onReasonChange?: (value: string) => void;
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  onConfirm,
  onClose,
  reasonRequired = false,
  reason = '',
  onReasonChange,
}: ConfirmDialogProps) {
  const [loading, setLoading] = useState(false);
  const titleId = useId();
  const descId = useId();

  if (!open) return null;

  const handleConfirm = async () => {
    setLoading(true);
    try {
      await onConfirm();
    } catch (err) {
      // Best-effort: caller is responsible for UI feedback; we just stop the spinner.
      console.error('ConfirmDialog onConfirm failed:', (err as Error)?.message);
    } finally {
      setLoading(false);
    }
  };

  const canConfirm = !reasonRequired || reason.trim().length > 0;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={descId}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
    >
      <div className="w-full max-w-md rounded-card bg-white p-6 shadow-card-md">
        <h2 id={titleId} className="text-lg font-semibold text-umber">{title}</h2>
        <p id={descId} className="mt-2 text-sm text-mocha">{description}</p>

        {reasonRequired && (
          <div className="mt-4">
            <label className="mb-1 block text-sm font-medium text-mocha">
              Reason <span className="text-destructive">*</span>
            </label>
            <textarea
              value={reason}
              onChange={(e) => onReasonChange?.(e.target.value)}
              className="w-full rounded-input border border-border bg-background px-4 py-3 text-sm text-umber outline-none transition focus:border-primary focus:ring-1 focus:ring-primary"
              rows={3}
              maxLength={1000}
              placeholder="Enter reason..."
              required
            />
            <p className="mt-1 text-right text-xs text-sand">
              {reason.length}/1000
            </p>
          </div>
        )}

        <div className="mt-6 flex justify-end gap-3">
          <button
            onClick={onClose}
            disabled={loading}
            className="rounded-lg border border-border bg-white px-4 py-2 text-sm font-medium text-mocha transition hover:bg-muted"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={loading || !canConfirm}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white transition hover:bg-primary-hover disabled:opacity-50"
          >
            {loading ? 'Processing...' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
