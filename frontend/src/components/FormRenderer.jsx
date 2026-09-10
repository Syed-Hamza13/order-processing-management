import React from 'react';

// Renders inputs for a list of field definitions (from a Form) and reports
// changes back via onChange(slug, value). Values are keyed by field.slug.
// Dates are stored internally as ISO (yyyy-mm-dd, native <input type="date">)
// and displayed elsewhere in Indian dd/mm/yyyy format — see utils formatDate.
//
// pincodeAutoFill is OPTIONAL — when the caller doesn't pass it (or the configured
// fields aren't part of this particular form), nothing extra renders and behavior
// is identical to before this feature existed.
export default function FormRenderer({ fields, values, onChange, pincodeAutoFill }) {
  const cfg = pincodeAutoFill?.config;
  const canAutoFill =
    cfg &&
    fields.some((f) => f.slug === cfg.pincodeFieldSlug) &&
    fields.some((f) => f.slug === cfg.addressFieldSlug);

  return (
    <div className="space-y-3">
      {fields.map((f) => (
        <div key={f.id}>
          <label className="label-text">{f.name}</label>
          {renderInput(f, values[f.slug], (v) => onChange(f.slug, v))}
        </div>
      ))}
      {canAutoFill && (
        <label className="flex items-center gap-2 text-sm text-gray-600 pt-1 border-t border-gray-100 mt-1">
          <input
            type="checkbox"
            checked={pincodeAutoFill.enabled}
            onChange={(e) => pincodeAutoFill.onToggle(e.target.checked)}
          />
          Auto-append District &amp; State to Address from PIN Code
          {pincodeAutoFill.loading && <span className="text-xs text-gray-400">Fetching…</span>}
        </label>
      )}
    </div>
  );
}

function renderInput(field, value, set) {
  switch (field.type) {
    case 'multiline_text':
      return <textarea className="input" rows={3} value={value || ''} onChange={(e) => set(e.target.value)} />;
    case 'number':
      return <input type="number" className="input" value={value ?? ''} onChange={(e) => set(e.target.value)} />;
    case 'date':
      return <input type="date" className="input" value={value || ''} onChange={(e) => set(e.target.value)} />;
    case 'dropdown':
      return (
        <select className="input" value={value || ''} onChange={(e) => set(e.target.value)}>
          <option value="">Select…</option>
          {(field.options || []).map((o) => <option key={o.id} value={o.value}>{o.label}</option>)}
        </select>
      );
    case 'toggle':
      return (
        <select className="input" value={value ?? ''} onChange={(e) => set(e.target.value)}>
          <option value="">—</option>
          <option value="Yes">Yes</option>
          <option value="No">No</option>
        </select>
      );
    case 'short_text':
    default:
      return <input type="text" className="input" value={value || ''} onChange={(e) => set(e.target.value)} />;
  }
}