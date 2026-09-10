import React, { useEffect, useState } from 'react';
import api from '../api';
import { useToast } from '../context/ToastContext.jsx';
import ConfirmDialog from '../components/ConfirmDialog.jsx';

export default function Dropdowns() {
  const toast = useToast();
  const [dropdowns, setDropdowns] = useState([]);
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState('');
  const [confirm, setConfirm] = useState(null);
  const [optionDraft, setOptionDraft] = useState({}); // { [dropdownId]: {label, value} }

  async function load() {
    const res = await api.get('/dropdowns');
    setDropdowns(res.data);
  }
  useEffect(() => { load(); }, []);

  async function addDropdown(e) {
    e.preventDefault();
    if (!newName.trim()) return;
    await api.post('/dropdowns', { name: newName });
    toast.success('Dropdown created successfully.');
    setNewName(''); setShowAdd(false);
    load();
  }

  async function renameDropdown(d, name) {
    const usage = await api.get(`/dropdowns/${d.id}/usage`);
    const usedList = usage.data.fields.flatMap((entry) =>
      entry.forms.length
        ? entry.forms.map((f) => `Field "${entry.field.name}" in form "${f.name}"`)
        : [`Field "${entry.field.name}" (not yet used in a form)`]
    );
    if (usedList.length === 0) {
      await api.put(`/dropdowns/${d.id}`, { name });
      toast.success('Dropdown renamed successfully.');
      load();
      return;
    }
    setConfirm({
      title: `Rename "${d.name}" to "${name}"?`,
      message: 'This dropdown is used in the following places. The update will apply everywhere automatically.',
      usageList: usedList,
      confirmLabel: 'Update Everywhere',
      onConfirm: async () => {
        await api.put(`/dropdowns/${d.id}`, { name });
        toast.success('Dropdown renamed successfully.');
        setConfirm(null);
        load();
      },
    });
  }

  async function deleteDropdown(d) {
    setConfirm({
      title: `Delete "${d.name}"?`,
      danger: true,
      confirmLabel: 'Delete Dropdown',
      onConfirm: async () => {
        setConfirm(null);
        try {
          await api.delete(`/dropdowns/${d.id}`);
          toast.success('Dropdown deleted successfully.');
          load();
        } catch (err) {
          if (err.response?.status === 409) {
            setConfirm({
              title: `Can't delete "${d.name}"`,
              message: 'This dropdown is still linked to the fields below. Unlink it first, then delete.',
              usageList: err.response.data.usedIn.map((f) => `Field: ${f.name}`),
              hideConfirm: true,
            });
          } else {
            toast.error(err.response?.data?.error || 'Delete failed.');
          }
        }
      },
    });
  }

  async function updateOption(optionId, label, value, dropdownName) {
    if (!label.trim() || !value.trim()) return toast.error('Both label and value are required.');
    await api.put(`/dropdowns/options/${optionId}`, { label: label.trim(), value: value.trim() });
    toast.success(`Option updated — it will reflect wherever "${dropdownName}" is used.`);
    load();
  }

  async function addOption(d) {
    const draft = optionDraft[d.id] || {};
    if (!draft.label || !draft.value) return toast.error('Both label and value are required.');
    await api.post(`/dropdowns/${d.id}/options`, draft);
    setOptionDraft((s) => ({ ...s, [d.id]: { label: '', value: '' } }));
    toast.success('Option added successfully.');
    load();
  }

  function deleteOption(optionId, dropdownName) {
    setConfirm({
      title: `Delete this option from "${dropdownName}"?`,
      danger: true,
      confirmLabel: 'Delete Option',
      onConfirm: async () => {
        await api.delete(`/dropdowns/options/${optionId}`);
        toast.success('Option deleted successfully.');
        setConfirm(null);
        load();
      },
    });
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-xl font-semibold">Dropdowns</h1>
          <p className="text-sm text-gray-500">Define reusable dropdown option lists for your Fields.</p>
        </div>
        <button className="btn-primary" onClick={() => setShowAdd(true)}>+ Add Dropdown</button>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        {dropdowns.map((d) => (
          <div key={d.id} className="card p-4">
            <div className="flex items-center justify-between mb-2">
              <input
                className="font-medium text-sm bg-transparent border-b border-transparent hover:border-gray-300 focus:border-brand-500 focus:outline-none px-0.5"
                defaultValue={d.name}
                onBlur={(e) => e.target.value.trim() && e.target.value !== d.name && renameDropdown(d, e.target.value.trim())}
              />
              <button className="btn-ghost text-red-600 text-xs" onClick={() => deleteDropdown(d)}>Delete</button>
            </div>
            <ul className="space-y-1 mb-2 max-h-48 overflow-y-auto">
              {d.options.map((o) => (
                <li key={o.id} className="flex items-center gap-1.5 text-sm bg-gray-50 rounded px-2 py-1">
                  <input
                    className="bg-transparent border-b border-transparent hover:border-gray-300 focus:border-brand-500 focus:outline-none px-0.5 flex-1 min-w-0"
                    defaultValue={o.label}
                    placeholder="Label"
                    onBlur={(e) => e.target.value.trim() && e.target.value !== o.label && updateOption(o.id, e.target.value, o.value, d.name)}
                  />
                  <span className="text-gray-300">/</span>
                  <input
                    className="bg-transparent border-b border-transparent hover:border-gray-300 focus:border-brand-500 focus:outline-none px-0.5 w-24 text-gray-500"
                    defaultValue={o.value}
                    placeholder="Value"
                    onBlur={(e) => e.target.value.trim() && e.target.value !== o.value && updateOption(o.id, o.label, e.target.value, d.name)}
                  />
                  <button className="text-xs text-red-500 shrink-0" onClick={() => deleteOption(o.id, d.name)}>✕</button>
                </li>
              ))}
              {d.options.length === 0 && <li className="text-xs text-gray-400 py-1">No options yet.</li>}
            </ul>
            <div className="flex gap-2">
              <input
                className="input flex-1"
                placeholder="Label"
                value={optionDraft[d.id]?.label || ''}
                onChange={(e) => setOptionDraft((s) => ({ ...s, [d.id]: { ...s[d.id], label: e.target.value } }))}
              />
              <input
                className="input flex-1"
                placeholder="Value"
                value={optionDraft[d.id]?.value || ''}
                onChange={(e) => setOptionDraft((s) => ({ ...s, [d.id]: { ...s[d.id], value: e.target.value } }))}
              />
              <button className="btn-secondary" onClick={() => addOption(d)}>Add</button>
            </div>
          </div>
        ))}
        {dropdowns.length === 0 && <div className="text-gray-400 text-sm">No dropdowns yet.</div>}
      </div>

      {showAdd && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/40 p-4">
          <form onSubmit={addDropdown} className="card w-full max-w-sm p-5">
            <h3 className="text-base font-semibold mb-3">Add Dropdown</h3>
            <label className="label-text">Dropdown Name</label>
            <input className="input" autoFocus value={newName} onChange={(e) => setNewName(e.target.value)} required />
            <div className="flex justify-end gap-2 mt-5">
              <button type="button" className="btn-secondary" onClick={() => setShowAdd(false)}>Cancel</button>
              <button className="btn-primary">Save</button>
            </div>
          </form>
        </div>
      )}

      <ConfirmDialog open={!!confirm} {...confirm} onCancel={() => setConfirm(null)} />
    </div>
  );
}
