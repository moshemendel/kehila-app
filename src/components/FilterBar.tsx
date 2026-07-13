import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, Radius } from '../utils/theme';

export interface FilterOption { key: string; label: string }

export interface FilterConfig {
  key: string;
  label: string;
  options: FilterOption[]; // must NOT include 'הכל' — it's added automatically
  multiSelect?: boolean;   // default true
  activeColor?: string;
}

interface Props {
  filters: FilterConfig[];
  values: Record<string, string[]>; // empty array = "all" / no filter
  onChange: (filterKey: string, selected: string[]) => void;
  sortSlot?: React.ReactNode; // optional sort toggle rendered on the left
}

export default function FilterBar({ filters, values, onChange, sortSlot }: Props) {
  const [openKey, setOpenKey] = useState<string | null>(null);
  const openFilter = filters.find((f) => f.key === openKey) ?? null;

  function togglePanel(key: string) {
    setOpenKey((prev) => (prev === key ? null : key));
  }

  function handleChipPress(filterKey: string, optionKey: string) {
    const cfg = filters.find((f) => f.key === filterKey)!;
    const current = values[filterKey] ?? [];

    if (optionKey === '__all__') {
      onChange(filterKey, []);
      return;
    }
    if (cfg.multiSelect === false) {
      // single-select: toggle off if already selected (→ all), else select
      onChange(filterKey, current[0] === optionKey ? [] : [optionKey]);
    } else {
      // multi-select: toggle inclusion
      const next = current.includes(optionKey)
        ? current.filter((k) => k !== optionKey)
        : [...current, optionKey];
      onChange(filterKey, next);
    }
  }

  return (
    <View>
      {/* ── Button row — single scrollable strip ── */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={s.btnRow}
        contentContainerStyle={s.btnRowContent}
      >
        {/* Sort slot sits at the start (visually right in RTL) */}
        {sortSlot && (
          <>
            <View style={s.sortSlot}>{sortSlot}</View>
            <View style={s.sep} />
          </>
        )}

        {filters.map((f) => {
          const selected = values[f.key] ?? [];
          const isActive = selected.length > 0;
          const isOpen   = openKey === f.key;
          const color    = f.activeColor ?? Colors.primary;
          return (
            <TouchableOpacity
              key={f.key}
              style={[
                s.btn,
                isActive && { backgroundColor: color, borderColor: color },
                isOpen && !isActive && s.btnOpen,
              ]}
              onPress={() => togglePanel(f.key)}
              activeOpacity={0.8}
            >
              <Ionicons
                name={isOpen ? 'chevron-up' : 'chevron-down'}
                size={11}
                color={isActive ? Colors.white : Colors.textMuted}
              />
              <Text style={[s.btnText, isActive && s.btnTextActive]}>
                {isActive && selected.length === 1
                  ? (f.options.find((o) => o.key === selected[0])?.label ?? f.label)
                  : f.label}
                {isActive && selected.length > 1 ? ` · ${selected.length}` : ''}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* ── Expandable chip panel ── */}
      {openFilter && (() => {
        const selected = values[openFilter.key] ?? [];
        const isAll    = selected.length === 0;
        const color    = openFilter.activeColor ?? Colors.primary;
        return (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={s.panel}
            contentContainerStyle={s.panelRow}
            keyboardShouldPersistTaps="handled"
          >
            {/* הכל chip */}
            <TouchableOpacity
              style={[s.chip, isAll && { backgroundColor: color, borderColor: color }]}
              onPress={() => handleChipPress(openFilter.key, '__all__')}
            >
              <Text style={[s.chipText, isAll && s.chipTextActive]}>הכל</Text>
            </TouchableOpacity>

            {openFilter.options.map((opt) => {
              const sel = selected.includes(opt.key);
              return (
                <TouchableOpacity
                  key={opt.key}
                  style={[
                    s.chip,
                    sel && { backgroundColor: color + '22', borderColor: color },
                  ]}
                  onPress={() => handleChipPress(openFilter.key, opt.key)}
                >
                  {sel && <Ionicons name="checkmark" size={12} color={color} />}
                  <Text style={[s.chipText, sel && { color, fontWeight: '700' }]}>
                    {opt.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        );
      })()}
    </View>
  );
}

const s = StyleSheet.create({
  btnRow: {
    backgroundColor: Colors.cardBackground,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  btnRowContent: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: 10,
    gap: 8,
  },
  sep: { width: 1, height: 20, backgroundColor: Colors.border, marginHorizontal: 4 },
  sortSlot: { flexDirection: 'row', alignItems: 'center' },
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: Radius.full,
    borderWidth: 1.5,
    borderColor: Colors.border,
    backgroundColor: Colors.cardBackground,
  },
  btnOpen:        { borderColor: Colors.primary },
  btnText:        { fontSize: 13, fontWeight: '600', color: Colors.textSecondary },
  btnTextActive:  { color: Colors.white },
  panel: {
    backgroundColor: Colors.background,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  panelRow: {
    flexDirection: 'row',
    paddingHorizontal: Spacing.md,
    paddingVertical: 9,
    gap: 8,
    alignItems: 'center',
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 13,
    paddingVertical: 6,
    borderRadius: Radius.full,
    borderWidth: 1.5,
    borderColor: Colors.border,
    backgroundColor: Colors.cardBackground,
  },
  chipText:       { fontSize: 12, fontWeight: '600', color: Colors.textSecondary },
  chipTextActive: { color: Colors.white },
});
