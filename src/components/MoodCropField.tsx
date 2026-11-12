import React, { useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { ImageCrop } from '../types';
import { Colors, Radius, Spacing } from '../utils/theme';
import { cropForImage } from '../utils/moodCrop';
import MoodCropModal from './MoodCropModal';

/**
 * "Fit the main picture" row for the manager forms: opens the full-screen
 * editor and hands back the new crop. Shows nothing until there is a picture.
 */
export default function MoodCropField({ uri, crop, onChange, frameHeight, keepDefault = false }: {
  uri: string | undefined;
  crop: ImageCrop | undefined;
  onChange: (crop: ImageCrop) => void;
  frameHeight?: number;
  /** True where an uncropped picture is not shown as cover (businesses). */
  keepDefault?: boolean;
}) {
  const [open, setOpen] = useState(false);
  if (!uri) return null;
  const adjusted = !!cropForImage(uri, crop, keepDefault);
  return (
    <View style={st.wrap}>
      <TouchableOpacity style={st.btn} onPress={() => setOpen(true)} activeOpacity={0.8}>
        <Ionicons name="crop-outline" size={18} color={Colors.primary} />
        <Text style={st.txt}>התאמת תמונת המצב</Text>
        {adjusted && <Text style={st.badge}>הותאמה</Text>}
      </TouchableOpacity>
      <MoodCropModal
        visible={open}
        uri={uri}
        initial={crop}
        frameHeight={frameHeight}
        onCancel={() => setOpen(false)}
        onSave={(c) => { onChange(c); setOpen(false); }}
      />
    </View>
  );
}

const st = StyleSheet.create({
  wrap:  { marginTop: Spacing.sm },
  btn:   {
    flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'flex-start',
    paddingVertical: 10, paddingHorizontal: Spacing.md, borderRadius: Radius.md,
    borderWidth: 1, borderColor: Colors.primary, backgroundColor: Colors.white,
  },
  txt:   { color: Colors.primary, fontSize: 14, fontWeight: '700' },
  badge: { color: Colors.success, fontSize: 12, fontWeight: '700' },
});
