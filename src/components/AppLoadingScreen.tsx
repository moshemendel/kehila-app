/**
 * What the app shows while it works out who you are.
 *
 * The native splash (app.json) is navy #1B3A6B with the app icon. This used
 * to hand over to a near-white screen with a small blue spinner, so a cold
 * start read as three disjoint screens — navy, a white flash, then the app.
 * Matching the splash exactly means the handover is invisible: the icon
 * simply stays put while the work finishes, and the whole startup reads as
 * one screen rather than a stall between two.
 *
 * Kept deliberately plain — no animation beyond the fade, nothing that
 * competes for attention. This is a screen nobody should notice.
 */
import React, { useEffect, useRef } from 'react';
import { View, Text, Image, StyleSheet, Animated, ActivityIndicator } from 'react-native';

// Same colour as `expo.splash.backgroundColor` in app.json — if that changes,
// change this too, or the seam becomes visible again.
const SPLASH_NAVY = '#1B3A6B';

export default function AppLoadingScreen() {
  // The spinner only fades in after a beat. When startup is quick — the case
  // we want — it never becomes visible at all, so a fast launch shows a
  // steady logo rather than a spinner that flashes and vanishes.
  const spinnerOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const t = setTimeout(() => {
      Animated.timing(spinnerOpacity, {
        toValue: 1, duration: 400, useNativeDriver: true,
      }).start();
    }, 600);
    return () => clearTimeout(t);
  }, [spinnerOpacity]);

  return (
    <View style={styles.root}>
      <Image
        source={require('../../assets/icon.png')}
        style={styles.icon}
        resizeMode="contain"
      />
      <Text style={styles.title}>קהילה</Text>

      <Animated.View style={[styles.spinnerWrap, { opacity: spinnerOpacity }]}>
        <ActivityIndicator size="small" color="#8FB3E0" />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: SPLASH_NAVY,
  },
  icon: {
    width: 96,
    height: 96,
    borderRadius: 22,
  },
  title: {
    marginTop: 18,
    fontSize: 26,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },
  spinnerWrap: {
    position: 'absolute',
    bottom: 72,
  },
});
