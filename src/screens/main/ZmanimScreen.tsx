import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { useAnalyticsTrack } from '../../services/analytics';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  ActivityIndicator, LayoutChangeEvent,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors, Spacing, Radius } from '../../utils/theme';
import { formatHebrewDate } from '../../utils/hebrewDate';
import { calcZmanim, minToStr, ZmanimResult, ZmanimSettings, ZMANIM_PRESETS } from '../../utils/zmanim';
import { getDailyMountainAngle } from '../../utils/mountainAngle';
import { useZmanimSettings } from '../../context/ZmanimSettingsContext';
import { useCity } from '../../hooks/useCity';
import { useCityId } from '../../hooks/useCityId';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const DEFAULT_LAT = 31.7767;
const DEFAULT_LON = 35.2988;
const DEFAULT_LOC = 'מעלה אדומים';

const NEXT_KEYS: (keyof ZmanimResult)[] = [
  'alot', 'misheyakir', 'netz', 'netzVatikin',
  'sofZmanShmaMga', 'sofZmanShma',
  'sofZmanTfilaMga', 'sofZmanTfila',
  'chatzot', 'minchaGedola', 'minchaKetana', 'plagHamincha',
  'shkia', 'tzetHakochavim', 'tzetHakochavim18', 'tzetRabbenuTam',
];

function nowInMinutes(): number {
  const d = new Date();
  return d.getHours() * 60 + d.getMinutes();
}

function getNextKey(result: ZmanimResult): keyof ZmanimResult | null {
  const now = nowInMinutes();
  for (const key of NEXT_KEYS) {
    const t = result[key] as number;
    if (t > 0 && t > now) return key;
  }
  return null;
}

function activePreset(s: ZmanimSettings) {
  if (s.presetKey) return ZMANIM_PRESETS.find(p => p.key === s.presetKey) ?? null;
  return ZMANIM_PRESETS.find(p => JSON.stringify(p.settings) === JSON.stringify(s)) ?? null;
}

// ── Single full-width time row ────────────────────────────────────────────────
function TimeRow({ label, subLabel, time, isNext, isPast, withSec, onLayout }: {
  label: string; subLabel?: string; time: number;
  isNext: boolean; isPast: boolean; withSec?: boolean;
  onLayout?: (e: LayoutChangeEvent) => void;
}) {
  return (
    <View style={[s.timeRow, isNext && s.timeRowNext, isPast && s.timeRowPast]} onLayout={onLayout}>
      <View style={s.timeRowLeft}>
        <Text style={[s.timeRowLabel, isNext && s.timeRowLabelNext]}>{label}</Text>
        {subLabel ? (
          <Text style={[s.timeRowSub, isNext && s.timeRowSubNext]}>{subLabel}</Text>
        ) : null}
      </View>
      <Text style={[s.timeRowTime, isNext && s.timeRowTimeNext, isPast && s.timeRowTimePast]}>
        {minToStr(time, withSec)}
      </Text>
    </View>
  );
}

// ── Section label row ────────────────────────────────────────────────────────
function SectionRow({ label }: { label: string }) {
  return (
    <View style={s.sectionRow}>
      <View style={s.sectionLine} />
      <Text style={s.sectionLabel}>{label}</Text>
      <View style={s.sectionLine} />
    </View>
  );
}

