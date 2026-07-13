/**
 * ImagePickerField
 *
 * A self-contained field that lets a manager either:
 *   (a) type / paste a remote URL, or
 *   (b) pick an image from the device gallery and upload it to Firebase Storage.
 *
 * Props:
 *   value        – current URL (may be undefined / empty)
 *   onChange     – called with the new URL once the image is ready
 *   storagePath  – Firebase Storage destination prefix,
 *                  e.g. "restaurants/abc123/gallery"
 *   label        – human-readable label shown above the field
 *   aspectRatio  – [w, h] passed to ImagePicker (default [4, 3])
 */

import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  Image, StyleSheet, ActivityIndicator, Alert,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, Radius } from '../utils/theme';
import { uploadImage } from '../utils/uploadImage';

interface Props {
  value:       string | undefined;
  onChange:    (url: string) => void;
  storagePath: string;          // e.g. "restaurants/abc/gallery"
  label:       string;
  aspectRatio?: [number, number];
}

type Mode = 'url' | 'upload';

export default function ImagePickerField({
  value,
  onChange,
  storagePath,
  label,
  aspectRatio = [4, 3],
}: Props) {
  const [mode,     setMode]     = useState<Mode>('url');
  const [urlDraft, setUrlDraft] = useState(value ?? '');
  const [progress, setProgress] = useState<number | null>(null); // null = idle

  // ── URL mode ────────────────────────────────────────────────────────────────
  function commitUrl() {
    const trimmed = urlDraft.trim();
    if (trimmed) onChange(trimmed);
  }

  // ── Upload mode ─────────────────────────────────────────────────────────────
  async function pickAndUpload() {
    // Request permission
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('הרשאת גלריה', 'כדי להעלות תמונה יש לאפשר גישה לגלריה בהגדרות המכשיר.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: aspectRatio,
      quality: 0.82,
    });

    if (result.canceled || !result.assets?.[0]) return;

    const asset     = result.assets[0];
    const ext       = asset.uri.split('.').pop() ?? 'jpg';
    const filename  = `${Date.now()}.${ext}`;
    const path      = `${storagePath}/${filename}`;

    try {
      setProgress(0);
      const downloadUrl = await uploadImage(asset.uri, path, (pct) => setProgress(pct));
      onChange(downloadUrl);
      setUrlDraft(downloadUrl);
    } catch (e: any) {
      Alert.alert('שגיאת העלאה', e.message ?? 'אנא נסה שוב');
    } finally {
      setProgress(null);
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────────
  const effectiveUrl = value?.trim();

  return (
    <View style={styles.wrapper}>
      <Text style={styles.label}>{label}</Text>

      {/* Current image preview */}
      {effectiveUrl ? (
        <View style={styles.previewBox}>
          <Image source={{ uri: effectiveUrl }} style={styles.preview} resizeMode="cover" />
          <TouchableOpacity
            style={styles.removeBtn}
            onPress={() => { onChange(''); setUrlDraft(''); }}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="close-circle" size={22} color="#fff" />
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.placeholder}>
          <Ionicons name="image-outline" size={36} color={Colors.textMuted} />
          <Text style={styles.placeholderTxt}>אין תמונה</Text>
        </View>
      )}

      {/* Mode toggle */}
      <View style={styles.toggleRow}>
        {(['url', 'upload'] as Mode[]).map((m) => (
          <TouchableOpacity
            key={m}
            style={[styles.toggleBtn, mode === m && styles.toggleBtnActive]}
            onPress={() => setMode(m)}
          >
            <Ionicons
              name={m === 'url' ? 'link-outline' : 'cloud-upload-outline'}
              size={14}
              color={mode === m ? Colors.primary : Colors.textSecondary}
            />
            <Text style={[styles.toggleTxt, mode === m && styles.toggleTxtActive]}>
              {m === 'url' ? 'כתובת URL' : 'העלאת תמונה'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* URL input */}
      {mode === 'url' && (
        <View style={styles.urlRow}>
          <TextInput scrollEnabled={false}
            style={styles.urlInput}
            value={urlDraft}
            onChangeText={setUrlDraft}
            placeholder="https://example.com/image.jpg"
            placeholderTextColor={Colors.textMuted}
            autoCapitalize="none"
            keyboardType="url"
            returnKeyType="done"
            onSubmitEditing={commitUrl}
            textAlign="left"
          />
          <TouchableOpacity
            style={[styles.urlApplyBtn, !urlDraft.trim() && { opacity: 0.4 }]}
            onPress={commitUrl}
            disabled={!urlDraft.trim()}
          >
            <Ionicons name="checkmark" size={16} color="#fff" />
          </TouchableOpacity>
        </View>
      )}

      {/* Upload button */}
      {mode === 'upload' && (
        <TouchableOpacity
          style={[styles.uploadBtn, progress !== null && { opacity: 0.7 }]}
          onPress={pickAndUpload}
          disabled={progress !== null}
          activeOpacity={0.75}
        >
          {progress !== null ? (
            <>
              <ActivityIndicator size="small" color={Colors.primary} />
              <Text style={styles.uploadTxt}>מעלה… {progress}%</Text>
            </>
          ) : (
            <>
              <Ionicons name="cloud-upload-outline" size={18} color={Colors.primary} />
              <Text style={styles.uploadTxt}>בחר מהגלריה והעלה</Text>
            </>
          )}
        </TouchableOpacity>
      )}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  wrapper: { marginBottom: Spacing.md },

  label: {
    fontSize:     12,
    fontWeight:   '700',
    color:        Colors.textMuted,
    textAlign:    'right',
    marginBottom: 6,
    textTransform:'uppercase',
    letterSpacing: 0.5,
  },

  // Image preview
  previewBox: {
    borderRadius: Radius.md,
    overflow:     'hidden',
    marginBottom: Spacing.sm,
    position:     'relative',
  },
  preview:    { width: '100%', height: 160, backgroundColor: Colors.background },
  removeBtn:  {
    position:        'absolute',
    top:             6,
    right:           6,
    backgroundColor: 'rgba(0,0,0,0.45)',
    borderRadius:    12,
  },

  placeholder: {
    height:          120,
    borderRadius:    Radius.md,
    borderWidth:     1.5,
    borderColor:     Colors.border,
    borderStyle:     'dashed',
    alignItems:      'center',
    justifyContent:  'center',
    gap:             6,
    marginBottom:    Spacing.sm,
    backgroundColor: Colors.background,
  },
  placeholderTxt: { fontSize: 13, color: Colors.textMuted },

  // Mode toggle
  toggleRow: {
    flexDirection:  'row',
    borderRadius:   Radius.full,
    borderWidth:    1.5,
    borderColor:    Colors.border,
    overflow:       'hidden',
    marginBottom:   Spacing.sm,
    alignSelf:      'flex-end',
  },
  toggleBtn: {
    flexDirection:   'row',
    alignItems:      'center',
    gap:             4,
    paddingHorizontal: 12,
    paddingVertical:  6,
  },
  toggleBtnActive: { backgroundColor: Colors.primary + '18' },
  toggleTxt:       { fontSize: 12, color: Colors.textSecondary, fontWeight: '600' },
  toggleTxtActive: { color: Colors.primary },

  // URL row
  urlRow: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           8,
  },
  urlInput: {
    flex:              1,
    borderWidth:       1,
    borderColor:       Colors.border,
    borderRadius:      Radius.sm,
    paddingHorizontal: Spacing.sm,
    paddingVertical:   8,
    fontSize:          13,
    color:             Colors.text,
    backgroundColor:   Colors.cardBackground,
    textAlign:         'left',
  },
  urlApplyBtn: {
    width:           36,
    height:          36,
    borderRadius:    Radius.sm,
    backgroundColor: Colors.primary,
    alignItems:      'center',
    justifyContent:  'center',
  },

  // Upload button
  uploadBtn: {
    flexDirection:    'row',
    alignItems:       'center',
    justifyContent:   'center',
    gap:              8,
    borderWidth:      1.5,
    borderColor:      Colors.primary,
    borderRadius:     Radius.md,
    paddingVertical:  10,
    backgroundColor:  Colors.primary + '0D',
  },
  uploadTxt: { fontSize: 14, fontWeight: '600', color: Colors.primary },
});
