import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import authService, { SignUpResult, User } from '../services/authService';
import { supabase } from '../config/supabase';

const GUEST_USER: User = { id: 'guest', email: '', username: 'Guest' };

interface AuthContextType {
  user: User | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<User>;
  signUp: (email: string, password: string, username: string) => Promise<SignUpResult>;
  signOut: () => Promise<void>;
  signInAsGuest: () => void;
  isGuest: boolean;
}

const AuthContext = createContext<AuthContextType>({} as AuthContextType);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const isGuestRef = useRef(false);

  useEffect(() => {
    // Always start on the login screen — clear any stale persisted session
    supabase.auth.signOut().catch(() => {}).finally(() => {
      setUser(null);
      setLoading(false);
    });

    // No auth-state listener needed: we only trust explicit signIn/signUp calls
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    isGuestRef.current = false;
    const u = await authService.signIn(email, password);
    setUser(u);
    return u;
  }, []);

  const signUp = useCallback(async (email: string, password: string, username: string) => {
    isGuestRef.current = false;
    const result = await authService.signUp(email, password, username);
    setUser(result.user);
    return result;
  }, []);

  const signOut = useCallback(async () => {
    try {
      if (user?.id !== 'guest') {
        await authService.signOut();
      }
    } finally {
      isGuestRef.current = false;
      setUser(null);
    }
  }, [user?.id]);

  const signInAsGuest = useCallback(() => {
    isGuestRef.current = true;
    setUser(GUEST_USER);
    setLoading(false);
  }, []);

  return (
    <AuthContext.Provider value={{ 
      user, 
      loading, 
      signIn, 
      signUp, 
      signOut, 
      signInAsGuest,
      isGuest: user?.id === 'guest',
    }}>
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
