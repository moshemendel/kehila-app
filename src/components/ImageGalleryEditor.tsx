/**
 * ImageGalleryEditor
 *
 * Displays image slots in a row.
 * • Empty slot  → dashed-border + button  → action sheet (gallery / URL)
 * • Filled slot → thumbnail with ✕ remove button
 * • While uploading → progress spinner in the next slot position
 *
 * Props
 *   images      current list of URLs
 *   onChange    called with the updated list
 *   storagePath Firebase Storage path prefix (no trailing slash)
 *   maxImages   max images allowed (default 3)
 *   label       optional section label shown above slots
 */

import React, { useState } from 'react';
import {
  View, Text, Image, TouchableOpacity, TextInput,
  StyleSheet, ActivityIndicator, Alert, Dimensions,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, Radius } from '../utils/theme';
import { uploadImage } from '../utils/uploadImage';

// ── Slot geometry ──────────────────────────────────────────────────────────────
// Three slots + two 8-px gaps inside 16-px horizontal padding on each side.
const SW   = Dimensions.get('window').width;
const SLOT = Math.floor((SW - 32 - 16) / 3);   // ~104 on a 360-dp screen

// ── Component ──────────────────────────────────────────────────────────────────

interface Props {
  images:      string[];
  onChange:    (images: string[]) => void;
  storagePath: string;
  maxImages?:  number;
  label?:      string;
}

