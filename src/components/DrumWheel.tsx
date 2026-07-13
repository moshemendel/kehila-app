import React, { useRef, useEffect, useCallback, useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet,
  NativeSyntheticEvent, NativeScrollEvent,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { Colors } from '../utils/theme';

// ── Layout constants (exported so parents can align separator lines) ──────────
export const DRUM_ITEM_H = 44;
export const DRUM_H      = DRUM_ITEM_H * 3;   // 132 — 3 visible rows
export const DRUM_W      = 56;

const REPEAT = 3;

// ── Component ─────────────────────────────────────────────────────────────────

export interface DrumWheelProps {
  values:   number[];
  selected: number;
  onChange: (v: number) => void;
  width?:   number;
}

export const DrumWheel = React.memo(function DrumWheel({
  values, selected, onChange, width = DRUM_W,
}: DrumWheelProps) {
  const vLen     = values.length * REPEAT;
  const midBlock = Math.floor(REPEAT / 2) * values.length;
  const initIdx  = midBlock + Math.max(0, values.indexOf(selected));

  const scrollRef   = useRef<ScrollView>(null);
  const liveIdx     = useRef(initIdx);
  const hasMomentum = useRef(false);
  const [hiIdx, setHiIdx] = useState(initIdx);

  useEffect(() => {
    const t = setTimeout(() => {
      scrollRef.current?.scrollTo({ y: initIdx * DRUM_ITEM_H, animated: false });
    }, 80);
    return () => clearTimeout(t);
  }, []);

  const resolve = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const vi       = Math.max(0, Math.min(vLen - 1,
      Math.round(e.nativeEvent.contentOffset.y / DRUM_ITEM_H)));
    const valueIdx = vi % values.length;
    const newVal   = values[valueIdx];

    liveIdx.current = vi;
    setHiIdx(vi);
    onChange(newVal);
    Haptics.selectionAsync().catch(() => {});

    // Silently jump to center block so the wheel feels infinite
    if (vi < values.length || vi >= (REPEAT - 1) * values.length) {
      const target = midBlock + valueIdx;
      liveIdx.current = target;
      setHiIdx(target);
      setTimeout(() => {
        scrollRef.current?.scrollTo({ y: target * DRUM_ITEM_H, animated: false });
      }, 0);
    }
  }, [values, onChange, midBlock, vLen]);

  return (
    <View style={[dw.wrap, { width }]}>
      <ScrollView
        ref={scrollRef}
        showsVerticalScrollIndicator={false}
        snapToInterval={DRUM_ITEM_H}
        decelerationRate="fast"
        scrollEventThrottle={16}
        nestedScrollEnabled={true}
        onScrollBeginDrag={() => { hasMomentum.current = false; }}
        onMomentumScrollBegin={() => { hasMomentum.current = true; }}
        onScrollEndDrag={(e) => { if (!hasMomentum.current) resolve(e); }}
        onMomentumScrollEnd={resolve}
      >
        {/* Spacer items instead of contentContainerStyle.paddingVertical.
            paddingVertical + snapToInterval is a known Android bug where
            snap offsets don't account for padding → items get stuck.
            Plain View spacers fix this. */}
        <View style={dw.spacer} />
        {Array.from({ length: vLen }, (_, vi) => {
          const v   = values[vi % values.length];
          const sel = vi === hiIdx;
          return (
            <View key={vi} style={dw.item}>
              <Text style={sel ? dw.numSel : dw.num}>
                {v.toString().padStart(2, '0')}
              </Text>
            </View>
          );
        })}
        <View style={dw.spacer} />
      </ScrollView>
    </View>
  );
});

const dw = StyleSheet.create({
  wrap:   { height: DRUM_H, overflow: 'hidden' },
  spacer: { height: DRUM_ITEM_H },
  item:   { height: DRUM_ITEM_H, justifyContent: 'center', alignItems: 'center' },
  num:    { fontSize: 19, color: Colors.textMuted },
  numSel: { fontSize: 28, color: Colors.text, fontWeight: '700' },
});
