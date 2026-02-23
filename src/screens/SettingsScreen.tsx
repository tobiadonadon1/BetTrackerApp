import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  Modal,
  ActivityIndicator,
  Linking,
  Platform
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../constants/colors';
import { useAuth } from '../hooks';
import { useTranslation } from '../contexts/LanguageContext';
import { Language } from '../utils/i18n';
import AppBackground from '../components/AppBackground';
import PageHeader from '../components/PageHeader';
import authService from '../services/authService';
import betService from '../services/betService';

interface SettingsScreenProps {
  onLogout: () => void;
}

export default function SettingsScreen({ onLogout }: SettingsScreenProps) {
  const { user, signOut } = useAuth();
  const { language, setLanguage, t } = useTranslation();
  const [langModalVisible, setLangModalVisible] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const handleLanguageChange = (lang: Language) => {
    setLanguage(lang);
    setLangModalVisible(false);
  };

  const languages: { code: Language; name: string; flag: string }[] = [
    { code: 'en', name: 'English', flag: '🇺🇸' },
    { code: 'it', name: 'Italiano', flag: '🇮🇹' },
    { code: 'es', name: 'Español', flag: '🇪🇸' },
  ];

  const handleLogout = async () => {
    if (Platform.OS === 'web') {
      const confirm = window.confirm('Are you sure you want to logout?');
      if (confirm) {
        await signOut();
        onLogout();
      }
    } else {
      Alert.alert(
        'Logout',
        'Are you sure you want to logout?',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Logout', style: 'destructive', onPress: async () => {
            await signOut();
            onLogout();
          }},
        ]
      );
    }
  };

  const handleResetPassword = async () => {
    if (!user?.email) return;
    
    if (Platform.OS === 'web') {
      const confirm = window.confirm(`Send a password reset email to ${user.email}?`);
      if (confirm) {
        setIsLoading(true);
        try {
          await authService.resetPassword(user.email!);
          window.alert('Email Sent: Check your inbox for the password reset link.');
        } catch (error: any) {
          window.alert('Error: ' + (error.message || 'Failed to send reset email.'));
        } finally {
          setIsLoading(false);
        }
      }
    } else {
      Alert.alert(
        'Reset Password',
        `Send a password reset email to ${user.email}?`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Send', onPress: async () => {
            setIsLoading(true);
            try {
              await authService.resetPassword(user.email!);
              Alert.alert('Email Sent', 'Check your inbox for the password reset link.');
            } catch (error: any) {
              Alert.alert('Error', error.message || 'Failed to send reset email.');
            } finally {
              setIsLoading(false);
            }
          }},
        ]
      );
    }
  };

  const clearAllData = () => {
    if (Platform.OS === 'web') {
      const confirm = window.confirm('Clear All Data: This will permanently delete ALL your bets. This action CANNOT be undone. Proceed?');
      if (confirm) {
        setIsLoading(true);
        betService.deleteAllBets().then(() => {
          window.alert('Data Cleared: All your bets have been permanently deleted.');
        }).catch((error: any) => {
          window.alert('Error: ' + (error.message || 'Failed to clear data.'));
        }).finally(() => setIsLoading(false));
      }
    } else {
      Alert.alert(
        'Clear All Data',
        'This will permanently delete ALL your bets. This action CANNOT be undone.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Delete Everything', style: 'destructive', onPress: async () => {
            setIsLoading(true);
            try {
              await betService.deleteAllBets();
              Alert.alert('Data Cleared', 'All your bets have been permanently deleted.');
            } catch (error: any) {
              Alert.alert('Error', error.message || 'Failed to clear data.');
            } finally {
              setIsLoading(false);
            }
          }},
        ]
      );
    }
  };

  const SettingItem = ({ icon, title, subtitle, value, onPress, disabled }: any) => (
    <TouchableOpacity 
      style={[styles.settingItem, disabled && !value && { opacity: 0.5 }]} 
      onPress={onPress} 
      disabled={disabled || !onPress}
    >
      <View style={styles.settingIcon}>
        <Ionicons name={icon} size={22} color={colors.accent} />
      </View>
      <View style={styles.settingContent}>
        <Text style={styles.settingTitle}>{title}</Text>
        {subtitle && <Text style={styles.settingSubtitle}>{subtitle}</Text>}
      </View>
      {value ? (
        <Text style={styles.settingValue}>{value}</Text>
      ) : onPress && !disabled ? (
        <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
      ) : null}
    </TouchableOpacity>
  );

  const SectionTitle = ({ title }: { title: string }) => (
    <Text style={styles.sectionTitle}>{title}</Text>
  );

  return (
    <View style={styles.container}>
      <AppBackground />
      <PageHeader title="Settings" />

      <ScrollView contentContainerStyle={styles.content}>
        
        <SectionTitle title="Account Info" />
        <View style={styles.section}>
          <SettingItem
            icon="person-outline"
            title="Username"
            value={user?.username || 'User'}
            disabled
          />
          <SettingItem
            icon="mail-outline"
            title="Email"
            value={user?.email || 'Unknown'}
            disabled
          />
        </View>

        <SectionTitle title={t('settings') || "Preferences"} />
        <View style={styles.section}>
          <TouchableOpacity style={styles.settingItem} onPress={() => setLangModalVisible(true)}>
            <View style={styles.settingIcon}>
              <Ionicons name="language" size={22} color={colors.accent} />
            </View>
            <View style={styles.settingContent}>
              <Text style={styles.settingTitle}>{t('language')}</Text>
              <Text style={styles.settingSubtitle}>{t('selectLanguage') || "App interface language"}</Text>
            </View>
            <Text style={styles.settingValue}>{languages.find(l => l.code === language)?.name}</Text>
            <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
          </TouchableOpacity>
        </View>

        <SectionTitle title="Security & Data" />
        <View style={styles.section}>
          <SettingItem
            icon="lock-closed-outline"
            title="Reset Password"
            subtitle="Send a password recovery email"
            onPress={handleResetPassword}
            disabled={isLoading}
          />
          <TouchableOpacity 
            style={[styles.settingItem, styles.dangerItem]} 
            onPress={clearAllData}
            disabled={isLoading}
          >
            <View style={[styles.settingIcon, { backgroundColor: colors.error + '20' }]}>
              <Ionicons name="trash-outline" size={22} color={colors.error} />
            </View>
            <View style={styles.settingContent}>
              <Text style={[styles.settingTitle, { color: colors.error }]}>Clear All Data</Text>
              <Text style={styles.settingSubtitle}>Permanently delete all your bets</Text>
            </View>
            {isLoading ? (
              <ActivityIndicator color={colors.error} style={{ marginRight: 8 }} />
            ) : (
              <Ionicons name="chevron-forward" size={20} color={colors.error} />
            )}
          </TouchableOpacity>
        </View>

        <SectionTitle title="Legal" />
        <View style={styles.section}>
          <SettingItem
            icon="document-text-outline"
            title="Terms of Service"
            onPress={() => Linking.openURL('https://example.com/terms')}
          />
          <SettingItem
            icon="shield-checkmark-outline"
            title="Privacy Policy"
            onPress={() => Linking.openURL('https://example.com/privacy')}
          />
        </View>

        <SectionTitle title="About" />
        <View style={styles.section}>
          <SettingItem
            icon="information-circle-outline"
            title="Version"
            value="1.0.0"
            disabled
          />
        </View>

        <TouchableOpacity 
          style={styles.logoutButton} 
          onPress={handleLogout}
          disabled={isLoading}
        >
          <Ionicons name="log-out-outline" size={20} color={colors.textPrimary} />
          <Text style={styles.logoutText}>{t('logout') || "Logout"}</Text>
        </TouchableOpacity>

        <Text style={styles.footerText}>BETRA v1.0.0</Text>
      </ScrollView>

      <Modal
        visible={langModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setLangModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{t('selectLanguage')}</Text>
              <TouchableOpacity onPress={() => setLangModalVisible(false)}>
                <Ionicons name="close" size={24} color={colors.textPrimary} />
              </TouchableOpacity>
            </View>
            {languages.map((lang) => (
              <TouchableOpacity
                key={lang.code}
                style={[styles.langOption, language === lang.code && styles.langOptionActive]}
                onPress={() => handleLanguageChange(lang.code)}
              >
                <Text style={styles.langFlag}>{lang.flag}</Text>
                <Text style={[styles.langName, language === lang.code && styles.langNameActive]}>
                  {lang.name}
                </Text>
                {language === lang.code && <Ionicons name="checkmark" size={20} color={colors.accent} />}
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: 16, paddingBottom: 40 },
  sectionTitle: { fontSize: 13, fontWeight: '600', color: colors.textMuted, marginTop: 24, marginBottom: 8, marginLeft: 8, textTransform: 'uppercase' },
  section: { backgroundColor: colors.surface, borderRadius: 16, overflow: 'hidden' },
  settingItem: { flexDirection: 'row', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: colors.border },
  dangerItem: { borderBottomWidth: 0 },
  settingIcon: { width: 36, height: 36, borderRadius: 10, backgroundColor: colors.accent + '20', justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  settingContent: { flex: 1 },
  settingTitle: { fontSize: 16, fontWeight: '600', color: colors.textPrimary },
  settingSubtitle: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  settingValue: { fontSize: 14, color: colors.textMuted },
  logoutButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface, borderRadius: 16, padding: 16, marginTop: 24 },
  logoutText: { fontSize: 16, fontWeight: '600', color: colors.textPrimary, marginLeft: 8 },
  footerText: { textAlign: 'center', color: colors.textMuted, marginTop: 24, fontSize: 12 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: colors.background, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  modalTitle: { fontSize: 20, fontWeight: 'bold', color: colors.textPrimary },
  langOption: { flexDirection: 'row', alignItems: 'center', padding: 16, borderRadius: 12, marginBottom: 8 },
  langOptionActive: { backgroundColor: colors.surface },
  langFlag: { fontSize: 24, marginRight: 12 },
  langName: { flex: 1, fontSize: 16, color: colors.textPrimary },
  langNameActive: { fontWeight: 'bold' },
});
