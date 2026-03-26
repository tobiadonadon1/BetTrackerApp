import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { createNavigationContainerRef } from '@react-navigation/native';
import { supabase } from '../config/supabase';

export const navigationRef = createNavigationContainerRef<any>();
const WEB_VAPID_PUBLIC_KEY = (process.env.EXPO_PUBLIC_VAPID_PUBLIC_KEY || '').trim();

class NotificationService {
  /**
   * Initialize notifications
   */
  async initialize(): Promise<boolean> {
    try {
      if (Platform.OS === 'web' && !WEB_VAPID_PUBLIC_KEY) {
        return false;
      }

      // Request permissions
      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;

      if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }

      if (finalStatus !== 'granted') {
        console.log('Notification permissions not granted');
        return false;
      }

      // Get push token
      const token = await this.getPushToken();
      if (token) {
        await this.savePushToken(token);
      }

      // Set notification handler
      Notifications.setNotificationHandler({
        handleNotification: async () => ({
          shouldShowAlert: true,
          shouldPlaySound: true,
          shouldSetBadge: true,
          shouldShowBanner: true,
          shouldShowList: true,
        }),
      });

      return true;
    } catch (error) {
      console.error('Failed to initialize notifications:', error);
      return false;
    }
  }

  /**
   * Get Expo push token
   */
  async getPushToken(): Promise<string | null> {
    try {
      const options = Platform.OS === 'web' && WEB_VAPID_PUBLIC_KEY
        ? { vapidPublicKey: WEB_VAPID_PUBLIC_KEY }
        : undefined;
      const { data } = await Notifications.getExpoPushTokenAsync(options as any);
      return data;
    } catch (error) {
      console.error('Failed to get push token:', error);
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
}

export default new NotificationService();
