import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Animated, Dimensions,
} from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import type { BottomTabBarProps }   from '@react-navigation/bottom-tabs';
import { Ionicons }                  from '@expo/vector-icons';
import AsyncStorage                  from '@react-native-async-storage/async-storage';
import { useSafeAreaInsets }         from 'react-native-safe-area-context';

import HomeScreen        from '../screens/main/HomeScreen';
import SynagoguesScreen  from '../screens/main/SynagoguesScreen';
import PrayerTimesScreen from '../screens/main/PrayerTimesScreen';
import ZmanimScreen      from '../screens/main/ZmanimScreen';
import BusinessesScreen from '../screens/main/BusinessesScreen';
import MikvehScreen      from '../screens/main/MikvehScreen';
import EventsScreen      from '../screens/main/EventsScreen';
import ProfileScreen     from '../screens/main/ProfileScreen';
import EruvScreen        from '../screens/main/EruvScreen';
import GemachScreen      from '../screens/main/GemachScreen';
import SearchScreen      from '../screens/main/SearchScreen';
import SelichotScreen    from '../screens/main/SelichotScreen';

import { Colors, Spacing, Radius, Shadow } from '../utils/theme';
import { MainTabParamList }                 from '../types';
import { useEventsFeed }                    from '../context/EventsContext';
import { useCityId }                        from '../hooks/useCityId';
import PrayerNotificationScheduler          from '../components/PrayerNotificationScheduler';
import { useManagerAlerts }                 from '../hooks/useManagerAlerts';
import { useAppIconBadge }                  from '../hooks/useAppIconBadge';
import BottomSheetModal                     from '../components/BottomSheetModal';
import ComingSoonScreen, { ComingSoonBadge } from '../components/ComingSoon';
import { isComingSoon }                     from '../utils/comingSoon';
import { isSelichotWindowOpen }             from '../utils/selichot';

/** Stands in for the kashrut tab while the certificate data is being verified. */
const KashrutComingSoon = () => (
  <ComingSoonScreen
    title="כשרות"
    description={'מסעדות, עסקים ותעודות כשרות מתעדכנים כעת מול הרבנות.\nהמדור ייפתח לאחר אימות כל התעודות.'}
    icon="restaurant-outline"
    color={Colors.kosher}
  />
);

// ─────────────────────────────────────────────────────────────────
type TabName = keyof MainTabParamList;

interface TabInfo { icon: string; iconActive: string; label: string; color: string }

const TAB_INFO: Record<TabName, TabInfo> = {
  Home:        { icon: 'home-outline',       iconActive: 'home',       label: 'בית',      color: Colors.primary   },
  Search:      { icon: 'search-outline',     iconActive: 'search',     label: 'חיפוש',    color: Colors.primary   },
  Synagogues:  { icon: 'business-outline',   iconActive: 'business',   label: 'בתי כנסת', color: Colors.primary   },
  PrayerTimes: { icon: 'time-outline',       iconActive: 'time',       label: 'מניינים',    color: Colors.shacharit },
  Zmanim:      { icon: 'sunny-outline',      iconActive: 'sunny',      label: 'זמנים',     color: Colors.gold      },
  Businesses: { icon: 'restaurant-outline', iconActive: 'restaurant', label: 'כשרות',    color: Colors.kosher    },
  Mikveh:      { icon: 'water-outline',      iconActive: 'water',      label: 'מקווה',     color: Colors.mikveh    },
  Events:      { icon: 'calendar-outline',   iconActive: 'calendar',   label: 'אירועים',   color: Colors.events    },
  Eruv:        { icon: 'shield-outline',     iconActive: 'shield',     label: 'עירוב',     color: Colors.gold      },
  Gemach:      { icon: 'gift-outline',       iconActive: 'gift',       label: 'גמ"ח',      color: '#B06B3A'        },
  Selichot:    { icon: 'moon-outline',       iconActive: 'moon',       label: 'סליחות',    color: Colors.gold      },
  Profile:     { icon: 'person-outline',     iconActive: 'person',     label: 'פרופיל',   color: Colors.primary   },
};

/**
 * Every tab that CAN exist. Selichot is filtered out of the menus outside its
 * season — see `visible` in KehilaTabBar. The Tab.Screen stays registered all
 * year regardless, so the Home card and deep links still reach it; it simply
 * isn't offered in the "עוד" popup for the eleven months it means nothing.
 */
