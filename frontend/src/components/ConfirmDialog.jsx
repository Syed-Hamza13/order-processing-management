import React from 'react';

// Generic overlay confirmation dialog used for:
// - "cannot delete, here's where it's used" warnings
// - "this cannot be undone" delete confirmations
// - "you're renaming X, it's used here" cascade confirmations
export default function ConfirmDialog({
  open,
  title,
  message,
  usageList, // optional array of strings describing where something is used
  danger = false,
  confirmLabel = 'Confirm',
  onConfirm,
  onCancel,
  hideConfirm = false, // true when this is a pure blocking warning (nothing to confirm)
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 p-4 no-print">
      <div className="card w-full max-w-md p-5">
        <h3 className="text-base font-semibold mb-2">{title}</h3>
        {message && <p className="text-sm text-gray-600 mb-3">{message}</p>}
        {usageList && usageList.length > 0 && (
          <ul className="text-sm bg-amber-50 border border-amber-200 rounded-lg p-3 mb-3 max-h-40 overflow-y-auto list-disc list-inside text-amber-800">
            {usageList.map((u, i) => <li key={i}>{u}</li>)}
          </ul>
        )}
        {danger && !hideConfirm && (
          <p className="text-xs font-medium text-red-600 mb-3">This action cannot be undone.</p>
        )}
        <div className="flex justify-end gap-2 mt-2">
          <button className="btn-secondary" onClick={onCancel}>{hideConfirm ? 'Close' : 'Cancel'}</button>
          {!hideConfirm && (
            <button className={danger ? 'btn-danger' : 'btn-primary'} onClick={onConfirm}>{confirmLabel}</button>
          )}
        </div>
      </div>
    </div>
  );
}
