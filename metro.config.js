// Learn more: https://docs.expo.dev/guides/customizing-metro/
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Firebase JS SDK ships its React Native build (with getReactNativePersistence)
// behind the legacy `react-native` package field. Expo SDK 54 enables Metro's
// `unstable_enablePackageExports` by default, which makes `firebase/auth`
// resolve to the browser build (no RN persistence → auth doesn't survive a
// cold restart). Disabling package exports restores field-based resolution so
// the correct RN build is used and sessions persist via AsyncStorage.
config.resolver.unstable_enablePackageExports = false;

// Allow .cjs modules (some Firebase entry points are CommonJS).
config.resolver.sourceExts.push('cjs');

module.exports = config;