const ALL_TABS: TabName[] = [
  'Home','Search','Synagogues','PrayerTimes','Zmanim',
  'Businesses','Mikveh','Events','Eruv','Gemach','Selichot','Profile',
];

// Default: 4 bar slots (More fixed in center, remaining 4 go to popup)
const DEFAULT_BAR: [TabName,TabName,TabName,TabName] =
  ['Home','Search','Synagogues','Events'];
const STORAGE_KEY = 'kehila_tabbar_v1';

const Tab = createBottomTabNavigator<MainTabParamList>();

// ─── Single tab button ──────────────────────────────────────────
function TabBtn({
  name, active, onPress, badge,
}: { name: TabName; active: boolean; onPress: () => void; badge?: string }) {
  const { icon, iconActive, label, color } = TAB_INFO[name];
  return (
    <TouchableOpacity style={btn.wrap} onPress={onPress} activeOpacity={0.7}>
      {active && <View style={[btn.indicator, { backgroundColor: color }]} />}
      <Ionicons
        name={(active ? iconActive : icon) as any}
        size={24}
        color={active ? color : Colors.textMuted}
      />
      {!!badge && (
        <View style={btn.badge}><Text style={btn.badgeTxt}>{badge}</Text></View>
      )}
      <Text style={[btn.label, active && { color }]} numberOfLines={1}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}
const btn = StyleSheet.create({
  wrap:      { flex: 1, alignItems: 'center', justifyContent: 'flex-start', gap: 3, paddingTop: 8 },
  label:     { fontSize: 10, fontWeight: '600', color: Colors.textMuted, textAlign: 'center' },
  indicator: { position: 'absolute', top: 0, width: 24, height: 3, borderRadius: 2 },
  badge: {
    position: 'absolute', top: 4, right: '28%',
    backgroundColor: Colors.danger, borderRadius: 8,
    minWidth: 16, height: 16,
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3,
  },
  badgeTxt: { fontSize: 10, color: '#fff', fontWeight: '800' },
});

// ─── Edit modal ─────────────────────────────────────────────────
function EditModal({
  visible, barTabs, onSave, onClose,
}: {
  visible: boolean;
  barTabs: [TabName,TabName,TabName,TabName];
  onSave: (t: [TabName,TabName,TabName,TabName]) => void;
  onClose: () => void;
}) {
  const [sel, setSel] = useState<TabName[]>(barTabs);
  useEffect(() => { setSel(barTabs); }, [barTabs, visible]);

  const toggle = (name: TabName) => {
    if (name === 'Home') return;
    setSel(prev =>
      prev.includes(name)
        ? prev.filter(n => n !== name)
        : prev.length < 4 ? [...prev, name] : prev
    );
  };

  return (
    <BottomSheetModal visible={visible} onClose={onClose} title="התאמה אישית" sheetStyle={ed.sheetPad}>
      <Text style={ed.subtitle}>בחר 4 כפתורים לסרגל ({sel.length}/4)</Text>

      <View style={ed.grid}>
        {ALL_TABS.filter(n => n !== 'Selichot' || isSelichotWindowOpen()).map(name => {
          const info   = TAB_INFO[name];
          const inBar  = sel.includes(name);
          const locked = name === 'Home';
          return (
            <TouchableOpacity
              key={name}
              style={[ed.item, inBar && ed.itemOn]}
              onPress={() => toggle(name)}
              activeOpacity={locked ? 1 : 0.7}
            >
              {locked && (
                <Ionicons name="lock-closed" size={9} color={Colors.textMuted} style={ed.lock} />
              )}
              <View style={[ed.itemIcon, { backgroundColor: inBar ? info.color : Colors.background }]}>
                <Ionicons name={info.iconActive as any} size={22}
                  color={inBar ? Colors.white : Colors.textMuted} />
              </View>
              <Text style={[ed.itemLabel, inBar && ed.itemLabelOn]}>{info.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <TouchableOpacity
        style={[ed.saveBtn, sel.length !== 4 && ed.saveBtnOff]}
        onPress={() => sel.length === 4 && onSave(sel as [TabName,TabName,TabName,TabName])}
        activeOpacity={sel.length === 4 ? 0.8 : 1}
      >
        <Text style={ed.saveTxt}>שמור</Text>
      </TouchableOpacity>
    </BottomSheetModal>
  );
}
const ed = StyleSheet.create({
  sheetPad:     { paddingHorizontal: Spacing.lg, paddingBottom: 44 },
  subtitle:     { fontSize: 13, color: Colors.textSecondary, textAlign: 'center', marginBottom: 20 },
  grid:         { flexDirection: 'row', flexWrap: 'wrap', gap: 10, justifyContent: 'center', marginBottom: 24 },
  item:         { width: '21%', alignItems: 'center', gap: 6, paddingVertical: 10, borderRadius: Radius.md, borderWidth: 2, borderColor: 'transparent' },
  itemOn:       { borderColor: Colors.primary + '40', backgroundColor: Colors.primary + '08' },
  itemIcon:     { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  itemLabel:    { fontSize: 10, color: Colors.textMuted, textAlign: 'center', fontWeight: '500' },
  itemLabelOn:  { color: Colors.primary, fontWeight: '700' },
  lock:         { position: 'absolute', top: 6, right: 6 },
  saveBtn:      { backgroundColor: Colors.primary, borderRadius: Radius.md, paddingVertical: 14, alignItems: 'center' },
  saveBtnOff:   { backgroundColor: Colors.border },
  saveTxt:      { fontSize: 16, fontWeight: '700', color: Colors.white },
});

// ─── Custom tab bar ─────────────────────────────────────────────
function KehilaTabBar({ state, navigation }: BottomTabBarProps) {
  const { bottom }    = useSafeAreaInsets();
  // Unread, not total: `events.filter(e => e.isAlert)` never shrinks, so the
  // badge sat there permanently once any alert event existed. useEventsFeed is
  // the same source the Home quick-links use, so the two now agree and the
  // badge clears as the user reads them.
  const { events, isRead } = useEventsFeed();
  const alertCount    = events.filter(e => e.isAlert && !isRead(e.id)).length;
  // "!" on Profile whenever something in the management screens needs action —
  // the badge replaces push notifications, which need a Cloud Function.
  const managerAlerts = useManagerAlerts();
  const needsAttention = managerAlerts.total > 0;
  // Same count on the OS app icon. Set locally (no push needed), so it reflects
  // what was true the last time the app was open — see useAppIconBadge.
  useAppIconBadge(managerAlerts.total);

  // What a given tab's badge shows when it sits in the bar.
  const badgeFor = (name: TabName): string | undefined => {
    if (name === 'Profile' && needsAttention) return '!';
    if (name === 'Events' && alertCount > 0) return String(alertCount);
    return undefined;
  };

  const [barTabs, setBarTabs] = useState<[TabName,TabName,TabName,TabName]>(DEFAULT_BAR);
  const [moreOpen, setMoreOpen] = useState(false);
  const [editOpen,  setEditOpen]  = useState(false);
  const popupAnim = useRef(new Animated.Value(0)).current;

  // Load persisted bar config
  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then(v => {
        if (!v) return;
        try {
          const p = JSON.parse(v);
          if (Array.isArray(p) && p.length === 4) setBarTabs(p as any);
        } catch {}
      }).catch(() => {});
  }, []);

  // Animate popup
  useEffect(() => {
    Animated.spring(popupAnim, {
      toValue: moreOpen ? 1 : 0,
      useNativeDriver: true,
      tension: 80, friction: 10,
    }).start();
  }, [moreOpen]);

  const currentRoute = state.routes[state.index].name as TabName;

  // Close popup whenever the active tab changes
  useEffect(() => { setMoreOpen(false); }, [currentRoute]);

  // ── Hide bar on Home screen ──
  if (currentRoute === 'Home') return null;

  // Out of season Selichot drops out of the popup AND out of a persisted bar
  // config — someone who pinned it during Elul shouldn't meet a dead tab in
  // Cheshvan.
  const inSeason  = isSelichotWindowOpen();
  const visible   = ALL_TABS.filter(n => n !== 'Selichot' || inSeason);
  const barShown  = (barTabs as TabName[]).filter(n => visible.includes(n));
  const moreTabs  = visible.filter(n => !(barShown as string[]).includes(n));
  // Only badge "עוד" for things that are actually inside it — otherwise the
  // user opens the popup looking for the count and finds nothing.
  const hiddenEventAlerts  = moreTabs.includes('Events') ? alertCount : 0;
  const hiddenProfileAlert = moreTabs.includes('Profile') && needsAttention;
  const leftTabs  = barShown.slice(0, 2) as TabName[];
  const rightTabs = barShown.slice(2, 4) as TabName[];

  const go = (name: TabName) => {
    setMoreOpen(false);
    navigation.navigate(name as never);
  };

  const saveBar = async (newBar: [TabName,TabName,TabName,TabName]) => {
    setBarTabs(newBar);
    setEditOpen(false);
    try { await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(newBar)); } catch {}
  };

  const BAR_H  = 64 + bottom;
  const SCR_H  = Dimensions.get('window').height;

  return (
    <>
      {/* Tab bar surface */}
      <View style={[tb.bar, { height: BAR_H, paddingBottom: bottom + 6 }]}>

        {/* ── Backdrop: extends above the tab bar, covers screen content ── */}
        {moreOpen && (
          <TouchableOpacity
            style={{
              position: 'absolute',
              // top: negative = extend above the tab bar container
              top: -(SCR_H - BAR_H),
              left: 0, right: 0,
              height: SCR_H - BAR_H,
              backgroundColor: 'rgba(0,0,0,0.25)',
              zIndex: 50,
            }}
            onPress={() => setMoreOpen(false)}
            activeOpacity={1}
          />
        )}

        {/* Popup: bottom: BAR_H puts its base at the tab bar's top edge, extends upward */}
        <Animated.View
          pointerEvents={moreOpen ? 'box-none' : 'none'}
          style={[
            pp.popup,
            {
              bottom: BAR_H,
              opacity: popupAnim,
              transform: [{ translateY: popupAnim.interpolate({ inputRange: [0,1], outputRange: [14,0] }) }],
            },
          ]}
        >
          <TouchableOpacity activeOpacity={1} onPress={() => {}}>
            <View style={pp.inner}>
              {/* Row of more items */}
              <View style={pp.grid}>
                {moreTabs.map(name => {
                  const info = TAB_INFO[name];
                  const isProfileAlert = name === 'Profile' && needsAttention;
                  const hasBadge = (name === 'Events' && alertCount > 0) || isProfileAlert;
                  const badgeTxt = isProfileAlert ? '!' : String(alertCount);
                  return (
                    <TouchableOpacity key={name} style={pp.item} onPress={() => go(name)} activeOpacity={0.75}>
                      <View style={[pp.itemIcon, { backgroundColor: info.color + '1C' }]}>
                        <Ionicons name={info.iconActive as any} size={24} color={info.color} />
                        {hasBadge && (
                          <View style={pp.badge}><Text style={pp.badgeTxt}>{badgeTxt}</Text></View>
                        )}
                      </View>
                      <Text style={pp.itemLabel}>{info.label}</Text>
                      {name === 'Businesses' && isComingSoon('kashrut') && (
                        <ComingSoonBadge color={info.color} />
                      )}
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* Edit row */}
              <View style={pp.divider} />
              <TouchableOpacity
                style={pp.editRow}
                onPress={() => { setMoreOpen(false); setTimeout(() => setEditOpen(true), 180); }}
                activeOpacity={0.7}
              >
                <Ionicons name="settings-outline" size={15} color={Colors.textSecondary} />
                <Text style={pp.editRowTxt}>התאמה אישית</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </Animated.View>

        {/* ── Left 2 tab slots ── */}
        {leftTabs.map(name => (
          <TabBtn key={name} name={name} active={currentRoute === name} onPress={() => go(name)}
            badge={badgeFor(name)} />
        ))}

        {/* ── Center: More button ── */}
        <TouchableOpacity style={btn.wrap} onPress={() => setMoreOpen(v => !v)} activeOpacity={0.7}>
          {moreOpen && <View style={[btn.indicator, { backgroundColor: Colors.primary }]} />}
          <View style={[tb.morePill, moreOpen && tb.morePillOpen]}>
            <Ionicons
              name={moreOpen ? 'close-outline' : 'apps-outline'}
              size={20}
              color={moreOpen ? Colors.white : Colors.primary}
            />
          </View>
          <Text style={[btn.label, moreOpen && { color: Colors.primary }]}>עוד</Text>
          {!moreOpen && (hiddenEventAlerts > 0 || hiddenProfileAlert) && (
            <View style={tb.moreBadge}>
              <Text style={tb.moreBadgeTxt}>
                {hiddenEventAlerts > 0 ? hiddenEventAlerts : '!'}
              </Text>
            </View>
          )}
        </TouchableOpacity>

        {/* ── Right 2 tab slots ── */}
        {rightTabs.map(name => (
          <TabBtn key={name} name={name} active={currentRoute === name} onPress={() => go(name)}
            badge={badgeFor(name)} />
        ))}
      </View>

      {/* ── Edit modal ── */}
      <EditModal
        visible={editOpen}
        barTabs={barTabs}
        onSave={saveBar}
        onClose={() => setEditOpen(false)}
      />
    </>
  );
}

// Tab bar styles
const tb = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    backgroundColor: Colors.white,
    borderTopWidth: 1,
    borderTopColor: '#E8E8E8',
    paddingTop: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.07,
    shadowRadius: 8,
    elevation: 12,
    alignItems: 'flex-start',
  },
  morePill: {
    width: 44, height: 26,
    borderRadius: 13,
    backgroundColor: Colors.primary + '18',
    alignItems: 'center',
    justifyContent: 'center',
  },
  morePillOpen: { backgroundColor: Colors.primary },
  moreBadge: {
    position: 'absolute', top: 0, right: 4,
    backgroundColor: Colors.danger, borderRadius: 8,
    minWidth: 16, height: 16,
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3,
  },
  moreBadgeTxt: { fontSize: 9, color: '#fff', fontWeight: '800' },
});

// Popup styles
const pp = StyleSheet.create({
  popup: {
    position: 'absolute',
    left: Spacing.md,
    right: Spacing.md,
    zIndex: 100,
  },
  inner: {
    backgroundColor: Colors.cardBackground,
    borderRadius: 20,
    paddingTop: 16,
    paddingBottom: 4,
    paddingHorizontal: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.14,
    shadowRadius: 20,
    elevation: 24,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 12,
    marginBottom: 10,
  },
  item:       { alignItems: 'center', gap: 5, width: 64 },
  itemIcon:   { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center' },
  itemLabel:  { fontSize: 11, color: Colors.text, fontWeight: '600', textAlign: 'center' },
  badge: {
    position: 'absolute', top: 2, right: 2,
    backgroundColor: Colors.danger, borderRadius: 7,
    minWidth: 14, height: 14,
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3,
  },
  badgeTxt:   { fontSize: 9, color: '#fff', fontWeight: '800' },
  divider:    { height: 1, backgroundColor: Colors.border, marginHorizontal: -12, marginBottom: 2 },
  editRow:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10 },
  editRowTxt: { fontSize: 13, color: Colors.textSecondary, fontWeight: '600' },
});

// ─── Navigator ──────────────────────────────────────────────────
export default function MainTabNavigator() {
  return (
    <>
      <PrayerNotificationScheduler />
      <Tab.Navigator
        screenOptions={{ headerShown: false }}
        tabBar={(props) => <KehilaTabBar {...props} />}
      >
        <Tab.Screen name="Home"        component={HomeScreen} />
        <Tab.Screen name="Search"      component={SearchScreen} />
        <Tab.Screen name="Synagogues"  component={SynagoguesScreen} />
        <Tab.Screen name="PrayerTimes" component={PrayerTimesScreen} />
        <Tab.Screen name="Zmanim"      component={ZmanimScreen} />
        <Tab.Screen name="Businesses" component={isComingSoon('kashrut') ? KashrutComingSoon : BusinessesScreen} />
        <Tab.Screen name="Mikveh"      component={MikvehScreen} />
        <Tab.Screen name="Events"      component={EventsScreen} />
        <Tab.Screen name="Eruv"        component={EruvScreen} />
        <Tab.Screen name="Gemach"      component={GemachScreen} />
        <Tab.Screen name="Selichot"    component={SelichotScreen} />
        <Tab.Screen name="Profile"     component={ProfileScreen} />
      </Tab.Navigator>
    </>
  );
}
