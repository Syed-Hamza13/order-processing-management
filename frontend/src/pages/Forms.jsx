import React, { useEffect, useState } from 'react';
import api from '../api';
import { useToast } from '../context/ToastContext.jsx';
import ConfirmDialog from '../components/ConfirmDialog.jsx';

export default function Forms() {
  const toast = useToast();
  const [forms, setForms] = useState([]);
  const [allFields, setAllFields] = useState([]);
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState('');
  const [newFieldIds, setNewFieldIds] = useState([]);
  const [openFormId, setOpenFormId] = useState(null); // which form's field-editor is expanded
  const [dragIndex, setDragIndex] = useState(null);
  const [confirm, setConfirm] = useState(null);

  async function load() {
    const [f, fl] = await Promise.all([api.get('/forms'), api.get('/fields')]);
    setForms(f.data);
    setAllFields(fl.data);
  }
  useEffect(() => { load(); }, []);

  async function createForm(e) {
    e.preventDefault();
    if (!newName.trim() || newFieldIds.length === 0) return toast.error('Give the form a name and select at least one field.');
    await api.post('/forms', { name: newName, fieldIds: newFieldIds });
    toast.success('Form created successfully.');
    setNewName(''); setNewFieldIds([]); setShowAdd(false);
    load();
  }

  async function renameForm(form, name) {
    await api.put(`/forms/${form.id}/name`, { name });
    toast.success('Form renamed successfully — updated everywhere it is used.');
    load();
  }

  function reorder(form, fromIdx, toIdx) {
    const ids = form.fields.map((f) => f.id);
    const [moved] = ids.splice(fromIdx, 1);
    ids.splice(toIdx, 0, moved);
    return ids;
  }

  async function persistFieldOrder(form, ids) {
    await api.put(`/forms/${form.id}/fields`, { fieldIds: ids });
    load();
  }

  async function toggleField(form, fieldId) {
    const currentIds = form.fields.map((f) => f.id);
    const isRemoving = currentIds.includes(fieldId);
    const nextIds = isRemoving ? currentIds.filter((id) => id !== fieldId) : [...currentIds, fieldId];
    if (nextIds.length === 0) return toast.error('A form must keep at least one field.');
    try {
      await api.put(`/forms/${form.id}/fields`, { fieldIds: nextIds });
      toast.success(isRemoving ? 'Field removed from form.' : 'Field added to form.');
      load();
    } catch (err) {
      if (err.response?.status === 409) {
        toast.error(err.response.data.error);
      } else {
        toast.error(err.response?.data?.error || 'Update failed.');
      }
    }
  }

  async function deleteForm(form) {
    try {
      await api.delete(`/forms/${form.id}`);
      toast.success('Form deleted successfully.');
      load();
    } catch (err) {
      if (err.response?.status === 409) {
        const u = err.response.data.usage;
        setConfirm({
          title: `Can't delete "${form.name}"`,
          message: 'This form is currently used by the Orders section (it is either the active order form, or has saved orders). Remove that dependency first.',
          usageList: [
            u.isActiveOrderForm ? 'Currently set as the active Orders form' : null,
            u.orderCount > 0 ? `${u.orderCount} saved order(s) use this form` : null,
          ].filter(Boolean),
          hideConfirm: true,
        });
      } else {
        toast.error(err.response?.data?.error || 'Delete failed.');
      }
    }
  }

  function confirmDelete(form) {
    setConfirm({
      title: `Delete "${form.name}"?`,
      danger: true,
      confirmLabel: 'Delete Form',
      onConfirm: () => { setConfirm(null); deleteForm(form); },
    });
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-xl font-semibold">Forms</h1>
          <p className="text-sm text-gray-500">Combine Fields into forms — used by Orders and future sections.</p>
        </div>
        <button className="btn-primary" onClick={() => setShowAdd(true)}>+ Add Form</button>
      </div>

      <div className="space-y-3">
        {forms.map((form) => (
          <div key={form.id} className="card p-4">
            <div className="flex items-center justify-between">
              <input
                className="font-medium text-sm bg-transparent border-b border-transparent hover:border-gray-300 focus:border-brand-500 focus:outline-none px-0.5"
                defaultValue={form.name}
                onBlur={(e) => e.target.value.trim() && e.target.value !== form.name && renameForm(form, e.target.value.trim())}
              />
              <div className="flex gap-2">
                <button className="btn-ghost text-xs" onClick={() => setOpenFormId(openFormId === form.id ? null : form.id)}>
                  {openFormId === form.id ? 'Close' : 'Manage Fields'}
                </button>
                <button className="btn-ghost text-red-600 text-xs" onClick={() => confirmDelete(form)}>Delete</button>
              </div>
            </div>
            <div className="text-xs text-gray-400 mt-1">{form.fields.length} field(s)</div>

            {openFormId === form.id && (
              <div className="mt-3 grid md:grid-cols-2 gap-4">
                <div>
                  <div className="text-xs font-semibold text-gray-500 mb-1.5">FIELD ORDER (drag to reorder)</div>
                  <ul className="space-y-1">
                    {form.fields.map((f, idx) => (
                      <li
                        key={f.id}
                        draggable
                        onDragStart={() => setDragIndex(idx)}
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={() => {
                          if (dragIndex === null || dragIndex === idx) return;
                          const ids = reorder(form, dragIndex, idx);
                          persistFieldOrder(form, ids);
                          setDragIndex(null);
                        }}
                        className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm cursor-move select-none"
                      >
                        <span className="text-gray-400">⠿</span>
                        {f.name}
                        <button
                          className="ml-auto text-xs text-red-500"
                          onClick={() => toggleField(form, f.id)}
                        >
                          Remove
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
                <div>
                  <div className="text-xs font-semibold text-gray-500 mb-1.5">ADD MORE FIELDS</div>
                  <ul className="space-y-1 max-h-52 overflow-y-auto">
                    {allFields.filter((f) => !form.fields.some((ff) => ff.id === f.id)).map((f) => (
                      <li key={f.id} className="flex items-center justify-between bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm">
                        {f.name}
                        <button className="text-xs text-brand-600" onClick={() => toggleField(form, f.id)}>+ Add</button>
                      </li>
                    ))}
                    {allFields.filter((f) => !form.fields.some((ff) => ff.id === f.id)).length === 0 && (
                      <li className="text-xs text-gray-400">All fields are already in this form.</li>
                    )}
                  </ul>
                </div>
              </div>
            )}
          </div>
        ))}
        {forms.length === 0 && <div className="text-gray-400 text-sm">No forms yet. Create one to get started.</div>}
      </div>

      {showAdd && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/40 p-4">
          <form onSubmit={createForm} className="card w-full max-w-md p-5">
            <h3 className="text-base font-semibold mb-3">Add Form</h3>
            <label className="label-text">Form Name</label>
            <input className="input mb-3" autoFocus value={newName} onChange={(e) => setNewName(e.target.value)} required />
            <label className="label-text">Select Fields</label>
            <ul className="space-y-1 max-h-52 overflow-y-auto border border-gray-200 rounded-lg p-2">
              {allFields.map((f) => (
                <li key={f.id}>
                  <label className="flex items-center gap-2 text-sm px-1 py-1">
                    <input
                      type="checkbox"
                      checked={newFieldIds.includes(f.id)}
                      onChange={(e) => setNewFieldIds((ids) => e.target.checked ? [...ids, f.id] : ids.filter((id) => id !== f.id))}
                    />
                    {f.name}
                  </label>
                </li>
              ))}
              {allFields.length === 0 && <li className="text-xs text-gray-400 p-1">No fields exist yet — create some in the Fields section first.</li>}
            </ul>
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
