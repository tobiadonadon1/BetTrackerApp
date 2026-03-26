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
          <Text style={styles.title}>Add New Bet</Text>
          <Text style={styles.subtitle}>Choose how you want to add your bet</Text>

          <TouchableOpacity style={[styles.option, styles.scanOption]} onPress={() => { onClose(); onScan(); }}>
            <View style={[styles.iconContainer, { backgroundColor: colors.accent }]}>
              <Ionicons name="camera" size={28} color={colors.primary} />
            </View>
            <View style={styles.optionText}>
              <Text style={styles.optionTitle}>Scan Ticket</Text>
              <Text style={styles.optionDesc}>Take a photo of your bet ticket</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
          </TouchableOpacity>

          <TouchableOpacity style={styles.option} onPress={() => { onClose(); onGallery(); }}>
            <View style={[styles.iconContainer, { backgroundColor: colors.surface }]}>
              <Ionicons name="images" size={28} color={colors.accent} />
            </View>
            <View style={styles.optionText}>
              <Text style={styles.optionTitle}>Upload from Gallery</Text>
              <Text style={styles.optionDesc}>Select existing photo</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
          </TouchableOpacity>

          <TouchableOpacity style={styles.option} onPress={() => { onClose(); onManual(); }}>
            <View style={[styles.iconContainer, { backgroundColor: colors.surface }]}>
              <Ionicons name="create-outline" size={28} color={colors.textMuted} />
            </View>
            <View style={styles.optionText}>
              <Text style={styles.optionTitle}>Manual Entry</Text>
              <Text style={styles.optionDesc}>Enter bet details yourself</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
          </TouchableOpacity>

          <TouchableOpacity style={styles.cancelButton} onPress={onClose}>
            <Text style={styles.cancelText}>Cancel</Text>
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
