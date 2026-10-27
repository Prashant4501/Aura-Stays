import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import api, { setAccessToken, registerLogoutCallback } from '../lib/api';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchCurrentUser = useCallback(async () => {
    try {
      const res = await api.get('/auth/me');
      setUser(res.data.user);
      return res.data.user;
    } catch {
      setUser(null);
      setAccessToken(null);
      return null;
    }
  }, []);

  // Silent refresh on startup
  useEffect(() => {
    const initAuth = async () => {
      try {
        const storedRefreshToken = localStorage.getItem('aura_refresh_token');
        const refreshRes = await api.post('/auth/refresh', {
          refreshToken: storedRefreshToken || undefined,
        });
        if (refreshRes.data?.accessToken) {
          setAccessToken(refreshRes.data.accessToken);
          if (refreshRes.data?.refreshToken) {
            localStorage.setItem('aura_refresh_token', refreshRes.data.refreshToken);
          }
          await fetchCurrentUser();
        }
      } catch {
        setUser(null);
        setAccessToken(null);
      } finally {
        setIsLoading(false);
      }
    };

    registerLogoutCallback(() => {
      setUser(null);
      setAccessToken(null);
      localStorage.removeItem('aura_refresh_token');
    });

    initAuth();
  }, [fetchCurrentUser]);

  const login = async (email, password) => {
    const res = await api.post('/auth/login', { email, password });
    const { accessToken, refreshToken, user: loggedUser } = res.data;
    setAccessToken(accessToken);
    if (refreshToken) {
      localStorage.setItem('aura_refresh_token', refreshToken);
    }
    setUser(loggedUser);
    return loggedUser;
  };

  const register = async (data) => {
    const res = await api.post('/auth/register', data);
    const { accessToken, refreshToken, user: newUser } = res.data;
    setAccessToken(accessToken);
    if (refreshToken) {
      localStorage.setItem('aura_refresh_token', refreshToken);
    }
    setUser(newUser);
    return newUser;
  };

  const logout = async () => {
    try {
      await api.post('/auth/logout');
    } catch (err) {
      console.warn('Logout API call failed:', err);
    } finally {
      localStorage.removeItem('aura_refresh_token');
      setAccessToken(null);
      setUser(null);
    }
  };

  const updateUser = (updatedFields) => {
    setUser((prev) => (prev ? { ...prev, ...updatedFields } : null));
  };

  const isAuthenticated = !!user;
  const role = user?.role || 'GUEST';
  const isGuest = role === 'GUEST';
  const isManager = role === 'PROPERTY_MANAGER';
  const isAdmin = role === 'ADMIN';

  return (
    <AuthContext.Provider
      value={{
        user,
        role,
        isAuthenticated,
        isLoading,
        isGuest,
        isManager,
        isAdmin,
        login,
        register,
        logout,
        updateUser,
        refreshSession: fetchCurrentUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
