import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Image, Modal, StyleSheet, Text, TouchableOpacity, View, useWindowDimensions,
} from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import { Ionicons } from '@expo/vector-icons';
import type { ImageCrop } from '../types';
import { Colors, Radius, Spacing } from '../utils/theme';
import {
  CROP_ZOOM_MAX, CROP_ZOOM_MIN, MOOD_FRAME_H, clampCenter, clampZoom, cropForImage, displaySize, layoutFor,
} from '../utils/moodCrop';

interface Props {
  visible: boolean;
  uri: string;
  /** The saved crop, if any; used only when it was made for this picture. */
  initial?: ImageCrop;
  /** Height of the frame it will be shown in; 186 for the detail cards, 200 for events. */
  frameHeight?: number;
  onCancel: () => void;
  onSave: (crop: ImageCrop) => void;
}

const MASK = 'rgba(0,0,0,0.62)';
const round3 = (n: number) => Math.round(n * 1000) / 1000;

/**
 * Full-screen editor for how the main picture sits in its frame, like the
 * card-scanning screens: the whole photo fills the screen behind a dimmed mask,
 * and the clear window is the frame exactly as the detail card shows it (same
 * width as the card, same 186 height). Drag to move, pinch or +/- to zoom. The
 * photo always covers the window — nothing can be dragged into emptiness.
 */
export default function MoodCropModal({ visible, uri, initial, frameHeight = MOOD_FRAME_H, onCancel, onSave }: Props) {
  const { width: SW, height: SH } = useWindowDimensions();
  const W = SW - 2 * Spacing.md;           // the detail card's width
  const H = frameHeight;
  const frameLeft = Spacing.md;
  const frameTop = Math.round((SH - H) / 2) - 30;

  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
  const [view, setView] = useState({ zoom: 1, fx: 0.5, fy: 0.5 });

  // The gesture handlers outlive a render, so they read these refs.
  const cur = useRef(view);
  const geo = useRef({ W, H, nw: 0, nh: 0 });
  geo.current = { W, H, nw: natural?.w ?? 0, nh: natural?.h ?? 0 };

  // Load the size and start from the saved crop each time the editor opens.
  useEffect(() => {
    if (!visible) return;
    let alive = true;
    setNatural(null);
    Image.getSize(uri, (w, h) => { if (alive) setNatural({ w, h }); }, () => {});
    const saved = cropForImage(uri, initial, true);
    const start = saved ? { zoom: saved.zoom, fx: saved.fx, fy: saved.fy } : { zoom: 1, fx: 0.5, fy: 0.5 };
    cur.current = start;
    setView(start);
    return () => { alive = false; };
  }, [visible, uri]);

  function apply(zoom: number, fx: number, fy: number) {
    const { W: w, H: h, nw, nh } = geo.current;
    if (!nw) return;
    const z = clampZoom(zoom);
    const { dw, dh } = displaySize(w, h, nw, nh, z);
    const c = clampCenter(w, h, dw, dh, fx, fy);
    const next = { zoom: z, fx: c.fx, fy: c.fy };
    cur.current = next;
    setView(next);
  }

  // Drag + pinch through gesture-handler (already mounted at the app root and
  // again inside this Modal, which on Android is a separate window). Both run on
  // the JS thread: the handlers only touch refs and call apply().
  const gesture = useMemo(() => {
    const base = { fx: 0.5, fy: 0.5, zoom: 1 };
    const pan = Gesture.Pan()
      .runOnJS(true)
      .onStart(() => { base.fx = cur.current.fx; base.fy = cur.current.fy; })
      .onUpdate((e) => {
        const { W: w, H: h, nw, nh } = geo.current;
        if (!nw) return;
        const { dw, dh } = displaySize(w, h, nw, nh, cur.current.zoom);
        apply(cur.current.zoom, base.fx - e.translationX / dw, base.fy - e.translationY / dh);
      });
    const pinch = Gesture.Pinch()
      .runOnJS(true)
      .onStart(() => { base.zoom = cur.current.zoom; })
      .onUpdate((e) => apply(base.zoom * e.scale, cur.current.fx, cur.current.fy));
    return Gesture.Simultaneous(pan, pinch);
  }, []);

  const placed = natural ? layoutFor(W, H, natural.w, natural.h, view.zoom, view.fx, view.fy) : null;
  const step = (delta: number) => apply(cur.current.zoom + delta, cur.current.fx, cur.current.fy);
  const canSave = !!natural;

  return (
    <Modal visible={visible} animationType="fade" onRequestClose={onCancel} statusBarTranslucent>
      <GestureHandlerRootView style={s.root}>
        {/* `direction: 'ltr'` keeps left/top offsets literal in this RTL app. */}
        <GestureDetector gesture={gesture}>
        <View style={[s.root, { direction: 'ltr' }]}>
          {placed && (
            <Image
              source={{ uri }}
              style={{ position: 'absolute', left: frameLeft + placed.left, top: frameTop + placed.top, width: placed.width, height: placed.height }}
              resizeMode="stretch"
            />
          )}

          {/* Dimmed mask with a clear window the size of the frame. */}
          <View pointerEvents="none" style={StyleSheet.absoluteFill}>
            <View style={{ position: 'absolute', left: 0, top: 0, width: SW, height: frameTop, backgroundColor: MASK }} />
            <View style={{ position: 'absolute', left: 0, top: frameTop + H, width: SW, height: SH - frameTop - H, backgroundColor: MASK }} />
            <View style={{ position: 'absolute', left: 0, top: frameTop, width: frameLeft, height: H, backgroundColor: MASK }} />
            <View style={{ position: 'absolute', left: frameLeft + W, top: frameTop, width: SW - frameLeft - W, height: H, backgroundColor: MASK }} />
            <View style={[s.frame, { left: frameLeft, top: frameTop, width: W, height: H }]} />
          </View>
        </View>
        </GestureDetector>

        <View pointerEvents="box-none" style={s.overlay}>
          <Text style={s.title}>התאמת תמונת המצב</Text>
          <Text style={s.hint}>גררו את התמונה והגדילו אותה כדי להתאים אותה למסגרת. זה בדיוק מה שיוצג בכרטיס.</Text>
        </View>

        <View style={s.controls}>
          <View style={s.zoomRow}>
            <TouchableOpacity style={s.roundBtn} onPress={() => step(-0.25)} disabled={view.zoom <= CROP_ZOOM_MIN} accessibilityLabel="הקטנה">
              <Ionicons name="remove" size={22} color="#fff" />
            </TouchableOpacity>
            <Text style={s.zoomTxt}>{Math.round(view.zoom * 100)}%</Text>
            <TouchableOpacity style={s.roundBtn} onPress={() => step(0.25)} disabled={view.zoom >= CROP_ZOOM_MAX} accessibilityLabel="הגדלה">
              <Ionicons name="add" size={22} color="#fff" />
            </TouchableOpacity>
            <TouchableOpacity style={s.resetBtn} onPress={() => apply(1, 0.5, 0.5)}>
              <Text style={s.resetTxt}>איפוס</Text>
            </TouchableOpacity>
          </View>
          <View style={s.actionRow}>
            <TouchableOpacity style={[s.action, s.cancel]} onPress={onCancel}>
              <Text style={s.cancelTxt}>ביטול</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.action, s.save, !canSave && { opacity: 0.5 }]}
              disabled={!canSave}
              onPress={() => onSave({ url: uri, zoom: round3(view.zoom), fx: round3(view.fx), fy: round3(view.fy) })}
            >
              <Text style={s.saveTxt}>שמור</Text>
            </TouchableOpacity>
          </View>
        </View>
      </GestureHandlerRootView>
    </Modal>
  );
}

