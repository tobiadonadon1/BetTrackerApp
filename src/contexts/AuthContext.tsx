import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import authService, { SignUpResult, User } from '../services/authService';

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
    // Restore session on mount so a previously signed-in user doesn't have to log in again
    authService.getCurrentUser()
      .then((u) => setUser(u))
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
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
      // Also log out of RevenueCat
      try {
        const revenueCatService = (await import('../services/revenueCatService')).default;
        await revenueCatService.logout();
      } catch {
        // RevenueCat logout is non-critical
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
