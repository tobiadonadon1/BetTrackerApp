import { useState, useEffect, useCallback } from 'react';
import authService, { User } from '../services/authService';

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    authService.getCurrentUser().then(u => {
      setUser(u);
      setLoading(false);
    });
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
    await authService.signOut();
    setUser(null);
  }, []);

  return { user, loading, signIn, signUp, signOut };
}