const s = StyleSheet.create({
  root:     { flex: 1, backgroundColor: '#000' },
  frame:    { position: 'absolute', borderWidth: 2, borderColor: '#fff', borderRadius: Radius.md },
  overlay:  { position: 'absolute', left: 0, right: 0, top: 56, paddingHorizontal: Spacing.lg, alignItems: 'center' },
  title:    { color: '#fff', fontSize: 18, fontWeight: '800' },
  hint:     { color: 'rgba(255,255,255,0.8)', fontSize: 13, textAlign: 'center', marginTop: 6 },
  controls: { position: 'absolute', left: 0, right: 0, bottom: 32, paddingHorizontal: Spacing.lg },
  zoomRow:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 14, marginBottom: 18 },
  roundBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' },
  zoomTxt:  { color: '#fff', fontSize: 15, fontWeight: '700', minWidth: 54, textAlign: 'center' },
  resetBtn: { paddingHorizontal: 14, height: 44, borderRadius: 22, borderWidth: 1, borderColor: 'rgba(255,255,255,0.5)', alignItems: 'center', justifyContent: 'center' },
  resetTxt: { color: '#fff', fontSize: 14, fontWeight: '600' },
  actionRow:{ flexDirection: 'row', gap: 12 },
  action:   { flex: 1, height: 50, borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center' },
  cancel:   { backgroundColor: 'rgba(255,255,255,0.18)' },
  cancelTxt:{ color: '#fff', fontSize: 16, fontWeight: '700' },
  save:     { backgroundColor: Colors.primary },
  saveTxt:  { color: '#fff', fontSize: 16, fontWeight: '800' },
});
