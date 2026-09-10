import React, { useEffect, useState } from 'react';
import api, { API_BASE } from '../api';
import { useToast } from '../context/ToastContext.jsx';
import ConfirmDialog from '../components/ConfirmDialog.jsx';

export default function Assets() {
  const toast = useToast();
  const [assets, setAssets] = useState([]);
  const [confirm, setConfirm] = useState(null);
  const [uploading, setUploading] = useState(false);

  async function load() {
    const res = await api.get('/assets');
    setAssets(res.data);
  }
  useEffect(() => { load(); }, []);

  async function upload(files) {
    setUploading(true);
    try {
      for (const file of files) {
        const fd = new FormData();
        fd.append('file', file);
        // eslint-disable-next-line no-await-in-loop
        await api.post('/assets', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      }
      toast.success('Asset(s) uploaded successfully.');
      load();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Upload failed.');
    } finally {
      setUploading(false);
    }
  }

  function confirmDelete(asset) {
    setConfirm({
      title: 'Delete this asset?', danger: true, confirmLabel: 'Delete Asset',
      onConfirm: async () => {
        await api.delete(`/assets/${asset.id}`);
        toast.success('Asset deleted successfully.');
        setConfirm(null);
        load();
      },
    });
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-xl font-semibold">Assets</h1>
          <p className="text-sm text-gray-500">Upload logos and images to use in the Template Editor.</p>
        </div>
        <label className="btn-primary cursor-pointer">
          {uploading ? 'Uploading…' : '+ Upload Image(s)'}
          <input type="file" accept="image/png,image/jpeg,image/svg+xml" multiple className="hidden" onChange={(e) => e.target.files.length && upload([...e.target.files])} />
        </label>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-3">
        {assets.map((a) => (
          <div key={a.id} className="card p-2">
            <div className="aspect-square rounded-lg overflow-hidden bg-gray-50 border border-gray-100">
              <img src={`${API_BASE}${a.url}`} className="w-full h-full object-contain" />
            </div>
            <button className="text-xs text-red-500 mt-1.5 w-full" onClick={() => confirmDelete(a)}>Delete</button>
          </div>
        ))}
        {assets.length === 0 && <div className="text-gray-400 text-sm col-span-full">No assets uploaded yet.</div>}
      </div>

      <ConfirmDialog open={!!confirm} {...confirm} onCancel={() => setConfirm(null)} />
    </div>
  );
}
