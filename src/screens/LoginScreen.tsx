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
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuth } from '../hooks';
import AppBackground from '../components/AppBackground';
import { colors } from '../constants/colors';
import authService from '../services/authService';

interface LoginScreenProps {
  onLogin: () => void;
}

export default function LoginScreen({ onLogin }: LoginScreenProps) {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordVisible, setPasswordVisible] = useState(false);
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
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Authentication failed');
    }
  };

  const handleForgotPassword = async () => {
    if (!email) {
      Alert.alert('Error', 'Please enter your email to reset the password');
      return;
    }
    try {
      await authService.resetPassword(email);
      Alert.alert('Email Sent', 'Check your inbox for the password reset link.');
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Failed to send reset email.');
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <AppBackground />

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.flex}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Logo + Branding */}
          <View style={styles.logoContainer}>
            <Image
              source={require('../../assets/new_logo.png')}
              style={styles.logo}
              resizeMode="contain"
            />
            <Text style={styles.brandName}>BETRA</Text>
            <Text style={styles.tagline}>Track. Analyze. Win.</Text>
          </View>

          {/* Tabs — underline style */}
          <View style={styles.tabRow}>
            <TouchableOpacity
              style={[styles.tab, isLogin && styles.tabActive]}
              onPress={() => setIsLogin(true)}
            >
              {isLogin && <View style={styles.tabDot} />}
              <Text style={[styles.tabText, isLogin && styles.tabTextActive]}>Login</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.tab, !isLogin && styles.tabActive]}
              onPress={() => setIsLogin(false)}
            >
              {!isLogin && <View style={styles.tabDot} />}
              <Text style={[styles.tabText, !isLogin && styles.tabTextActive]}>Sign Up</Text>
            </TouchableOpacity>
          </View>

          {/* Form */}
          <View style={styles.form}>
            {!isLogin && (
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Username</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Enter username"
                  placeholderTextColor="rgba(255,255,255,0.4)"
                  value={username}
                  onChangeText={setUsername}
                  autoCapitalize="none"
                />
              </View>
            )}

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Email</Text>
              <TextInput
                style={styles.input}
                placeholder="Enter your email"
                placeholderTextColor="rgba(255,255,255,0.4)"
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                keyboardType="email-address"
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Password</Text>
              <View style={styles.passwordContainer}>
                <TextInput
                  style={styles.passwordInput}
                  placeholder="Enter your password"
                  placeholderTextColor="rgba(255,255,255,0.4)"
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry={!passwordVisible}
                />
                <TouchableOpacity
                  style={styles.eyeButton}
                  onPress={() => setPasswordVisible(!passwordVisible)}
                >
                  <Ionicons
                    name={passwordVisible ? 'eye-off' : 'eye'}
                    size={20}
                    color="rgba(255,255,255,0.5)"
                  />
                </TouchableOpacity>
              </View>
            </View>

            {/* Submit Button — gradient */}
            <TouchableOpacity 
              style={styles.buttonWrap} 
              onPress={handleAuth} 
              activeOpacity={0.9}
              accessibilityRole="button"
              accessibilityLabel={isLogin ? 'Login' : 'Create Account'}
            >
              <LinearGradient
                colors={['#5BAAF0', '#4A9FD4', '#3A8BC4']}
                style={styles.button}
                start={{ x: 0.5, y: 0 }}
                end={{ x: 0.5, y: 1 }}
              >
                <Text style={styles.buttonText}>
                  {isLogin ? 'Login' : 'Create Account'}
                </Text>
              </LinearGradient>
            </TouchableOpacity>

            {isLogin && (
              <TouchableOpacity 
              style={styles.forgotButton} 
              onPress={handleForgotPassword}
              accessibilityRole="button"
              accessibilityLabel="Forgot Password"
            >
                <Text style={styles.forgotText}>Forgot password?</Text>
              </TouchableOpacity>
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  flex: {
    flex: 1,
  },

  // Content
  content: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 32,
  },

  // Logo + Branding
  logoContainer: {
    alignItems: 'center',
    marginBottom: 28,
  },
  logo: {
    width: 100,
    height: 100,
  },
  brandName: {
    fontSize: 28,
    fontWeight: '800',
    color: '#ffffff',
    letterSpacing: 4,
    marginTop: 12,
  },
  tagline: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.85)',
    marginTop: 6,
  },

  // Tabs — underline style
  tabRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 32,
    marginBottom: 28,
  },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 4,
    gap: 8,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabActive: {
    borderBottomColor: colors.accent,
  },
  tabDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.accent,
  },
  tabText: {
    fontSize: 16,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.5)',
  },
  tabTextActive: {
    color: '#ffffff',
  },

  // Form
  form: {
    gap: 20,
  },

  // Inputs
  inputGroup: {
    marginBottom: 4,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#ffffff',
    marginBottom: 8,
  },
  input: {
    backgroundColor: 'rgba(30, 50, 80, 0.6)',
    borderRadius: 12,
    padding: 16,
    color: '#ffffff',
    borderWidth: 1,
    borderColor: 'rgba(135, 206, 235, 0.35)',
    fontSize: 16,
    ...(Platform.OS === 'web' && { outlineStyle: 'none' as const }),
  },
  passwordContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(30, 50, 80, 0.6)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(135, 206, 235, 0.35)',
  },
  passwordInput: {
    flex: 1,
    padding: 16,
    color: '#ffffff',
    fontSize: 16,
    ...(Platform.OS === 'web' && { outlineStyle: 'none' as const }),
  },
  eyeButton: {
    padding: 16,
    paddingLeft: 0,
  },

  // Buttons
  buttonWrap: {
    marginTop: 8,
    borderRadius: 12,
    overflow: 'hidden',
  },
  button: {
    padding: 16,
    alignItems: 'center',
    borderRadius: 12,
  },
  buttonText: {
    fontWeight: '700',
    color: '#ffffff',
    fontSize: 16,
  },
  forgotButton: {
    alignSelf: 'center',
  },
  forgotText: {
    fontSize: 14,
    color: '#ffffff',
    fontWeight: '500',
  },
  guestButton: {
    alignItems: 'center',
    marginTop: 8,
  },
  guestText: {
    color: colors.accent,
    fontWeight: '500',
    fontSize: 14,
  },
});
