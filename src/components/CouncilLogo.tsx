import React from 'react';
import { Image, StyleSheet, View } from 'react-native';
import { useCityId } from '../hooks/useCityId';
import { useCity } from '../hooks/useCity';
import { LOGO_SCALE_MAX, resolveLogoFrame, resolveLogoScale } from '../utils/cityHeader';

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
  const frame = resolveLogoFrame(city?.religiousCouncilLogoFrame);
  const scale = resolveLogoScale(city?.religiousCouncilLogoScale);
  const [failed, setFailed] = React.useState(false);
  React.useEffect(() => setFailed(false), [url]);
  if (!url || failed) return null;

  // The box is a fixed size whatever the scale, so enlarging the emblem never
  // pushes the header's layout around; an oversized emblem is clipped by it.
  if (frame === 'none') {
    // As-is: for a logo that brings its own background (a JPEG), a white disc
    // behind it would only be a second, mismatched frame.
    return (
      <View style={[st.box, { width: size, height: size, borderRadius: size * 0.14 }]}>
        <Image
          source={{ uri: url }}
          style={{ width: size * scale, height: size * scale }}
          resizeMode="contain"
          onError={() => setFailed(true)}
          accessibilityLabel="סמל המועצה הדתית"
        />
      </View>
    );
  }

  return (
    <View style={[st.disc, { width: size, height: size, borderRadius: size / 2 }]}>
      {/* At 100% the image is 1/1.3 (~77%) of the disc, so the corners of a
          square image sit inside it; at the top of the scale range (130%) it is
          the full box, exactly the size of 100% with no frame — the two modes
          line up on purpose. The emblem itself is a transparent PNG, so no
          white square can show behind it. */}
      <Image
        source={{ uri: url }}
        style={{ width: (size / LOGO_SCALE_MAX) * scale, height: (size / LOGO_SCALE_MAX) * scale }}
        resizeMode="contain"
        onError={() => setFailed(true)}
        accessibilityLabel="סמל המועצה הדתית"
      />
    </View>
  );
}

const st = StyleSheet.create({
  disc: { overflow: 'hidden', backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', marginHorizontal: 10 },
  box:  { overflow: 'hidden', alignItems: 'center', justifyContent: 'center', marginHorizontal: 10 },
});