// ── Screen ───────────────────────────────────────────────────────────────────
export default function ZmanimScreen() {
  useAnalyticsTrack('zmanim');
  const navigation = useNavigation();
  const { settings, setSettings, gpsLocation } = useZmanimSettings();
  const cityId = useCityId();
  const { top }  = useSafeAreaInsets();
  const { city } = useCity(cityId);

  const [zmanim,        setZmanim]        = useState<ZmanimResult | null>(null);
  const [locationName,  setLocName]       = useState(DEFAULT_LOC);
  const [lat,           setLat]           = useState(DEFAULT_LAT);
  const [lon,           setLon]           = useState(DEFAULT_LON);
  const [mountainAngle, setMountainAngle] = useState(0);
  const [tzId,          setTzId]          = useState('Asia/Jerusalem');
  const [now, setNow] = useState(new Date());

  const scrollRef   = useRef<ScrollView>(null);
  const rowLayouts  = useRef<Partial<Record<string, number>>>({});
  const svHeight    = useRef(600);
  const hasScrolled = useRef(false);

  useEffect(() => {
    if (gpsLocation) {
      setLat(gpsLocation.lat);
      setLon(gpsLocation.lon);
      setLocName(gpsLocation.name);
      setTzId(gpsLocation.timezone);
      getDailyMountainAngle('gps', gpsLocation.lat, gpsLocation.lon, 0, new Date())
        .then(setMountainAngle).catch(() => setMountainAngle(0));
      return;
    }
    if (!city) return;
    setLat(city.latitude);
    setLon(city.longitude);
    setLocName(city.name);
    if (city.timezone) setTzId(city.timezone);
    getDailyMountainAngle(
      city.id, city.latitude, city.longitude, city.elevation ?? 0, new Date()
    ).then(setMountainAngle).catch(() => setMountainAngle(0));
  }, [city, gpsLocation]);

  const recalc = useCallback((
    date: Date, lt: number, ln: number,
    s: ZmanimSettings, tz: string, ma: number,
  ) => {
    setZmanim(calcZmanim(date, lt, ln, s, tz, 0, ma));
  }, []);

  useEffect(() => {
    const tick = () => {
      const d = new Date();
      setNow(d);
      recalc(d, lat, lon, settings, tzId, mountainAngle);
    };
    tick();
    const id = setInterval(tick, 60_000);
    return () => clearInterval(id);
  }, [lat, lon, tzId, mountainAngle, settings, recalc]);

  // Reset scroll guard each time the screen is focused (tab switch or back navigation)
  useFocusEffect(useCallback(() => {
    hasScrolled.current = false;
  }, []));

  // Scroll the next row to the vertical center of the list — once per focus
  const nextKey = zmanim ? getNextKey(zmanim) : null;
  useEffect(() => {
    if (!nextKey || hasScrolled.current) return;
    hasScrolled.current = true;
    // Wait for onLayout callbacks to fire before reading rowLayouts
    const timer = setTimeout(() => {
      const y = rowLayouts.current[nextKey];
      if (y == null) return;
      scrollRef.current?.scrollTo({
        y: Math.max(0, y - svHeight.current / 2 + 26),
        animated: true,
      });
    }, 150);
    return () => clearTimeout(timer);
  }, [nextKey]);

  const curPreset  = activePreset(settings);
  const today      = now;
  const hasVatikin = !!(zmanim && zmanim.netzVatikin > 0);

  function isNext(key: keyof ZmanimResult) { return nextKey === key; }
  function isPast(key: keyof ZmanimResult) {
    if (!zmanim) return false;
    const t = zmanim[key] as number;
    return t > 0 && t < nowInMinutes() && !isNext(key);
  }

  return (
    <View style={s.root}>
      <LinearGradient colors={[Colors.primaryDark, Colors.primary]} style={[s.header, { paddingTop: top + 16 }]}>
        <View style={s.headerRow}>
          <View style={s.titleCol}>
            <Text style={s.screenTitle}>זמני היום</Text>
            <Text style={s.hebrewDate}>{formatHebrewDate(today)}</Text>
            <Text style={s.gregDate}>
              {today.toLocaleDateString('he-IL', { day: 'numeric', month: 'long', year: 'numeric' })}
            </Text>
            <Text style={s.locName}>📍 {locationName}</Text>
          </View>

          <TouchableOpacity style={s.methodBadge} onPress={() => navigation.navigate('ZmanimSettings' as never)} activeOpacity={0.75}>
            <Text style={s.methodBadgeLabel}>{curPreset ? curPreset.label : 'הגדרות זמנים'}</Text>
            <Text style={s.methodBadgePosek}>{curPreset ? curPreset.posek : 'מותאם אישית · לחץ לשינוי'}</Text>
          </TouchableOpacity>
        </View>
      </LinearGradient>

      <ScrollView
        ref={scrollRef}
        onLayout={(e) => { svHeight.current = e.nativeEvent.layout.height; }}
        contentContainerStyle={s.list}
        showsVerticalScrollIndicator={false}
      >
        {!zmanim ? (
          <ActivityIndicator color={Colors.goldMuted} style={{ marginTop: 40 }} />
        ) : (
          <>
            <TimeRow label="עלות השחר"        time={zmanim.alot}       isNext={isNext('alot')}       isPast={isPast('alot')}
              onLayout={(e) => { rowLayouts.current['alot'] = e.nativeEvent.layout.y; }} />
            <TimeRow label="זמן ציצית ותפילין" time={zmanim.misheyakir} isNext={isNext('misheyakir')} isPast={isPast('misheyakir')}
              onLayout={(e) => { rowLayouts.current['misheyakir'] = e.nativeEvent.layout.y; }} />
            <TimeRow
              label={hasVatikin ? 'הנץ החמה הנראה' : 'הנץ החמה'}
              time={hasVatikin ? zmanim.netzVatikin : zmanim.netz}
              isNext={hasVatikin ? isNext('netzVatikin') : isNext('netz')}
              isPast={hasVatikin ? isPast('netzVatikin') : isPast('netz')}
              withSec
              onLayout={(e) => {
                const y = e.nativeEvent.layout.y;
                rowLayouts.current['netz'] = y;
                rowLayouts.current['netzVatikin'] = y;
              }}
            />

            <SectionRow label="סוף זמן קריאת שמע" />
            <TimeRow label={'ק"ש מג"א (לחומרא)'} time={zmanim.sofZmanShmaMga} isNext={isNext('sofZmanShmaMga')} isPast={isPast('sofZmanShmaMga')}
              onLayout={(e) => { rowLayouts.current['sofZmanShmaMga'] = e.nativeEvent.layout.y; }} />
            <TimeRow label={'ק"ש גר"א'}           time={zmanim.sofZmanShma}    isNext={isNext('sofZmanShma')}    isPast={isPast('sofZmanShma')}
              onLayout={(e) => { rowLayouts.current['sofZmanShma'] = e.nativeEvent.layout.y; }} />
            <TimeRow label="סוף זמן תפילה"        time={zmanim.sofZmanTfila}   isNext={isNext('sofZmanTfila')}   isPast={isPast('sofZmanTfila')}
              onLayout={(e) => {
                const y = e.nativeEvent.layout.y;
                rowLayouts.current['sofZmanTfila']    = y;
                rowLayouts.current['sofZmanTfilaMga'] = y; // no separate MGA row, map to same
              }} />

            <TimeRow label="חצות"       time={zmanim.chatzot}      isNext={isNext('chatzot')}      isPast={isPast('chatzot')}
              onLayout={(e) => { rowLayouts.current['chatzot'] = e.nativeEvent.layout.y; }} />
            <TimeRow label="מנחה גדולה" time={zmanim.minchaGedola} isNext={isNext('minchaGedola')} isPast={isPast('minchaGedola')}
              onLayout={(e) => { rowLayouts.current['minchaGedola'] = e.nativeEvent.layout.y; }} />
            <TimeRow label="מנחה קטנה"  time={zmanim.minchaKetana} isNext={isNext('minchaKetana')} isPast={isPast('minchaKetana')}
              onLayout={(e) => { rowLayouts.current['minchaKetana'] = e.nativeEvent.layout.y; }} />
            <TimeRow label="פלג המנחה"  time={zmanim.plagHamincha} isNext={isNext('plagHamincha')} isPast={isPast('plagHamincha')}
              onLayout={(e) => { rowLayouts.current['plagHamincha'] = e.nativeEvent.layout.y; }} />
            <TimeRow label="שקיעה"      time={zmanim.shkia}        isNext={isNext('shkia')}        isPast={isPast('shkia')} withSec
              onLayout={(e) => { rowLayouts.current['shkia'] = e.nativeEvent.layout.y; }} />

            <SectionRow label="צאת הכוכבים" />
            <TimeRow label={`${settings.tzetMinutes} דק' זמניות`} time={zmanim.tzetHakochavim}   isNext={isNext('tzetHakochavim')}   isPast={isPast('tzetHakochavim')}
              onLayout={(e) => { rowLayouts.current['tzetHakochavim'] = e.nativeEvent.layout.y; }} />
            <TimeRow label="18 דק' זמניות"           time={zmanim.tzetHakochavim18} isNext={isNext('tzetHakochavim18')} isPast={isPast('tzetHakochavim18')}
              onLayout={(e) => { rowLayouts.current['tzetHakochavim18'] = e.nativeEvent.layout.y; }} />
            <TimeRow label="רבנו תם - 72 דק' זמניות" time={zmanim.tzetRabbenuTam}  isNext={isNext('tzetRabbenuTam')}   isPast={isPast('tzetRabbenuTam')}
              onLayout={(e) => { rowLayouts.current['tzetRabbenuTam'] = e.nativeEvent.layout.y; }} />
          </>
        )}
      </ScrollView>

    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },

  // Header
  header:      { paddingHorizontal: Spacing.lg, paddingBottom: Spacing.xl },
  headerRow:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  titleCol:    { flex: 1, marginRight: Spacing.sm },
  screenTitle: { fontSize: 22, fontWeight: '800', color: Colors.white },
  hebrewDate:  { fontSize: 15, color: Colors.goldMuted, fontWeight: '700', marginTop: 2 },
  gregDate:    { fontSize: 12, color: 'rgba(255,255,255,0.55)', marginTop: 2 },
  locName:     { fontSize: 13, color: 'rgba(255,255,255,0.7)', marginTop: 4 },
  methodBadge: {
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 10,
    alignItems: 'center',
    minWidth: 118,
  },
  methodBadgeLabel: { fontSize: 13, fontWeight: '800', color: Colors.white, textAlign: 'center' },
  methodBadgePosek: { fontSize: 11, color: 'rgba(255,255,255,0.6)', marginTop: 3, textAlign: 'center' },

  // List
  list: { padding: Spacing.sm, gap: 6, paddingBottom: 32 },

  // Section label
  sectionRow:   { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6, marginBottom: 2 },
  sectionLine:  { flex: 1, height: 1, backgroundColor: Colors.border },
  sectionLabel: { fontSize: 11, color: Colors.textMuted, fontWeight: '600' },

  // Full-width time row
  timeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: Colors.cardBackground,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: 13,
    borderWidth: 1,
    borderColor: Colors.border,
    elevation: 1,
  },
  timeRowNext:     { backgroundColor: Colors.primaryDark, borderColor: Colors.goldMuted, borderWidth: 2 },
  timeRowPast:     { opacity: 0.38 },
  timeRowLeft:     { flex: 1, marginRight: 12 },
  timeRowLabel:    { fontSize: 14, color: Colors.textSecondary, fontWeight: '600' },
  timeRowLabelNext:{ color: Colors.goldMuted },
  timeRowSub:      { fontSize: 11, color: Colors.textMuted, marginTop: 1 },
  timeRowSubNext:  { color: 'rgba(201,168,76,0.7)' },
  timeRowTime:     { fontSize: 22, fontWeight: '800', color: Colors.text, fontVariant: ['tabular-nums'] },
  timeRowTimeSec:  { fontSize: 17 },
  timeRowTimeNext: { color: Colors.white },
  timeRowTimePast: { color: Colors.text },

});
