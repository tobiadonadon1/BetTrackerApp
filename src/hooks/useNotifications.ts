import { useEffect, useCallback, useRef } from 'react';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import notificationService from '../services/notificationService';
import { useAuth } from './useAuth';
import { navigationRef } from '../services/notificationService';

function requestWebNotificationPermission() {
  if (Platform.OS !== 'web') return;
  if (typeof window === 'undefined' || !('Notification' in window)) return;
  if (Notification.permission === 'default') {
    Notification.requestPermission();
  }
}

function showWebNotification(title: string, body: string) {
  if (Platform.OS !== 'web') return;
  if (typeof window === 'undefined' || !('Notification' in window)) return;
  if (Notification.permission !== 'granted') return;
  try { new Notification(title, { body, icon: '/assets/new_logo.png' }); } catch { /* ignore */ }
}

export function useNotifications() {
  const { user } = useAuth();
  const initializedRef = useRef(false);

  useEffect(() => {
    if (!user) return;
    if (initializedRef.current) return;
    initializedRef.current = true;

    if (Platform.OS === 'web') {
      requestWebNotificationPermission();
      return;
    }

    notificationService.initialize();

    const responseListener = notificationService.addNotificationResponseListener((response) => {
      const data = response.notification.request.content.data;
      if ((data.type === 'bet_result' || data.type === 'in_play_event') && data.bet_id) {
        if (navigationRef.isReady()) {
          navigationRef.navigate('BetDetail', { betId: data.bet_id });
        }
      }
    });

    const receivedListener = notificationService.addNotificationReceivedListener(() => {});

    return () => {
      responseListener.remove();
      receivedListener.remove();
      initializedRef.current = false;
    };
  }, [user]);

  const sendBetResultNotification = useCallback(async (betTitle: string, status: 'won' | 'lost', profit: number) => {
    if (Platform.OS === 'web') {
      const emoji = status === 'won' ? '🎉' : '😞';
      const profitText = profit >= 0 ? `+$${profit.toFixed(2)}` : `-$${Math.abs(profit).toFixed(2)}`;
      showWebNotification(
        `${emoji} Bet ${status === 'won' ? 'Won' : 'Lost'}!`,
        `${betTitle} — ${profitText}`,
      );
      return;
    }
    await notificationService.sendBetResultNotification(betTitle, status, profit);
  }, []);

  return {
    sendBetResultNotification,
  };
}
