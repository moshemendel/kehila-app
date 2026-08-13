import React, { useState, useEffect, useLayoutEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, Modal, Pressable, Platform, Keyboard,
  Animated, PanResponder, EmitterSubscription,
  StyleProp, ViewStyle, DimensionValue,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, Spacing } from '../utils/theme';

/**
 * Shared bottom-sheet modal: slides up from the bottom, dims the screen behind
 * it, and can be dismissed by tapping the backdrop, the hardware back button,
 * or swiping down on the handle/header.
 *
 * Several details here are load-bearing and were arrived at by debugging real
 * device behaviour — see the comments at each one before changing them.
 *
 * Usage:
 *   <BottomSheetModal visible={open} onClose={close} title="בחר עיר">
 *     ...content...
 *   </BottomSheetModal>
 */
interface Props {
  visible: boolean;
  onClose: () => void;

  /** Centered title rendered inside the draggable header area. */
  title?: string;
  /** Extra header content, also inside the draggable area (below the title). */
  header?: React.ReactNode;
  children: React.ReactNode;

  /** Cap on the sheet's height. Percentages are of the available screen area. */
  maxHeight?: DimensionValue;
  /** Lift the sheet above the on-screen keyboard. Only needed when the sheet
   *  itself contains a focusable TextInput. */
  avoidKeyboard?: boolean;
  /** Opacity of the dimmed backdrop (0–1). */
  dimOpacity?: number;
  /** Whether tapping the dimmed area closes the sheet. */
  closeOnBackdropPress?: boolean;
  /** Enable/disable the swipe-down gesture. */
  swipeEnabled?: boolean;

  /** Extra styles for the white sheet surface (e.g. horizontal padding). */
  sheetStyle?: StyleProp<ViewStyle>;
}

/** Drag distance (px) past which release dismisses, and the fling velocity that
 *  dismisses regardless of distance. */
const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

const DISMISS_DISTANCE = 100;
const DISMISS_VELOCITY = 0.8;
/** Drag distance over which the backdrop fades from fully dim to clear. */
const FADE_DISTANCE = 300;

