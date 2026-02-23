import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  Image,
  ActivityIndicator,
  Animated,
  ScrollView,
  TextInput,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../constants/colors';
import { useBets } from '../hooks';
import ocrService from '../services/ocrService';

interface ScanTicketScreenProps {
  navigation: any;
  route: any;
}

export default function ScanTicketScreen({ navigation, route }: ScanTicketScreenProps) {
  const insets = useSafeAreaInsets();
  const mode = route.params?.mode || 'camera';
  const [permission, requestPermission] = useCameraPermissions();
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [flashAnim] = useState(new Animated.Value(0));
  const [extractedData, setExtractedData] = useState<any>(null);
  const cameraRef = useRef<CameraView>(null);
  const { createBet } = useBets();

  // Auto-launch gallery if in gallery mode
  useEffect(() => {
    if (mode === 'gallery' && !capturedImage) {
      pickImage();
    }
  }, [mode]);

  const pickImage = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [4, 3],
        quality: 0.8,
      });

      if (!result.canceled && result.assets[0]) {
        setCapturedImage(result.assets[0].uri);
      } else {
        // User cancelled, go back
        navigation.goBack();
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to pick image');
      navigation.goBack();
    }
  };

  const takePicture = async () => {
    if (cameraRef.current) {
      try {
        Animated.sequence([
          Animated.timing(flashAnim, { toValue: 0.8, duration: 50, useNativeDriver: true }),
          Animated.timing(flashAnim, { toValue: 0, duration: 150, useNativeDriver: true }),
        ]).start();

        const photo = await cameraRef.current.takePictureAsync({ quality: 0.8 });
        if (photo) {
          setCapturedImage(photo.uri);
        }
      } catch (error) {
        Alert.alert('Error', 'Failed to capture image');
      }
    }
  };

  const processImage = async () => {
    if (!capturedImage) return;
    
    setScanning(true);
    
    try {
      // Real OCR extraction using Google Vision API
      const extracted = await ocrService.extractBetData(capturedImage);
      setExtractedData({
        title: extracted.title,
        bookmaker: extracted.bookmaker,
        stake: extracted.stake,
        odds: extracted.odds,
        detectedLang: extracted.detectedLang,
      });
      setScanning(false);
    } catch (error: any) {
      setScanning(false);
      const isNetwork = error.message?.toLowerCase().includes('fetch') || error.message?.toLowerCase().includes('network');
      Alert.alert('Error', isNetwork ? 'Network connection failed. Please check your internet.' : 'Failed to analyze image. Please try again or enter manually.');
    }
  };

  const confirmAndSave = async () => {
    if (!extractedData) return;
    
    try {
      const potentialWin = extractedData.stake * extractedData.odds;
      await createBet({
        title: extractedData.title,
        bookmaker: extractedData.bookmaker,
        stake: extractedData.stake,
        totalOdds: extractedData.odds,
        potentialWin: potentialWin,
        status: 'pending',
        date: new Date().toISOString().split('T')[0],
        selections: [{
          id: Date.now().toString(),
          event: extractedData.title,
          selection: 'Auto-extracted',
          odds: extractedData.odds,
          status: 'pending',
          category: 'Other',
        }],
        category: 'Other',
        betType: 'single',
      });
      
      Alert.alert('✅ Success', 'Bet added!', [
        { text: 'View Bets', onPress: () => navigation.navigate('Home') },
      ]);
    } catch (error: any) {
      const isNetwork = error.message?.toLowerCase().includes('fetch') || error.message?.toLowerCase().includes('network');
      Alert.alert('Error', isNetwork ? 'Network connection failed. Please check your internet.' : 'Failed to save bet. Please try again.');
    }
  };

  const retake = () => {
    setCapturedImage(null);
    setExtractedData(null);
    if (mode === 'gallery') {
      pickImage();
    }
  };

  // Show extracted data review
  if (extractedData && capturedImage) {
    return (
      <View style={styles.container}>
        <View style={[styles.header, { paddingTop: Math.max(insets.top + 10, 50) }]}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
            <Ionicons name="close" size={28} color={colors.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Review Extracted Data</Text>
          <View style={{ width: 44 }} />
        </View>
        
        <ScrollView style={styles.reviewScroll}>
          <Image source={{ uri: capturedImage }} style={styles.reviewImage} />
          
          <View style={styles.dataCard}>
            <Text style={styles.dataTitle}>Detected Bet Details</Text>
            <Text style={styles.dataSubtitle}>Language: {extractedData.detectedLang}</Text>
            
            <View style={styles.dataRow}>
              <Text style={styles.dataLabel}>Event</Text>
              <TextInput
                style={styles.dataInput}
                value={extractedData.title}
                onChangeText={(t) => setExtractedData({ ...extractedData, title: t })}
              />
            </View>
            <View style={styles.dataRow}>
              <Text style={styles.dataLabel}>Bookmaker</Text>
              <TextInput
                style={styles.dataInput}
                value={extractedData.bookmaker}
                onChangeText={(t) => setExtractedData({ ...extractedData, bookmaker: t })}
              />
            </View>
            <View style={styles.dataRow}>
              <Text style={styles.dataLabel}>Stake</Text>
              <TextInput
                style={styles.dataInput}
                value={String(extractedData.stake)}
                keyboardType="numeric"
                onChangeText={(t) => setExtractedData({ ...extractedData, stake: parseFloat(t) || 0 })}
              />
            </View>
            <View style={styles.dataRow}>
              <Text style={styles.dataLabel}>Odds</Text>
              <TextInput
                style={styles.dataInput}
                value={String(extractedData.odds)}
                keyboardType="numeric"
                onChangeText={(t) => setExtractedData({ ...extractedData, odds: parseFloat(t) || 0 })}
              />
            </View>
            <View style={styles.dataRow}>
              <Text style={styles.dataLabel}>Potential Win</Text>
              <Text style={[styles.dataValue, { color: colors.success }]}>
                ${(extractedData.stake * extractedData.odds).toFixed(2)}
              </Text>
            </View>
          </View>
        </ScrollView>
        
        <View style={styles.reviewButtons}>
          <TouchableOpacity style={[styles.reviewButton, styles.retakeButton]} onPress={retake}>
            <Ionicons name="refresh" size={20} color={colors.textPrimary} />
            <Text style={styles.reviewButtonText}>Retake</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.reviewButton, styles.confirmButton]} onPress={confirmAndSave}>
            <Ionicons name="checkmark" size={20} color={colors.primary} />
            <Text style={[styles.reviewButtonText, { color: colors.primary }]}>Confirm & Save</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // Show captured image preview (before OCR)
  if (capturedImage) {
    return (
      <View style={styles.container}>
        <Animated.View style={[styles.flashOverlay, { opacity: flashAnim }]} pointerEvents="none" />
        
        <View style={[styles.header, { paddingTop: Math.max(insets.top + 10, 50) }]}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
            <Ionicons name="close" size={28} color={colors.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Review Ticket</Text>
          <View style={{ width: 44 }} />
        </View>
        
        <View style={styles.previewContainer}>
          <Image source={{ uri: capturedImage }} style={styles.previewImage} />
          
          {scanning && (
            <View style={styles.scanningOverlay}>
              <View style={styles.scanningBox}>
                <ActivityIndicator size="large" color={colors.accent} />
                <Text style={styles.scanningText}>Analyzing ticket...</Text>
                <Text style={styles.scanningSubtext}>Reading text in any language</Text>
              </View>
            </View>
          )}
        </View>
        
        {!scanning && (
          <View style={styles.actionButtons}>
            <TouchableOpacity style={[styles.actionButton, styles.retakeButton]} onPress={retake}>
              <Ionicons name="refresh" size={24} color={colors.textPrimary} />
              <Text style={styles.actionButtonText}>Retake</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.actionButton, styles.confirmButton]} onPress={processImage}>
              <Ionicons name="scan" size={24} color={colors.primary} />
              <Text style={[styles.actionButtonText, { color: colors.primary }]}>Extract Data</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    );
  }

  // Gallery mode - show loading while picker opens
  if (mode === 'gallery') {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color={colors.accent} style={{ marginTop: 100 }} />
        <Text style={styles.loadingText}>Opening gallery...</Text>
      </View>
    );
  }

  // Camera mode
  if (!permission) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color={colors.accent} />
        <Text style={styles.loadingText}>Loading camera...</Text>
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={styles.container}>
        <View style={styles.permissionIcon}>
          <Ionicons name="camera-outline" size={64} color={colors.accent} />
        </View>
        <Text style={styles.permissionTitle}>Camera Access Required</Text>
        <Text style={styles.permissionText}>
          We need camera access to scan your bet tickets. Your photos are processed on-device.
        </Text>
        <TouchableOpacity style={styles.button} onPress={requestPermission}>
          <Ionicons name="camera" size={20} color={colors.primary} style={styles.buttonIcon} />
          <Text style={styles.buttonText}>Allow Camera Access</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.cancelButton} onPress={() => navigation.goBack()}>
          <Text style={styles.cancelText}>Not Now</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: Math.max(insets.top + 10, 50) }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="close" size={28} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Scan Ticket</Text>
        <TouchableOpacity style={styles.galleryButton} onPress={pickImage}>
          <Ionicons name="images" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
      </View>
      
      <View style={styles.cameraWrapper}>
        <CameraView ref={cameraRef} style={styles.camera} facing="back" />
        <View style={styles.overlay} pointerEvents="none">
          <View style={styles.scanFrame}>
            <View style={styles.frameCorners}>
              <View style={[styles.corner, styles.topLeft]} />
              <View style={[styles.corner, styles.topRight]} />
              <View style={[styles.corner, styles.bottomLeft]} />
              <View style={[styles.corner, styles.bottomRight]} />
            </View>
            <View style={styles.scanLine} />
          </View>
          
          <Text style={styles.scanText}>Align bet ticket within frame</Text>
          <Text style={styles.scanSubtext}>Works with tickets in any language</Text>
        </View>
      </View>
      
      <View style={styles.controls}>
        <View style={styles.tips}>
          <Ionicons name="language" size={16} color={colors.textMuted} />
          <Text style={styles.tipText}>Auto-detects: EN, IT, ES, FR, DE</Text>
        </View>
        
        <TouchableOpacity style={styles.captureButton} onPress={takePicture} activeOpacity={0.8}>
          <View style={styles.captureButtonOuter}>
            <View style={styles.captureButtonInner} />
          </View>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 12 },
  backButton: { padding: 8 },
  galleryButton: { padding: 8 },
  headerTitle: { fontSize: 18, fontWeight: 'bold', color: colors.textPrimary },
  loadingText: { color: colors.textMuted, marginTop: 16, fontSize: 16, textAlign: 'center' },
  
  // Permission
  permissionIcon: { width: 120, height: 120, borderRadius: 60, backgroundColor: colors.accent + '20', justifyContent: 'center', alignItems: 'center', marginBottom: 24, marginTop: 60 },
  permissionTitle: { fontSize: 24, fontWeight: 'bold', color: colors.textPrimary, marginBottom: 12, textAlign: 'center' },
  permissionText: { color: colors.textMuted, fontSize: 16, textAlign: 'center', marginHorizontal: 40, marginBottom: 32, lineHeight: 22 },
  button: { flexDirection: 'row', backgroundColor: colors.accent, marginHorizontal: 40, padding: 16, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  buttonIcon: { marginRight: 8 },
  buttonText: { color: colors.primary, fontWeight: 'bold', fontSize: 16 },
  cancelButton: { marginTop: 16 },
  cancelText: { color: colors.textMuted, fontSize: 16 },
  
  // Camera
  cameraWrapper: { flex: 1, margin: 16, borderRadius: 24, overflow: 'hidden', position: 'relative' },
  camera: { flex: 1 },
  overlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(11, 27, 61, 0.4)', justifyContent: 'center', alignItems: 'center' },
  scanFrame: { width: 300, height: 200, position: 'relative', justifyContent: 'center', alignItems: 'center' },
  frameCorners: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  corner: { position: 'absolute', width: 40, height: 40, borderColor: colors.accent, borderWidth: 4 },
  topLeft: { top: 0, left: 0, borderRightWidth: 0, borderBottomWidth: 0, borderTopLeftRadius: 16 },
  topRight: { top: 0, right: 0, borderLeftWidth: 0, borderBottomWidth: 0, borderTopRightRadius: 16 },
  bottomLeft: { bottom: 0, left: 0, borderRightWidth: 0, borderTopWidth: 0, borderBottomLeftRadius: 16 },
  bottomRight: { bottom: 0, right: 0, borderLeftWidth: 0, borderTopWidth: 0, borderBottomRightRadius: 16 },
  scanLine: { width: 280, height: 2, backgroundColor: colors.accent, shadowColor: colors.accent, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.8, shadowRadius: 10, elevation: 10 },
  scanText: { color: colors.textPrimary, marginTop: 24, fontSize: 16, fontWeight: '600' },
  scanSubtext: { color: colors.textMuted, marginTop: 8, fontSize: 13 },
  
  // Controls
  controls: { padding: 24, alignItems: 'center' },
  tips: { flexDirection: 'row', alignItems: 'center', marginBottom: 20 },
  tipText: { color: colors.textMuted, marginLeft: 8, fontSize: 13 },
  captureButton: { marginBottom: 20 },
  captureButtonOuter: { width: 84, height: 84, borderRadius: 42, backgroundColor: colors.textPrimary, justifyContent: 'center', alignItems: 'center' },
  captureButtonInner: { width: 72, height: 72, borderRadius: 36, backgroundColor: colors.background, borderWidth: 3, borderColor: colors.textPrimary },
  
  // Preview
  flashOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'white', zIndex: 100 },
  previewContainer: { flex: 1, margin: 16, borderRadius: 24, overflow: 'hidden', position: 'relative' },
  previewImage: { flex: 1, borderRadius: 24 },
  scanningOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(11, 27, 61, 0.85)', justifyContent: 'center', alignItems: 'center' },
  scanningBox: { backgroundColor: colors.surface, padding: 32, borderRadius: 20, alignItems: 'center' },
  scanningText: { color: colors.textPrimary, marginTop: 16, fontSize: 18, fontWeight: 'bold' },
  scanningSubtext: { color: colors.textMuted, marginTop: 8, fontSize: 14 },
  actionButtons: { flexDirection: 'row', padding: 20, gap: 12 },
  actionButton: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: 16, borderRadius: 16, gap: 8 },
  retakeButton: { backgroundColor: colors.surface },
  confirmButton: { backgroundColor: colors.accent },
  actionButtonText: { fontSize: 16, fontWeight: 'bold', color: colors.textPrimary },
  
  // Review extracted data
  reviewScroll: { flex: 1 },
  reviewImage: { width: '100%', height: 200, borderRadius: 16, margin: 16 },
  dataCard: { backgroundColor: colors.surface, borderRadius: 16, padding: 20, margin: 16, marginTop: 0 },
  dataTitle: { fontSize: 20, fontWeight: 'bold', color: colors.textPrimary, marginBottom: 4 },
  dataSubtitle: { fontSize: 13, color: colors.accent, marginBottom: 16 },
  dataRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border },
  dataLabel: { fontSize: 14, color: colors.textMuted },
  dataValue: { fontSize: 14, fontWeight: 'bold', color: colors.textPrimary },
  dataInput: { flex: 1, fontSize: 14, fontWeight: 'bold', color: colors.textPrimary, textAlign: 'right', padding: 0 },
  reviewButtons: { flexDirection: 'row', padding: 16, gap: 12 },
  reviewButton: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: 16, borderRadius: 12, gap: 8 },
  reviewButtonText: { fontSize: 16, fontWeight: 'bold', color: colors.textPrimary },
});
