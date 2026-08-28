/**
 * What the app shows while it works out who you are.
 *
 * The native splash (app.json) is navy #1B3A6B with the app icon. This used
 * to hand over to a near-white screen with a small blue spinner, so a cold
 * start read as three disjoint screens — navy, a white flash, then the app.
 * Matching the splash exactly means the handover is invisible: the icon
 * simply stays put while the work finishes, and the whole startup reads as
 * one screen rather than a stall between two.
 */
import React, { useEffect, useRef, useState } from 'react';
import { View, Text, Image, StyleSheet, Animated, ActivityIndicator, Easing } from 'react-native';

// Same colour as `expo.splash.backgroundColor` in app.json — if that changes,
// change this too, or the seam becomes visible again.
const SPLASH_NAVY = '#1B3A6B';

/**
 * How long the splash stays up at minimum. This is a FLOOR, not a delay: a
 * slow start is never made slower, only a fast one is stopped from flashing.
 *
 * Deliberately not the "2–3 seconds" a splash is often given. This is a
 * utility app — people open it to see when mincha is — and seconds of
 * enforced waiting on every launch is a real cost paid every single time,
 * against a polish benefit paid once. Just under a second is long enough to
 * read as a deliberate opening rather than a stutter.
 */
const MIN_VISIBLE_MS = 900;

/**
 * True while the splash should stay on screen: either the app is still
 * loading, or it finished so fast that hiding now would be a flash.
 */
export function useSplashHold(stillLoading: boolean): boolean {
  const [minElapsed, setMinElapsed] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setMinElapsed(true), MIN_VISIBLE_MS);
    return () => clearTimeout(t);
  }, []);
  return stillLoading || !minElapsed;
}

export default function AppLoadingScreen() {
  // The logo settles in rather than appearing hard, so the handover from the
  // native splash reads as one continuous motion.
  const entrance = useRef(new Animated.Value(0)).current;

  // The spinner only fades in after a beat. When startup is quick — the case
  // we want — it never becomes visible at all, so a fast launch shows a
  // steady logo rather than a spinner that flashes and vanishes.
  const spinnerOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(entrance, {
      toValue: 1,
      duration: 520,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();

    const t = setTimeout(() => {
      Animated.timing(spinnerOpacity, {
        toValue: 1, duration: 400, useNativeDriver: true,
      }).start();
    }, 700);
    return () => clearTimeout(t);
  }, [entrance, spinnerOpacity]);

  const logoStyle = {
    opacity: entrance,
    transform: [{
      scale: entrance.interpolate({ inputRange: [0, 1], outputRange: [0.92, 1] }),
    }],
  };

  return (
    <View style={styles.root}>
      <Animated.View style={[styles.logoBlock, logoStyle]}>
        <Text style={styles.title}>Kehila</Text>
        <Image
          source={require('../../assets/icon.png')}
          style={styles.icon}
          resizeMode="contain"
        />
        <Text style={styles.title}>קהילה</Text>
      </Animated.View>

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
  logoBlock: { alignItems: 'center' },
  icon: {
    width: 120,
    height: 120,
    borderRadius: 22,
  },
  title: {
    marginTop: 6,
    marginBottom: 6,
    fontSize: 32,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },
  spinnerWrap: {
    position: 'absolute',
    bottom: 72,
  },
});
