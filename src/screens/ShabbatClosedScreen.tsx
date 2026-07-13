import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import { Colors, Spacing, Radius } from '../utils/theme';

interface Props {
  title: string;            // "שבת שלום" / "סוכות · חג שמח"
  kind?: 'shabbat' | 'yomtov';
  parasha?: string;
  reopenAt?: string;        // "HH:MM"
  /** Provided only in development (__DEV__) — never in production. */
  onDevBypass?: () => void;
}

export default function ShabbatClosedScreen({ title, kind, parasha, reopenAt, onDevBypass }: Props) {
  const reopenWord = kind === 'yomtov' ? 'בצאת החג' : 'בצאת השבת';

  return (
    <LinearGradient
      colors={[Colors.primaryDark, Colors.primary, Colors.primaryLight]}
      style={styles.fill}
    >
      <StatusBar style="light" />

      <View style={styles.center}>
        <Text style={styles.candle}>🕯️</Text>
        <Text style={styles.title}>{title}</Text>
        {!!parasha && <Text style={styles.parasha}>{parasha}</Text>}

        <View style={styles.divider} />

        <Text style={styles.msg}>האפליקציה סגורה בשבת ובחג</Text>
        <Text style={styles.msgSub}>מתוך כבוד לקדושת היום 🤍</Text>

        {!!reopenAt && (
          <View style={styles.reopenBox}>
            <Text style={styles.reopenLabel}>האפליקציה תיפתח מחדש {reopenWord}</Text>
            <Text style={styles.reopenTime}>{reopenAt}</Text>
          </View>
        )}
      </View>

      {!!onDevBypass && (
        <TouchableOpacity style={styles.devBtn} onPress={onDevBypass} activeOpacity={0.7}>
          <Text style={styles.devTxt}>(dev) המשך בכל זאת</Text>
        </TouchableOpacity>
      )}
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  fill:    { flex: 1 },
  center:  { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.xl },

  candle:  { fontSize: 72, marginBottom: Spacing.md },
  title:   { fontSize: 34, fontWeight: '800', color: Colors.white, textAlign: 'center', letterSpacing: 1 },
  parasha: { fontSize: 16, color: 'rgba(255,255,255,0.8)', marginTop: 6, textAlign: 'center' },

  divider: { width: 60, height: 2, backgroundColor: 'rgba(255,255,255,0.35)', borderRadius: 1, marginVertical: Spacing.lg },

  msg:     { fontSize: 18, color: Colors.white, fontWeight: '600', textAlign: 'center' },
  msgSub:  { fontSize: 14, color: 'rgba(255,255,255,0.75)', textAlign: 'center', marginTop: 6 },

  reopenBox:   { marginTop: Spacing.xl, alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: Radius.lg, paddingHorizontal: Spacing.xl, paddingVertical: Spacing.md },
  reopenLabel: { fontSize: 13, color: 'rgba(255,255,255,0.85)' },
  reopenTime:  { fontSize: 30, fontWeight: '800', color: Colors.goldBright, marginTop: 4 },

  devBtn:  { position: 'absolute', bottom: 28, alignSelf: 'center', paddingHorizontal: 16, paddingVertical: 8, borderRadius: Radius.full, borderWidth: 1, borderColor: 'rgba(255,255,255,0.3)' },
  devTxt:  { fontSize: 12, color: 'rgba(255,255,255,0.6)' },
});
