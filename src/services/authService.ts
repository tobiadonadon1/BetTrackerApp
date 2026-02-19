import AsyncStorage from '@react-native-async-storage/async-storage';

const USER_KEY = '@betra_user';

export interface User {
  id: string;
  email: string;
  username: string;
}

class AuthService {
  async signIn(email: string, password: string): Promise<User> {
    // Mock auth - in production this would call an API
    const user: User = {
      id: '1',
      email,
      username: email.split('@')[0],
    };
    await AsyncStorage.setItem(USER_KEY, JSON.stringify(user));
    return user;
  }

  async signUp(email: string, password: string, username: string): Promise<User> {
    const user: User = {
      id: Date.now().toString(),
      email,
      username,
    };
    await AsyncStorage.setItem(USER_KEY, JSON.stringify(user));
    return user;
  }

  async signOut(): Promise<void> {
    await AsyncStorage.removeItem(USER_KEY);
  }

  async getCurrentUser(): Promise<User | null> {
    const data = await AsyncStorage.getItem(USER_KEY);
    return data ? JSON.parse(data) : null;
  }
}

export default new AuthService();
