import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import api from '../api';
import { useAuth } from '../context/AuthContext';

const NAV_ITEMS = [
  { to: '/orders', label: 'Orders', icon: '📦' },
  { to: '/template-editor', label: 'Template Editor', icon: '🖊️' },
  { to: '/forms', label: 'Forms', icon: '🧾' },
  { to: '/fields', label: 'Fields', icon: '🔤' },
  { to: '/dropdowns', label: 'Dropdowns', icon: '⬇️' },
  { to: '/assets', label: 'Assets', icon: '🖼️' },
  { to: '/settings', label: 'Settings', icon: '⚙️' },
];

export default function Sidebar() {
  const navigate = useNavigate();
  const { refresh } = useAuth();

  async function logout() {
    await api.post('/auth/logout');
    await refresh();
    navigate('/login');
  } 

  return (
    <aside className="w-60 shrink-0 h-screen sticky top-0 flex flex-col bg-white border-r border-gray-200 no-print">
      <div className="px-4 py-5 border-b border-gray-100">
        <div className="font-semibold text-brand-700 leading-tight">Orders App</div>
        <div className="text-xs text-gray-400">Order & Label Manager</div>
      </div>
      <nav className="flex-1 py-3 px-2 space-y-1 overflow-y-auto">
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              'flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ' +
              (isActive ? 'bg-brand-50 text-brand-700' : 'text-gray-600 hover:bg-gray-100')
            }
          >
            <span>{item.icon}</span>
            {item.label}
          </NavLink>
        ))}
      </nav>
      <div className="p-3 border-t border-gray-100">
        <button onClick={logout} className="btn-ghost w-full justify-center">
          🚪 Logout
        </button>
      </div>
    </aside>
  );
}
