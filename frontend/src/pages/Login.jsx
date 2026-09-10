import React, { useState } from 'react';
import api from '../api';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const { refresh } = useAuth();
  const toast = useToast();

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    try {
      await api.post('/auth/login', { email, password });
      await refresh();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Login failed.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="h-screen flex items-center justify-center bg-gray-50">
      <form onSubmit={submit} className="card w-full max-w-sm p-6">
        <h1 className="text-lg font-semibold mb-1">Eklavya Pitara</h1>
        <p className="text-sm text-gray-500 mb-5">Log in to continue.</p>
        <div className="space-y-3">
          <div>
            <label className="label-text">Email</label>
            <input className="input" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div>
            <label className="label-text">Password</label>
            <input className="input" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
        </div>
        <button className="btn-primary w-full justify-center mt-5" disabled={busy}>{busy ? 'Logging in…' : 'Log In'}</button>
      </form>
    </div>
  );
}