export default function BottomSheetModal({
  visible, onClose, title, header, children,
  maxHeight = '75%',
  avoidKeyboard = false,
  dimOpacity = 0.4,
  closeOnBackdropPress = true,
  swipeEnabled = true,
  sheetStyle,
}: Props) {
  const insets = useSafeAreaInsets();

  function handleClose() {
    Keyboard.dismiss();
    onClose();
  }

  // ── Keyboard avoidance ──────────────────────────────────────────────────
  // This Modal's window is NOT resized by the keyboard on Android, so a sheet
  // containing a TextInput has to be lifted manually or the keyboard covers it.
  //
  // The offset goes on the OVERLAY as paddingBottom rather than on the sheet as
  // marginBottom: percentage heights resolve against the parent's *content
  // box*, so padding here shrinks the box that the height cap is measured
  // against. The sheet then sits above the keyboard AND stays correctly capped,
  // instead of the two constraints fighting each other.
  const [kbHeight, setKbHeight] = useState(0);
  useEffect(() => {
    if (!avoidKeyboard) return;
    const showEvt = Platform.OS === 'android' ? 'keyboardDidShow' : 'keyboardWillShow';
    const hideEvt = Platform.OS === 'android' ? 'keyboardDidHide' : 'keyboardWillHide';
    const showSub: EmitterSubscription = Keyboard.addListener(showEvt, (e) => setKbHeight(e.endCoordinates?.height ?? 0));
    const hideSub: EmitterSubscription = Keyboard.addListener(hideEvt, () => setKbHeight(0));
    return () => { showSub.remove(); hideSub.remove(); };
  }, [avoidKeyboard]);

  // Keyboard listeners are global, and sheets are often mounted unconditionally
  // alongside a form's other TextInputs — so they see keyboard events that have
  // nothing to do with this sheet. Clear any leftover height on each open, or a
  // stale value pushes the sheet up with no keyboard actually on screen.
  useEffect(() => { if (visible) setKbHeight(0); }, [visible]);

  // ── Swipe-down-to-dismiss ───────────────────────────────────────────────
  const pan = useRef(new Animated.Value(0)).current;

  // Reset before paint (layout effect), not in the close path. Resetting it
  // when closing snapped the sheet back to its resting position while the Modal
  // was still mounted — visible:false is an async state update, so the sheet
  // rendered fully in place for a frame or two before the native dismiss
  // finished, which looked like the sheet "bouncing back" mid-close.
  useLayoutEffect(() => { if (visible) pan.setValue(0); }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      // Only claim clearly-vertical drags, so horizontal swipes and taps on
      // header content still work.
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dy) > 4 && Math.abs(g.dy) > Math.abs(g.dx),
      onPanResponderMove: (_, g) => { if (g.dy > 0) pan.setValue(g.dy); },
      onPanResponderRelease: (_, g) => {
        if (g.dy > DISMISS_DISTANCE || g.vy > DISMISS_VELOCITY) {
          // Close immediately — the same path the hardware back button takes.
          // Animating the sheet down first and closing in the callback ran two
          // sequential animations (ours, then the Modal's own native slide-out)
          // which read as lag compared to the back button.
          handleClose();
        } else {
          Animated.spring(pan, { toValue: 0, useNativeDriver: true, bounciness: 6 }).start();
        }
      },
    })
  ).current;

  // Fade the dim out as the sheet is dragged down. Without this the backdrop
  // stays fully opaque through the drag; on release the sheet — already near
  // the bottom — exits almost at once while the backdrop still has a full
  // screen height of slide left, so the grey visibly lingers after it.
  const backdropOpacity = pan.interpolate({
    inputRange: [0, FADE_DISTANCE],
    outputRange: [1, 0],
    extrapolate: 'clamp',
  });

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={handleClose}
      // Android edge-to-edge (app.json sets edgeToEdgeEnabled) needs BOTH of
      // these, or the modal window miscalculates its bounds and leaves an
      // un-tinted strip at the bottom.
      statusBarTranslucent
      navigationBarTranslucent
    >
      {/* No Pressable wraps the sheet. An ancestor Pressable claims the touch
          responder, so a drag that starts on any non-interactive part of the
          content (a blank calendar cell, empty space beside a label) never
          reaches the ScrollView inside and the content refuses to scroll.
          Tap-to-close lives on the dim layer instead, which sits BEHIND the
          sheet — so it only ever receives taps outside it. */}
      <View style={[s.overlay, { paddingBottom: kbHeight }]}>
        <AnimatedPressable
          onPress={closeOnBackdropPress ? handleClose : undefined}
          disabled={!closeOnBackdropPress}
          style={[s.backdrop, { backgroundColor: `rgba(0,0,0,${dimOpacity})`, opacity: backdropOpacity }]}
        />

        {/* The height cap lives on this wrapper, NOT on the sheet. A percentage
            height resolves against the parent, so capping the sheet instead
            would let this wrapper size to the sheet's uncapped content height
            and the sheet would then take that percentage of *itself* — leaving
            the remainder as an empty gap below the sheet. */}
        <Animated.View style={[{ maxHeight }, { transform: [{ translateY: pan }] }]}>
          <View
            style={[
              s.sheet,
              { paddingBottom: kbHeight > 0 ? 8 : insets.bottom + 8 },
              sheetStyle,
            ]}
          >
            {/* Gesture is attached to the header only — never the whole sheet,
                which would fight scroll views and inputs in the content. */}
            <View {...(swipeEnabled ? panResponder.panHandlers : {})}>
              <View style={s.handle} />
              {!!title && <Text style={s.title}>{title}</Text>}
              {header}
            </View>

            {children}
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  // Transparent — the dim lives in `backdrop` so it can fade independently.
  overlay:  { flex: 1, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFillObject },
  sheet: {
    backgroundColor: Colors.cardBackground,
    borderTopLeftRadius: 20, borderTopRightRadius: 20,
    flexShrink: 1, paddingTop: 12,
  },
  handle: { width: 36, height: 4, borderRadius: 2, backgroundColor: Colors.border, alignSelf: 'center', marginBottom: 12 },
  title:  { fontSize: 17, fontWeight: '800', color: Colors.text, textAlign: 'center', marginBottom: 12, paddingHorizontal: Spacing.lg },
});
