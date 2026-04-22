import React, { useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  Animated,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../constants/colors';
import { useSubscription } from '../hooks';
import { useTranslation } from '../contexts/LanguageContext';

const USE_NATIVE = Platform.OS !== 'web';

interface AddChoiceModalProps {
  visible: boolean;
  onClose: () => void;
  onScan: () => void;
  onManual: () => void;
  onGallery: () => void;
}

export default function AddChoiceModal({ visible, onClose, onScan, onManual, onGallery }: AddChoiceModalProps) {
  const slideAnim = useRef(new Animated.Value(300)).current;
  const { canUseFeature, openPaywall, loading: subLoading } = useSubscription();
  const { t } = useTranslation();

  // While subscription is loading, assume OCR is available to avoid
  // blocking VIP/pro users whose tier hasn't resolved yet.
  const ocrAvailable = subLoading || canUseFeature('ocrEnabled');

  React.useEffect(() => {
    if (visible) {
      Animated.spring(slideAnim, {
        toValue: 0,
        useNativeDriver: USE_NATIVE,
      }).start();
    } else {
      Animated.timing(slideAnim, {
        toValue: 300,
        duration: 200,
        useNativeDriver: USE_NATIVE,
      }).start();
    }
  }, [visible]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <TouchableOpacity style={styles.backdrop} onPress={onClose} />
        <Animated.View style={[styles.modal, { transform: [{ translateY: slideAnim }] }]}>
          <View style={styles.handle} />
          <Text style={styles.title}>{t('addNewBet')}</Text>
          <Text style={styles.subtitle}>{t('chooseHow')}</Text>

          <TouchableOpacity style={[styles.option, styles.scanOption, !ocrAvailable && styles.optionDisabled]} onPress={() => {
            if (!ocrAvailable) {
              onClose();
              openPaywall('OCR Bet Scanning is a Pro feature. Upgrade to scan tickets automatically.');
              return;
            }
            onClose(); onScan();
          }}>
            <View style={[styles.iconContainer, { backgroundColor: ocrAvailable ? colors.accent : colors.surface }]}>
              <Ionicons name="camera" size={28} color={ocrAvailable ? colors.primary : colors.textMuted} />
            </View>
            <View style={styles.optionText}>
              <Text style={styles.optionTitle}>{t('scanTicket')}</Text>
              <Text style={styles.optionDesc}>{ocrAvailable ? t('alignTicket') : 'Pro feature — Tap to upgrade'}</Text>
            </View>
            {!ocrAvailable ? (
              <Ionicons name="lock-closed" size={18} color="#FBBF24" />
            ) : (
              <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
            )}
          </TouchableOpacity>

          <TouchableOpacity style={[styles.option, !ocrAvailable && styles.optionDisabled]} onPress={() => {
            if (!ocrAvailable) {
              onClose();
              openPaywall('OCR Bet Scanning is a Pro feature. Upgrade to scan tickets automatically.');
              return;
            }
            onClose(); onGallery();
          }}>
            <View style={[styles.iconContainer, { backgroundColor: colors.surface }]}>
              <Ionicons name="images" size={28} color={ocrAvailable ? colors.accent : colors.textMuted} />
            </View>
            <View style={styles.optionText}>
              <Text style={styles.optionTitle}>{t('uploadGallery')}</Text>
              <Text style={styles.optionDesc}>{ocrAvailable ? t('worksAnyLanguage') : 'Pro feature — Tap to upgrade'}</Text>
            </View>
            {!ocrAvailable ? (
              <Ionicons name="lock-closed" size={18} color="#FBBF24" />
            ) : (
              <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
            )}
          </TouchableOpacity>

          <TouchableOpacity style={styles.option} onPress={() => { onClose(); onManual(); }}>
            <View style={[styles.iconContainer, { backgroundColor: colors.surface }]}>
              <Ionicons name="create-outline" size={28} color={colors.textMuted} />
            </View>
            <View style={styles.optionText}>
              <Text style={styles.optionTitle}>{t('manualEntry')}</Text>
              <Text style={styles.optionDesc}>{t('addFirstBet')}</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
          </TouchableOpacity>

          <TouchableOpacity style={styles.cancelButton} onPress={onClose}>
            <Text style={styles.cancelText}>{t('cancel')}</Text>
          </TouchableOpacity>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'flex-end',
  },
  backdrop: {
    flex: 1,
  },
  modal: {
    backgroundColor: colors.background,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingBottom: 40,
    paddingTop: 12,
  },
  handle: {
    width: 40,
    height: 4,
    backgroundColor: colors.border,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: colors.textPrimary,
    textAlign: 'center',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: colors.textMuted,
    textAlign: 'center',
    marginBottom: 24,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
  },
  scanOption: {
    borderWidth: 2,
    borderColor: colors.accent,
  },
  optionDisabled: {
    opacity: 0.6,
    borderColor: colors.border,
  },
  iconContainer: {
    width: 56,
    height: 56,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  optionText: {
    flex: 1,
  },
  optionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: colors.textPrimary,
    marginBottom: 4,
  },
  optionDesc: {
    fontSize: 13,
    color: colors.textMuted,
  },
  cancelButton: {
    marginTop: 8,
    padding: 16,
    alignItems: 'center',
  },
  cancelText: {
    fontSize: 16,
    color: colors.textMuted,
    fontWeight: '600',
  },
});
