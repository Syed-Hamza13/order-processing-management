import React, { createContext, useContext, useEffect, useState } from 'react';
import api from '../api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [loading, setLoading] = useState(true);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [user, setUser] = useState(null);

  async function refresh() {
    setLoading(true);
    try {
      const statusRes = await api.get('/auth/setup-status');
      if (statusRes.data.needsSetup) {
        setNeedsSetup(true);
        setUser(null);
      } else {
        setNeedsSetup(false);
        try {
          const meRes = await api.get('/auth/me');
          setUser(meRes.data);
        } catch {
          setUser(null);
        }
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { refresh(); }, []);

  return (
    <AuthContext.Provider value={{ loading, needsSetup, user, refresh, setUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
