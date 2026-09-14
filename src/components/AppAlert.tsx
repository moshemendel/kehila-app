import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, TextInput, StyleSheet, TouchableOpacity } from 'react-native';
import BottomSheetModal from './BottomSheetModal';
import { Colors, Spacing, Radius } from '../utils/theme';

/**
 * Drop-in-shaped replacement for React Native's own `Alert` — same call
 * surface (`alert(title, message, buttons)`, `prompt(title, message, cb, …)`)
 * — so every one of the ~180 existing call sites needed only an import swap,
 * never a rewrite. The native dialog it replaces looks like the OS; this one
 * renders as a BottomSheetModal, the same shell every custom modal in this
 * app already uses (GuestInfoModal, LocationEditModal, the picker sheets…),
 * so a "✓ פורסם" success message now looks like it belongs to this app
 * rather than to Android.
 *
 * Imperative by design, not a hook: Alert.alert is called from deep inside
 * event handlers, promise chains and catch blocks — most of which are not
 * component bodies, so a hook's `alert()` would not be callable from them.
 * `enqueue` is a module-level ref set once when <AppAlertHost/> mounts near
 * the app root (see App.tsx) — the same pattern navigationRef already uses
 * in this codebase for the identical reason (calling into React from
 * outside a component).
 *
 * Usage: `import { AppAlert as Alert } from '.../AppAlert'` — the alias
 * keeps every existing `Alert.alert(...)` / `Alert.prompt(...)` call site
 * unchanged; only the import line differs from `from 'react-native'`.
 */

export interface AppAlertButton {
  text: string;
  onPress?: () => void;
  /** default: filled primary. destructive: filled danger red. cancel: outlined, neutral. */
  style?: 'default' | 'destructive' | 'cancel';
}

type PendingAlert = {
  kind: 'alert';
  title: string;
  message?: string;
  buttons: AppAlertButton[];
};
type PendingPrompt = {
  kind: 'prompt';
  title: string;
  message?: string;
  defaultValue: string;
  secure: boolean;
  onSubmit: (text: string) => void;
};
type Pending = PendingAlert | PendingPrompt;

let enqueue: ((p: Pending) => void) | null = null;

export const AppAlert = {
  /** Matches RN Alert.alert(title, message?, buttons?) — options (e.g.
   *  `cancelable`) are accepted for signature compatibility but unused: every
   *  existing call site here dismisses on backdrop tap regardless, same as
   *  RN's own Android default. */
  alert(title: string, message?: string, buttons?: AppAlertButton[]) {
    if (!enqueue) { console.warn('[AppAlert] alert() before AppAlertHost mounted:', title); return; }
    enqueue({ kind: 'alert', title, message, buttons: buttons?.length ? buttons : [{ text: 'אישור' }] });
  },
  /** Matches RN Alert.prompt(title, message?, onSubmit, type?, defaultValue?).
   *  `onSubmit` may also be RN's button-array form; only the plain-callback
   *  form is used anywhere in this codebase today, so that is all this
   *  supports — passing an array throws rather than silently doing nothing. */
  prompt(
    title: string,
    message: string | undefined,
    onSubmit: (text: string) => void,
    type: 'plain-text' | 'secure-text' | 'login-password' | 'default' = 'plain-text',
    defaultValue = '',
  ) {
    if (typeof onSubmit !== 'function') {
      throw new Error('[AppAlert] prompt() only supports the callback form, not the RN button-array form');
    }
    if (!enqueue) { console.warn('[AppAlert] prompt() before AppAlertHost mounted:', title); return; }
    enqueue({ kind: 'prompt', title, message, defaultValue, secure: type === 'secure-text', onSubmit });
  },
};

/** How long BottomSheetModal's own slide-out takes. Content is kept on screen
 *  for this long after a dismissal before advancing to the next queued item
 *  (or clearing) — otherwise the title/buttons would go blank mid-animation,
 *  since React re-renders BottomSheetModal's children immediately on state
 *  change, independent of the native close animation still playing out. */
const CLOSE_ANIM_MS = 300;

