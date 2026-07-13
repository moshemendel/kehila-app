import React, { Component, ReactNode, useEffect } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, I18nManager, LogBox } from 'react-native';

// TimerPicker uses FlatList internally; suppress the nested-scroll warning
LogBox.ignoreLogs(['VirtualizedLists should never be nested']);
import * as Notifications from 'expo-notifications';
import { AuthProvider } from './src/context/AuthContext';
import { ZmanimSettingsProvider } from './src/context/ZmanimSettingsContext';
import { NotificationsProvider } from './src/context/NotificationsContext';
import { FavoritesProvider } from './src/context/FavoritesContext';
import { KashrutUpdatesProvider } from './src/context/KashrutUpdatesContext';
import { EventsProvider } from './src/context/EventsContext';
import RootNavigator from './src/navigation/RootNavigator';
import { navigationRef, navigateFromNotification } from './src/navigation/navigationRef';

I18nManager.forceRTL(true);

// ── Error boundary — shows the real exception instead of the Expo crash screen ──
interface EBState { error: Error | null }
class ErrorBoundary extends Component<{ children: ReactNode }, EBState> {
  state: EBState = { error: null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <View style={eb.container}>
        <Text style={eb.title}>💥 Runtime Error</Text>
        <Text style={eb.msg}>{error.message}</Text>
        <ScrollView style={eb.scroll}>
          <Text style={eb.stack}>{error.stack}</Text>
        </ScrollView>
        <TouchableOpacity style={eb.btn} onPress={() => this.setState({ error: null })}>
          <Text style={eb.btnText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }
}
const eb = StyleSheet.create({
  container: { flex: 1, padding: 24, paddingTop: 60, backgroundColor: '#1a1a2e' },
  title: { fontSize: 20, fontWeight: '800', color: '#ff6b6b', marginBottom: 12 },
  msg: { fontSize: 15, color: '#ffd93d', marginBottom: 16, lineHeight: 22 },
  scroll: { flex: 1, backgroundColor: '#16213e', borderRadius: 8, padding: 12 },
  stack: { fontSize: 11, color: '#aaa', lineHeight: 18 },
  btn: { marginTop: 16, backgroundColor: '#e94560', borderRadius: 8, padding: 14, alignItems: 'center' },
  btnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
});

type NotifData = { screen?: string; params?: Record<string, unknown> };

function handleNotifResponse(response: Notifications.NotificationResponse) {
  const data = response.notification.request.content.data as NotifData;
  if (data?.screen) navigateFromNotification(data.screen, data.params);
}

export default function App() {
  // Listen for notification taps while app is running (foreground / background)
  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener(handleNotifResponse);
    return () => sub.remove();
  }, []);

  return (
    <ErrorBoundary>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <SafeAreaProvider>
          <AuthProvider>
            <ZmanimSettingsProvider>
              <NotificationsProvider>
                <FavoritesProvider>
                  <KashrutUpdatesProvider>
                    <EventsProvider>
                      <NavigationContainer
                        ref={navigationRef}
                        onReady={() => {
                          // Handle tap that launched the app from a closed state
                          Notifications.getLastNotificationResponseAsync().then(response => {
                            if (response) handleNotifResponse(response);
                          });
                        }}
                      >
                        <StatusBar style="light" />
                        <RootNavigator />
                      </NavigationContainer>
                    </EventsProvider>
                  </KashrutUpdatesProvider>
                </FavoritesProvider>
              </NotificationsProvider>
            </ZmanimSettingsProvider>
          </AuthProvider>
        </SafeAreaProvider>
      </GestureHandlerRootView>
    </ErrorBoundary>
  );
}
