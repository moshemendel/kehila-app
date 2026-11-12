import React, { useEffect, useState } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import type { ImageCrop } from '../types';
import { cropForImage, layoutFor } from '../utils/moodCrop';

/**
 * The main picture of a detail card, filling its parent (which supplies the
 * height and clips). Without a crop it is plain "cover", exactly as before; with
 * one it is drawn at the zoom and centre the manager chose, and the frame is
 * always fully covered (see utils/moodCrop.ts).
 */
export default function MoodImage({ uri, crop, legacyFit = 'cover' }: {
  uri: string;
  crop?: ImageCrop;
  /** How the picture shows when it has no crop. Businesses used to show it whole
   *  ('contain'); a saved crop (even the default) turns it into a framed crop. */
  legacyFit?: 'cover' | 'contain';
}) {
  const [frame, setFrame] = useState<{ w: number; h: number } | null>(null);
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
  const active = cropForImage(uri, crop, legacyFit === 'contain');

  useEffect(() => {
    if (!active) return;
    let alive = true;
    setNatural(null);
    Image.getSize(uri, (w, h) => { if (alive) setNatural({ w, h }); }, () => {});
    return () => { alive = false; };
  }, [uri, !!active]);

  const placed = active && frame && natural
    ? layoutFor(frame.w, frame.h, natural.w, natural.h, active.zoom, active.fx, active.fy)
    : null;

  return (
    <View
      // `direction: 'ltr'`: this app forces RTL, which would otherwise mirror the
      // literal left offset the crop is drawn at.
      style={[StyleSheet.absoluteFillObject, { direction: 'ltr' }]}
      onLayout={(e) => setFrame({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}
    >
      {placed ? (
        <Image
          source={{ uri }}
          style={{ position: 'absolute', left: placed.left, top: placed.top, width: placed.width, height: placed.height }}
          resizeMode="stretch"
        />
      ) : (
        <Image source={{ uri }} style={StyleSheet.absoluteFillObject} resizeMode={legacyFit} />
      )}
    </View>
  );
}
