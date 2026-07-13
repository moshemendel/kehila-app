import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, Spacing, Radius, Shadow } from '../../utils/theme';
import { MainTabParamList } from '../../types';
import { useEvents } from '../../hooks/useEvents';
import { useCityId } from '../../hooks/useCityId';
import { useAuth } from '../../context/AuthContext';

type Nav = BottomTabNavigationProp<MainTabParamList>;

interface MoreItem {
  icon: string;
  label: string;
  sublabel: string;
  tab: 'Restaurants' | 'Mikveh' | 'Events' | 'Profile';
  color: string;
}

const MORE_ITEMS: MoreItem[] = [
  { icon: 'restaurant-outline', label: 'כשרות',   sublabel: 'מסעדות ועסקים',    tab: 'Restaurants', color: Colors.kosher  },
  { icon: 'water-outline',      label: 'מקווה',    sublabel: 'שעות ומידע',       tab: 'Mikveh',      color: Colors.mikveh  },
  { icon: 'calendar-outline',   label: 'אירועים',  sublabel: 'שיעורים ואירועים', tab: 'Events',      color: Colors.events  },
  { icon: 'person-outline',     label: 'פרופיל',   sublabel: 'הגדרות חשבון',     tab: 'Profile',     color: Colors.primary },
];

export default function MoreScreen() {
  const navigation  = useNavigation<Nav>();
  const { top }     = useSafeAreaInsets();
  const cityId      = useCityId();
  const { events }  = useEvents(cityId);
  const { appUser } = useAuth();

  const alertCount  = events.filter((e) => e.isAlert).length;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ paddingBottom: 40 }}
      showsVerticalScrollIndicator={false}
    >
      {/* Header */}
      <View style={[styles.header, { paddingTop: top + 20 }]}>
        <Text style={styles.title}>שירותים נוספים</Text>
        {appUser?.displayName ? (
          <Text style={styles.subtitle}>שלום, {appUser.displayName}</Text>
        ) : null}
      </View>

      {/* Grid */}
      <View style={styles.grid}>
        {MORE_ITEMS.map((item) => (
          <TouchableOpacity
            key={item.tab}
            style={styles.card}
            onPress={() => navigation.navigate(item.tab)}
            activeOpacity={0.82}
          >
            <View style={[styles.iconWrap, { backgroundColor: item.color + '1A' }]}>
              <Ionicons name={item.icon as any} size={34} color={item.color} />
              {item.tab === 'Events' && alertCount > 0 && (
                <View style={styles.badge}>
                  <Text style={styles.badgeTxt}>{alertCount}</Text>
                </View>
              )}
            </View>
            <Text style={styles.cardLabel}>{item.label}</Text>
            <Text style={styles.cardSub}>{item.sublabel}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },

  header: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.lg,
  },
  title: { fontSize: 28, fontWeight: '800', color: Colors.text },
  subtitle: { fontSize: 14, color: Colors.textSecondary, marginTop: 4 },

  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: Spacing.md,
    gap: Spacing.md,
  },

  card: {
    width: '47%',
    backgroundColor: Colors.cardBackground,
    borderRadius: Radius.lg,
    paddingVertical: Spacing.lg,
    paddingHorizontal: Spacing.sm,
    alignItems: 'center',
    gap: Spacing.sm,
    ...Shadow.card,
    shadowOpacity: 0.09,
    elevation: 3,
  },

  iconWrap: {
    width: 76,
    height: 76,
    borderRadius: 38,
    alignItems: 'center',
    justifyContent: 'center',
  },

  cardLabel: { fontSize: 17, fontWeight: '700', color: Colors.text, textAlign: 'center' },
  cardSub: { fontSize: 12, color: Colors.textMuted, textAlign: 'center', lineHeight: 16 },

  badge: {
    position: 'absolute',
    top: 2,
    right: 2,
    backgroundColor: Colors.danger,
    borderRadius: 9,
    minWidth: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  badgeTxt: { fontSize: 10, color: '#fff', fontWeight: '800' },
});
