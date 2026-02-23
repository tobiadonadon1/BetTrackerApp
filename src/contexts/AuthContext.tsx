import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import authService, { User } from '../services/authService';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<User>;
  signUp: (email: string, password: string, username: string) => Promise<User>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({} as AuthContextType);

const IGNORE_AUTH_USER_MS = 3000;

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const signedOutAt = useRef<number>(0);

  useEffect(() => {
    authService.getCurrentUser().then(u => {
      setUser(u);
      setLoading(false);
    });

    let unsubscribe: (() => void) | null = null;
    authService.onAuthStateChange((u) => {
      if (u && signedOutAt.current && Date.now() - signedOutAt.current < IGNORE_AUTH_USER_MS) {
        return;
      }
      setUser(u);
      setLoading(false);
    }).then((res) => {
      const sub = res?.data?.subscription;
      if (sub) unsubscribe = () => sub.unsubscribe();
    });

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    const u = await authService.signIn(email, password);
    setUser(u);
    return u;
  }, []);

  const signUp = useCallback(async (email: string, password: string, username: string) => {
    const u = await authService.signUp(email, password, username);
    setUser(u);
    return u;
  }, []);

  const signOut = useCallback(async () => {
    try {
      await authService.signOut();
    } finally {
      signedOutAt.current = Date.now();
      setUser(null);
    }
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, signIn, signUp, signOut }}>
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
