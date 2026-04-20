import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { createNavigationContainerRef } from '@react-navigation/native';
import { supabase } from '../config/supabase';

export const navigationRef = createNavigationContainerRef<any>();
const WEB_VAPID_PUBLIC_KEY = (process.env.EXPO_PUBLIC_VAPID_PUBLIC_KEY || '').trim();

class NotificationService {
  /**
   * Initialize notifications
   */
  async initialize(requestPermissions: boolean = false): Promise<boolean> {
    try {
      if (Platform.OS === 'web' && !WEB_VAPID_PUBLIC_KEY) {
        return false;
      }

      // On iOS, check and configure notification channel
      if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync('default', {
          name: 'Bet Updates',
          importance: Notifications.AndroidImportance.HIGH,
          vibrationPattern: [0, 250, 250, 250],
          lightColor: '#4A9FD4',
          sound: 'default',
        });
      }

      // Request permissions
      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;

      if (existingStatus !== 'granted') {
        if (!requestPermissions) {
          console.log('[Notifications] Permissions not granted. Skipping prompt to comply with App Store rules.');
          return false;
        }
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }

      if (finalStatus !== 'granted') {
        console.warn('[Notifications] Permissions not granted. Status:', finalStatus);
        return false;
      }

      // Get push token
      const token = await this.getPushToken();
      console.log('[Notifications] Push token:', token ? token.substring(0, 30) + '...' : 'null');
      if (token) {
        await this.savePushToken(token);
      }

      // Set notification handler — ensures notifications show even when app is in foreground
      Notifications.setNotificationHandler({
        handleNotification: async () => ({
          shouldShowAlert: true,
          shouldPlaySound: true,
          shouldSetBadge: true,
          shouldShowBanner: true,
          shouldShowList: true,
        }),
      });

      console.log('[Notifications] Initialized successfully');
      return true;
    } catch (error) {
      console.error('[Notifications] Failed to initialize:', error);
      return false;
    }
  }

  /**
   * Get Expo push token — requires projectId for iOS native builds
   */
  async getPushToken(): Promise<string | null> {
    try {
      const projectId = Constants.expoConfig?.extra?.eas?.projectId;

      if (Platform.OS === 'web') {
        if (!WEB_VAPID_PUBLIC_KEY) return null;
        const { data } = await Notifications.getExpoPushTokenAsync({
          vapidPublicKey: WEB_VAPID_PUBLIC_KEY,
        } as any);
        return data;
      }

      // Native: projectId is REQUIRED for iOS push notifications
      if (!projectId) {
        console.error('[Notifications] Missing projectId in app.json extra.eas.projectId — push tokens will NOT work on iOS');
        // Try anyway (might work in Expo Go)
        try {
          const { data } = await Notifications.getExpoPushTokenAsync();
          return data;
        } catch {
          return null;
        }
      }

      const { data } = await Notifications.getExpoPushTokenAsync({ projectId });
      return data;
    } catch (error) {
      console.error('[Notifications] Failed to get push token:', error);
      return null;
    }
  }

  /**
   * Save push token to user profile
   */
  async savePushToken(token: string): Promise<void> {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) return;

      await supabase
        .from('profiles')
        .update({ push_token: token })
        .eq('id', session.user.id);
    } catch (error) {
      console.error('Failed to save push token:', error);
    }
  }

  /**
   * Schedule local notification
   */
  async scheduleLocalNotification(title: string, body: string, data?: any): Promise<string> {
    const identifier = await Notifications.scheduleNotificationAsync({
      content: {
        title,
        body,
        data: data || {},
        sound: 'default',
      },
      trigger: null, // Show immediately
    });
    return identifier;
  }

  /**
   * Send bet result notification
   */
  async sendBetResultNotification(betTitle: string, status: 'won' | 'lost', profit: number, betId?: string): Promise<void> {
    const title = status === 'won' ? '🎉 Bet Won!' : '😞 Bet Lost';
    const profitText = profit >= 0 ? `+$${profit.toFixed(2)}` : `-$${Math.abs(profit).toFixed(2)}`;
    const body = `Your bet on ${betTitle} was ${status.toUpperCase()}! ${status === 'won' ? 'Profit' : 'Loss'}: ${profitText}`;

    await this.scheduleLocalNotification(title, body, {
      type: 'bet_result',
      betTitle,
      status,
      profit,
      bet_id: betId,
    });
  }

  /**
   * Send a GOAL notification — triggered when polling detects a score change
   */
  async sendGoalNotification(
    match: string,
    homeTeam: string,
    awayTeam: string,
    homeScore: number,
    awayScore: number,
    betId?: string,
  ): Promise<void> {
    const dedupKey = `goal_${match}_${homeScore}_${awayScore}`;
    if (this.recentNotifications.has(dedupKey)) return;
    this.recentNotifications.set(dedupKey, Date.now());

    const title = `⚽ GOL! ${homeTeam} ${homeScore} - ${awayScore} ${awayTeam}`;
    const body = `Punteggio aggiornato per la tua scommessa`;

    await this.scheduleLocalNotification(title, body, {
      type: 'goal',
      match,
      homeScore,
      awayScore,
      bet_id: betId,
    });
  }

  /**
   * Send match-ended notification — triggered when a match finishes
   */
  async sendMatchEndNotification(
    match: string,
    homeScore: number,
    awayScore: number,
    betOutcome: 'won' | 'lost' | 'pending',
    betId?: string,
  ): Promise<void> {
    const dedupKey = `match_end_${match}_${homeScore}_${awayScore}`;
    if (this.recentNotifications.has(dedupKey)) return;
    this.recentNotifications.set(dedupKey, Date.now());

    const emoji = betOutcome === 'won' ? '🎉' : betOutcome === 'lost' ? '😞' : '🏁';
    const title = `${emoji} Partita Finita: ${match}`;
    const outcomeLabel = betOutcome === 'won' ? 'VINTA' : betOutcome === 'lost' ? 'PERSA' : 'In attesa';
    const body = `Risultato finale: ${homeScore}-${awayScore} — Scommessa: ${outcomeLabel}`;

    await this.scheduleLocalNotification(title, body, {
      type: 'match_end',
      match,
      homeScore,
      awayScore,
      betOutcome,
      bet_id: betId,
    });
  }

  /**
   * Template for sending in-play event notifications (Goals, Assists, etc.)
   * This would typically be triggered by your backend receiving a webhook from a sports data provider.
   */
  async sendInPlayEventNotification(eventTitle: string, player: string, action: string, betId?: string): Promise<void> {
    const title = `⚽ In-Play Update: ${action}!`;
    const body = `${player} just recorded a ${action.toLowerCase()} in ${eventTitle}.`;

    await this.scheduleLocalNotification(title, body, {
      type: 'in_play_event',
      eventTitle,
      player,
      action,
      bet_id: betId,
    });
  }

  /**
   * Add notification response listener
   */
  addNotificationResponseListener(callback: (response: Notifications.NotificationResponse) => void) {
    return Notifications.addNotificationResponseReceivedListener(callback);
  }

  /**
   * Add notification received listener
   */
  addNotificationReceivedListener(callback: (notification: Notifications.Notification) => void) {
    return Notifications.addNotificationReceivedListener(callback);
  }

  /**
   * Remove all scheduled notifications
   */
  async clearAllNotifications(): Promise<void> {
    await Notifications.dismissAllNotificationsAsync();
    await Notifications.cancelAllScheduledNotificationsAsync();
  }

  // ── Dedup guard ──
  private recentNotifications = new Map<string, number>();

  /** Clean stale dedup entries (called periodically) */
  private cleanDedup() {
    const fiveMinAgo = Date.now() - 300_000;
    for (const [key, ts] of this.recentNotifications) {
      if (ts < fiveMinAgo) this.recentNotifications.delete(key);
    }
  }

  /** Periodically clean dedup map */
  constructor() {
    setInterval(() => this.cleanDedup(), 60_000);
  }
}

export default new NotificationService();
