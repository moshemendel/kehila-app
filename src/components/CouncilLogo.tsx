import React from 'react';
import { Image, StyleSheet, View } from 'react-native';
import { useCityId } from '../hooks/useCityId';
import { useCity } from '../hooks/useCity';

/**
 * The religious council's emblem, taken from the city document, so every
 * tenant shows its own and a city that has not supplied one shows nothing at
 * all — no empty frame, no placeholder. Shown on the home screen (which
 * identifies the app as the council's) and in the headers of the section lists.
 *
 * Sits on a white disc because the emblems are drawn for light backgrounds and
 * the headers are blue.
 */
export default function CouncilLogo({ size = 44 }: { size?: number }) {
  const cityId = useCityId();
  const { city } = useCity(cityId);
  const url = city?.religiousCouncilLogoUrl;
  const [failed, setFailed] = React.useState(false);
  React.useEffect(() => setFailed(false), [url]);
  if (!url || failed) return null;
  return (
    <View style={[st.disc, { width: size, height: size, borderRadius: size / 2 }]}>
      {/* A square image inscribed in a circle must be ~71% of its width or the
          corners poke out; 66% leaves a margin. The emblem itself is a
          transparent PNG, so no white square can show behind it. */}
      <Image
        source={{ uri: url }}
        style={{ width: size * 0.78, height: size * 0.78 }}
        resizeMode="contain"
        onError={() => setFailed(true)}
        accessibilityLabel="סמל המועצה הדתית"
      />
    </View>
  );
}

const st = StyleSheet.create({
  disc: { overflow: 'hidden', backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', marginHorizontal: 10 },
});
