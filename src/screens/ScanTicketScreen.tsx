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
  Platform,
  ScrollView,
  TextInput,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../constants/colors';
import { useBets, useSubscription } from '../hooks';

const SUBSCRIPTION_LOADING_TIMEOUT_MS = 5000;
import ocrService, { OCRExtractionResult } from '../services/ocrService';

const IMAGE_QUALITY = 0.85; // High quality needed for OCR text recognition

interface ScanTicketScreenProps {
  navigation: any;
  route: any;
}

type ScreenStep = 'camera' | 'processing' | 'review' | 'error';

interface ReviewSelection {
  event: string;
  selection: string;
  odds: string;
  category: string;
  market: string;
  kickoff?: string;
}

export default function ScanTicketScreen({ navigation, route }: ScanTicketScreenProps) {
  const insets = useSafeAreaInsets();
  const mode = route.params?.mode || 'camera';
  const [permission, requestPermission] = useCameraPermissions();
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [capturedBase64, setCapturedBase64] = useState<string | null>(null);
  const [step, setStep] = useState<ScreenStep>('camera');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [flashAnim] = useState(new Animated.Value(0));
  const cameraRef = useRef<CameraView>(null);
  const processingRef = useRef(false); // Guard against double-processing
  const { createBet } = useBets();
  const { canUseFeature, openPaywall, loading: subLoading } = useSubscription();

  // Review state — editable extracted data
  const [reviewTitle, setReviewTitle] = useState('');
  const [reviewBookmaker, setReviewBookmaker] = useState('');
  const [reviewStake, setReviewStake] = useState('');
  const [reviewOdds, setReviewOdds] = useState('');
  const [reviewLeague, setReviewLeague] = useState('');
  const [reviewSelections, setReviewSelections] = useState<ReviewSelection[]>([]);
  const [reviewBetType, setReviewBetType] = useState<'single' | 'parlay' | 'classica' | 'combo' | 'chance-mix'>('classica');
  const [reviewPotentialWin, setReviewPotentialWin] = useState('');
  const [validationError, setValidationError] = useState('');
  const reviewScrollRef = useRef<any>(null);

  // Timeout: if subscription context takes too long, force-resolve loading
  const [subTimedOut, setSubTimedOut] = useState(false);
  useEffect(() => {
    if (!subLoading) return;
    const timer = setTimeout(() => {
      console.warn('[ScanTicket] Subscription loading timed out after 5s — continuing anyway');
      setSubTimedOut(true);
    }, SUBSCRIPTION_LOADING_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [subLoading]);

  const subReady = !subLoading || subTimedOut;

  useEffect(() => {
    if (!subReady) return;
    if (!canUseFeature('ocrEnabled')) {
      openPaywall('OCR Bet Scanning is a Pro feature. Upgrade to scan tickets automatically.');
      const timer = setTimeout(() => navigation.goBack(), 300);
      return () => clearTimeout(timer);
    }
  }, [subReady]);

  // Auto-launch gallery if in gallery mode
  const galleryLaunched = useRef(false);
  useEffect(() => {
    if (!subReady) return;
    if (mode === 'gallery' && !capturedImage && !galleryLaunched.current && canUseFeature('ocrEnabled')) {
      galleryLaunched.current = true;
      pickImage();
    }
  }, [mode, subReady]);

  // When image is captured, start processing
  useEffect(() => {
    if (!capturedImage || step !== 'camera' || processingRef.current) return;
    processImage();
  }, [capturedImage]);

  const pickImage = async () => {
    try {
      const permResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (permResult.status === 'denied') {
        Alert.alert(
          'Photo Access Required',
          'Please allow photo library access in Settings to upload bet tickets.',
          [
            { text: 'Cancel', onPress: () => navigation.goBack(), style: 'cancel' },
            { text: 'Open Settings', onPress: () => {
              import('react-native').then(({ Linking }) => Linking.openSettings());
              navigation.goBack();
            }},
          ]
        );
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: false,
        quality: IMAGE_QUALITY,
        base64: true, // Request base64 directly — avoids FileSystem issues on web
      });

      if (!result.canceled && result.assets[0]) {
        console.log('[ScanTicket] Gallery selected. Base64 length:', result.assets[0].base64?.length);
        setCapturedImage(result.assets[0].uri);
        setCapturedBase64(result.assets[0].base64 || null);
      } else {
        navigation.goBack();
      }
    } catch (error) {
      console.error('[ScanTicket] pickImage error:', error);
      Alert.alert('Error', 'Failed to pick image');
      navigation.goBack();
    }
  };

  const takePicture = async () => {
    if (cameraRef.current) {
      try {
        Animated.sequence([
          Animated.timing(flashAnim, { toValue: 0.8, duration: 50, useNativeDriver: Platform.OS !== 'web' }),
          Animated.timing(flashAnim, { toValue: 0, duration: 150, useNativeDriver: Platform.OS !== 'web' }),
        ]).start();

        const photo = await cameraRef.current.takePictureAsync({
          quality: IMAGE_QUALITY,
          base64: true, // Request base64 directly from camera
        });
        if (photo) {
          console.log('[ScanTicket] Photo taken. Base64 length:', photo.base64?.length);
          setCapturedImage(photo.uri);
          setCapturedBase64(photo.base64 || null);
        }
      } catch (error) {
        console.error('[ScanTicket] takePicture error:', error);
        Alert.alert('Error', 'Failed to capture image');
      }
    }
  };

  const processImage = async () => {
    if (!capturedImage || processingRef.current) return;
    processingRef.current = true;
    setStep('processing');

    try {
      console.log('[ScanTicket] Starting OCR extraction...');
      console.log('[ScanTicket] Image URI type:', capturedImage.substring(0, 50));
      console.log('[ScanTicket] Have direct base64?', !!capturedBase64);

      let extracted;
      if (capturedBase64) {
        // Direct base64 from camera or gallery (native path)
        console.log('[ScanTicket] Using direct base64, length:', capturedBase64.length);
        extracted = await ocrService.extractBetData(capturedBase64, true);
      } else if (capturedImage.startsWith('data:')) {
        // Web: URI is already a data URI — extract raw base64 from it
        const rawBase64 = capturedImage.split('base64,')[1] || '';
        console.log('[ScanTicket] Extracted base64 from data URI, length:', rawBase64.length);
        if (!rawBase64 || rawBase64.length < 100) {
          throw new Error('Camera captured an empty or corrupted image. Please try again.');
        }
        extracted = await ocrService.extractBetData(rawBase64, true);
      } else {
        // Native: file:// URI — let ocrService convert it
        console.log('[ScanTicket] Using file URI path');
        extracted = await ocrService.extractBetData(capturedImage, false);
      }
      console.log('[ScanTicket] OCR extraction successful:', extracted.title);

      // Populate review state with extracted data
      const hasMultipleSelections = extracted.selections && extracted.selections.length > 1;

      setReviewTitle(hasMultipleSelections
        ? `Combo (${extracted.selections.length} legs)`
        : extracted.title || 'Scanned Bet');
      setReviewBookmaker(extracted.bookmaker || '');
      setReviewStake(extracted.stake > 0 ? String(extracted.stake) : '');
      setReviewOdds(extracted.odds > 0 ? String(extracted.odds) : '');
      setReviewLeague(extracted.league || '');
      setReviewBetType(hasMultipleSelections ? 'combo' : 'classica');
      setReviewPotentialWin(extracted.potentialWin > 0 ? String(extracted.potentialWin) : '');

      const sels: ReviewSelection[] = extracted.selections.map(s => ({
        event: s.event || '',
        selection: s.selection || '',
        odds: s.odds > 0 ? String(s.odds) : '',
        category: s.category || 'Other',
        market: s.market || 'other',
        kickoff: s.kickoff || undefined,
      }));

      // Ensure at least one selection
      if (sels.length === 0) {
        sels.push({
          event: extracted.title || '',
          selection: extracted.title || '',
          odds: extracted.odds > 0 ? String(extracted.odds) : '',
          category: 'Other',
          market: 'other',
        });
      }

      setReviewSelections(sels);
      setStep('review');
    } catch (error: any) {
      console.error('[ScanTicket] processImage error:', error);
      processingRef.current = false;
      const msg = error.message || '';
      const isNetwork = msg.toLowerCase().includes('fetch') || msg.toLowerCase().includes('network');
      const isKeyMissing = msg.toLowerCase().includes('api key') || msg.toLowerCase().includes('not configured');
      
      const finalMsg = isKeyMissing
        ? 'OCR is not configured in this build. The Google Vision API key is missing. Please contact support or rebuild the app.'
        : isNetwork
        ? 'Network connection failed. Please check your internet.'
        : msg || 'Could not extract data from this image. Please try again or enter manually.';
      
      setErrorMsg(finalMsg);
      setStep('error');
    }
  };

  const handleConfirmBet = async () => {
    const stakeVal = parseFloat(reviewStake) || 0;
    const oddsVal = parseFloat(reviewOdds) || 0;
    const potWinVal = parseFloat(reviewPotentialWin) || 0;

    // Validate required fields
    const missing: string[] = [];
    if (!reviewTitle.trim()) missing.push('Title');
    if (stakeVal <= 0) missing.push('Stake');
    if (potWinVal <= 0) missing.push('Potential Win');
    if (missing.length > 0) {
      setValidationError(`Please complete ${missing.join(', ')} before saving.`);
      reviewScrollRef.current?.scrollTo?.({ y: 0, animated: true });
      return;
    }
    setValidationError('');

    const selections = reviewSelections.map((s, index) => ({
      id: `${Date.now()}-${index}`,
      event: s.event || 'Unknown Event',
      selection: s.selection || s.event || 'Unknown',
      odds: parseFloat(s.odds) || 0,
      oddsFormat: 'decimal' as const,
      status: 'pending' as const,
      category: (s.category || 'Other') as any,
      market: (s.market || 'other') as any,
      kickoff: s.kickoff || null,
    }));

    const totalOdds = oddsVal > 0
      ? oddsVal
      : selections.reduce((acc, sel) => acc * (sel.odds > 0 ? sel.odds : 1), 1);

    const potentialWin = parseFloat(reviewPotentialWin) || stakeVal * totalOdds;

    try {
      const createdBet = await createBet({
        title: reviewTitle || 'Scanned Bet',
        bookmaker: reviewBookmaker.trim() || 'Unknown',
        stake: stakeVal,
        totalOdds: Number(totalOdds.toFixed(2)),
        oddsFormat: 'decimal',
        potentialWin: Number(potentialWin.toFixed(2)),
        status: 'pending',
        date: new Date().toISOString(),
        selections,
        category: (selections[0]?.category || 'Other') as any,
        betType: reviewBetType,
        market: (selections[0]?.market || 'other') as any,
        league: reviewLeague.trim() || undefined,
        source: mode === 'gallery' ? 'scan-gallery' : 'scan-camera',
      });

      navigation.replace('BetDetail', { betId: createdBet.id, selectionIndex: 0 });
    } catch (error: any) {
      console.error('[ScanTicket] handleConfirmBet error:', error);
      const msg = error.message || '';
      const isNetwork = msg.toLowerCase().includes('fetch') || msg.toLowerCase().includes('network');
      Alert.alert('Error', isNetwork ? 'Network connection failed.' : 'Failed to save bet. Please try again.');
    }
  };

  const updateSelection = (index: number, field: keyof ReviewSelection, value: string) => {
    setReviewSelections(prev =>
      prev.map((s, i) => (i === index ? { ...s, [field]: value } : s))
    );
  };

  const retake = () => {
    setCapturedImage(null);
    setCapturedBase64(null);
    setStep('camera');
    processingRef.current = false;
    if (mode === 'gallery') {
      pickImage();
    }
  };

  if (step === 'review') {
    return (
      <View style={[styles.container, Platform.OS === 'web' ? { position: 'absolute' as any, top: 0, left: 0, right: 0, bottom: 0 } : {}, { display: 'flex', flexDirection: 'column' }]}>
        <View style={[styles.header, { paddingTop: Math.max(insets.top + 10, 50), flexShrink: 0 }]}>
          <TouchableOpacity onPress={retake} style={styles.backButton}>
            <Ionicons name="arrow-back" size={28} color={colors.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Review Bet</Text>
          <View style={{ width: 44 }} />
        </View>

        <ScrollView 
          ref={reviewScrollRef}
          style={styles.reviewScroll} 
          contentContainerStyle={{ padding: 16, paddingBottom: 80 }}
          showsVerticalScrollIndicator={true}
        >

          {validationError ? (
            <View style={{ backgroundColor: 'rgba(239, 68, 68, 0.15)', borderWidth: 1, borderColor: '#ef4444', borderRadius: 12, padding: 14, marginBottom: 16 }}>
              <Text style={{ color: '#ef4444', fontSize: 13, fontWeight: '600', textAlign: 'center' }}>{validationError}</Text>
            </View>
          ) : null}

          <View style={styles.dataCard}>
            <Text style={styles.dataTitle}>Extracted Data</Text>
            <Text style={styles.dataSubtitle}>Tap any field to edit</Text>

            <View style={styles.dataRow}>
              <Text style={styles.dataLabel}>Title</Text>
              <TextInput
                style={styles.dataInput}
                value={reviewTitle}
                onChangeText={setReviewTitle}
                placeholder="Bet title"
                placeholderTextColor={colors.textMuted}
              />
            </View>

            <View style={styles.dataRow}>
              <Text style={styles.dataLabel}>Bookmaker</Text>
              <TextInput
                style={styles.dataInput}
                value={reviewBookmaker}
                onChangeText={setReviewBookmaker}
                placeholder="e.g. Sisal"
                placeholderTextColor={colors.textMuted}
              />
            </View>

            <View style={styles.dataRow}>
              <Text style={styles.dataLabel}>Stake ($)</Text>
              <TextInput
                style={styles.dataInput}
                value={reviewStake}
                onChangeText={setReviewStake}
                placeholder="0"
                placeholderTextColor={colors.textMuted}
                keyboardType="decimal-pad"
              />
            </View>

            <View style={styles.dataRow}>
              <Text style={styles.dataLabel}>Potential Win</Text>
              <TextInput
                style={styles.dataInput}
                value={reviewPotentialWin}
                onChangeText={setReviewPotentialWin}
                placeholder="0"
                placeholderTextColor={colors.textMuted}
                keyboardType="decimal-pad"
              />
            </View>

            <View style={[styles.dataRow, { borderBottomWidth: 0 }]}>
              <Text style={styles.dataLabel}>League</Text>
              <TextInput
                style={[styles.dataInput, { fontSize: reviewLeague && reviewLeague.length > 20 ? 11 : 14 }]}
                value={reviewLeague}
                onChangeText={setReviewLeague}
                placeholder="Optional"
                placeholderTextColor={colors.textMuted}
              />
            </View>
          </View>

          {/* Bet Type Selector (for multi-leg bets) */}
          {reviewSelections.length > 1 && (
            <View style={{ marginBottom: 16 }}>
              <Text style={styles.selectionsTitle}>Tipo Scommessa</Text>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                {(['combo', 'chance-mix'] as const).map(bt => (
                  <TouchableOpacity
                    key={bt}
                    onPress={() => setReviewBetType(bt)}
                    style={{
                      flex: 1,
                      paddingVertical: 12,
                      borderRadius: 10,
                      backgroundColor: reviewBetType === bt ? colors.accent : colors.surface,
                      borderWidth: 1,
                      borderColor: reviewBetType === bt ? colors.accent : colors.border,
                      alignItems: 'center',
                    }}
                  >
                    <Text style={{
                      fontSize: 14,
                      fontWeight: '700',
                      color: reviewBetType === bt ? colors.primary : colors.textPrimary,
                    }}>
                      {bt === 'combo' ? 'Combo' : 'Chance Mix'}
                    </Text>
                    <Text style={{
                      fontSize: 11,
                      color: reviewBetType === bt ? colors.primary : colors.textMuted,
                      marginTop: 2,
                    }}>
                      {bt === 'combo' ? 'Tutte devono vincere' : 'Basta una'}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}

          {/* Selections / Legs */}
          <Text style={styles.selectionsTitle}>
            {reviewSelections.length > 1 ? `Selections (${reviewSelections.length} legs)` : 'Selection'}
          </Text>

          {reviewSelections.map((sel, index) => (
            <View key={index} style={styles.selectionCard}>
              {reviewSelections.length > 1 && (
                <Text style={styles.legLabel}>Leg {index + 1}</Text>
              )}
              <View style={styles.dataRow}>
                <Text style={styles.dataLabel}>Event</Text>
                <TextInput
                  style={styles.dataInput}
                  value={sel.event}
                  onChangeText={(v) => updateSelection(index, 'event', v)}
                  placeholder="Event name"
                  placeholderTextColor={colors.textMuted}
                />
              </View>
              <View style={styles.dataRow}>
                <Text style={styles.dataLabel}>Selection</Text>
                <TextInput
                  style={styles.dataInput}
                  value={sel.selection}
                  onChangeText={(v) => updateSelection(index, 'selection', v)}
                  placeholder="Selection"
                  placeholderTextColor={colors.textMuted}
                />
              </View>
              <View style={[styles.dataRow, { borderBottomWidth: 0 }]}>
                <Text style={styles.dataLabel}>Odds</Text>
                <TextInput
                  style={styles.dataInput}
                  value={sel.odds}
                  onChangeText={(v) => updateSelection(index, 'odds', v)}
                  placeholder="0"
                  placeholderTextColor={colors.textMuted}
                  keyboardType="decimal-pad"
                />
              </View>
            </View>
          ))}
        </ScrollView>

        {/* Bottom Buttons */}
        <View style={[styles.reviewButtons, { paddingBottom: Math.max(insets.bottom, 16) }]}>
          <TouchableOpacity
            style={[styles.reviewButton, styles.retakeButton]}
            onPress={retake}
          >
            <Ionicons name="camera" size={20} color={colors.textPrimary} />
            <Text style={styles.reviewButtonText}>Retake</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.reviewButton, styles.confirmButton]}
            onPress={handleConfirmBet}
          >
            <Ionicons name="checkmark-circle" size={20} color={colors.primary} />
            <Text style={[styles.reviewButtonText, { color: colors.primary }]}>Confirm</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // =================== RENDER: PROCESSING ===================
  if (step === 'processing' && capturedImage) {
    return (
      <View style={styles.container}>
        <Animated.View style={[styles.flashOverlay, { opacity: flashAnim, pointerEvents: 'none' }]} />

        <View style={[styles.header, { paddingTop: Math.max(insets.top + 10, 50) }]}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
            <Ionicons name="close" size={28} color={colors.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Processing Ticket</Text>
          <View style={{ width: 44 }} />
        </View>

        <View style={styles.previewContainer}>
          <Image source={{ uri: capturedImage }} style={styles.previewImage} />
          <View style={styles.scanningOverlay}>
            <View style={styles.scanningBox}>
              <ActivityIndicator size="large" color={colors.accent} />
              <Text style={styles.scanningText}>Analyzing ticket...</Text>
              <Text style={styles.scanningSubtext}>Extracting legs, odds, market, and kickoff</Text>
            </View>
          </View>
        </View>
      </View>
    );
  }

  // =================== RENDER: ERROR ===================
  if (step === 'error') {
    return (
      <View style={styles.container}>
        <View style={[styles.header, { paddingTop: Math.max(insets.top + 10, 50) }]}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
            <Ionicons name="close" size={28} color={colors.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Scan Failed</Text>
          <View style={{ width: 44 }} />
        </View>

        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <View style={{ width: 80, height: 80, borderRadius: 40, backgroundColor: 'rgba(239, 68, 68, 0.1)', alignItems: 'center', justifyContent: 'center', marginBottom: 24 }}>
            <Ionicons name="alert-circle" size={48} color={colors.error} />
          </View>
          <Text style={{ fontSize: 22, fontWeight: 'bold', color: colors.textPrimary, marginBottom: 12, textAlign: 'center' }}>
            Extraction Failed
          </Text>
          <Text style={{ fontSize: 15, color: colors.textMuted, textAlign: 'center', marginBottom: 32, lineHeight: 22 }}>
            {errorMsg}
          </Text>

          <TouchableOpacity
            style={[styles.reviewButton, { width: '100%', marginBottom: 16 }]}
            onPress={retake}
          >
            <Ionicons name="camera" size={20} color={colors.textPrimary} />
            <Text style={styles.reviewButtonText}>Try Again</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.reviewButton, { width: '100%', backgroundColor: 'rgba(74, 159, 212, 0.1)', borderColor: 'rgba(74, 159, 212, 0.3)' }]}
            onPress={() => navigation.navigate('AddBet')}
          >
            <Ionicons name="pencil" size={20} color={colors.accent} />
            <Text style={[styles.reviewButtonText, { color: colors.accent }]}>Enter Manually</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // =================== RENDER: GALLERY LOADING ===================
  if (mode === 'gallery' && !capturedImage) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color={colors.accent} style={{ marginTop: 100 }} />
        <Text style={styles.loadingText}>Opening gallery...</Text>
      </View>
    );
  }

  // =================== RENDER: CAMERA PERMISSION ===================
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

  // =================== RENDER: CAMERA VIEW ===================
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
        <View style={[styles.overlay, { pointerEvents: 'none' }]}>
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

  // Preview / Processing
  flashOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'white', zIndex: 100 },
  previewContainer: { flex: 1, margin: 16, borderRadius: 24, overflow: 'hidden', position: 'relative' },
  previewImage: { flex: 1, borderRadius: 24 },
  scanningOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(11, 27, 61, 0.85)', justifyContent: 'center', alignItems: 'center' },
  scanningBox: { backgroundColor: colors.surface, padding: 32, borderRadius: 20, alignItems: 'center' },
  scanningText: { color: colors.textPrimary, marginTop: 16, fontSize: 18, fontWeight: 'bold' },
  scanningSubtext: { color: colors.textMuted, marginTop: 8, fontSize: 14 },

  // Review screen
  reviewScroll: { flex: 1, minHeight: 0 },
  reviewImage: { width: '100%' as any, height: 180, borderRadius: 16, marginBottom: 16 },
  dataCard: { backgroundColor: colors.surface, borderRadius: 16, padding: 20, marginBottom: 16, borderWidth: 1, borderColor: colors.border },
  dataTitle: { fontSize: 20, fontWeight: 'bold', color: colors.textPrimary, marginBottom: 4 },
  dataSubtitle: { fontSize: 13, color: colors.accent, marginBottom: 16 },
  dataRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border },
  dataLabel: { fontSize: 14, color: colors.textMuted, minWidth: 100 },
  dataValue: { fontSize: 14, fontWeight: 'bold', color: colors.textPrimary },
  dataInput: { flex: 1, fontSize: 14, fontWeight: 'bold', color: colors.textPrimary, textAlign: 'right', padding: 0 },
  selectionsTitle: { fontSize: 16, fontWeight: '700', color: colors.textPrimary, marginBottom: 12 },
  selectionCard: { backgroundColor: colors.surface, borderRadius: 14, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: colors.border },
  legLabel: { fontSize: 13, fontWeight: '700', color: colors.accent, marginBottom: 8, letterSpacing: 0.5 },
  reviewButtons: { flexDirection: 'row', paddingHorizontal: 16, paddingTop: 12, gap: 12, flexShrink: 0 },
  reviewButton: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: 16, borderRadius: 12, gap: 8 },
  retakeButton: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  confirmButton: { backgroundColor: colors.accent },
  reviewButtonText: { fontSize: 16, fontWeight: 'bold', color: colors.textPrimary },
});
