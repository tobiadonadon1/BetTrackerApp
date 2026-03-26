import React, { useState } from 'react';
import { View, ActivityIndicator, Text, Platform } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createStackNavigator } from '@react-navigation/stack';
import { Ionicons } from '@expo/vector-icons';
import * as Notifications from 'expo-notifications';
import { colors } from './src/constants/colors';
import { useNotifications, useAuth, BetsProvider } from './src/hooks';
import { navigationRef } from './src/services/notificationService';

// Screens
import LoginScreen from './src/screens/LoginScreen';
import HomeScreen from './src/screens/HomeScreen';
import AddBetScreen from './src/screens/AddBetScreen';
import StatsScreen from './src/screens/StatsScreen';
import CommunityScreen from './src/screens/CommunityScreen';
import SettingsScreen from './src/screens/SettingsScreen';
import BetDetailScreen from './src/screens/BetDetailScreen';
import ScanTicketScreen from './src/screens/ScanTicketScreen';
import AddChoiceModal from './src/components/AddChoiceModal';

import { LanguageProvider, useTranslation } from './src/contexts/LanguageContext';
import { AuthProvider } from './src/contexts/AuthContext';

if (Platform.OS !== 'web') {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
}

const Stack = createStackNavigator();
const Tab = createBottomTabNavigator();

function MainTabs({ navigation }: { navigation: any }) {
  const [modalVisible, setModalVisible] = useState(false);
  const { t } = useTranslation();

  return (
    <>
      <Tab.Navigator
        screenOptions={({ route }) => ({
          tabBarIcon: ({ focused, color, size }) => {
            let iconName: keyof typeof Ionicons.glyphMap;
            if (route.name === 'Home') iconName = focused ? 'home' : 'home-outline';
            else if (route.name === 'Community') iconName = focused ? 'people' : 'people-outline';
            else if (route.name === 'Add') iconName = 'add-circle';
            else if (route.name === 'Stats') iconName = focused ? 'stats-chart' : 'stats-chart-outline';
            else if (route.name === 'Settings') iconName = focused ? 'settings' : 'settings-outline';
            else iconName = 'help-circle';
            return <Ionicons name={iconName} size={size} color={color} />;
          },
          tabBarActiveTintColor: colors.accent,
          tabBarInactiveTintColor: colors.textMuted,
          tabBarStyle: { backgroundColor: colors.background, borderTopWidth: 1, borderTopColor: colors.border, paddingBottom: 8, paddingTop: 8, height: 70 },
          headerShown: false,
        })}
      >
        <Tab.Screen name="Home" component={HomeScreen} options={{ tabBarLabel: t('home') }} />
        <Tab.Screen name="Community" component={CommunityScreen} options={{ tabBarLabel: t('community') }} />
        <Tab.Screen 
          name="Add" 
          component={View} 
          options={{ title: t('add'), tabBarLabel: t('add') }}
          listeners={{
            tabPress: (e) => {
              e.preventDefault();
              setModalVisible(true);
            },
          }}
        />
        <Tab.Screen name="Stats" component={StatsScreen} options={{ tabBarLabel: t('stats') }} />
        <Tab.Screen name="Settings" component={SettingsScreen} options={{ tabBarLabel: t('settings') }} />
      </Tab.Navigator>

      <AddChoiceModal
        visible={modalVisible}
        onClose={() => setModalVisible(false)}
        onScan={() => navigation.navigate('ScanTicket', { mode: 'camera' })}
        onManual={() => navigation.navigate('AddBet')}
        onGallery={() => navigation.navigate('ScanTicket', { mode: 'gallery' })}
      />
    </>
  );
}

function AppContent() {
  const { user, loading } = useAuth();
  
  // Initialize notifications when logged in
  useNotifications();

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color={colors.accent} />
        <Text style={{ color: colors.textSecondary, marginTop: 12, fontSize: 14 }}>Loading...</Text>
      </View>
    );
  }

  return (
    <NavigationContainer ref={navigationRef}>
      <Stack.Navigator key={user ? 'app' : 'auth'} screenOptions={{ headerShown: false }}>
        {user ? (
          <>
            <Stack.Screen name="MainTabs">
              {(props) => <MainTabs {...props} />}
            </Stack.Screen>
            <Stack.Screen name="BetDetail" component={BetDetailScreen} />
            <Stack.Screen name="ScanTicket" component={ScanTicketScreen} />
            <Stack.Screen name="AddBet" component={AddBetScreen} />
          </>
        ) : (
          <Stack.Screen name="Login" component={LoginScreen} />
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}

export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <LanguageProvider>
        <AuthProvider>
          <BetsProvider>
            <SafeAreaProvider>
              <AppContent />
            </SafeAreaProvider>
          </BetsProvider>
        </AuthProvider>
      </LanguageProvider>
    </GestureHandlerRootView>
  );
}
