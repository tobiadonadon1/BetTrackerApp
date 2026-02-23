import { supabase } from '../config/supabase';

export interface User {
  id: string;
  email: string;
  username: string;
}

class AuthService {
  async signIn(email: string, password: string): Promise<User> {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      throw new Error(error.message);
    }

    if (!data.user) {
      throw new Error('No user returned');
    }

    // Fetch or create profile
    const { data: profile } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', data.user.id)
      .single();

    if (!profile) {
      // Create profile if doesn't exist
      const username = email.split('@')[0];
      await supabase.from('profiles').insert({
        id: data.user.id,
        email: data.user.email!,
        username,
      });
      return {
        id: data.user.id,
        email: data.user.email!,
        username,
      };
    }

    return {
      id: data.user.id,
      email: data.user.email!,
      username: profile.username,
    };
  }

  async signUp(email: string, password: string, username: string): Promise<User> {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          username,
        },
      },
    });

    if (error) {
      throw new Error(error.message);
    }

    if (!data.user) {
      throw new Error('No user returned');
    }

    // Create profile
    await supabase.from('profiles').insert({
      id: data.user.id,
      email: data.user.email!,
      username,
    });

    // Auto-login after signup (user is auto-confirmed via database trigger)
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (signInError) {
      console.log('Auto-login failed:', signInError.message);
    }

    return {
      id: data.user.id,
      email: data.user.email!,
      username,
    };
  }

  async signOut(): Promise<void> {
    const { error } = await supabase.auth.signOut();
    if (error) {
      throw new Error(error.message);
    }
  }

  async resetPassword(email: string): Promise<void> {
    const { error } = await supabase.auth.resetPasswordForEmail(email);
    if (error) {
      throw new Error(error.message);
    }
  }

  async getCurrentUser(): Promise<User | null> {
    const { data: { session } } = await supabase.auth.getSession();
    
    if (!session?.user) {
      return null;
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', session.user.id)
      .single();

    if (!profile) {
      return {
        id: session.user.id,
        email: session.user.email!,
        username: session.user.email!.split('@')[0],
      };
    }

    return {
      id: session.user.id,
      email: session.user.email!,
      username: profile.username,
    };
  }

  onAuthStateChange(callback: (user: User | null) => void) {
    return Promise.resolve(supabase.auth.onAuthStateChange(async (event, session) => {
      if (session?.user) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', session.user.id)
          .single();

        callback({
          id: session.user.id,
          email: session.user.email!,
          username: profile?.username || session.user.email!.split('@')[0],
        });
      } else {
        callback(null);
      }
    }));
  }
}

export default new AuthService();