export function AppAlertHost() {
  const queueRef = useRef<Pending[]>([]);
  const [current, setCurrent] = useState<Pending | null>(null);
  const [visible, setVisible] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    enqueue = (p) => {
      queueRef.current.push(p);
      setCurrent((c) => {
        if (c) return c; // already showing something; it'll be picked up on dismiss
        setVisible(true);
        return queueRef.current.shift() ?? null;
      });
    };
    return () => {
      enqueue = null;
      if (closeTimer.current) clearTimeout(closeTimer.current);
    };
  }, []);

  useEffect(() => {
    setInputValue(current?.kind === 'prompt' ? current.defaultValue : '');
  }, [current]);

  const advance = useCallback(() => {
    const next = queueRef.current.shift() ?? null;
    setCurrent(next);
    setVisible(!!next);
  }, []);

  const dismiss = useCallback(() => {
    setVisible(false);
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(advance, CLOSE_ANIM_MS);
  }, [advance]);

  const pressButton = (btn: AppAlertButton) => {
    dismiss();
    btn.onPress?.();
  };
  const submitPrompt = () => {
    if (current?.kind !== 'prompt') return;
    const { onSubmit } = current;
    const value = inputValue;
    dismiss();
    onSubmit(value);
  };

  return (
    <BottomSheetModal visible={visible} onClose={dismiss} title={current?.title} maxHeight="60%" sheetStyle={s.sheetPad}>
      {current && (
        <View>
          {!!current.message && <Text style={s.message}>{current.message}</Text>}

          {current.kind === 'prompt' ? (
            <>
              <TextInput
                value={inputValue}
                onChangeText={setInputValue}
                style={s.input}
                textAlign="right"
                secureTextEntry={current.secure}
                autoFocus
                onSubmitEditing={submitPrompt}
              />
              <View style={s.buttonRow}>
                <AlertButtonView style="default" text="אישור" onPress={submitPrompt} />
                <AlertButtonView style="cancel" text="ביטול" onPress={dismiss} />
              </View>
            </>
          ) : (
            <View style={current.buttons.length > 2 ? s.buttonColumn : s.buttonRow}>
              {current.buttons.map((btn, i) => (
                <AlertButtonView key={i} style={btn.style ?? 'default'} text={btn.text} onPress={() => pressButton(btn)} />
              ))}
            </View>
          )}
        </View>
      )}
    </BottomSheetModal>
  );
}

function AlertButtonView({ style, text, onPress }: { style: NonNullable<AppAlertButton['style']>; text: string; onPress: () => void }) {
  return (
    <TouchableOpacity
      style={[s.button, style === 'destructive' ? s.destructiveButton : style === 'cancel' ? s.cancelButton : s.primaryButton]}
      onPress={onPress}
      activeOpacity={0.75}
    >
      <Text style={style === 'cancel' ? s.cancelButtonText : s.filledButtonText}>{text}</Text>
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  // BottomSheetModal's `title` gets its own paddingHorizontal, but the sheet
  // itself carries none — every other consumer supplies it via `sheetStyle`
  // (see e.g. NavigationAppSheet, LocationEditModal). This was the one that
  // didn't: the title sat properly inset while the message and buttons ran
  // edge to edge into the sheet's rounded corners.
  sheetPad: { paddingHorizontal: Spacing.lg },
  message: { fontSize: 14, color: Colors.textSecondary, textAlign: 'center', lineHeight: 20, marginBottom: Spacing.md },
  input: {
    borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.sm,
    paddingHorizontal: 14, paddingVertical: 10, fontSize: 15, color: Colors.text,
    marginBottom: Spacing.md, textAlign: 'right',
  },
  buttonRow: { flexDirection: 'row', gap: 10 },
  buttonColumn: { flexDirection: 'column', gap: 10 },
  button: { flex: 1, borderRadius: Radius.sm, paddingVertical: 13, alignItems: 'center' },
  primaryButton: { backgroundColor: Colors.primary },
  destructiveButton: { backgroundColor: Colors.danger },
  cancelButton: { backgroundColor: Colors.background, borderWidth: 1, borderColor: Colors.border },
  filledButtonText: { color: Colors.white, fontSize: 15, fontWeight: '700' },
  cancelButtonText: { color: Colors.text, fontSize: 15, fontWeight: '600' },
});
