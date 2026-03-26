import { supabase } from '../config/supabase';

export interface User {
  id: string;
  email: string;
  username: string;
}

export interface SignUpResult {
  user: User | null;
  requiresEmailConfirmation: boolean;
  email: string;
}

type AuthUser = {
  id: string;
  email?: string | null;
  user_metadata?: Record<string, any>;
};

class AuthService {
  private withTimeout<T>(promise: PromiseLike<T>, message: string, timeoutMs = 12000): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(message)), timeoutMs);
      Promise.resolve(promise)
        .then((value) => {
          clearTimeout(timer);
          resolve(value);
        })
        .catch((error: unknown) => {
          clearTimeout(timer);
          reject(error);
        });
    });
  }

  private normalizeEmail(email: string) {
    return email.trim().toLowerCase();
  }

  private sanitizeUsername(username: string) {
    const cleaned = username.trim().replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_]/g, '').slice(0, 24);
    return cleaned || 'user';
  }

  private async findAvailableUsername(preferredUsername: string, userId: string) {
    const base = this.sanitizeUsername(preferredUsername);
    const suffix = userId.replace(/-/g, '').slice(0, 6) || 'user';

    for (let attempt = 0; attempt < 6; attempt += 1) {
      const extra = attempt === 0 ? '' : `_${suffix}${attempt > 1 ? attempt : ''}`;
      const room = Math.max(1, 24 - extra.length);
      const candidate = `${base.slice(0, room)}${extra}`;

      const { data, error } = await supabase
        .from('profiles')
        .select('id')
        .eq('username', candidate)
        .limit(1);

      if (error) {
        throw new Error(error.message);
      }

      const profile = data?.[0] || null;

      if (!profile || profile.id === userId) {
        return candidate;
      }
    }

    return `${base.slice(0, 17)}_${Date.now().toString().slice(-6)}`;
  }

  private userFromAuth(authUser: AuthUser, preferredUsername?: string): User {
    const email = authUser.email || '';
    const usernameSeed =
      preferredUsername ||
      (typeof authUser.user_metadata?.username === 'string' ? authUser.user_metadata.username : '') ||
      email.split('@')[0] ||
      'user';

    return {
      id: authUser.id,
      email,
      username: this.sanitizeUsername(usernameSeed),
    };
  }

  private async ensureProfile(authUser: AuthUser, preferredUsername?: string): Promise<User> {
    const email = authUser.email || '';
    const usernameSeed =
      preferredUsername ||
      (typeof authUser.user_metadata?.username === 'string' ? authUser.user_metadata.username : '') ||
      email.split('@')[0] ||
      'user';

    const { data, error } = await supabase
      .from('profiles')
      .select('id, email, username')
      .eq('id', authUser.id)
      .limit(1);

    if (error) {
      throw new Error(error.message);
    }

    const profile = data?.[0] || null;

    if (profile) {
      return {
        id: authUser.id,
        email,
        username: profile.username || this.sanitizeUsername(usernameSeed),
      };
    }

    const username = await this.findAvailableUsername(usernameSeed, authUser.id);
    const { error: upsertError } = await supabase
      .from('profiles')
      .upsert({
        id: authUser.id,
        email,
        username,
      }, { onConflict: 'id' });

    if (upsertError) {
      throw new Error(upsertError.message);
    }

    return {
      id: authUser.id,
      email,
      username,
    };
  }

  async signIn(email: string, password: string): Promise<User> {
    const normalizedEmail = this.normalizeEmail(email);
    const { data, error } = await this.withTimeout(
      supabase.auth.signInWithPassword({
        email: normalizedEmail,
        password,
      }),
      'Sign in timed out. Check your connection and Supabase auth settings.',
    );

    if (error) {
      throw new Error(error.message);
    }

    if (!data.user) {
      throw new Error('No user returned');
    }

    const fallbackUser = this.userFromAuth(data.user);

    try {
      return await this.withTimeout(
        this.ensureProfile(data.user),
        'Loading your account took too long. Please try again.',
        8000,
      );
    } catch (error) {
      console.warn('Sign-in profile hydration fallback:', error);
      return fallbackUser;
    }
  }

  async signUp(email: string, password: string, username: string): Promise<SignUpResult> {
    const normalizedEmail = this.normalizeEmail(email);
    const cleanedUsername = this.sanitizeUsername(username);

    const usernameRows = await this.withTimeout(
      supabase
        .from('profiles')
        .select('id')
        .eq('username', cleanedUsername)
        .limit(1),
      'Username check timed out. Please try again.',
      8000,
    );

    if (usernameRows.error) {
      throw new Error(usernameRows.error.message);
    }

    if ((usernameRows.data?.length || 0) > 0) {
      throw new Error('Username is already taken');
    }

    const signUpResponse = await this.withTimeout(
      supabase.auth.signUp({
        email: normalizedEmail,
        password,
        options: {
          data: {
            username: cleanedUsername,
          },
        },
      }),
      'Sign up timed out. Check your connection and try again.',
    );

    if (signUpResponse.error) {
      throw new Error(signUpResponse.error.message);
    }

    const newSessionUser = signUpResponse.data.user;

    if (!newSessionUser) {
      throw new Error('No user returned');
    }

    if (!signUpResponse.data.session) {
      return {
        user: null,
        requiresEmailConfirmation: true,
        email: normalizedEmail,
      };
    }

    const fallbackUser = this.userFromAuth(newSessionUser, cleanedUsername);

    return {
      user: await this.withTimeout(
        this.ensureProfile(newSessionUser, cleanedUsername).catch((profileError) => {
          console.warn('Sign-up profile hydration fallback:', profileError);
          return fallbackUser;
        }),
        'Loading your new account took too long. Please try signing in.',
        8000,
      ),
      requiresEmailConfirmation: false,
      email: normalizedEmail,
    };
  }

  async signOut(): Promise<void> {
    const { error } = await supabase.auth.signOut();
    if (error) {
      throw new Error(error.message);
    }
  }

  async resetPassword(email: string): Promise<void> {
    const { error } = await this.withTimeout(
      supabase.auth.resetPasswordForEmail(this.normalizeEmail(email)),
      'Password reset request timed out. Please try again.',
      8000,
    );
    if (error) {
      throw new Error(error.message);
    }
  }

  async getCurrentUser(): Promise<User | null> {
    const { data: { session } } = await this.withTimeout(
      supabase.auth.getSession(),
      'Session lookup timed out.',
      8000,
    );
    
    if (!session?.user) {
      return null;
    }

    try {
      return await this.withTimeout(
        this.ensureProfile(session.user),
        'Account lookup timed out.',
        8000,
      );
    } catch (error) {
      console.warn('Session profile hydration fallback:', error);
      return this.userFromAuth(session.user);
    }
  }

  onAuthStateChange(callback: (user: User | null) => void) {
    return Promise.resolve(supabase.auth.onAuthStateChange(async (event, session) => {
      if (session?.user) {
        try {
          callback(await this.withTimeout(
            this.ensureProfile(session.user),
            'Auth state hydration timed out.',
            8000,
          ));
        } catch {
          callback(this.userFromAuth(session.user));
        }
      } else {
        callback(null);
      }
    }));
  }
}

export default new AuthService();
