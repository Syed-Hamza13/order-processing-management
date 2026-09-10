import React, { useState } from 'react';
import api from '../api';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';

export default function Setup() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [retypePassword, setRetypePassword] = useState('');
  const [busy, setBusy] = useState(false);
  const { refresh } = useAuth();
  const toast = useToast();

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    try {
      await api.post('/auth/setup', { email, password, retypePassword });
      toast.success('Setup complete — please log in.');
      await refresh();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Setup failed.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="h-screen flex items-center justify-center bg-gray-50">
      <form onSubmit={submit} className="card w-full max-w-sm p-6">
        <h1 className="text-lg font-semibold mb-1">Welcome to Eklavya Pitara</h1>
        <p className="text-sm text-gray-500 mb-5">This is a one-time setup. Create your admin login below.</p>
        <div className="space-y-3">
          <div>
            <label className="label-text">Email (this will be your username)</label>
            <input className="input" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div>
            <label className="label-text">Password</label>
            <input className="input" type="password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          <div>
            <label className="label-text">Retype Password</label>
            <input className="input" type="password" required minLength={8} value={retypePassword} onChange={(e) => setRetypePassword(e.target.value)} />
          </div>
        </div>
        <button className="btn-primary w-full justify-center mt-5" disabled={busy}>{busy ? 'Setting up…' : 'Complete Setup'}</button>
      </form>
    </div>
  );
}
