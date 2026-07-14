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

// SVG-as-component support (react-native-svg-transformer) — lets icon SVGs be
// imported directly as React components, e.g. `import Logo from './logo.svg'`
// then `<Logo width={24} height={24} fill={Colors.primary} />`, instead of
// bundling them as static image assets.
config.transformer.babelTransformerPath = require.resolve('react-native-svg-transformer');
config.resolver.assetExts = config.resolver.assetExts.filter((ext) => ext !== 'svg');
config.resolver.sourceExts.push('svg');

module.exports = config;