export default function ImageGalleryEditor({
  images,
  onChange,
  storagePath,
  maxImages = 3,
  label,
}: Props) {
  const [urlMode,   setUrlMode]   = useState(false);
  const [urlDraft,  setUrlDraft]  = useState('');
  const [uploading, setUploading] = useState(false);
  const [progress,  setProgress]  = useState(0);

  const canAdd = images.length < maxImages && !uploading;

  // ── Add button pressed ────────────────────────────────────────────────────────
  function handleAddPress() {
    Alert.alert('הוסף תמונה', '', [
      { text: '📷 בחר מהגלריה',   onPress: pickFromGallery },
      { text: '🔗 הכנס כתובת URL', onPress: () => setUrlMode(true) },
      { text: 'ביטול',             style: 'cancel' },
    ]);
  }

  // ── Device gallery picker + upload ───────────────────────────────────────────
  async function pickFromGallery() {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('הרשאה נדרשת', 'יש לאפשר גישה לגלריה בהגדרות המכשיר.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [4, 3],
      quality: 0.82,
    });
    if (result.canceled || !result.assets?.[0]) return;

    const asset = result.assets[0];
    // Strip query params from extension (some Android URIs add ?…)
    const ext  = (asset.uri.split('.').pop() ?? 'jpg').split('?')[0].toLowerCase();
    const path = `${storagePath}/${Date.now()}.${ext}`;

    setUploading(true);
    setProgress(0);
    try {
      const url = await uploadImage(asset.uri, path, setProgress);
      onChange([...images, url]);
    } catch (e: any) {
      Alert.alert('שגיאת העלאה', e.message ?? 'אנא נסה שוב');
    } finally {
      setUploading(false);
    }
  }

  // ── URL commit ────────────────────────────────────────────────────────────────
  function commitUrl() {
    const url = urlDraft.trim();
    if (url) onChange([...images, url]);
    setUrlDraft('');
    setUrlMode(false);
  }

  // ── Remove ────────────────────────────────────────────────────────────────────
  function removeImage(idx: number) {
    onChange(images.filter((_, i) => i !== idx));
  }

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <View>
      {label && <Text style={styles.label}>{label}</Text>}

      {/* Slot row */}
      <View style={styles.row}>

        {/* Filled slots */}
        {images.map((uri, idx) => (
          <View key={uri + idx} style={styles.slot}>
            <Image
              source={{ uri }}
              style={StyleSheet.absoluteFillObject}
              resizeMode="cover"
            />
            {/* Remove button */}
            <TouchableOpacity
              style={styles.removeBtn}
              onPress={() => removeImage(idx)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="close-circle" size={22} color="#fff" />
            </TouchableOpacity>
          </View>
        ))}

        {/* Upload-in-progress slot */}
        {uploading && (
          <View style={[styles.slot, styles.slotLoading]}>
            <ActivityIndicator color={Colors.primary} size="small" />
            <Text style={styles.progressTxt}>{progress}%</Text>
          </View>
        )}

        {/* Add slot — shown when under the limit and not uploading */}
        {canAdd && (
          <TouchableOpacity
            style={[styles.slot, styles.slotAdd]}
            onPress={handleAddPress}
            activeOpacity={0.7}
          >
            <View style={styles.plusCircle}>
              <Ionicons name="add" size={26} color={Colors.primary} />
            </View>
            {images.length === 0 && !uploading && (
              <Text style={styles.addHint}>הוסף תמונה</Text>
            )}
          </TouchableOpacity>
        )}
      </View>

      {/* URL input — shown only after user picks "URL" from action sheet */}
      {urlMode && (
        <View style={styles.urlRow}>
          <TextInput scrollEnabled={false}
            style={styles.urlInput}
            value={urlDraft}
            onChangeText={setUrlDraft}
            placeholder="https://example.com/photo.jpg"
            placeholderTextColor={Colors.textMuted}
            autoFocus
            keyboardType="url"
            autoCapitalize="none"
            returnKeyType="done"
            onSubmitEditing={commitUrl}
            textAlign="left"
          />
          <TouchableOpacity
            style={[styles.urlAction, styles.urlConfirm, !urlDraft.trim() && { opacity: 0.4 }]}
            onPress={commitUrl}
            disabled={!urlDraft.trim()}
          >
            <Ionicons name="checkmark" size={17} color="#fff" />
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.urlAction, styles.urlCancel]}
            onPress={() => { setUrlMode(false); setUrlDraft(''); }}
          >
            <Ionicons name="close" size={17} color={Colors.textSecondary} />
          </TouchableOpacity>
        </View>
      )}

      {/* Counter hint for multi-image slots */}
      {maxImages > 1 && images.length > 0 && (
        <Text style={styles.counter}>{images.length}/{maxImages} תמונות</Text>
      )}
    </View>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  label: {
    fontSize:      11,
    fontWeight:    '700',
    color:         Colors.textMuted,
    textAlign:     'right',
    marginBottom:  8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },

  row: {
    flexDirection: 'row',
    flexWrap:      'wrap',
    gap:           8,
  },

  // Every slot is the same square size
  slot: {
    width:        SLOT,
    height:       SLOT,
    borderRadius: Radius.sm,
    overflow:     'hidden',
    position:     'relative',
  },

  // Dashed "+" slot
  slotAdd: {
    borderWidth:     1.5,
    borderColor:     Colors.primary + '55',
    borderStyle:     'dashed',
    backgroundColor: Colors.primary + '08',
    alignItems:      'center',
    justifyContent:  'center',
    gap:             4,
  },
  plusCircle: {
    width:           40,
    height:          40,
    borderRadius:    20,
    backgroundColor: Colors.primary + '18',
    alignItems:      'center',
    justifyContent:  'center',
  },
  addHint: {
    fontSize:   11,
    fontWeight: '600',
    color:      Colors.primary,
  },

  // Uploading-in-progress slot
  slotLoading: {
    backgroundColor: Colors.background,
    borderWidth:     1,
    borderColor:     Colors.border,
    alignItems:      'center',
    justifyContent:  'center',
    gap:             4,
  },
  progressTxt: {
    fontSize:   11,
    fontWeight: '700',
    color:      Colors.primary,
  },

  // Remove button overlaid on thumbnail
  removeBtn: {
    position:        'absolute',
    top:             4,
    right:           4,
    backgroundColor: 'rgba(0,0,0,0.48)',
    borderRadius:    12,
  },

  // URL input row
  urlRow: {
    flexDirection:  'row',
    alignItems:     'center',
    gap:            6,
    marginTop:      Spacing.sm,
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
  },
  urlAction: {
    width:           34,
    height:          34,
    borderRadius:    Radius.sm,
    alignItems:      'center',
    justifyContent:  'center',
  },
  urlConfirm: { backgroundColor: Colors.primary },
  urlCancel:  { backgroundColor: Colors.background, borderWidth: 1, borderColor: Colors.border },

  counter: {
    fontSize:   11,
    color:      Colors.textMuted,
    textAlign:  'right',
    marginTop:  6,
  },
});
