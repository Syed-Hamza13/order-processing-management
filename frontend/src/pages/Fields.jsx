import React, { useEffect, useState } from 'react';
import api from '../api';
import { useToast } from '../context/ToastContext.jsx';
import ConfirmDialog from '../components/ConfirmDialog.jsx';

const TYPE_LABELS = {
  short_text: 'Short Text',
  multiline_text: 'Multiline Text',
  number: 'Number',
  date: 'Date (dd/mm/yyyy)',
  dropdown: 'Dropdown',
  toggle: 'Toggle (Yes/No)',
};

export default function Fields() {
  const toast = useToast();
  const [fields, setFields] = useState([]);
  const [dropdowns, setDropdowns] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null); // field being edited, or null
  const [editingLocked, setEditingLocked] = useState(false); // true = only name editable
  const [name, setName] = useState('');
  const [type, setType] = useState('short_text');
  const [dropdownId, setDropdownId] = useState('');
  const [confirm, setConfirm] = useState(null); // { title, message, usageList, onConfirm, danger, hideConfirm }

  async function load() {
    const [f, d] = await Promise.all([api.get('/fields'), api.get('/dropdowns')]);
    setFields(f.data);
    setDropdowns(d.data);
  }
  useEffect(() => { load(); }, []);

  function openAdd() {
    setEditing(null);
    setEditingLocked(false);
    setName(''); setType('short_text'); setDropdownId('');
    setShowForm(true);
  }

  async function openEdit(field) {
    const usage = await api.get(`/fields/${field.id}/usage`);
    setEditing(field);
    setEditingLocked(usage.data.forms.length > 0);
    setName(field.name); setType(field.type); setDropdownId(field.dropdown_id || '');
    setShowForm(true);
  }

  async function save(e) {
    e.preventDefault();
    try {
      if (editing) {
        if (!editingLocked) {
          await api.put(`/fields/${editing.id}`, { name, type, dropdownId: dropdownId || null });
        } else {
          const usage = await api.get(`/fields/${editing.id}/usage`);
          setConfirm({
            title: `Rename "${editing.name}"?`,
            message: 'This field is used in the following forms. Renaming will update its name everywhere it appears.',
            usageList: usage.data.forms.map((f) => `Form: ${f.name}`),
            confirmLabel: 'Rename Everywhere',
            onConfirm: async () => {
              await api.put(`/fields/${editing.id}`, { name });
              toast.success('Field renamed successfully.');
              setConfirm(null); setShowForm(false); load();
            },
          });
          return;
        }
      } else {
        await api.post('/fields', { name, type, dropdownId: dropdownId || null });
      }
      toast.success(editing ? 'Field updated successfully.' : 'Field added successfully.');
      setShowForm(false);
      load();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Something went wrong.');
    }
  }

  async function remove(field) {
    try {
      await api.delete(`/fields/${field.id}`);
      toast.success('Field deleted successfully.');
      load();
    } catch (err) {
      if (err.response?.status === 409) {
        setConfirm({
          title: `Can't delete "${field.name}"`,
          message: 'This field is still used in the forms below. Remove it from all of them first, then delete it.',
          usageList: err.response.data.usedIn.map((f) => `Form: ${f.name}`),
          hideConfirm: true,
        });
      } else {
        toast.error(err.response?.data?.error || 'Delete failed.');
      }
    }
  }

  function confirmDeleteDialog(field) {
    setConfirm({
      title: `Delete "${field.name}"?`,
      danger: true,
      confirmLabel: 'Delete Field',
      onConfirm: () => { setConfirm(null); remove(field); },
    });
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-xl font-semibold">Fields</h1>
          <p className="text-sm text-gray-500">Reusable data fields used to build your Forms.</p>
        </div>
        <button className="btn-primary" onClick={openAdd}>+ Add Field</button>
      </div>

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
            <tr>
              <th className="text-left px-4 py-3">Name</th>
              <th className="text-left px-4 py-3">Type</th>
              <th className="text-right px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {fields.map((f) => (
              <tr key={f.id}>
                <td className="px-4 py-3 font-medium">{f.name}</td>
                <td className="px-4 py-3 text-gray-600">
                  {TYPE_LABELS[f.type]}{f.type === 'dropdown' && f.dropdown_name ? ` — ${f.dropdown_name}` : ''}
                </td>
                <td className="px-4 py-3 text-right space-x-2">
                  <button className="btn-ghost" onClick={() => openEdit(f)}>Edit</button>
                  <button className="btn-ghost text-red-600" onClick={() => confirmDeleteDialog(f)}>Delete</button>
                </td>
              </tr>
            ))}
            {fields.length === 0 && (
              <tr><td colSpan={3} className="px-4 py-8 text-center text-gray-400">No fields yet. Add your first field to get started.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {showForm && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/40 p-4">
          <form onSubmit={save} className="card w-full max-w-sm p-5">
            <h3 className="text-base font-semibold mb-3">{editing ? 'Edit Field' : 'Add Field'}</h3>
            <div className="space-y-3">
              <div>
                <label className="label-text">Field Name</label>
                <input className="input" value={name} onChange={(e) => setName(e.target.value)} required autoFocus />
              </div>
              <div>
                <label className="label-text">Field Type {editingLocked && <span className="text-xs text-amber-600">(locked — in use)</span>}</label>
                <select className="input" value={type} onChange={(e) => setType(e.target.value)} disabled={editingLocked}>
                  {Object.entries(TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
              {type === 'dropdown' && (
                <div>
                  <label className="label-text">Which Dropdown?</label>
                  <select className="input" value={dropdownId} onChange={(e) => setDropdownId(e.target.value)} disabled={editingLocked} required>
                    <option value="">Select a dropdown…</option>
                    {dropdowns.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </select>
                </div>
              )}
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <button type="button" className="btn-secondary" onClick={() => setShowForm(false)}>Cancel</button>
              <button className="btn-primary">Save</button>
            </div>
          </form>
        </div>
      )}

      <ConfirmDialog open={!!confirm} {...confirm} onCancel={() => setConfirm(null)} />
    </div>
  );
}
