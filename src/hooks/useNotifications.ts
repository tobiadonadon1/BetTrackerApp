import { useEffect, useCallback } from 'react';
import * as Notifications from 'expo-notifications';
import notificationService from '../services/notificationService';
import { useAuth } from './useAuth';

import { navigationRef } from '../services/notificationService';

export function useNotifications() {
  const { user } = useAuth();

  useEffect(() => {
    if (!user) return;

    // Initialize notifications when user logs in
    notificationService.initialize();

    // Listen for notification responses (when user taps notification)
    const responseListener = notificationService.addNotificationResponseListener((response) => {
      const data = response.notification.request.content.data;
      
      // Handle bet result or in-play event notification tap
      if ((data.type === 'bet_result' || data.type === 'in_play_event') && data.bet_id) {
        console.log('User tapped bet notification:', data);
        if (navigationRef.isReady()) {
          navigationRef.navigate('BetDetail', { betId: data.bet_id });
        }
      }
    });

    // Listen for received notifications (while app is foreground)
    const receivedListener = notificationService.addNotificationReceivedListener((notification) => {
      console.log('Notification received:', notification);
    });

    return () => {
      responseListener.remove();
      receivedListener.remove();
    };
  }, [user]);

  const sendBetResultNotification = useCallback(async (betTitle: string, status: 'won' | 'lost', profit: number) => {
    await notificationService.sendBetResultNotification(betTitle, status, profit);
  }, []);

  return {
    sendBetResultNotification,
  };
}
