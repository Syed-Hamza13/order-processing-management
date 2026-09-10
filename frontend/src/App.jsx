import React from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import Sidebar from './components/Sidebar.jsx';
import Setup from './pages/Setup.jsx';
import Login from './pages/Login.jsx';
import Fields from './pages/Fields.jsx';
import Dropdowns from './pages/Dropdowns.jsx';
import Forms from './pages/Forms.jsx';
import Orders from './pages/Orders.jsx';
import TemplateEditor from './pages/TemplateEditor.jsx';
import Assets from './pages/Assets.jsx';
import Settings from './pages/Settings.jsx';
import { useAuth } from './context/AuthContext.jsx';

function FullPageLoader() {
  return <div className="h-screen w-screen flex items-center justify-center text-gray-400">Loading…</div>;
}

function Layout({ children }) {
  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 p-6 max-w-[1400px]">{children}</main>
    </div>
  );
}

export default function App() {
  const { loading, needsSetup, user } = useAuth();

  if (loading) return <FullPageLoader />;
  if (needsSetup) return <Routes><Route path="*" element={<Setup />} /></Routes>;
  if (!user) return <Routes><Route path="*" element={<Login />} /></Routes>;

  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Navigate to="/orders" replace />} />
        <Route path="/orders" element={<Orders />} />
        <Route path="/template-editor" element={<TemplateEditor />} />
        <Route path="/forms" element={<Forms />} />
        <Route path="/fields" element={<Fields />} />
        <Route path="/dropdowns" element={<Dropdowns />} />
        <Route path="/assets" element={<Assets />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="*" element={<Navigate to="/orders" replace />} />
      </Routes>
    </Layout>
  );
}
