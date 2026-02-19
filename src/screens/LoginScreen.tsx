import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
  Image,
} from 'react-native';
import { colors } from '../constants/colors';
import { useAuth } from '../hooks';

interface LoginScreenProps {
  onLogin: () => void;
}

export default function LoginScreen({ onLogin }: LoginScreenProps) {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const { signIn, signUp } = useAuth();

  const handleAuth = async () => {
    try {
      if (isLogin) {
        await signIn(email, password);
      } else {
        await signUp(email, password, username);
      }
      onLogin();
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.flex}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.logoContainer}>
            <Image source={require('../../assets/icon.png')} style={styles.logo} resizeMode="contain" />
            <Text style={styles.appName}>BETRA</Text>
            <Text style={styles.tagline}>Track. Analyze. Win.</Text>
          </View>

          <View style={styles.toggleContainer}>
            <TouchableOpacity style={[styles.toggle, isLogin && styles.toggleActive]} onPress={() => setIsLogin(true)}>
              <Text style={[styles.toggleText, isLogin && styles.toggleTextActive]}>Login</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.toggle, !isLogin && styles.toggleActive]} onPress={() => setIsLogin(false)}>
              <Text style={[styles.toggleText, !isLogin && styles.toggleTextActive]}>Sign Up</Text>
            </TouchableOpacity>
          </View>

          {!isLogin && (
            <TextInput
              style={styles.input}
              placeholder="Username"
              placeholderTextColor={colors.textMuted}
              value={username}
              onChangeText={setUsername}
              autoCapitalize="none"
            />
          )}
          <TextInput
            style={styles.input}
            placeholder="Email"
            placeholderTextColor={colors.textMuted}
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
          />
          <TextInput
            style={styles.input}
            placeholder="Password"
            placeholderTextColor={colors.textMuted}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
          />

          <TouchableOpacity style={styles.button} onPress={handleAuth}>
            <Text style={styles.buttonText}>{isLogin ? 'Login' : 'Create Account'}</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.guestButton} onPress={onLogin}>
            <Text style={styles.guestText}>Continue as Guest →</Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  content: { padding: 24, justifyContent: 'center', flexGrow: 1 },
  logoContainer: { alignItems: 'center', marginBottom: 40 },
  logo: { width: 120, height: 120, borderRadius: 24, marginBottom: 16 },
  appName: { fontSize: 32, fontWeight: 'bold', color: colors.textPrimary, letterSpacing: 4 },
  tagline: { fontSize: 14, color: colors.textMuted, marginTop: 8 },
  toggleContainer: { flexDirection: 'row', backgroundColor: colors.surface, borderRadius: 12, padding: 4, marginBottom: 24 },
  toggle: { flex: 1, paddingVertical: 12, alignItems: 'center', borderRadius: 8 },
  toggleActive: { backgroundColor: colors.accent },
  toggleText: { fontWeight: '600', color: colors.textMuted },
  toggleTextActive: { color: colors.primary },
  input: { backgroundColor: colors.surface, borderRadius: 12, padding: 14, marginBottom: 12, color: colors.textPrimary, borderWidth: 1, borderColor: colors.border },
  button: { backgroundColor: colors.accent, borderRadius: 12, padding: 16, alignItems: 'center', marginTop: 8 },
  buttonText: { fontWeight: 'bold', color: colors.primary, fontSize: 16 },
  guestButton: { alignItems: 'center', marginTop: 24 },
  guestText: { color: colors.accent, fontWeight: '600', fontSize: 16 },
});
